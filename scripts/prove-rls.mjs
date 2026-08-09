#!/usr/bin/env node
//
// Prove Row Level Security with two real accounts.
//
// Usage:
//   node scripts/prove-rls.mjs              # prove the real policies hold
//   node scripts/prove-rls.mjs --self-test  # prove this file can detect a hole
//
// The policies in supabase/migrations/0001_accounts.sql read correctly. That is
// not the same as tested. This signs in as two genuine accounts using the same
// publishable key that ships in the browser bundle, has one try every way it
// can reach the other's rows, and asserts that every attempt comes back empty
// or refused.
//
// The service role key bypasses RLS entirely, so it proves nothing and appears
// nowhere in this file. Everything below runs with the key an attacker already
// has.
//
// Two things this has to get right, and they are the reason it is longer than
// it looks:
//
//   1. RLS hides rows, it does not raise errors. An update or delete aimed at
//      someone else's row succeeds and changes nothing. So "no error" is not a
//      pass. Every attempt asserts on the rows actually returned.
//   2. A test where everything fails for a boring reason, a typo in a table
//      name, would look identical to a perfect pass. So each table also runs a
//      positive control proving the owner CAN do the thing the intruder cannot.
//
// And because a test that has never been seen to fail is only a guess, there is
// --self-test. It builds a table with deliberately broken policies, points the
// same probes at it, and insists they all go red.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEYCHAIN_SERVICE = 'pbrr-supabase-db';
const TABLES = ['profiles', 'rosters', 'players', 'preferences'];

// .invalid is reserved by RFC 2606 and can never be delivered to, so a
// misconfiguration that starts sending confirmation mail bounces instead of
// reaching a stranger. The suffix keeps a crashed run from colliding with the
// next one.
const RUN = Math.random().toString(36).slice(2, 8);
const EMAIL_A = `rls-probe-a-${RUN}@example.invalid`;
const EMAIL_B = `rls-probe-b-${RUN}@example.invalid`;
const PASSWORD = `probe-${RUN}-${Math.random().toString(36).slice(2)}`;

const ROSTER_ID = `rls-probe-roster-${RUN}`;
const PLAYER_ID = `rls-probe-player-${RUN}`;
const OWNER_NAME = 'Owned by A';
const COURTS = 7; // A distinctive value, so tampering is visible.

// ---------------------------------------------------------------- reporting --

let failures = 0;
let checks = 0;

