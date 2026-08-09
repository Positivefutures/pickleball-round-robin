#!/usr/bin/env node
//
// Prove one account cannot fill the database.
//
// Usage:
//   node scripts/prove-caps.mjs              # prove the limits in 0003 hold
//   node scripts/prove-caps.mjs --self-test  # prove this file can detect no limit
//
// RLS answers "whose rows are these". It says nothing about "how many", and the
// publishable key ships in the browser bundle, so anyone can sign up and start
// inserting. supabase/migrations/0003_row_caps.sql is the answer. This is the
// test of it, run against the live project with the same key an attacker has.
// The service role key bypasses nothing here, but it would insert past RLS and
// muddy the counts, so it appears nowhere in this file.
//
// Three things this has to get right:
//
//   1. Sync writes with upsert, and an upsert of a row the server already has
//      must keep working when an account is full. Otherwise the limit stops
//      people editing what they already own, which is a far worse bug than the
//      one it was protecting against. That case is checked explicitly.
//   2. A row limit with no size limit is theatre, because one row can be a
//      gigabyte of text. Both halves are probed.
//   3. Every refusal is asserted on the error, and every allowance on the rows
//      that actually came back. "It did not crash" is not a result.
//
// And because a test that has never been seen to fail is a guess, --self-test
// builds a table with no limits at all, points the same probes at it, and
// insists the ones that depend on a limit all go red.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEYCHAIN_SERVICE = 'pbrr-supabase-db';

// .invalid is reserved by RFC 2606 and can never be delivered to, so a
// misconfiguration that starts sending mail bounces rather than reaching a
// stranger. The suffix keeps a crashed run from colliding with the next one.
const RUN = Math.random().toString(36).slice(2, 8);
const EMAIL_A = `caps-probe-a-${RUN}@example.invalid`;
const EMAIL_B = `caps-probe-b-${RUN}@example.invalid`;
const PASSWORD = `probe-${RUN}-${Math.random().toString(36).slice(2)}`;

// Well past any limit, and past what a CHECK could plausibly allow by accident.
const HUGE = 'x'.repeat(100_000);

// PostgREST takes the whole batch in one request, and one request is one
// statement, which is one firing of the cap trigger. Chunking is what proves
// the limit counts what is already there rather than only what is arriving.
const CHUNK = 500;

// ---------------------------------------------------------------- reporting --

let checks = 0;
let failures = 0;
// Assertions that only pass because a limit exists. The self-test requires
// every one of these to go red; the rest are setup and positive controls, which
// pass either way and would drown the signal.
let guards = 0;
let guardFailures = 0;

