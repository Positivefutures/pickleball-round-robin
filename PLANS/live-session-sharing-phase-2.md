# Live Session Sharing (Phase 2)

## Context

Phase 1 shipped in v1.50: courts carry a scoreboard and the schedule page ranks
the afternoon. All of it lives on the host's phone. Twelve people standing around
the net still have to lean over that phone to see who is up next and who is
winning.

This is the other half. A signed-in host taps **Share Live Session** in the
Actions sheet, gets a QR code, and everyone points a camera at it. Their phones
open a read-only view of the same session that keeps up as scores land.

Phase 1 built for this on purpose and the groundwork is real: `sessionSnapshot.ts`
is a versioned document with no callers, `standings.ts` has no React or store
imports, `StandingsPanel`'s props are exactly `{ schedule, players }`, and
`stores.sessionId` is minted on generate and read by nobody. Those all get their
first caller here.

**Decided with the user:** QR via one tiny lazy-loaded dependency; ratings and
group ids withheld from the published document; links live **24 hours**; the
control is an **Actions sheet card** on the Schedule page.

---

## 1. The security shape, which decides everything else

There is **no anonymous read anywhere in this database today**. Sixteen policies
across four tables, every one `to authenticated` with `auth.uid() = user_id`, and
`scripts/prove-rls.mjs` asserts a signed-out client sees nothing.

A viewer has no `auth.uid()`, so something has to change. Two ways, and only one
is safe:

- ❌ **A permissive select policy** (`for select to anon using (true)`). PostgREST
  allows unfiltered selects, so this is not "anyone with a link can read one
  session", it is **anyone at all can dump every session**. Not an option.
- ✅ **A `security definer` function granted to `anon`**, taking the share key and
  returning at most one snapshot. RLS on the table stays owner-only and unchanged.
  This is the `delete_my_account()` pattern from
  [0004_delete_account.sql](supabase/migrations/0004_delete_account.sql), and it is
  what the "no server tier" rule in project memory points at.

Consequences that follow, and each one is load-bearing:

- **The key is the whole control.** The publishable key ships in the bundle and
  there is no tier to rate-limit in, so entropy is the only defence against
  enumeration. **Ten characters** from a 32-symbol alphabet is 2^50, about a
  quadrillion. With a QR code nobody types it, so length is free.
- **The function must not say whether a key exists.** Returning "expired" rather
  than "no such link" hands an enumerator exactly the oracle they want. It returns
  `null` for missing, expired and revoked alike, and the viewer shows one message
  for all three.
- **The function returns the snapshot only.** No `user_id`, no `expires_at`, no
  row. Nothing about the host leaves the database.

## 2. The migration — `supabase/migrations/0005_live_sessions.sql`

One file, run whole in the SQL Editor, matching the house conventions in 0001-0004.

```sql
create table public.shared_sessions (
  share_key   text primary key,
  user_id     uuid not null default auth.uid()
              references auth.users(id) on delete cascade,
  session_id  text not null,
  snapshot    jsonb not null,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);
create index shared_sessions_owner_idx on public.shared_sessions (user_id);
```

- `share_key` is the primary key because the lookup is by key and nothing else.
- The `auth.users` cascade is not optional: `0004`'s entire correctness argument
  is that deleting the one row is the whole job. A table without it silently
  makes `delete_my_account()` incomplete.
- `default auth.uid()` follows [0002_owner_defaults.sql](supabase/migrations/0002_owner_defaults.sql),
  so the client never sends `user_id` — the same discipline as `sync.ts:378-380`.
- Attach the existing `public.touch_server_updated_at()` trigger, four owner-scoped
  policies character-for-character like `preferences_*`, and RLS enabled.

**Caps**, copied from [0003_row_caps.sql](supabase/migrations/0003_row_caps.sql),
because a table with anon-reachable rows and no ceiling re-opens the hole 0003 closed:

```sql
alter table public.shared_sessions
  add constraint shared_sessions_snapshot_size
  check (octet_length(snapshot::text) <= 262144);      -- ~8x a big session
```
plus `share_key` length exactly 10, `session_id` ≤ 64, and a **statement-level
after-insert trigger** capping rows per user at 20, using the
`referencing new table as inserted ... for each statement` shape from `0003:113-121`
so a re-publish that resolves to an update never trips it.

**The read function:**

```sql
create or replace function public.shared_session(key text)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select s.snapshot
  from public.shared_sessions s
  where s.share_key = key
    and s.revoked_at is null
    and s.expires_at > now();
$$;

revoke all on function public.shared_session(text) from public;
grant execute on function public.shared_session(text) to anon, authenticated;

notify pgrst, 'reload schema';
```

