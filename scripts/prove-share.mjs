#!/usr/bin/env node
//
// Prove that a shared session is readable by exactly the people holding its key.
//
// Usage:
//   node scripts/prove-share.mjs              # prove the real policies hold
//   node scripts/prove-share.mjs --self-test  # prove this file can detect a hole
//
// This is the only part of the database anybody can reach without signing in,
// which makes it the only part where a mistake is a stranger reading a room full
// of people's names. prove-rls.mjs asks "can one account reach another's rows".
// This asks the two questions that are new:
//
//   1. Can somebody with no account read the table itself? They must not. A
//      permissive select policy would not mean "one session per link", it would
//      mean anybody can ask for every session there has ever been, with the
//      user_id that owns each one. That is the failure this file exists for.
//   2. Does the one function they may call answer only the question it was
//      given? It takes a key and returns a snapshot. It must not return a row,
//      must not name an owner, and must not admit that a key it will not serve
//      was ever real.
//
// The service role key bypasses RLS and so proves nothing. Everything below runs
// with the publishable key that already ships inside the browser bundle.
//
// And because a test that has never been seen to fail is only a guess, there is
// --self-test. It stands up a table and a function holed in exactly the ways the
// real ones are sound, points the same probes at them, and insists every one
// goes red.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEYCHAIN_SERVICE = 'pbrr-supabase-db';
const TABLE = 'shared_sessions';
const FUNCTION = 'shared_session';

/** Matches SHARE_KEY_LENGTH and the check constraint in 0005. */
const KEY_LENGTH = 10;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const RUN = Math.random().toString(36).slice(2, 8);
const EMAIL_A = `share-probe-a-${RUN}@example.invalid`;
const EMAIL_B = `share-probe-b-${RUN}@example.invalid`;
const PASSWORD = `probe-${RUN}-${Math.random().toString(36).slice(2)}`;

const key = () =>
  Array.from({ length: KEY_LENGTH }, () => ALPHABET[Math.floor(Math.random() * 32)]).join('');

/** A distinctive name, so anything that leaks is recognisable on sight. */
const SECRET_NAME = `Ada-${RUN}`;

function snapshot(name = SECRET_NAME) {
  return {
    version: 1,
    at: new Date().toISOString(),
    sessionId: `sess-${RUN}`,
    schedule: {
      rounds: [
        {
          roundNumber: 1,
          courts: [
            {
              courtNumber: 1,
              team1: [{ id: 'p1', name, rating: 0, gender: 'F', rosterIds: [] }],
              team2: [{ id: 'p2', name: 'Bea', rating: 0, gender: 'M', rosterIds: [] }],
              ratingDiff: 0,
              score: { team1: 11, team2: 7 },
            },
          ],
          sitOuts: [],
        },
      ],
    },
    completedRounds: [],
    players: [],
    scoringEnabled: true,
  };
}

