#!/usr/bin/env node
//
// Prove that deleting an account deletes exactly one account.
//
// Usage:
//   node scripts/prove-delete.mjs              # prove 0004 does what it says
//   node scripts/prove-delete.mjs --self-test  # prove this file notices a bad one
//
// public.delete_my_account() is the only privileged thing in this app. It runs
// as its owner, which holds BYPASSRLS and DELETE on auth.users, so every rule
// that protects one account from another is switched off inside it. Reading it
// and agreeing it looks right is not enough for that, which is what this is.
//
// Two accounts are created on the live project, both filled with rows, and then
// one of them deletes itself. Everything is done with the publishable key that
// already ships in the browser bundle, because that is exactly what an attacker
// has. The service role key would bypass RLS and prove nothing, so it appears
// nowhere in this file.
//
// What has to be true, and none of it is visible from the app:
//
//   1. The auth.users row goes, and the profile, groups, players and settings
//      go with it by cascade. Nothing is left orphaned.
//   2. The other account is untouched. This is the one that matters.
//   3. A signed-out caller is refused.
//   4. The function cannot be aimed. It takes no arguments, so calling it with
//      a user id in the body must fail rather than quietly delete a stranger.
//   5. Calling it twice is not an error. Two devices pressing the button
//      together is real, and the second one has got what it asked for.
//
// Reading auth.users and counting rows past RLS both need the database
// password, which lives in the macOS Keychain and nowhere else. Unlike the
// other two proof scripts this one will not run without it, because both claims
// worth making are about rows the publishable key cannot see.
//
// And because a test that has never been seen to fail is a guess, --self-test
// installs a deliberately terrible version of the function, points the same
// probes at it, and insists every check that depends on a safeguard goes red.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEYCHAIN_SERVICE = 'pbrr-supabase-db';
const PSQL = '/opt/homebrew/opt/libpq/bin/psql';

// .invalid is reserved by RFC 2606 and can never be delivered to, so a
// misconfiguration that starts sending mail bounces rather than reaching a
// stranger. The suffix keeps a crashed run from colliding with the next one.
const RUN = Math.random().toString(36).slice(2, 8);
const EMAIL_A = `del-probe-keeper-${RUN}@example.invalid`;
const EMAIL_B = `del-probe-goer-${RUN}@example.invalid`;
const PASSWORD = `probe-${RUN}-${Math.random().toString(36).slice(2)}`;

const REAL_FUNCTION = 'delete_my_account';
const DECOY_FUNCTION = `delete_probe_${RUN}`;

// ---------------------------------------------------------------- reporting --

let checks = 0;
let failures = 0;
// Assertions that only pass because a safeguard exists. The self-test requires
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

// -------------------------------------------------------------- the database --