Write the same four-point safeguard comment 0004 carries: one argument and it is
the secret itself, empty `search_path` with everything qualified, the projection
is a single column so no owner data can escape, and `stable` rather than
`volatile` so PostgREST exposes it without side effects.

**Also in this migration, and this is the sequencing the Phase 1 commit deferred:**

```sql
alter table public.preferences
  add column if not exists scoring_enabled boolean not null default false;
```

`preferences` has fixed columns, so a client that ships `scoring_enabled` before
this SQL runs gets `PGRST204` and breaks **all** preference sync for every
signed-in user, on a forever-retrying backoff. **Run the SQL first, deploy second.**

## 3. What gets published

`SessionSnapshot` is still on `SNAPSHOT_VERSION = 1` and nothing has ever published
one, so the version is unspent and stays 1.

`Player` objects are embedded three times over in a snapshot — in `players`, in
every `court.team1`/`team2`, and in every `round.sitOuts`. They carry
`rating`, `gender`, `rosterIds` and `id`, and `CourtAssignment.ratingDiff` leaks the
same judgement in aggregate. `CourtMatchup.tsx:131` prints the rating on every chip
today; a host's private assessment of a player is not something to put behind a
link anyone can open.

Add to [sessionSnapshot.ts](src/lib/sessionSnapshot.ts):

```ts
/**
 * The same session with the host's private judgement taken out.
 *
 * A rating is the host's opinion of somebody, and this document goes behind a
 * link that anyone can open. Not drawing it would not be enough — it would still
 * be in the JSON for anyone who opened a network tab. So it never leaves.
 *
 * Zero rather than absent, and an empty array rather than absent, so the shape
 * stays a Schedule and every component that already reads one still can. Nothing
 * in the viewer reads either field. Gender stays: the viewer draws nothing from
 * it today, but it is what a round already announces as Mixed or Gendered.
 */
export function withholdPrivate(snapshot: SessionSnapshot): SessionSnapshot
```

Zeroes `rating` and empties `rosterIds` on every `Player` reached from any of the
three places, and sets `ratingDiff` to 0 on every court. The test is the point:
build a snapshot with distinctive ratings, `JSON.stringify` the redacted copy, and
assert none of those numbers appear anywhere in the string.

**Whose players go in.** `SessionSnapshot.players` is documented as everybody in
the session *including anyone who has gone home*. `SchedulePage`'s `players` prop
is `attendingPlayers`, which filters `removedIds` out — building from it would drop
departed players. The publisher composes its own list from the stores:
`[...stores.players, ...stores.guests]` filtered to `stores.selectedIds`, with
`removedIds` **not** applied. Verify this against `App.tsx:184-198` and `:346-348`
when implementing; guests must be present in `selectedIds` for the filter to keep them.

## 4. The share key — `src/lib/shareKey.ts`

Small and pure, and its own module so `main.tsx` can decide whether to boot the
viewer without pulling in the publisher.

```ts
/** Crockford's base 32 less I, L, O and U, so a key read aloud has no twins. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const SHARE_KEY_LENGTH = 10;

export function mintShareKey(): string        // crypto.getRandomValues, byte & 31 (32 divides 256, so unbiased)
export function isShareKey(v: string): boolean
export function shareUrl(key: string): string // derived from APP_URL, never a second hardcoded host
export function sharedKeyFromUrl(): string | null  // reads ?s=, returns null unless isShareKey
```

`?s=` on the root is the only URL shape that works here. `sw.ts:74-111` routes on
`pathname` alone and discards the query, so `/?s=KEY` already resolves to the
precached shell — offline, installed, everywhere. A path like `/s/KEY` would 404 at
Vercel and be `'pass'`ed by the worker, and `sw.ts:106-110` explicitly refuses a
navigation fallback. `?s=` collides with nothing (`?code`, `?error_description`,
`?crashtest` are the only params in use).

`sharedKeyFromUrl()` validating rather than merely reading is deliberate: a junk
`?s=` must fall through to the normal app, not a broken viewer.

## 5. Publishing — `src/lib/liveSession.ts`

Modelled on `sync.ts`, and deliberately **not** part of it. `sync.ts:193` watches
only the person's data and `sync.test.ts:819` pins that a live session belongs to
the device. This is a separate channel with its own store, its own debounce and its
own backoff.