const inADay = () => new Date(Date.now() + 24 * 3600_000).toISOString();

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
  const get = (name) => {
    const line = raw.split('\n').find((l) => l.trim().startsWith(`${name}=`));
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
  createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function signUpProbe(client, email) {
  const { data, error } = await client.auth.signUp({ email, password: PASSWORD });
  if (error) throw new Error(`could not create ${email}: ${error.message}`);
  if (data.session) return data.user;
  throw new Error(
    `${email} was created but no session came back, which means email ` +
      'confirmation is switched on for this project. This test needs autoconfirm.'
  );
}

// -------------------------------------------------------------------- probes --

/**
 * Every probe below asks what came back, never whether it errored. RLS hides
 * rows rather than raising, so an update aimed at somebody else's row succeeds
 * and changes nothing, and "no error" is not a pass.
 */
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
  await signUpProbe(a, EMAIL_A);
  await signUpProbe(b, EMAIL_B);
  console.log(`  ok    ${EMAIL_A} and ${EMAIL_B}`);

  // --------------------------------------------------------------- publishing
  section('A publishes a session');
  const liveKey = key();
  const { error: insertError } = await a
    .from(TABLE)
    .insert({
      share_key: liveKey,
      session_id: `sess-${RUN}`,
      snapshot: snapshot(),
      expires_at: inADay(),
      // user_id deliberately absent: the column defaults to auth.uid().
    });
  check(!insertError, 'A can publish', insertError?.message);

  const mine = await rowsFrom(a.from(TABLE).select('*').eq('share_key', liveKey));
  check(mine.rows.length === 1, 'and can see its own row back');
  check(
    mine.rows[0]?.user_id && mine.rows[0].user_id.length === 36,
    'which the database stamped with an owner A never sent'
  );

  // ------------------------------------------------------- the anonymous read
  section('Somebody with no account, holding the key');
  const shared = await anon.rpc(FUNCTION, { key: liveKey });
  check(!shared.error, 'can call the function at all', shared.error?.message);
  check(
    JSON.stringify(shared.data ?? {}).includes(SECRET_NAME),
    'and gets the session behind that key'
  );
  check(
    shared.data !== null && typeof shared.data === 'object' && !('user_id' in shared.data),
    'and is told nothing about who owns it'
  );
  for (const column of ['expires_at', 'session_id', 'share_key', 'server_updated_at']) {
    check(
      shared.data === null || !(column in shared.data),
      `and nothing about ${column}, because the function returns one column`
    );
  }

  section('Somebody with no account, without the key');
  const table = await rowsFrom(anon.from(TABLE).select('*'));
  check(table.rows.length === 0, 'cannot read the table', `${table.rows.length} row(s) came back`);
  const oneRow = await rowsFrom(anon.from(TABLE).select('*').eq('share_key', liveKey));
  check(oneRow.rows.length === 0, 'cannot read even the row they hold the key to');

  const guessed = await anon.rpc(FUNCTION, { key: key() });
  check(guessed.data === null, 'gets nothing for a key that was never real');

  const anonInsert = await anon
    .from(TABLE)
    .insert({ share_key: key(), session_id: 'x', snapshot: {}, expires_at: inADay() });
  check(!!anonInsert.error, 'cannot publish anything of their own');

  const anonDelete = await rowsFrom(
    anon.from(TABLE).delete().eq('share_key', liveKey).select()
  );
  check(anonDelete.rows.length === 0, 'cannot take somebody else\'s session down');
  const stillThere = await anon.rpc(FUNCTION, { key: liveKey });
  check(stillThere.data !== null, 'and the session is still there afterwards');

  // ------------------------------------------------------------- the two ends
  section('Account B, against A\'s session');
  const bSees = await rowsFrom(b.from(TABLE).select('*'));
  check(bSees.rows.length === 0, 'cannot see A\'s row in the table');

  const bUpdate = await rowsFrom(
    b.from(TABLE).update({ snapshot: snapshot('Intruder') }).eq('share_key', liveKey).select()
  );
  check(bUpdate.rows.length === 0, 'cannot overwrite what A published');
  const afterUpdate = await anon.rpc(FUNCTION, { key: liveKey });
  check(
    JSON.stringify(afterUpdate.data ?? {}).includes(SECRET_NAME),
    'and the published session is unchanged'
  );

  const bDelete = await rowsFrom(b.from(TABLE).delete().eq('share_key', liveKey).select());
  check(bDelete.rows.length === 0, 'cannot delete what A published');

  // A positive control, without which a typo in the table name would look
  // exactly like a perfect pass.
  section('A, against its own session');
  const aUpdate = await rowsFrom(
    a.from(TABLE).update({ session_id: `sess-${RUN}-2` }).eq('share_key', liveKey).select()
  );
  check(aUpdate.rows.length === 1, 'can update it');

  // ------------------------------------------------------------------ expiry
  section('Expiry');
  const expiredKey = key();
  await a.from(TABLE).insert({
    share_key: expiredKey,
    session_id: `sess-${RUN}-old`,
    snapshot: snapshot(),
    expires_at: new Date(Date.now() - 3600_000).toISOString(),
  });
  const expired = await anon.rpc(FUNCTION, { key: expiredKey });
  check(expired.data === null, 'an expired session is not served');
  check(
    expired.data === null && guessed.data === null,
    'and looks exactly like a key that never existed, so nothing can be enumerated'
  );

  const greedyKey = key();
  await a.from(TABLE).insert({
    share_key: greedyKey,
    session_id: `sess-${RUN}-greedy`,
    snapshot: snapshot(),
    expires_at: '3000-01-01T00:00:00.000Z',
  });
  const greedy = await rowsFrom(a.from(TABLE).select('expires_at').eq('share_key', greedyKey));
  const granted = new Date(greedy.rows[0]?.expires_at ?? 0).getTime() - Date.now();
  check(
    granted > 0 && granted < 50 * 3600_000,
    'a client asking for a thousand years is given two days',
    `got ${Math.round(granted / 3600_000)} hours`
  );

  // -------------------------------------------------------------------- caps
  section('Limits');
  const huge = snapshot('x'.repeat(300_000));
  const tooBig = await a
    .from(TABLE)
    .insert({ share_key: key(), session_id: 'big', snapshot: huge, expires_at: inADay() });
  check(!!tooBig.error, 'a session too large to be one is refused');

  const many = Array.from({ length: 25 }, () => ({
    share_key: key(),
    session_id: `sess-${RUN}-bulk`,
    snapshot: snapshot(),
    expires_at: inADay(),
  }));
  const tooMany = await a.from(TABLE).insert(many);
  check(!!tooMany.error, 'an account cannot fill the table with shares');
  check(
    String(tooMany.error?.message ?? '').startsWith('This account is full.'),
    'and is told so in words the app already knows how to show',
    tooMany.error?.message
  );

  // -------------------------------------------------------- deleting the owner
  section('Deleting the account');
  const { error: goneError } = await a.rpc('delete_my_account');
  check(!goneError, 'A can delete its account', goneError?.message);
  const orphan = await anon.rpc(FUNCTION, { key: liveKey });
  check(
    orphan.data === null,
    'and its published sessions go with it, rather than outliving the owner'
  );

  section(`${checks - failures}/${checks} checks passed`);
  await cleanup();
  process.exit(failures === 0 ? 0 : 1);
}

