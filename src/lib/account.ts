import { APP_VERSION } from './appInfo';
import { friendlyError } from './auth';
import { forgetAccount } from './sync';
import { getSupabase } from './supabase';

/**
 * The two things you can do to an account that are not signing in and out:
 * take a copy of everything it holds, and end it.
 *
 * They are one module because they are one conversation. Somebody about to
 * delete an account is exactly the person who should be offered the download
 * first, and the delete screen offers it.
 *
 * Neither function touches the DOM. Building the file and handing it to the
 * browser are separate jobs, so the shape of the export can be asserted in a
 * test without a download ever happening — the same split `downloadTextFile`
 * already exists for.
 */

export type AccountResult<T = void> = { ok: true; value: T } | { ok: false; message: string };

/** A file ready to hand to the browser: what to call it, and what is in it. */
export interface MyDataFile {
  name: string;
  json: string;
}

type Row = Record<string, unknown>;

/**
 * The plain-English half of the export, carried inside the file itself.
 *
 * A JSON file arriving in a downloads folder with no explanation is a
 * technically complete answer and a practically useless one. The column names
 * below are the server's own, because an access request should show what is
 * actually held rather than a tidied-up retelling of it, and that is precisely
 * why they need translating.
 */
const README = [
  'This file holds everything your Pickleball Round Robin account has on the server.',
  'It was made by the Download My Data button in the app. Nobody was sent a copy.',
  '',
  'account: how you sign in, as the server holds it. There is no password, because this app never had one.',
  'groups: one entry per group. The app calls them groups and the database calls them rosters, which is why the file says both.',
  'players: one entry per player. roster_ids lists the groups they play in.',
  'settings: courts, rounds, and the rating a new player starts at.',
  '',
  'An entry with a deleted_at date was deleted. It is kept only until your other devices have seen that it went, and it is not shown anywhere in the app.',
  '',
  'Anything not listed here never left your device. The schedule you are running now, who has sat out, and which rounds are finished are all on the phone or computer you built them on.',
  '',
  'To open your groups in a spreadsheet instead, use Import / Export in the app. That file is the convenient one. This one is the complete one.',
];

/**
 * Dated in local time, matching the all-groups CSV export. Somebody who takes a
 * copy twice needs to be able to tell them apart in a downloads folder, and the
 * stamp should say the day they pressed the button in their own timezone.
 */
export function toMyDataFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `pickleball-my-data-${stamp}.json`;
}

/**
 * Errors from a signed-in account action, in words worth showing.
 *
 * The one case auth's mapping cannot know about is a token that has stopped
 * being good, which PostgREST answers with a 401 or 403. "Try again in a
 * moment" would be wrong there, because trying again does the same thing.
 */
function describe(error: unknown): string {
  const status =
    typeof error === 'object' && error !== null
      ? (error as { status?: unknown }).status
      : undefined;
  const text = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();

  if (
    status === 401 ||
    status === 403 ||
    text.includes('not signed in') ||
    text.includes('jwt') ||
    text.includes('session')
  ) {
    return 'You are not signed in any more. Sign in again, then try this.';
  }
  return friendlyError(error);
}

/**
 * Turns a returned failure into a thrown one, so a single catch covers every
 * call in a function rather than each one carrying its own branch.
 *
 * It is rebuilt as a real Error rather than thrown as it stands. PostgREST
 * answers with a plain object, and every place that reads a message asks
 * `error instanceof Error ? error.message : String(error)` — so thrown raw, a
 * perfectly good message arrives at the user as "[object Object]".
 */
function raise(error: { message: string; code?: string; status?: number } | null): void {
  if (!error) return;
  const failure = new Error(error.message) as Error & { code?: string; status?: number };
  if (error.code !== undefined) failure.code = error.code;
  if (error.status !== undefined) failure.status = error.status;
  throw failure;
}

/**
 * Everything the account holds, as one JSON file.
 *
 * Read with the publishable key under the caller's own session, so RLS is what
 * decides the scope. There is no privileged read here and there does not need
 * to be: the policies in 0001 already show an account exactly its own rows, so
 * `select *` is both the simplest query and the correct one.
 */
export async function buildMyDataFile(now = new Date()): Promise<AccountResult<MyDataFile>> {
  try {
    const supabase = await getSupabase();

    // Deliberately getUser and not getSession. getSession reads what is in this
    // browser, which may be a token for an account that has since gone; getUser
    // asks the server. An export is a record of what is held, so it should be
    // built from an answer the server just gave.
    const { data: userData, error: userError } = await supabase.auth.getUser();
    raise(userError);
    const user = userData?.user;
    if (!user) throw new Error('Not signed in.');

    const [profiles, rosters, players, preferences] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('rosters').select('*'),
      supabase.from('players').select('*'),
      supabase.from('preferences').select('*'),
    ]);
    for (const result of [profiles, rosters, players, preferences]) raise(result.error);

    const file = {
      readme: README,
      exported_at: now.toISOString(),
      app: 'Pickleball Round Robin',
      app_version: APP_VERSION,
      account: {
        user_id: user.id,
        email: user.email ?? null,
        created_at: user.created_at ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
        // The profile row exists so billing can be added later without a schema
        // change. It is included because it is held, not because it says
        // anything interesting today.
        profile: ((profiles.data ?? []) as Row[])[0] ?? null,
      },
      groups: (rosters.data ?? []) as Row[],
      players: (players.data ?? []) as Row[],
      settings: ((preferences.data ?? []) as Row[])[0] ?? null,
    };

    return {
      ok: true,
      value: {
        name: toMyDataFileName(now),
        // Indented. It is a file a person may well open, and two spaces is the
        // difference between readable and a single unbroken line.
        json: JSON.stringify(file, null, 2),
      },
    };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

/**
 * Ends the account, and everything the server holds under it.
 *
 * The deletion itself is one call to `public.delete_my_account()`, added in
 * `supabase/migrations/0004_delete_account.sql`. It takes no arguments, so
 * there is no account to name and none to get wrong: it deletes whoever the
 * token says is calling. Everything under it goes by cascade.
 *
 * Nothing on this device is touched. The groups and players stay where they
 * are, and the app carries on exactly as it does for somebody who never signed
 * in, which is what the confirmation screen promises.
 */
export async function deleteMyAccount(): Promise<AccountResult> {
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.rpc('delete_my_account');
    raise(error);

    // Past this line the account is gone, and nothing below may report a
    // failure. Someone told it did not work would press the button again, be
    // told they are not signed in, and reasonably conclude their data is still
    // sitting on a server somewhere.
    forgetAccount();

    try {
      // Local only. The session row went with the account, so asking the server
      // to end a session it no longer has would fail for a reason that means
      // nothing here. This clears the token out of this browser, which is the
      // only part still outstanding.
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Storage refused, which is rare and survivable: the token names an
      // account that no longer exists, so it can do nothing with it.
    }

    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}