```ts
export type LiveStatus =
  | { state: 'off' }
  | { state: 'starting' }
  | { state: 'live'; url: string; at: string }
  | { state: 'publishing'; url: string }
  | { state: 'problem'; url: string | null; message: string };

export const liveStatusStore = { get, subscribe };  // the useSyncExternalStore shape sync.ts uses
export async function startSharing(): Promise<void>;
export async function stopSharing(): Promise<void>;
export function startLive(): void;   // once, from App, beside startSync()
export function endSharing(): void;  // fire and forget, for session teardown
```

**The seam is the stores, not a callback.** `onUpdateSchedule` looks like the seam
and `SchedulePage.tsx:207-213` says so, but it catches only 4 of the 13 sites that
call `setSchedule` — reshuffle, add a court, substitute and nine others go round it.
Subscribing to `stores.schedule`, `completedRounds`, `guests`, `players`,
`selectedIds`, `removedIds` and `scoringEnabled` catches all thirteen for free, and
it is exactly what `startTracking()` in `sync.ts:198-264` already does.

- **Debounce 1500ms**, matching `FLUSH_DELAY_MS`. A trailing timer, same shape.
- **Publish** is `upsert(row, { onConflict: 'share_key' })` with `user_id` omitted.
  A `23505` means the minted key collided with a row RLS hides from us, which is
  correct and rare: mint again and retry, three times, then give up loudly.
- **Backoff** on failure: 15s doubling to a 5-minute cap, `PUSH_RETRY_BASE_MS`'s
  numbers. A fresh edit still publishes on the 1.5s debounce; only the retry backs off.
- **Republish on `visibilitychange` → visible**, so a phone that slept through three
  rounds catches up the moment it wakes.
- `expires_at` is `now + 24h`, refreshed on every publish, so an afternoon that runs
  long never dies mid-session.

**Teardown, in three places, and one of them is an existing bug:**

1. `clearSession` in `App.tsx:249-269` (Start New Session, roster switch, group
   delete) must call `endSharing()`. It already nulls `sessionId`; the share must go
   the same way or the link outlives the session it names.
2. `stopSharing()` sets `revoked_at` and clears the local key.
3. **`sync.ts:930-938`** (`adoptAccountCopy`) wipes the schedule but leaves
   `sessionId` and `guests` behind. That is invisible today. With a live share it
   becomes a link pointing at a schedule the device no longer has. Fix it there.

New device-half store in [stores.ts](src/lib/stores.ts), beside `sessionId`:
`export const shareKey = createStoredValue<string | null>('pb-share-key', null);`

## 6. Reading — `src/lib/liveViewer.ts`

```ts
export type LiveFetch =
  | { state: 'ok'; snapshot: SessionSnapshot }
  | { state: 'gone' }        // missing, expired or revoked — deliberately one state
  | { state: 'offline' }
  | { state: 'error'; message: string };

export async function fetchShared(key: string): Promise<LiveFetch>;
```

Calls `supabase.rpc('shared_session', { key })`. `null` data is `'gone'`.

**Validate the returned document before rendering it.** It is JSON from a network
call and the viewer will index into `schedule.rounds`. Check `version`, that
`rounds` is an array, and that every round has `courts` and `sitOuts` arrays. An
unrecognised `version` greater than ours renders "This session needs a newer
version of the app. Reload the page." rather than crashing into `ErrorBoundary`.

**A note on the client.** `getSupabase()` is a module-level singleton with
`persistSession: true`, so a signed-in host opening their own share link calls the
RPC carrying their own JWT. The function is `security definer`, so it behaves
identically either way, and no separate anonymous client is needed. Worth a comment
at the call site, because it looks like a bug and is not.

## 7. The viewer

**Branch at `main.tsx:32`**, alongside the `crashTestRequested()` precedent:

```tsx
{crashTestRequested() ? <CrashTest />
  : sharedKey ? <LiveSessionPage shareKey={sharedKey} />
  : <App />}
```

Not inside `App`. A visitor has their **own** saved session in localStorage, and
every one of App's 20+ `useStoredValue` calls reads it in a lazy initializer before
any early return could fire. Branching at the root keeps a visitor's device
untouched and keeps `startSync()`, the 50 static imports and the whole host app out
of their boot. `App.walkthrough.test.ts` and `App.print.test.ts` import `./App`
directly, so both suites are unaffected.

**`src/components/live/LiveSessionPage.tsx`** — the whole page for that visitor:
loading, gone, or live. Polls every **20 seconds while visible**, pauses when
hidden, and refetches immediately on becoming visible. No Supabase Realtime; there
is none anywhere in this codebase and polling is what `sync.ts` does.