function check(ok, label, detail) {
  checks++;
  if (ok) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

// ------------------------------------------------------------------- config --

function readEnv() {
  let raw;
  try {
    raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
  } catch {
    console.error('No .env.local. This needs the same two values the app builds with.');
    process.exit(1);
  }
  const get = (key) => {
    const line = raw.split('\n').find((l) => l.trim().startsWith(`${key}=`));
    return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '') : '';
  };
  const url = get('VITE_SUPABASE_URL');
  const anonKey = get('VITE_SUPABASE_ANON_KEY');
  if (!url || !anonKey) {
    console.error('.env.local is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
    process.exit(1);
  }
  return { url, anonKey };
}

const { url, anonKey } = readEnv();

// persistSession off, so three clients in one process do not share one login.
const newClient = () =>
  createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

// ------------------------------------------------------------------ accounts --

async function signUpProbe(client, email) {
  const { data, error } = await client.auth.signUp({ email, password: PASSWORD });
  if (error) throw new Error(`could not create ${email}: ${error.message}`);
  if (data.session) return data.user;

  // Email confirmation is on. Nothing further is possible without reading the
  // inbox, so say which setting caused it rather than failing obscurely.
  throw new Error(
    `${email} was created but no session came back, which means email ` +
      'confirmation is switched on for this project. This test needs ' +
      'autoconfirm, or it needs the codes read out of the inbox.'
  );
}

// -------------------------------------------------------------------- probes --

// PostgREST answers an update or delete against invisible rows with success and
// an empty body. So these all ask what came back, never whether it errored.
async function rowsFrom(query) {
  const { data, error } = await query;
  return { rows: data ?? [], error };
}

async function main() {
  console.log(`Project: ${new URL(url).host}`);
  console.log(`Probing with two throwaway accounts, run id ${RUN}.`);

  const a = newClient();
  const b = newClient();
  const anon = newClient(); // never signs in

  section('Creating two accounts');
  const userA = await signUpProbe(a, EMAIL_A);
  const userB = await signUpProbe(b, EMAIL_B);
  check(!!userA?.id && !!userB?.id, 'both accounts exist and are signed in');
  check(userA.id !== userB.id, 'they are different accounts');

  // ------------------------------------------------------- A seeds its data --

  section("Account A creates its own data");

  const seedErrors = [];
  for (const [label, result] of [
    ['roster', await a.from('rosters').insert({
      user_id: userA.id, id: ROSTER_ID, name: OWNER_NAME,
    }).select()],
    ['player', await a.from('players').insert({
      user_id: userA.id, id: PLAYER_ID, name: OWNER_NAME,
      rating: 4.0, gender: 'M', roster_ids: [ROSTER_ID],
    }).select()],
    ['preferences', await a.from('preferences').insert({
      user_id: userA.id, num_courts: COURTS,
    }).select()],
  ]) {
    if (result.error) seedErrors.push(`${label}: ${result.error.message}`);
  }
  check(seedErrors.length === 0, 'A can write its own rows', seedErrors.join('; '));

  // The signup trigger writes this one. If it is missing, the whole profiles
  // half of this test would pass for the wrong reason.
  const { rows: profileA } = await rowsFrom(a.from('profiles').select('*'));
  check(profileA.length === 1, "A's profile row exists, written by the signup trigger");

  if (seedErrors.length > 0 || profileA.length !== 1) {
    console.log('\nCannot probe what was never written. Stopping.');
    await cleanup();
    process.exit(1);
  }

  // ------------------------------------------------------ what B can see -----

  section('Account B tries to READ A\'s rows');
  for (const table of TABLES) {
    const { rows } = await rowsFrom(b.from(table).select('*').eq('user_id', userA.id));
    check(rows.length === 0, `${table}: B sees none of A's rows`,
      rows.length ? `${rows.length} row(s) leaked` : '');
  }

  // A count query is a separate code path in PostgREST and worth its own look:
  // a policy could hide the bodies while still leaking how many there are.
  section('Account B tries to COUNT A\'s rows');
  for (const table of TABLES) {
    const { count } = await b.from(table).select('*', { count: 'exact', head: true })
      .eq('user_id', userA.id);
    check((count ?? 0) === 0, `${table}: B cannot count A's rows`,
      count ? `count leaked as ${count}` : '');
  }

  section('Account B tries to UPDATE A\'s rows');
  const updates = {
    profiles: { plan: 'stolen' },
    rosters: { name: 'stolen' },
    players: { name: 'stolen' },
    preferences: { num_courts: 99 },
  };
  for (const table of TABLES) {
    const { rows } = await rowsFrom(
      b.from(table).update(updates[table]).eq('user_id', userA.id).select()
    );
    check(rows.length === 0, `${table}: B changes nothing of A's`,
      rows.length ? `${rows.length} row(s) modified` : '');
  }

  section('Account B tries to DELETE A\'s rows');
  for (const table of TABLES) {
    const { rows } = await rowsFrom(
      b.from(table).delete().eq('user_id', userA.id).select()
    );
    check(rows.length === 0, `${table}: B deletes nothing of A's`,
      rows.length ? `${rows.length} row(s) deleted` : '');
  }

  // The insert policies carry with check, so this is the attack they exist for:
  // planting a row into someone else's account rather than reading one out.
  section('Account B tries to INSERT rows owned by A');
  const plants = {
    profiles: { user_id: userA.id, email: 'planted@example.invalid' },
    rosters: { user_id: userA.id, id: `planted-${RUN}`, name: 'planted' },
    players: {
      user_id: userA.id, id: `planted-${RUN}`, name: 'planted',
      rating: 4.0, gender: 'M', roster_ids: [],
    },
    preferences: { user_id: userA.id, num_courts: 1 },
  };
  for (const table of TABLES) {
    const { error } = await b.from(table).insert(plants[table]).select();
    check(!!error, `${table}: B cannot write into A's account`,
      error ? '' : 'the insert was accepted');
  }

  // The one the migration's own comments call out: with using but no with
  // check, a user could edit their own row and reassign it to someone else.
  section('Account B tries to HAND AWAY its own rows to A');
  const { error: prefsOwn } = await b.from('preferences')
    .insert({ user_id: userB.id, num_courts: 2 }).select();
  check(!prefsOwn, 'B can write its own preferences row first');

  for (const table of TABLES) {
    // rosters and players need B to own something before it can give it away.
    if (table === 'rosters') {
      await b.from('rosters').insert({ user_id: userB.id, id: ROSTER_ID, name: 'B' }).select();
    }
    if (table === 'players') {
      await b.from('players').insert({
        user_id: userB.id, id: PLAYER_ID, name: 'B',
        rating: 4.0, gender: 'F', roster_ids: [],
      }).select();
    }
    const { data, error } = await b.from(table)
      .update({ user_id: userA.id }).eq('user_id', userB.id).select();
    const gaveAway = !error && (data ?? []).length > 0;
    check(!gaveAway, `${table}: B cannot reassign its own row to A`,
      gaveAway ? 'the row was handed over' : '');
  }

  // -------------------------------------------------- the signed-out case ----

  section('A signed-out visitor tries to read anything');
  for (const table of TABLES) {
    const { rows, error } = await rowsFrom(anon.from(table).select('*'));
    check(rows.length === 0, `${table}: nothing readable without signing in`,
      rows.length ? `${rows.length} row(s) leaked` : '');
    void error; // an error is also a pass here; an empty result is the usual one
  }

  section('A signed-out visitor tries to write');
  for (const table of TABLES) {
    const { error } = await anon.from(table).insert(plants[table]).select();
    check(!!error, `${table}: nothing writable without signing in`,
      error ? '' : 'the insert was accepted');
  }

  // ----------------------------------------- positive controls, and damage ---

  // Without these, a run where every single call failed for an unrelated reason
  // would print a wall of "ok" and mean nothing.
  section('Positive controls. A can still do what B could not');

  const { rows: ownRoster } = await rowsFrom(
    a.from('rosters').select('*').eq('id', ROSTER_ID)
  );
  check(ownRoster.length === 1, 'A can read its own group');
  check(ownRoster[0]?.name === OWNER_NAME, "A's group name was not tampered with",
    ownRoster[0] ? `name is now "${ownRoster[0].name}"` : 'the group is gone');

  const { rows: renamed } = await rowsFrom(
    a.from('rosters').update({ name: 'Renamed by A' }).eq('id', ROSTER_ID).select()
  );
  check(renamed.length === 1, 'A can update its own group');

  const { rows: ownPlayer } = await rowsFrom(
    a.from('players').select('*').eq('id', PLAYER_ID)
  );
  check(ownPlayer.length === 1 && ownPlayer[0].name === OWNER_NAME,
    "A's player survived untouched");

  const { rows: ownPrefs } = await rowsFrom(a.from('preferences').select('*'));
  check(ownPrefs.length === 1 && ownPrefs[0].num_courts === COURTS,
    `A's preferences still say ${COURTS} courts`,
    ownPrefs[0] ? `num_courts is ${ownPrefs[0].num_courts}` : 'the row is gone');

  const { rows: stillOne } = await rowsFrom(a.from('profiles').select('*'));
  check(stillOne.length === 1 && stillOne[0].plan !== 'stolen',
    "A's profile is intact and still A's alone");

  await cleanup();
}

// ----------------------------------------------------------------- self-test --

const PSQL = '/opt/homebrew/opt/libpq/bin/psql';
const DECOY = `rls_decoy_${RUN}`;

function dbUrlOrNull() {
  try {
    return execFileSync('security',
      ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'],
      { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function psql(dbUrl, sql) {
  return execFileSync(PSQL, [dbUrl, '-v', 'ON_ERROR_STOP=1', '-tAc', sql],
    { encoding: 'utf8', env: { ...process.env, PGCONNECT_TIMEOUT: '20' } }).trim();
}

// Proves this file can tell a hole from a wall. It stands up a table whose
// policies are wrong in exactly the ways the real ones are right, aims the same
// probes at it, and requires every one to come back red. The decoy is empty
// except for rows these throwaway accounts write, so nothing real is exposed
// even for the seconds it exists.
async function selfTest() {
  const dbUrl = dbUrlOrNull();
  if (!dbUrl) {
    console.error('--self-test needs the database password in the Keychain.');
    console.error('Run ./scripts/backup-db.sh once to store it.');
    process.exit(1);
  }

  console.log(`Project: ${new URL(url).host}`);
  console.log('Self-test. Building a table with deliberately broken policies.\n');

  const a = newClient();
  const b = newClient();
  let created = false;

  try {
    // "using (true)" everywhere: the classic mistake, RLS switched on and then
    // handed a policy that lets every signed-in user reach every row.
    psql(dbUrl, `
      create table public.${DECOY} (
        user_id uuid not null references auth.users(id) on delete cascade,
        id text not null,
        name text not null,
        primary key (user_id, id)
      );
      alter table public.${DECOY} enable row level security;
      create policy decoy_select on public.${DECOY} for select to authenticated using (true);
      create policy decoy_insert on public.${DECOY} for insert to authenticated with check (true);
      create policy decoy_update on public.${DECOY} for update to authenticated using (true);
      create policy decoy_delete on public.${DECOY} for delete to authenticated using (true);
      grant select, insert, update, delete on public.${DECOY} to authenticated;
      notify pgrst, 'reload schema';
    `);
    created = true;

    const userA = await signUpProbe(a, EMAIL_A);
    const userB = await signUpProbe(b, EMAIL_B);

    // PostgREST reloads its schema cache on the notify above, but not instantly.
    let ready = false;
    for (let i = 0; i < 20 && !ready; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const { error } = await a.from(DECOY).select('*').limit(1);
      ready = !error;
    }
    if (!ready) throw new Error('the decoy table never appeared in the API');

    await a.from(DECOY).insert({ user_id: userA.id, id: 'x', name: OWNER_NAME }).select();

    section('Every one of these should FAIL');
    const { rows: read } = await rowsFrom(b.from(DECOY).select('*').eq('user_id', userA.id));
    check(read.length === 0, "decoy: B sees none of A's rows");

    const { rows: upd } = await rowsFrom(
      b.from(DECOY).update({ name: 'stolen' }).eq('user_id', userA.id).select()
    );
    check(upd.length === 0, "decoy: B changes nothing of A's");

    const { error: plant } = await b.from(DECOY)
      .insert({ user_id: userA.id, id: 'planted', name: 'planted' }).select();
    check(!!plant, "decoy: B cannot write into A's account");

    const { rows: del } = await rowsFrom(
      b.from(DECOY).delete().eq('user_id', userA.id).select()
    );
    check(del.length === 0, "decoy: B deletes nothing of A's");
  } finally {
    if (created) {
      try {
        psql(dbUrl, `drop table if exists public.${DECOY} cascade; notify pgrst, 'reload schema';`);
        console.log(`\nDecoy table dropped.`);
      } catch (e) {
        console.log(`\nWARN could not drop the decoy table: ${String(e.message).split('\n')[0]}`);
        console.log(`     Drop it by hand: drop table public.${DECOY};`);
      }
    }
    await cleanup();
  }

  console.log(`\n${checks} checks, ${failures} of them red.`);
  if (failures === checks && checks > 0) {
    console.log('PASS. A hole in the policies makes this test go red, as it must.');
    process.exit(0);
  }
  console.log('FAIL. This test did not notice a table anyone could read and write.');
  console.log('Until that is fixed, a green run of the real test means nothing.');
  process.exit(1);
}

// ------------------------------------------------------------------ cleanup --

// The probe accounts are real rows in the live database. Leaving them behind
// would put fake users in every backup from here on, so this runs even when the
// checks fail.
async function cleanup() {
  section('Cleaning up');
  const dbUrl = dbUrlOrNull();
  if (!dbUrl) {
    console.log('  SKIPPED. No database password in the Keychain.');
    console.log('  Delete the probe accounts by hand, in the Supabase SQL editor:');
    console.log(`    delete from auth.users where email like 'rls-probe-%-${RUN}@example.invalid';`);
    return;
  }

  try {
    const left = execFileSync(PSQL, [dbUrl, '-tAc',
      `delete from auth.users where email like 'rls-probe-%-${RUN}@example.invalid';
       select count(*) from auth.users where email like 'rls-probe-%';`],
      { encoding: 'utf8', env: { ...process.env, PGCONNECT_TIMEOUT: '20' } })
      .trim().split('\n').pop();
    if (left === '0') {
      console.log('  ok    both probe accounts removed, and none left from earlier runs');
    } else {
      console.log(`  WARN  ${left} probe account(s) still in the database.`);
      console.log("        Clear them with: delete from auth.users where email like 'rls-probe-%';");
    }
  } catch (e) {
    console.log(`  WARN  cleanup failed: ${String(e.message).split('\n')[0]}`);
    console.log(`        Run by hand: delete from auth.users where email like 'rls-probe-%';`);
  }
}

const entry = process.argv.includes('--self-test') ? selfTest : main;

entry()
  .then(() => {
    console.log(`\n${checks} checks, ${failures} failed.`);
    if (failures === 0) {
      console.log('PASS. One account cannot reach another\'s data by any route tried here.');
    } else {
      console.log('FAIL. Row Level Security is not holding. Do not launch on this.');
    }
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error(`\nCould not finish: ${err.message}`);
    await cleanup();
    process.exit(1);
  });