function dbUrlOrNull() {
  try {
    return execFileSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function psql(dbUrl, sql) {
  return execFileSync(PSQL, [dbUrl, '-v', 'ON_ERROR_STOP=1', '-tAc', sql], {
    encoding: 'utf8',
    env: { ...process.env, PGCONNECT_TIMEOUT: '20' },
  }).trim();
}

/**
 * Everything held under one account, counted past RLS.
 *
 * The whole point of the delete is that four tables empty themselves without
 * anybody naming them, so the only honest way to check is to count them from
 * outside. The publishable key cannot see auth.users at all.
 */
function heldBy(dbUrl, userId) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error(`not a user id: ${userId}`);
  const line = psql(
    dbUrl,
    `select concat_ws(' ',
       (select count(*) from auth.users        where id      = '${userId}'),
       (select count(*) from public.profiles    where user_id = '${userId}'),
       (select count(*) from public.rosters     where user_id = '${userId}'),
       (select count(*) from public.players     where user_id = '${userId}'),
       (select count(*) from public.preferences where user_id = '${userId}'))`
  );
  const [account, profiles, rosters, players, preferences] = line.split(' ').map(Number);
  return { account, profiles, rosters, players, preferences };
}

const total = (held) =>
  held.account + held.profiles + held.rosters + held.players + held.preferences;

// --------------------------------------------------------------- the probes --

/** Gives an account something to lose: two groups, three players, and settings. */
async function fill(client, userId, tag) {
  const rosters = [
    { user_id: userId, id: `${tag}-g1`, name: 'Tuesday Crowd' },
    { user_id: userId, id: `${tag}-g2`, name: 'Sunday Social' },
  ];
  const players = [1, 2, 3].map((n) => ({
    user_id: userId,
    id: `${tag}-p${n}`,
    name: `Player ${n}`,
    rating: 4.0,
    gender: n === 1 ? 'F' : 'M',
    roster_ids: [`${tag}-g1`],
  }));

  for (const [table, rows] of [
    ['rosters', rosters],
    ['players', players],
    ['preferences', [{ user_id: userId, num_courts: 4, num_rounds: 9 }]],
  ]) {
    const { error } = await client.from(table).insert(rows);
    if (error) throw new Error(`could not fill ${table}: ${error.message}`);
  }
}

/**
 * The whole suite, against whichever function it is pointed at.
 *
 * Shared so the self-test runs exactly these probes against a deliberately bad
 * function rather than a second copy of them that could drift.
 */
async function probe(fn, dbUrl) {
  section('Setting up two accounts with data in them');

  const a = newClient();
  const b = newClient();
  const userA = await signUpProbe(a, EMAIL_A);
  const userB = await signUpProbe(b, EMAIL_B);
  await fill(a, userA.id, 'keeper');
  await fill(b, userB.id, 'goer');

  const beforeA = heldBy(dbUrl, userA.id);
  const beforeB = heldBy(dbUrl, userB.id);
  check(total(beforeA) === 8, 'the keeper account holds 8 rows', `it holds ${total(beforeA)}`);
  check(total(beforeB) === 8, 'the account about to go holds 8 rows', `it holds ${total(beforeB)}`);

  section('A signed-out caller cannot delete anything');

  const anon = newClient();
  const { error: anonError } = await anon.rpc(fn);
  guard(!!anonError, 'a signed-out call is refused', anonError ? '' : 'it was allowed');
  if (anonError) console.log(`          the server said: ${anonError.message}`);

  section('The function cannot be aimed at somebody else');

  // The security model in one line: there is no user id to pass, so there is
  // nothing to change. If this ever starts succeeding, an account id is all
  // anybody needs to delete a stranger, and account ids are not secret.
  const { error: aimedError } = await b.rpc(fn, { target: userA.id });
  guard(!!aimedError, 'naming another account is refused', aimedError ? '' : 'it was accepted');
  if (aimedError) console.log(`          the server said: ${aimedError.message}`);

  const { data: keeperRows } = await a.from('rosters').select('id');
  guard(
    (keeperRows ?? []).length === 2,
    'and the other account still has its groups',
    `it has ${(keeperRows ?? []).length}`
  );

  section('Deleting the account');

  const { data: deleted, error: deleteError } = await b.rpc(fn);
  check(!deleteError, 'the account can delete itself', deleteError ? deleteError.message : '');
  check(deleted === true, 'and the function says it deleted a row', `it returned ${deleted}`);

  section('Everything under it went with it');

  const afterB = heldBy(dbUrl, userB.id);
  check(afterB.account === 0, 'the account row is gone', `${afterB.account} left`);
  check(afterB.profiles === 0, 'the profile went by cascade', `${afterB.profiles} left`);
  check(afterB.rosters === 0, 'the groups went by cascade', `${afterB.rosters} left`);
  check(afterB.players === 0, 'the players went by cascade', `${afterB.players} left`);
  check(afterB.preferences === 0, 'the settings went by cascade', `${afterB.preferences} left`);

  section('The other account is untouched');

  const afterA = heldBy(dbUrl, userA.id);
  guard(afterA.account === 1, 'the keeper account still exists', 'it does not');
  guard(
    total(afterA) === total(beforeA),
    'and it holds exactly what it held before',
    `${total(beforeA)} before, ${total(afterA)} after`
  );
  const { data: stillThere } = await a.from('players').select('id');
  guard(
    (stillThere ?? []).length === 3,
    'and it can still read them for itself',
    `it read ${(stillThere ?? []).length}`
  );

  section('Asking twice is not an error');

  // Two devices pressing the button together. The second one has got what it
  // asked for, so an error there would show a failure for something that
  // succeeded.
  const { data: again, error: againError } = await b.rpc(fn);
  check(!againError, 'a second call is accepted', againError ? againError.message : '');
  check(again === false, 'and says it deleted nothing', `it returned ${again}`);

  return { userA, userB };
}

// ------------------------------------------------------------------ the run --

/**
 * The database password is not optional here, unlike in the other two proof
 * scripts. Both claims worth making are about rows the publishable key cannot
 * see: that four tables emptied themselves without being named, and that the
 * account next door still exists. A run that could not check either would print
 * a green wall meaning almost nothing.
 */
function requireDbUrl() {
  const dbUrl = dbUrlOrNull();
  if (dbUrl) return dbUrl;
  console.error('This needs the database password, which is not in the Keychain.');
  console.error('It is the only way to see auth.users, and auth.users is the point.');
  console.error('Run scripts/backup-db.sh once to store it, then run this again.');
  process.exit(1);
}

async function main() {
  await probe(REAL_FUNCTION, requireDbUrl());
  await cleanup();
}

/**
 * Everything 0004 refuses to do, done on purpose.
 *
 * The decoy is the function somebody writes when they are in a hurry: it takes
 * the account to delete as an argument, and anyone at all may call it. Both are
 * exactly the mistakes the real one is shaped to make impossible.
 *
 * It is fenced to probe accounts all the same. `example.invalid` can never be
 * a real address, so for the few seconds this thing exists on the live database
 * the worst anybody who guessed its random name could do is delete a throwaway
 * account this script just made.
 */
async function selfTest() {
  const dbUrl = requireDbUrl();
  let created = false;
  try {
    console.log(`Installing a deliberately unsafe ${DECOY_FUNCTION}().`);
    psql(
      dbUrl,
      `create or replace function public.${DECOY_FUNCTION}(target uuid default null)
       returns boolean language plpgsql security definer set search_path = '' as $$
       declare deleted uuid;
       begin
         delete from auth.users
          where id = coalesce(target, (select auth.uid()))
            and email like 'del-probe-%@example.invalid'
          returning id into deleted;
         return deleted is not null;
       end; $$;
       grant execute on function public.${DECOY_FUNCTION}(uuid) to anon, authenticated;
       notify pgrst, 'reload schema';`
    );
    created = true;

    // PostgREST reloads its schema cache asynchronously, so the function can be
    // a 404 for a moment after it exists.
    let ready = false;
    for (let i = 0; i < 20 && !ready; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const { error } = await newClient().rpc(DECOY_FUNCTION);
      ready = !error;
    }
    if (!ready) throw new Error('the decoy function never appeared in the API');

    console.log('Every check that depends on a safeguard should FAIL below.');
    await probe(DECOY_FUNCTION, dbUrl);
  } finally {
    if (created) {
      try {
        psql(
          dbUrl,
          `drop function if exists public.${DECOY_FUNCTION}(uuid); notify pgrst, 'reload schema';`
        );
        console.log('\nDecoy function dropped.');
      } catch (e) {
        console.log(`\nWARN could not drop the decoy: ${String(e.message).split('\n')[0]}`);
        console.log(`     Drop it by hand: drop function public.${DECOY_FUNCTION}(uuid);`);
      }
    }
    await cleanup();
  }

  console.log(`\n${guards} checks depend on a safeguard, ${guardFailures} of them red.`);
  if (guards > 0 && guardFailures === guards) {
    console.log('PASS. A function that deletes the wrong account makes this test go red.');
    process.exit(0);
  }
  console.log('FAIL. This test did not notice a function anybody can aim at anybody.');
  console.log('Until that is fixed, a green run of the real test means nothing.');
  process.exit(1);
}

// ------------------------------------------------------------------ cleanup --

// The probe accounts are real rows in the live database, so this runs even when
// the checks fail. One of the two has usually deleted itself by now.
async function cleanup() {
  section('Cleaning up');
  const dbUrl = dbUrlOrNull();
  if (!dbUrl) {
    console.log('  SKIPPED. No database password in the Keychain.');
    console.log('  Delete the probe accounts by hand, in the Supabase SQL editor:');
    console.log(`    delete from auth.users where email like 'del-probe-%@example.invalid';`);
    return;
  }

  try {
    const left = psql(
      dbUrl,
      `delete from auth.users where email like 'del-probe-%-${RUN}@example.invalid';
       select count(*) from auth.users where email like 'del-probe-%';`
    )
      .split('\n')
      .pop();
    if (left === '0') {
      console.log('  ok    probe accounts removed, and none left from earlier runs');
    } else {
      console.log(`  WARN  ${left} probe account(s) still in the database.`);
      console.log("        Clear them with: delete from auth.users where email like 'del-probe-%';");
    }
  } catch (e) {
    console.log(`  WARN  cleanup failed: ${String(e.message).split('\n')[0]}`);
    console.log("        Run by hand: delete from auth.users where email like 'del-probe-%';");
  }
}

const entry = process.argv.includes('--self-test') ? selfTest : main;

entry()
  .then(() => {
    console.log(`\n${checks} checks, ${failures} failed.`);
    if (failures === 0) {
      console.log('PASS. Deleting an account deletes exactly one account, and everything under it.');
    } else {
      console.log('FAIL. Do not ship the delete button until this is green.');
    }
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error(`\nCould not finish: ${err.message}`);
    await cleanup();
    process.exit(1);
  });