Renders: a heading naming the session, each round in the host's order with completed
ones marked, each court, the sit-outs, and `<StandingsPanel schedule players />`
unchanged when `scoringEnabled`. Plus a quiet "Updated 18:42" line, because a live
view that has silently stopped updating is worse than one that admits it.

**`src/components/live/LiveCourt.tsx`** — a read-only court card. `CourtMatchup` is
not reusable here: it prints `player.rating.toFixed(1)` at `:131`, draws
`BalanceIndicator` at `:388`, and takes eight interaction props. This one takes
`{ court, scoringEnabled }` and composes the **exported** `ScorePanel` and
`ScoreColon` from [Scoreboard.tsx](src/components/schedule/Scoreboard.tsx) — the
same panels and the same `PANEL_TONE`, so a green side means the same thing on both
phones — plus `GuestChip`, which is already pure.

Chrome: full-screen in the [InstructionsPanel](src/components/layout/InstructionsPanel.tsx#L56)
mould, `.app-shell` / `.app-panel` from `index.css` so it looks like the app, and its
own `useScrollLock` is **not** needed since it is a page rather than an overlay.

## 8. The QR code

**Add `qrcode-generator@2.0.4`** — MIT, ships its own `.d.ts`, and has zero
dependencies of its own. This is a different trade from the one `vite.config.ts:16-18`
refuses: that was 267 packages and nine advisories for a service worker; this is one
file. Hand-rolling Reed-Solomon and mask selection is squarely in the tradition of
`pdf.ts`, but a QR that looks right and will not scan is a failure mode with no
decoder in this repo to catch it.

**Lazy-imported** inside the share view, the way `getSupabase()` is
([supabase.ts:31-53](src/lib/supabase.ts#L31-L53)), so a visitor who never taps
Share never downloads it.

**`src/components/QrCode.tsx`** renders the matrix as a single `<path>` of `Mx yhVvz`
segments in one `<svg viewBox="0 0 n n">`. Not `createSvgTag()`, which would mean
`dangerouslySetInnerHTML`, and not a canvas, which does not scale or print. `shapeRendering="crispEdges"`.

## 9. The share view

A new card in [ActionsSheet.tsx](src/components/schedule/ActionsSheet.tsx): add
`'share-live'` to the `View` union, a `CARDS` entry, and a `HEADINGS` entry. Tone
`TEAL` and a new icon in `actionIcons.tsx`.

The card is shown only when `ACCOUNTS_ENABLED && isSupabaseConfigured()`, matching
`showAccountItem` at `App.tsx:769` and the "no config means no item rather than a
dead button" precedent at `SettingsPanel.tsx:240`.

**It needs no new props and touches `App.tsx` not at all.** The view reads
`liveStatusStore` through `useSyncExternalStore` and calls `startSharing()` /
`stopSharing()` directly, exactly as `AccountPanel.tsx:36-40` reads `authStore` and
`syncStatusStore`. The publisher reads the session from the stores itself, so there
is nothing to hand it.

Three states:

- **Signed out** — sharing writes under `auth.uid()`, so there is no signed-out
  version of this. Copy: *"Sharing needs an account. Open the menu and choose My
  Account to sign in."*
- **Off** — what it does, then one green **Share This Session** button.
- **Live** — the QR at about 240px, the link in a `select-all` box, a **Share…**
  button when `canShare()`, **Copy Link**, and **Stop Sharing** in the destructive
  style. This is [SharePanel.tsx](src/components/layout/SharePanel.tsx) rearranged
  around a QR, and it should read as its sibling.

`src/lib/share.ts` widens by one argument: `sharePayload(url = APP_URL)` and
`shareApp(payload, share?)`. The iOS rule in its docblock still holds and must be
kept — `share()` is called before anything is awaited, or the sheet silently never
opens.

## 10. Tests

House rules: colocated `*.test.ts`, never `.tsx`; `@vitest-environment happy-dom` in
the docblock of every DOM test; `createElement` + `createRoot` + `act`; assert on
rendered output, never on the fact that it compiled, because
`tsconfig.app.json` excludes tests from `tsc -b`.

- **`shareKey.test.ts`** — a minted key is 10 chars and all in the alphabet; 10,000
  keys hit every symbol and repeat none; `isShareKey` rejects lowercase, `I`, `L`,
  `O`, `U`, wrong lengths and empty; `sharedKeyFromUrl` reads a good `?s=`, returns
  null for junk, and returns null when the param is absent; `shareUrl` is built from
  `APP_URL` and round-trips.
- **`sessionSnapshot.test.ts`** additions — the redaction test above; the redacted
  copy still round-trips through JSON; a guest survives redaction with `guest: true`
  intact; `standings()` over a redacted snapshot gives the same table as over the
  original, which is what proves nothing the standings need was thrown away.
- **`liveSession.test.ts`** — a fake supabase, as `sync.test.ts` does. Publishing
  debounces two quick edits into one write; the row omits `user_id`; a `23505` mints
  a new key and retries; three collisions give up with a `problem` status; a failure
  backs off and a fresh edit still goes at 1.5s; `stopSharing` sets `revoked_at`;
  `endSharing` runs from `clearSession`; the published document has no ratings in it.
- **`liveViewer.test.ts`** — a null RPC result is `gone`; a good one is `ok`; a
  snapshot with a higher `version` is refused rather than rendered; a snapshot with
  `rounds` missing is refused; a network throw is `offline`.
- **`LiveSessionPage.test.ts`** — renders courts, sit-outs and standings from a
  fixture; **renders no rating and no balance indicator anywhere**; `gone` shows the
  one message; polls again on a timer and repaints when the score changes.
- **`QrCode.test.ts`** — a known input gives a stable path length and the three
  finder squares are dark at the three corners.
- **`ActionsSheet.test.ts`** — the card is absent when Supabase is unconfigured.
- **`App.walkthrough.test.ts`** — Start New Session tears the share down.
- **Sabotage every one of these**, one deliberate break per assertion, each turning
  the suite red. In particular: make `withholdPrivate` miss `sitOuts`, and make
  `sharedKeyFromUrl` skip validation.

## 11. Proving the policies

`scripts/prove-share.mjs`, in the mould of `prove-rls.mjs` — two real accounts, the
publishable key that already ships, and a `--self-test` that builds a deliberately
holed table and insists every probe goes red.

1. Anon `select` on `shared_sessions` returns **nothing**, and anon insert/update/
   delete are refused.
2. Anon **can** `rpc('shared_session', { key })` with a live key and gets the
   snapshot.
3. The RPC returns `null` for a bad key, an expired row and a revoked row — the
   three indistinguishable.
4. The RPC's return contains no `user_id`, no `expires_at`, no row.
5. Account A cannot read, update or delete B's row, **and** A can do all three to
   its own — the positive control, without which a typo'd table name looks like a
   perfect pass.
6. The size cap and the 20-row cap both bite.
7. Deleting an account takes its shared sessions with it.

Also add `'shared_sessions'` to `TABLES` at `scripts/prove-rls.mjs:41`, or the
existing anon-read proof silently skips the one new table that has an anon entry point.

## 12. Verification

1. **Run the SQL first.** `0005` in the Supabase SQL Editor, whole. Confirm the
   `notify pgrst` took by calling the RPC once.
2. `npx tsc -b`, `npm run build`, `npm test`, `npx eslint src` — **`src` only**,
   `npm run lint` walks a stray backup folder for five minutes.
3. `node scripts/prove-share.mjs` then `--self-test`; re-run `prove-rls.mjs` and
   `prove-delete.mjs`, both of which now cover a table they did not before.
4. **Two browsers, playwright-core from the scratchpad** against the chromium on
   disk. Host signs in, generates with scoring on, shares. Open the URL in a second
   **fresh context with its own storage**, and check: the courts and standings are
   there, the visitor's own localStorage is untouched, and **no rating and no
   balance bar appear anywhere**. Score a game on the host and watch it arrive
   within one poll. Then Stop Sharing and confirm the viewer turns over to the ended
   message.
5. **Scan the QR with a real phone.** Chrome's `BarcodeDetector` is worth trying
   first from the playwright pass, but a code that a camera will not read is the
   whole failure mode, and a phone is the only honest test of it.
6. Read the network tab on the viewer and confirm the response body carries no
   ratings. This is the requirement, and it is the one that cannot be checked by
   looking at the screen.
7. Bump `APP_VERSION` to `1.60` in the same commit as the deploy.

## Two things flagged, not changed

- **Link previews will show the generic app card.** `index.html:54-55` hardcodes
  `og:url` and `og:image`, Vercel serves the file verbatim, and there is no SSR
  here. "Tuesday Night Ladder, live now" in a WhatsApp preview needs a server tier
  this app does not have. Say so rather than let it look like an oversight.
- **A viewer on a stale service worker gets the old shell.** `sw.ts` serves the
  precached `/index.html` and holds a new build until Reload. Someone who has not
  taken an update since before this ships will open `?s=` and get the plain app.
  It self-corrects on their next reload, and the alternative is reversing the
  deliberate no-fallback decision at `sw.ts:106-110`.