// ----------------------------------------------------------------- self-test --

const PSQL = '/opt/homebrew/opt/libpq/bin/psql';
const DECOY = `share_decoy_${RUN}`;
const DECOY_FN = `share_decoy_read_${RUN}`;

function dbUrlOrNull() {
  try {
    return execFileSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], {
      encoding: 'utf8',
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
 * Stands up a table and a function wrong in exactly the ways the real ones are
 * right, and requires every probe above to notice. The decoy holds one row this
 * script writes and nothing else, so nothing real is exposed for the seconds it
 * exists.
 */
async function selfTest() {
  const dbUrl = dbUrlOrNull();
  if (!dbUrl) {
    console.error('--self-test needs the database password in the Keychain.');
    process.exit(1);
  }

  console.log(`Building a deliberately holed table, ${DECOY}.`);
  psql(
    dbUrl,
    `
    create table public.${DECOY} (
      share_key text primary key,
      user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
      snapshot jsonb not null,
      expires_at timestamptz not null
    );
    alter table public.${DECOY} enable row level security;

    -- Hole one: anybody at all may read the whole table.
    create policy ${DECOY}_read on public.${DECOY} for select to anon, authenticated using (true);
    create policy ${DECOY}_write on public.${DECOY} for insert to authenticated with check (true);

    -- Hole two: the function hands back the row, owner and all, and does not
    -- care whether the session has expired.
    create or replace function public.${DECOY_FN}(key text)
    returns jsonb language sql security definer set search_path = '' stable as $fn$
      select to_jsonb(s) from public.${DECOY} s where s.share_key = key;
    $fn$;
    grant execute on function public.${DECOY_FN}(text) to anon, authenticated;

    notify pgrst, 'reload schema';
  `
  );

  // PostgREST needs a moment to notice the new table.
  await new Promise((r) => setTimeout(r, 3000));

  const a = newClient();
  const anon = newClient();
  await signUpProbe(a, EMAIL_A);

  const liveKey = key();
  const expiredKey = key();
  await a.from(DECOY).insert({ share_key: liveKey, snapshot: snapshot(), expires_at: inADay() });
  await a.from(DECOY).insert({
    share_key: expiredKey,
    snapshot: snapshot(),
    expires_at: new Date(Date.now() - 3600_000).toISOString(),
  });

  section('Every probe below MUST go red');

  const table = await rowsFrom(anon.from(DECOY).select('*'));
  check(table.rows.length === 0, 'a stranger cannot read the table');

  const leaked = await anon.rpc(DECOY_FN, { key: liveKey });
  check(
    leaked.data !== null && !('user_id' in leaked.data),
    'the function says nothing about who owns a session'
  );

  const expired = await anon.rpc(DECOY_FN, { key: expiredKey });
  check(expired.data === null, 'an expired session is not served');

  section(
    failures === 3
      ? `PASS. All ${failures} probes went red, so they can tell a hole from a wall.`
      : `BROKEN. ${failures} of 3 probes went red. This file cannot be trusted.`
  );

  psql(
    dbUrl,
    `drop function if exists public.${DECOY_FN}(text);
     drop table if exists public.${DECOY} cascade;
     notify pgrst, 'reload schema';`
  );
  console.log(`Decoy removed.`);

  await cleanup();
  process.exit(failures === 3 ? 0 : 1);
}

// ------------------------------------------------------------------- cleanup --

async function cleanup() {
  section('Cleaning up');
  const dbUrl = dbUrlOrNull();
  if (!dbUrl) {
    console.log('  SKIPPED. No database password in the Keychain.');
    console.log('  Delete the probe accounts by hand, in the Supabase SQL editor:');
    console.log(
      `    delete from auth.users where email like 'share-probe-%-${RUN}@example.invalid';`
    );
    return;
  }
  try {
    const left = psql(
      dbUrl,
      `delete from auth.users where email like 'share-probe-%-${RUN}@example.invalid';
       select count(*) from auth.users where email like 'share-probe-%';`
    )
      .split('\n')
      .pop();
    if (left === '0') {
      console.log('  ok    both probe accounts removed, and none left from earlier runs');
    } else {
      console.log(`  WARN  ${left} probe account(s) still in the database.`);
      console.log("        Clear them with: delete from auth.users where email like 'share-probe-%';");
    }
  } catch (e) {
    console.log(`  WARN  cleanup failed: ${String(e.message).split('\n')[0]}`);
  }
}

const entry = process.argv.includes('--self-test') ? selfTest : main;

entry().catch((e) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
