# User accounts and cloud sync with Supabase

## Context

Today the app has no server. Everything a host builds — their groups, their
players, their ratings — lives in one browser's `localStorage` and nowhere else.
Change phone, switch browser, or let Safari evict the origin's storage, and it
is gone with no way back except the CSV export, which most people will never
have run.

This plan adds Supabase accounts so the server becomes the source of truth,
while keeping the app exactly as it is for anyone who never signs in. Local
storage stays, demoted from "the data" to "a cache of the data".

**Out of scope, explicitly:** no paywall, subscriptions, Stripe, or payment
logic. The `profiles` table carries a `subscription_status` column from day one
so adding that later is a backfill, not a rewrite.

---

## What the codebase actually looks like

**Framework.** Vite 7 + React 19 + TypeScript 5.9 + Tailwind v4 (CSS-first, no
config file). Vitest with happy-dom, 13 test files, 185 tests. Deployed to
Vercel as a static SPA. No router, no backend, no data-fetching library, no
environment variables anywhere in `src/` — `grep import.meta.env` returns
nothing.

**State management.** There is no state library and no context. Every piece of
persisted state is a `useState` in [App.tsx](src/App.tsx), which is a single
703-line component holding fourteen of them, plus two hooks —
[usePlayers.ts](src/hooks/usePlayers.ts) and
[useRosters.ts](src/hooks/useRosters.ts) — that wrap the same primitive.

That primitive is [useLocalStorage.ts](src/hooks/useLocalStorage.ts), 29 lines:
`useState` with a lazy initializer that reads `localStorage` once, and a setter
that writes through on every change.