function check(ok, label, detail) {
  checks++;
  if (ok) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ''}`);
  }
  return ok;
}

function guard(ok, label, detail) {
  guards++;
  if (!ok) guardFailures++;
  return check(ok, label, detail);
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

// persistSession off, so two clients in one process do not share one login.
const newClient = () =>
  createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function signUpProbe(client, email) {
  const { data, error } = await client.auth.signUp({ email, password: PASSWORD });
  if (error) throw new Error(`could not create ${email}: ${error.message}`);
  if (data.session) return data.user;
  throw new Error(
    `${email} was created but no session came back, which means email ` +
      'confirmation is switched on for this project. This test needs ' +
      'autoconfirm, or it needs the codes read out of the inbox.'
  );
}

// -------------------------------------------------------------------- probes --

async function insertMany(client, table, rows) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await client.from(table).insert(rows.slice(i, i + CHUNK));
    if (error) return error;
  }
  return null;
}

async function countRows(client, table) {
  const { count } = await client.from(table).select('*', { count: 'exact', head: true });
  return count ?? 0;
}

/**
 * Fills an account to exactly its limit and then tries every way past it.
 *
 * `cap` is read from the database rather than written here, so this asserts
 * against the number actually being enforced. Passing a cap the table does not
 * have is what the self-test does.
 */
async function probeCap({ client, table, cap, noun, row }) {
  section(`${cap} ${noun} is the limit, and ${cap + 1} is not`);

  const fillError = await insertMany(
    client, table, Array.from({ length: cap }, (_, i) => row(i))
  );
  if (!check(!fillError, `an account can hold all ${cap} of its ${noun}`,
    fillError ? fillError.message : '')) {
    return;
  }

  const held = await countRows(client, table);
  check(held === cap, `the account is holding exactly ${cap}`, `it holds ${held}`);

  const { error: oneMore } = await client.from(table).insert(row(cap));
  guard(!!oneMore, `one more ${noun.replace(/s$/, '')} is refused`,
    oneMore ? '' : 'it was accepted');
  if (oneMore) console.log(`          the database said: ${oneMore.message}`);

  // The reason this is an AFTER STATEMENT trigger rather than a BEFORE ROW one.
  // Sync re-sends rows the server already has, and a full account that could no
  // longer edit its own data would be a worse bug than the one being prevented.
  const existing = { ...row(0), name: 'Edited while full' };
  const { data: edited, error: editError } = await client.from(table)
    .upsert(existing, { onConflict: 'user_id,id' }).select();
  check(!editError && (edited ?? []).length === 1,
    'a full account can still edit what it already has',
    editError ? editError.message : 'nothing came back');

  // Partial success would be the nasty outcome: some rows in, an error out, and
  // an outbox that no longer matches the server.
  const straddle = Array.from({ length: 3 }, (_, i) => row(cap + 10 + i));
  const { error: straddleError } = await client.from(table).insert(straddle);
  guard(!!straddleError, 'a batch that would cross the limit is refused',
    straddleError ? '' : 'it was accepted');
  const after = await countRows(client, table);
  guard(after === cap, 'and none of that batch landed', `the account now holds ${after}`);

  // Deleting is a tombstone, never a physical delete, so the row is still
  // occupying space. Counting only live rows would let anyone insert, delete
  // and insert again forever.
  const { error: tombstone } = await client.from(table)
    .update({ deleted_at: new Date().toISOString() }).eq('id', row(1).id).select();
  check(!tombstone, `deleting one of the ${noun} works`, tombstone ? tombstone.message : '');
  const { error: afterDelete } = await client.from(table).insert(row(cap + 1));
  guard(!!afterDelete, 'deleted rows still count against the limit',
    afterDelete ? '' : 'deleting one bought room for another');
}

/** One row can be a gigabyte, so the size limits are half of the answer. */
async function probeSize({ client, table, userId, row }) {
  section('A single row cannot be enormous');

  // Each case gets an id of its own. Reusing one would collide on the primary
  // key, and a duplicate-key error looks exactly like a size limit doing its
  // job, so the whole section would pass for the wrong reason.
  const cases = [
    ['a name of 100,000 characters', { ...row(9001), name: HUGE }],
    ['an id of 100,000 characters', { ...row(9002), id: HUGE }],
    ['one group id of 100,000 characters', { ...row(9003), roster_ids: [HUGE] }],
    ['600 group ids on one player', {
      ...row(9004), roster_ids: Array.from({ length: 600 }, (_, i) => `g${i}`),
    }],
  ];

  for (const [label, bad] of cases) {
    const { error } = await client.from(table).insert(bad);
    guard(!!error, `${label} is refused`, error ? '' : 'it was accepted');
  }

  const { data, error } = await client.from(table).insert(row(9999)).select();
  check(!error && (data ?? []).length === 1, 'an ordinary row is still accepted',
    error ? error.message : 'nothing came back');
  void userId;
}

// ---------------------------------------------------------------- the real run --

const playerRow = (userId) => (n) => ({
  user_id: userId,
  id: `caps-p-${RUN}-${n}`,
  name: `P${n}`,
  rating: 4.0,
  gender: 'M',
  roster_ids: [],
});

const rosterRow = (userId) => (n) => ({
  user_id: userId,
  id: `caps-r-${RUN}-${n}`,
  name: `R${n}`,
});

async function main() {
  console.log(`Project: ${new URL(url).host}`);
  console.log(`Probing with two throwaway accounts, run id ${RUN}.`);
  console.log('This writes a few thousand rows and then deletes the accounts holding them.');

  const a = newClient();
  const b = newClient();

  section('Creating two accounts');
  const userA = await signUpProbe(a, EMAIL_A);
  const userB = await signUpProbe(b, EMAIL_B);
  check(!!userA?.id && !!userB?.id, 'both accounts exist and are signed in');

  // Read the limits out of the database rather than restating them, so this
  // cannot quietly test a number nobody is enforcing.
  section('The limits, as the database reports them');
  const playersCap = await readCap(a, 'players');
  const rostersCap = await readCap(a, 'rosters');
  check(Number.isInteger(playersCap) && playersCap > 0,
    `players: ${playersCap}`, 'row_cap() did not answer');
  check(Number.isInteger(rostersCap) && rostersCap > 0,
    `rosters: ${rostersCap}`, 'row_cap() did not answer');
  if (!Number.isInteger(playersCap) || !Number.isInteger(rostersCap)) {
    console.log('\nWithout the limits there is nothing to test. Stopping.');
    await cleanup();
    process.exit(1);
  }

  // Account B is empty, so a refusal here is the size limit and not the count.
  await probeSize({ client: b, table: 'players', userId: userB.id, row: playerRow(userB.id) });

  section('A single stored value cannot be enormous either');
  const { error: prefsTooBig } = await b.from('preferences')
    .insert({ user_id: userB.id, special_types: { k: HUGE } });
  guard(!!prefsTooBig, 'preferences holding 100,000 bytes of settings is refused',
    prefsTooBig ? '' : 'it was accepted');
  const { error: emailTooBig } = await b.from('profiles')
    .update({ email: `${HUGE}@example.invalid` }).eq('user_id', userB.id).select();
  guard(!!emailTooBig, 'an email address of 100,000 characters is refused',
    emailTooBig ? '' : 'it was accepted');
  const { error: prefsOk } = await b.from('preferences')
    .upsert({ user_id: userB.id, num_courts: 3, special_types: { switchDoubles: true } });
  check(!prefsOk, 'ordinary settings are still accepted', prefsOk ? prefsOk.message : '');

  await probeCap({
    client: a, table: 'players', cap: playersCap, noun: 'players', row: playerRow(userA.id),
  });
  await probeCap({
    client: a, table: 'rosters', cap: rostersCap, noun: 'groups', row: rosterRow(userA.id),
  });

  // A limit that applied to everyone at once would be a denial of service with
  // extra steps.
  section('A full account does not stop anybody else');
  const { data: other, error: otherError } = await b.from('players')
    .insert(playerRow(userB.id)(1)).select();
  check(!otherError && (other ?? []).length === 1,
    'a second account can still create players while the first is full',
    otherError ? otherError.message : 'nothing came back');

  await cleanup();
}

async function readCap(client, which) {
  const { data, error } = await client.rpc('row_cap', { which });
  if (error) return error.message;
  return data;
}

// ----------------------------------------------------------------- self-test --

const PSQL = '/opt/homebrew/opt/libpq/bin/psql';
const DECOY = `caps_decoy_${RUN}`;

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

// Proves this file can tell a limit from no limit. The decoy has the same shape
// as players and the same RLS, so the probes reach it normally, but no cap
// trigger and no size constraints. Every assertion that exists because of a
// limit must go red. A small cap is passed in so this takes six inserts rather
// than two thousand.
async function selfTest() {
  const dbUrl = dbUrlOrNull();
  if (!dbUrl) {
    console.error('--self-test needs the database password in the Keychain.');
    console.error('Run ./scripts/backup-db.sh once to store it.');
    process.exit(1);
  }

  console.log(`Project: ${new URL(url).host}`);
  console.log('Self-test. Building a table with no limits of any kind.\n');

  const a = newClient();
  let created = false;

  try {
    psql(dbUrl, `
      create table public.${DECOY} (
        user_id uuid not null references auth.users(id) on delete cascade,
        id text not null,
        name text not null,
        rating real not null default 4.0,
        gender text not null default 'M',
        roster_ids text[] not null default '{}',
        deleted_at timestamptz,
        primary key (user_id, id)
      );
      alter table public.${DECOY} enable row level security;
      create policy decoy_all on public.${DECOY} for all to authenticated
        using ((select auth.uid()) = user_id)
        with check ((select auth.uid()) = user_id);
      alter table public.${DECOY} alter column user_id set default auth.uid();
      grant select, insert, update, delete on public.${DECOY} to authenticated;
      notify pgrst, 'reload schema';
    `);
    created = true;

    const userA = await signUpProbe(a, EMAIL_A);

    // PostgREST reloads its schema cache on the notify above, but not instantly.
    let ready = false;
    for (let i = 0; i < 20 && !ready; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const { error } = await a.from(DECOY).select('*').limit(1);
      ready = !error;
    }
    if (!ready) throw new Error('the decoy table never appeared in the API');

    const row = (n) => ({
      user_id: userA.id, id: `caps-p-${RUN}-${n}`, name: `P${n}`,
      rating: 4.0, gender: 'M', roster_ids: [],
    });

    // Counting first, while the decoy is empty, so its row-count assertions see
    // the state they expect rather than leftovers from the size probes.
    console.log('Every check that depends on a limit should FAIL below.');
    await probeCap({ client: a, table: DECOY, cap: 5, noun: 'players', row });
    await probeSize({ client: a, table: DECOY, userId: userA.id, row });
  } finally {
    if (created) {
      try {
        psql(dbUrl, `drop table if exists public.${DECOY} cascade; notify pgrst, 'reload schema';`);
        console.log('\nDecoy table dropped.');
      } catch (e) {
        console.log(`\nWARN could not drop the decoy table: ${String(e.message).split('\n')[0]}`);
        console.log(`     Drop it by hand: drop table public.${DECOY};`);
      }
    }
    await cleanup();
  }

  console.log(`\n${guards} checks depend on a limit existing, ${guardFailures} of them red.`);
  if (guards > 0 && guardFailures === guards) {
    console.log('PASS. A missing limit makes this test go red, as it must.');
    process.exit(0);
  }
  console.log('FAIL. This test did not notice a table with no limits on it at all.');
  console.log('Until that is fixed, a green run of the real test means nothing.');
  process.exit(1);
}

// ------------------------------------------------------------------ cleanup --

// The probe accounts are real rows in the live database, holding a few thousand
// rows between them, so this runs even when the checks fail.
async function cleanup() {
  section('Cleaning up');
  const dbUrl = dbUrlOrNull();
  if (!dbUrl) {
    console.log('  SKIPPED. No database password in the Keychain.');
    console.log('  Delete the probe accounts by hand, in the Supabase SQL editor:');
    console.log(`    delete from auth.users where email like 'caps-probe-%-${RUN}@example.invalid';`);
    return;
  }

  try {
    const left = execFileSync(PSQL, [dbUrl, '-tAc',
      `delete from auth.users where email like 'caps-probe-%-${RUN}@example.invalid';
       select count(*) from auth.users where email like 'caps-probe-%';`],
      { encoding: 'utf8', env: { ...process.env, PGCONNECT_TIMEOUT: '20' } })
      .trim().split('\n').pop();
    if (left === '0') {
      console.log('  ok    probe accounts removed, and none left from earlier runs');
    } else {
      console.log(`  WARN  ${left} probe account(s) still in the database.`);
      console.log("        Clear them with: delete from auth.users where email like 'caps-probe-%';");
    }
  } catch (e) {
    console.log(`  WARN  cleanup failed: ${String(e.message).split('\n')[0]}`);
    console.log("        Run by hand: delete from auth.users where email like 'caps-probe-%';");
  }
}

const entry = process.argv.includes('--self-test') ? selfTest : main;

entry()
  .then(() => {
    console.log(`\n${checks} checks, ${failures} failed.`);
    if (failures === 0) {
      console.log('PASS. One account cannot fill the database, and a full one still works.');
    } else {
      console.log('FAIL. The limits are not holding.');
    }
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error(`\nCould not finish: ${err.message}`);
    await cleanup();
    process.exit(1);
  });