[runMigrations()](src/lib/migrations.ts) runs in
[main.tsx:11](src/main.tsx#L11) before React mounts, reshaping stored data in
place.

**The localStorage shape.** Sixteen live keys, all plain JSON, no namespacing:

| Key | Type | Synced? |
|---|---|---|
| `pb-rosters` | `Roster[]` — `{id, name}` | **yes** |
| `pb-roster` | `Player[]` — the single global pool | **yes** |
| `pb-active-roster` | `string` | **yes** |
| `pb-default-rating` | `number` | **yes** |
| `pb-num-courts` / `pb-num-rounds` | `number` | **yes** |
| `pb-large-text` | `boolean` | **yes** |
| `pb-special-types` | `SpecialGameTypes` | **yes** |
| `pb-schedule` | `Schedule \| null` | no |
| `pb-completed-rounds` | `number[]` | no |
| `pb-removed-ids` / `pb-selected-ids` | `string[]` | no |
| `pb-schedule-edited` | `boolean` | no |
| `pb-schedule-roster` | `string \| null` | no |
| `pb-partnerships` | `Partnership[]` | no |
| `pb-install-dismissed` | `boolean` | no |

Plus three legacy keys that only `runMigrations` reads.

The interesting shape is `Player`: one global pool, with roster membership held
on the child as `rosterIds: string[]`. [usePlayers.ts:9-14](src/hooks/usePlayers.ts#L9-L14)
explains why — sharding per roster is impossible because `useLocalStorage`
cannot re-read when its key changes.

### Six things that make this awkward

1. **`useLocalStorage` is read-once, write-through.** It reads in the lazy
   initializer and never reads again. There is no `storage` event listener, no
   subscription, no re-read on focus. **Nothing outside React can push a new
   value in.** This is the single structural blocker: a sync engine that pulls
   fresher data from the server has no way to get it onto the screen. Every
   other part of this plan is easy by comparison, and Phase 0 exists solely to
   fix it.

2. **`generateId()` does not always return a UUID.**
   [helpers.ts:23-30](src/utils/helpers.ts#L23-L30) prefers
   `crypto.randomUUID()` but falls back to `'xxxx-xxxx-xxxx'` — twelve hex
   characters, not a UUID. Devices carrying ids in that shape exist. **Every id
   column must be `text`, not `uuid`,** or those rows fail to insert.

   The good news is the other half: ids are client-generated and globally
   unique, so local ids can become server primary keys directly. No id
   remapping, no `local_id` column, no translation layer.

3. **The app has no service worker.** `public/` holds icons and a manifest,
   nothing else. It does not currently load offline — it survives bad signal
   only because after load it makes zero network requests. Adding Supabase
   introduces network calls where there were none, so "works offline at the
   court" gets *harder* before it gets easier. True offline needs a service
   worker; that is Phase 6, and deliberately last.

4. **Magic links land in the wrong storage jar on iOS.** Tapping the link in
   Mail opens Safari, which does not share storage with the home-screen PWA. An
   installed user would sign in and find the app still logged out. Settled: the
   email carries **both a link and a 6-digit code**.

5. **The walkthrough test mounts the real App** and seeds `localStorage` by
   hand ([App.walkthrough.test.ts:26-43](src/App.walkthrough.test.ts#L26-L43)).
   A Supabase client constructed at module scope would break it. The client must
   be created lazily and only when env vars exist. Note that
   `tsconfig.app.json` excludes `*.test.ts`, so `tsc` will not catch a break
   here — only running the suite will.

6. **Bundle weight.** `@supabase/supabase-js` is well over 100KB. For an app
   whose pitch is speed on a phone at a court, it must be a dynamic `import()`,
   loaded only when someone opens the account panel or is already signed in.

---

## Decisions taken

| Question | Choice |
|---|---|
| Login email | Link **and** 6-digit code, so PWA users never leave the app |
| Second device with existing data | **Ask, then merge** — never silent |
| Live session (schedule, completed rounds) | **Device-local**, not synced |
| Visibility | Settings drawer item **plus** a dismissible banner |

---

## 1. Data model

Four tables. Shape deliberately mirrors the local types so the client-side
translation is field renaming and nothing more.

Two timestamps on every row, doing two different jobs:

- **`updated_at`** — set by the *client*, orders last-write-wins. An edit made
  offline on Tuesday must not beat one made on Wednesday just because it synced
  later.
- **`server_updated_at`** — set by a *server* trigger, used only as the pull
  cursor. Clients cannot write it, so a device with a skewed clock can never
  make itself invisible to another device's incremental pull.

`deleted_at` is a tombstone. Clients never issue a physical `delete`. Without
this, deleting a player on phone A and then syncing phone B would resurrect it,
because B still has the row and would happily push it back.

### The SQL — review before applying

```sql
-- ============================================================================
-- 0001_accounts.sql
-- Every table below enables RLS in this same migration, with select / insert /
-- update / delete all restricted to auth.uid() = user_id.
-- ============================================================================

-- Server-owned pull cursor. A BEFORE trigger, so a client that tries to send
-- this column has its value discarded rather than honoured.
create or replace function public.touch_server_updated_at()
returns trigger language plpgsql as $$
begin
  new.server_updated_at = now();
  return new;
end;
$$;


-- ---------------------------------------------------------------- profiles --
-- One row per user. The subscription columns are reserved: nothing reads or
-- writes them yet, they exist so billing is a later backfill.
create table public.profiles (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  email               text,
  subscription_status text not null default 'free',
  plan                text,
  current_period_end  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  server_updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_insert on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy profiles_update on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy profiles_delete on public.profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

create trigger profiles_touch before insert or update on public.profiles
  for each row execute function public.touch_server_updated_at();


-- ----------------------------------------------------------------- rosters --
create table public.rosters (
  user_id           uuid not null references auth.users(id) on delete cascade,
  -- text, not uuid: generateId() falls back to 'xxxx-xxxx-xxxx' on browsers
  -- without crypto.randomUUID, and devices carrying such ids exist.
  id                text not null,
  name              text not null,
  deleted_at        timestamptz,
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.rosters enable row level security;

create policy rosters_select on public.rosters
  for select to authenticated using ((select auth.uid()) = user_id);
create policy rosters_insert on public.rosters
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy rosters_update on public.rosters
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy rosters_delete on public.rosters
  for delete to authenticated using ((select auth.uid()) = user_id);

create index rosters_pull_idx on public.rosters (user_id, server_updated_at);

create trigger rosters_touch before insert or update on public.rosters
  for each row execute function public.touch_server_updated_at();


-- ----------------------------------------------------------------- players --
create table public.players (
  user_id           uuid not null references auth.users(id) on delete cascade,
  id                text not null,
  name              text not null,
  -- real, not numeric: PostgREST serialises numeric as a JSON *string* to
  -- preserve precision, which would break sumRatings() and every rating
  -- comparison in the pairing code. real round-trips as a JS number, and
  -- ratings move in 0.25 steps, which float4 represents exactly.
  rating            real not null,
  gender            text not null check (gender in ('M','F')),
  -- Array, matching Player.rosterIds one-for-one. A join table is more correct
  -- relationally, but it would cost a shape translation on every read and
  -- write plus a second entity in the outbox, for integrity the client never
  -- relies on today.
  roster_ids        text[] not null default '{}',
  deleted_at        timestamptz,
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.players enable row level security;

create policy players_select on public.players
  for select to authenticated using ((select auth.uid()) = user_id);
create policy players_insert on public.players
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy players_update on public.players
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy players_delete on public.players
  for delete to authenticated using ((select auth.uid()) = user_id);

create index players_pull_idx on public.players (user_id, server_updated_at);

create trigger players_touch before insert or update on public.players
  for each row execute function public.touch_server_updated_at();


-- ------------------------------------------------------------- preferences --
-- One row per user, last-write-wins as a whole. These are single scalars that
-- nobody edits concurrently; giving each its own row would be ceremony.
create table public.preferences (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  active_roster_id  text,
  default_rating    real    not null default 4.0,
  num_courts        int     not null default 3,
  num_rounds        int     not null default 8,
  large_text        boolean not null default false,
  special_types     jsonb   not null default '{}'::jsonb,
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

alter table public.preferences enable row level security;

create policy preferences_select on public.preferences
  for select to authenticated using ((select auth.uid()) = user_id);
create policy preferences_insert on public.preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy preferences_update on public.preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy preferences_delete on public.preferences
  for delete to authenticated using ((select auth.uid()) = user_id);

create trigger preferences_touch before insert or update on public.preferences
  for each row execute function public.touch_server_updated_at();


-- ------------------------------------------------- profile on signup ------
-- security definer so it can write past RLS; empty search_path is Supabase's
-- current guidance against search-path injection in definer functions.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

**Three details in there worth not skipping over:**

- The `update` policies carry **both** `using` and `with check`. With only
  `using`, a user could update their own row and set `user_id` to someone
  else's, handing the row away. This is the most commonly missed RLS mistake.
- `(select auth.uid())` rather than bare `auth.uid()` — Postgres caches the
  wrapped form once per statement instead of evaluating it per row.
- `profiles.user_id` is both the primary key and the policy column. Naming it
  `user_id` rather than the more usual `id` means every policy in the schema
  reads identically, which is worth the tiny redundancy.

---

## 2. Auth

Magic link / OTP only. No password APIs are called anywhere, so there is no
password to leak, reset, or reuse.

**Send** — `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })`.
The same call sends both the link and the code; which one the user acts on is
their choice.

**Redeem** — link handled by `detectSessionInUrl` on load; code handled by
`supabase.auth.verifyOtp({ email, token, type: 'email' })`.

There is no router, so the link returns to `/`. The Supabase SDK strips the
hash itself. `step` is plain `useState`, so the reload lands on Players (or
Schedule if a session is live), which is correct behaviour anyway.

### New components

All three follow the existing full-screen panel pattern — see
[DonatePanel.tsx](src/components/layout/DonatePanel.tsx) for the card, backdrop,
`stopPropagation` and Close button conventions.

- **`SignInPanel`** — logged out. One line of pitch, an email field, "Email me a
  link". Then the sent state: "Check your email" with a 6-digit code input and
  a resend control on a cooldown.
- **`AccountPanel`** — logged in. Shows the email, sync status
  (*Synced just now* / *3 changes waiting* / *Offline*), **Change email**, and
  **Log out**.
- **`SignInBanner`** — mirrors
  [InstallBanner.tsx](src/components/layout/InstallBanner.tsx) exactly: in
  normal flow, not an overlay, no scroll lock, a primary action and a dismiss
  ✕. Gated the same way `InstallBanner` is gated at
  [App.tsx:528-536](src/App.tsx#L528-L536) — only once there is data worth
  losing (`rosterPlayers.length >= 4`), never when signed in, and dismissal
  persists to a new `pb-signin-dismissed` key.

An **Account** item goes in [SettingsPanel.tsx](src/components/layout/SettingsPanel.tsx),
guarded by the configured-check exactly as `DONATE_URL &&` guards Donate at
[SettingsPanel.tsx:215](src/components/layout/SettingsPanel.tsx#L215) — no
Supabase env vars means no item, rather than a button that cannot work.

### Two auth behaviours to be deliberate about

- **Changing email.** Supabase's secure email change sends a confirmation to
  *both* the old and new addresses by default, and the change only lands when
  both are clicked. Someone who has lost access to the old address cannot move.
  Turning that off (confirm new address only) is a Dashboard toggle. Worth a
  conscious choice.
- **Logging out must not wipe local data.** The app returns to exactly its
  logged-out behaviour with the cache intact. The trade is that on a shared
  device the next person sees the previous person's groups, so `AccountPanel`
  offers a secondary **Log out and remove this device's copy** for that case.

---

## 3. Local-first sync

### Phase 0 first: one store, same signature

Replace the read-once hook with a tiny observable store per key, read through
React 19's `useSyncExternalStore`:

```ts
// src/lib/store.ts
createStoredValue<T>(key: string, initial: T, opts?: { sync?: boolean }): StoredValue<T>

// src/hooks/useStoredValue.ts
useStoredValue<T>(store: StoredValue<T>): [T, (v: T | ((prev: T) => T)) => void]
```

The returned tuple is identical to `useLocalStorage`'s, so
[App.tsx](src/App.tsx), [usePlayers.ts](src/hooks/usePlayers.ts) and
[useRosters.ts](src/hooks/useRosters.ts) change their import and their call
shape and nothing else. Write-through to `localStorage` stays synchronous and
unchanged. What is new is that the store has subscribers, so something outside
React can now set a value and have the UI follow — which is the whole point.

Device-local keys get `sync: false` and behave exactly as today.

### The engine

- **Outbox.** Every mutation to a synced store appends a row-level entry to
  `pb-sync-outbox`, itself persisted to `localStorage` so it survives a reload
  or a killed tab. It is a **map keyed by `table:rowId`**, so editing the same
  player five times leaves one entry, not five.
- **Push.** Flush the outbox with `upsert(..., { onConflict: 'user_id,id' })`.
  On success, drop the flushed entries. On failure, leave them and retry.
- **Pull.** `select * where server_updated_at > cursor`, cursor kept per account
  in `pb-sync-cursor:<userId>`. Triggered on boot, tab focus, the browser
  `online` event, and after every successful push. No Realtime subscription in
  v1 — for one person with two phones the cost is not worth it.
- **Apply.** For each pulled row: if there is a pending outbox entry for that
  `table:rowId`, keep the local value (the user's unsent edit wins and will be
  pushed). Otherwise take the server's if its `updated_at` is newer.

### Conflicts, and why data does not get clobbered

Last-write-wins per row, ordered by the client-stamped `updated_at`. Stated
plainly, because the honest answer to "how do you avoid clobbering" is not one
clever mechanism but four boring ones:

1. **Only touched rows are ever pushed.** The outbox holds what the user
   actually changed. A device that has been offline for a month and holds stale
   data does **not** upload its whole cache — it uploads the two players it
   edited. This is the property that matters most, and it is the one a naive
   "sync = upsert everything local" design gets wrong.
2. **Rows are narrow.** Editing Ava's rating on the phone and Ben's name on the
   laptop touches different rows. Both survive. Genuine conflict requires the
   *same* player edited on two devices while both were offline — at which point
   losing one edit costs a name or a rating, retyped in seconds.
3. **Deletes are tombstones,** so a delete propagates instead of being undone by
   the other device pushing the row back. A scheduled job purges tombstones
   older than 90 days.
4. **Clock skew cannot hide a row.** LWW uses the client clock; the pull cursor
   uses the server clock. A device an hour fast can win a conflict it should
   have lost, but it cannot make its rows invisible to the other device.

Field-level merge or CRDTs would be the next step up. They are not worth it
here: the edit surface is one person maintaining a list of their friends' names
and ratings.

**Left device-local:** the schedule, completed rounds, removed players, selected
players, partnerships, and the install/sign-in dismissals. Two phones at one
court both ticking round 3 complete is a conflict with no sensible resolution,
and a session lasts two hours. This is where sync bugs would come from and where
the value is lowest.

---

## 4. Migration

### Nothing changes for anyone who never signs in

Guaranteed structurally, not by discipline: with `VITE_SUPABASE_URL` absent the
Supabase module is never imported, the Account item and banner never render, and
the app is byte-for-byte its current self. That also keeps the 185 tests green
without stubbing anything, since the test environment has no env vars.

Signed out but configured is the same code path — the stores run in `sync:
false` mode, exactly as today.

### First login

On `SIGNED_IN`, read `pb-sync-account` (the account this device's cache belongs
to) and branch:

| Local state | Server state | Action |
|---|---|---|
| never synced | empty | **Seed.** Push every local roster, player and preference under its existing local id. Nothing to reconcile — this is the common case and it is silent. |
| never synced | has rows | **Ask,** then merge or adopt. |
| synced, same account | anything | Ordinary pull + outbox flush. No merge. |
| synced, different account | anything | Different person on this device: clear the synced caches and pull the new account clean. The old account's data is already on the server. |

`pb-sync-account` is what stops a re-login from re-running a merge, which is the
mechanism that makes the whole thing idempotent.

### The merge, and the duplicate problem

When the account already has data, the dialog from the decision above appears —
counts of what is on the account and what is on this device, and two buttons.
Choosing **Add them to my account** runs a pure planner:

```ts
// src/lib/syncMerge.ts
planMerge(local: LocalSnapshot, server: ServerSnapshot): MergePlan
```

Deliberately modelled on [planImport()](src/lib/groupImport.ts) — same
signature style, same purity, same reason (it is the fiddly part, so it gets
tested without a React tree). It reuses the matching rule that file already
ships:

- **Rosters** match on `name.trim().toLowerCase()`. On a match the local roster
  **adopts the server's id**, and every local `rosterIds` reference is rewritten
  to it. No match means a genuinely new group; push it.
- **Players** match on `name.trim().toLowerCase()` — literally the key
  `planImport` builds at [groupImport.ts:44](src/lib/groupImport.ts#L44). On a
  match, adopt the server id and **union** the `rosterIds`. The server keeps its
  rating and gender, mirroring `planImport`'s existing rule that a name already
  in the pool keeps what it has.
- Preferences: the account's win. They are trivial to re-set.

**Id adoption is what actually prevents duplicates.** After it runs, both
devices refer to the same person by the same id forever, so every subsequent
sync is an ordinary idempotent upsert. Nothing depends on the merge running only
once.

Report the outcome in the panel using the existing `ImportResult`
`{title, details[]}` shape from
[ImportExportPanel](src/components/layout/ImportExportPanel.tsx), so the copy
reads like the import summaries already do.

**Flag: name matching will merge two different people with the same name.** Two
Daves on two devices become one Dave. Matching on name *and* gender narrows it;
it does not close it. Mitigations, in order of cost: the dialog means it never
happens without consent; the plan can list the matched names before applying;
and Export Groups already gives a manual escape hatch. I would ship with the
dialog plus a "these N players matched" list and go no further until someone
actually hits it.

---

## 5. Setup steps for you

**Supabase project**
1. New project at supabase.com — pick the region nearest your users, not
   nearest you.
2. Settings → API: copy the **Project URL** and the **anon/publishable** key.
   The anon key is meant to be public and ships in the bundle; RLS is what
   protects the data. The `service_role` key must never appear in this repo.
3. SQL Editor → paste `0001_accounts.sql` above → Run. Then Database → Tables
   and confirm all four show **RLS enabled**.

**Auth configuration** (Authentication → URL Configuration)
4. Site URL: `https://app.pbroundrobin.com`
5. Redirect URLs: `http://localhost:5173/**` and `https://*-<your-scope>.vercel.app/**`
   for preview deploys.
6. Email template (Authentication → Email Templates → Magic Link): include
   **both** `{{ .ConfirmationURL }}` and `{{ .Token }}`. The default template
   has only the link, so the code path silently will not work until you edit it.
   Set OTP expiry to 1 hour (Authentication → Providers → Email).

**SMTP** (Project Settings → Auth → SMTP)
7. **Required, not optional.** Supabase's built-in email sender is rate-limited
   to a handful of messages per hour and is explicitly not for production — a
   Sunday-morning rush of sign-ins would silently stop delivering. Set up
   Resend, Postmark, or SES, verify the sending domain (SPF + DKIM), and point
   Supabase at it. Sending from a verified `pbroundrobin.com` address also keeps
   the codes out of spam folders, which matters more than usual when the email
   *is* the login.

**Environment variables**
8. Locally: `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
   Add `.env.local` to `.gitignore` — note the existing `*.local` line does
   **not** match it, same trap as `.claude/settings.local.json`.
9. Vercel → Settings → Environment Variables: add both to **Production,
   Preview and Development**. Vite inlines `VITE_*` at build time, so a change
   needs a redeploy to take effect, and a push to main is that redeploy.

**One thing to watch**
10. Free-tier Supabase projects **pause after 7 days with no activity**. A
    paused project means every sign-in and sync fails. For a low-traffic app
    this is a real risk — either keep it warm with a scheduled ping or plan on
    the $25 tier before you tell anyone about the feature.

---

## 6. Phasing

Seven ships. Each is independently useful, independently revertible, and leaves
the app working. `APP_VERSION` gets bumped on every one.

| # | Ships | Risk | Why it is its own step |
|---|---|---|---|
| **0** | Store refactor: `createStoredValue` + `useStoredValue`, no Supabase at all | very low | Removes the read-once blocker with **zero user-visible change**. 185 tests must still pass untouched — that is the whole proof. De-risks everything after it. |
| **1** | Supabase project, `0001_accounts.sql`, RLS verified. **No app code.** | none | Schema and policies proven with two throwaway users before a line of client code exists. |
| **2** | Auth only: `SignInPanel`, `AccountPanel`, drawer item. Signing in changes **no data**. | low | Ships the email path alone, so if codes land in spam or the PWA flow misbehaves you find out with nothing else in flight. |
| **2b** | `SignInBanner`, as its own commit | low | Jeff took the recommendation to split this out. It is the only part a never-signing-in user sees, so it reverts on its own without taking the account feature with it. |
| **3** | Push-only sync + the empty-account seed. Server accumulates; it never writes back. | low | The safest possible half. If the client is wrong, the *worst* case is bad rows on a server nothing reads. Local data cannot be harmed. |
| **4** | Pull + apply + the ask-then-merge flow. Genuine two-device. | **highest** | Where clobbering becomes possible at all. Everything before this exists so this step arrives on proven foundations. |
| **5** | Outbox hardening: retry/backoff, `online` and focus triggers, sync status UI | medium | Turns "syncs when things go well" into "syncs at a court on one bar". |
| **6** | Service worker, so the app loads with no network | medium | Independent of accounts, and the only thing that makes "works offline" literally true. Last because it is a separate concern with its own cache-invalidation problems. |

Stopping after 3 leaves a coherent product: sign in, your data is backed up, a
new phone gets it via the seed on first login.

---

## Things I would decide differently, or want you to look at

1. ~~**The banner will be seen by everyone with 4+ players.**~~ **Settled
   2026-08-07:** Jeff took the recommendation. Phase 2 ships the drawer item
   only; the banner follows as phase 2b, a separate commit that can be reverted
   without taking the account feature with it.

2. **Ratings must be `real`, not `numeric`.** PostgREST returns `numeric` as a
   JSON string. `"3.75"` flowing into `sumRatings()` would concatenate instead
   of adding and quietly corrupt every balance calculation. This is the kind of
   thing that passes review and fails at a court.

3. **`text` ids, not `uuid`.** Forced by the `generateId()` fallback. A `uuid`
   column looks tidier and would reject real users' real data.

4. **`roster_ids` as an array, not a join table.** Deliberately the less
   "correct" choice. A join table buys referential integrity the client does not
   rely on today, and costs a shape translation on every read and write plus a
   second entity in the outbox. Your instruction to keep the shape close to the
   local data points the same way.

5. **`pb-schedule` is hardcoded at [App.tsx:79](src/App.tsx#L79)** even though
   `KEYS.schedule` exists for it. Worth fixing in Phase 0 while that line is
   being touched anyway.

6. **Anonymous accounts are the road not taken.** Supabase can issue an
   anonymous user on first visit and later link an email to it, which makes the
   whole first-login merge disappear. I am not proposing it: it puts every
   visitor in your auth table, sends a network request before anyone has asked
   for one, and trades a merge you can see and test for an upgrade path you
   cannot. Mentioning it so the choice is visible rather than accidental.

---

## Verification

**Phase 0** — the bar is that nothing changed. `npx tsc -b`, `npx eslint src`
(src only; a full lint is five minutes of noise from the stray backup folder),
and **185 tests still passing with no test file edited**. If a test needed
changing, the refactor changed behaviour and is wrong.

**Phase 1 — prove RLS before trusting it.** In the SQL editor, create two users,
insert rows for each, then with `request.jwt.claims` set to user A confirm that
`select * from players` returns only A's rows, that `update ... set user_id =
<B>` is rejected by the `with check`, and that a `delete` of B's row affects 0
rows. Repeat over HTTP with the anon key and A's access token — the policy that
matters is the one PostgREST enforces, not the one the editor does.

**Phase 3-4 — the merge planner is a pure function, so test it like one.** New
`src/lib/syncMerge.test.ts` alongside
[groupImport.test.ts](src/lib/groupImport.test.ts): same names on both sides
collapse to one row; different names both survive; `rosterIds` union rather than
replace; a tombstone beats an older live row; and running `planMerge` twice
produces the same result the second time. Plus an outbox test proving five
edits to one player coalesce to one entry.

**End to end, by hand, because no automated test can cover it:**

1. Desktop, fresh profile: build two groups, sign in, confirm the rows appear in
   the Supabase table editor with the *same ids* the browser holds.
2. Second browser, empty: sign in, confirm both groups arrive.
3. Second browser with its **own** group first: sign in, confirm the dialog
   appears, choose Add, confirm no duplicate players and that a shared name
   collapsed to one row with both groups on it.
4. **The offline test, which is the point of the whole design.** Airplane mode,
   rename three players, add one, delete one. Reload the app — the changes must
   still be there and the outbox must still hold them. Go online, confirm all
   five land and the deleted player stays deleted on the other device rather
   than coming back.
5. **iPhone, installed to the home screen.** Sign in using the *code*, not the
   link, and confirm the session lands inside the PWA. Then try the link from
   Mail and confirm what happens — this is the case that justified the code, so
   look at it rather than assuming.
6. Log out: local data still present, app fully usable, no network calls.

**After deploying:** confirm the live bundle reports the new `APP_VERSION`, and
that with env vars *absent* from a preview deploy the app still renders with no
Account item and no console errors.
