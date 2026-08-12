# Subscriptions with Stripe

> Parked 2026-08-12, unbuilt. Decisions below were made with Jeff on 2026-08-11.
> Pick this file back up when subscriptions come off the shelf.

## Context

The app is feature-complete and free. Everything an organizer could want — unlimited
groups, cloud sync, live session sharing — ships to everyone at no charge, and the
only money in the building is a Ko-fi link. The launch checklist has carried "Tier F.
Only if subscriptions happen" as two unticked boxes since it was written, and
`profiles` has carried three reserved billing columns since the first migration.

This turns that on. A free tier keeps the app whole on one device. A paid tier at
$4.99/month or $39/year covers the parts the server does: more than one group, cloud
sync across devices, and Live Session Share. A 14-day trial starts when someone makes
an account. A hand-kept list of email addresses gets everything free for life.

Four things decided up front, because they shape everything below:

| | |
|---|---|
| **Free** | One group. Unlimited players, every format, scoring, standings, print/PDF |
| **Paid** | Unlimited groups, cloud sync, Live Session Share |
| **Trial** | 14 days, no card, clock stamped in Postgres at account creation |
| **Billing** | USD, Stripe Tax on |
| **Comps** | A `comp_grants` table you add rows to by hand. Nothing automatic |

### The one security fact that drives the design

`profiles` today grants `authenticated` a full update policy on their own row
(supabase/migrations/0001_accounts.sql:54-57). Anyone holding the anon key — which
ships in the bundle — can set their own `subscription_status` to whatever they like.
**Entitlement cannot live in a table the user can write.** It goes in a new table with
a select policy and no write policy at all, so only the service role can touch it.

### Prerequisites, before any code

1. **Vercel Pro, ~$20/month.** docs/costs-and-limits.md:203-221 already establishes
   that Hobby is non-commercial and that charging is the line. Taking a payment on a
   Hobby deployment breaks their terms.
2. **A Stripe account**, business details and payout bank filled in.
3. **One product, two prices**: $4.99 USD/month and $39 USD/year. Set the product's
   tax code to a SaaS code (`txcd_10103000`, *Software as a service — personal use*);
   worth a word with your accountant.
4. **Stripe Tax enabled**, with your registrations entered. Stripe calculates and
   collects; you still file.
5. **The Billing Portal configured** in the Stripe dashboard — cancel, change card,
   switch monthly/yearly, download invoices. That is the whole of the account-
   management surface and it is why none of it gets built here.

---

## 1. The database is the source of truth

New migration `supabase/migrations/0007_subscriptions.sql`. Three moves.

**`public.entitlements`** — one row per user, the only place paid state lives.

```sql
create table public.entitlements (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  trial_ends_at          timestamptz,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  status                 text,           -- trialing|active|past_due|canceled|unpaid
  plan                   text,           -- 'monthly' | 'yearly'
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  updated_at             timestamptz not null default now()
);
alter table public.entitlements enable row level security;

-- Select only. There is deliberately no insert, update or delete policy: the
-- service role bypasses RLS and is the only thing that writes here. A user can
-- read their own standing and cannot alter it.
create policy entitlements_select on public.entitlements
  for select to authenticated using ((select auth.uid()) = user_id);
```

**`public.comp_grants`** — the free-for-life list.

```sql
create table public.comp_grants (
  email      text primary key check (email = lower(email)),
  note       text,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.comp_grants enable row level security;
-- No policies at all. Invisible to anon and authenticated alike. Only the
-- service role and the security definer function below can read it.
```

You add a row in the Supabase SQL editor. Matching happens at read time against the
signed-in address, so a comp follows the person across devices and reinstalls, and
lands even if they are granted it before they ever sign up.

**`public.is_entitled(uid uuid default auth.uid()) returns boolean`** — `stable
security definer set search_path = ''`, following the three functions already in the
tree (`handle_new_user`, `delete_my_account`, `shared_session`). True when any of:
a live comp grant on the user's verified address, `trial_ends_at > now()`, or
`current_period_end > now()` with a status of `trialing` or `active`.

Also in this migration:

- **`handle_new_user()`** (0001_accounts.sql:186) gains an insert into `entitlements`
  with `trial_ends_at = now() + interval '14 days'`, in the same trigger that already
  creates the profile row. The clock is stamped by Postgres, so reinstalling, clearing
  localStorage, or switching devices cannot reset it.
- **A backfill** for accounts that already exist, giving each a 14-day trial dated
  from launch: `insert into public.entitlements (user_id, trial_ends_at) select id,
  now() + interval '14 days' from auth.users on conflict do nothing;`
- **Drop `profiles.subscription_status`, `plan`, `current_period_end`.** Nothing reads
  them (src/lib/account.ts:131 only does `select *` for the data export). Two tables
  that both look like billing state is a bug waiting to happen.
- **Write gates on the paid tables.** The insert and update policies on `rosters`,
  `players`, `preferences` and `shared_sessions` gain `and (select public.is_entitled())`.
  Select policies are untouched: a lapsed subscriber can still read and export
  everything they synced, they just cannot push more. Wrap the call in `(select ...)`
  so Postgres caches it as an InitPlan, the same trick the existing policies use on
  `auth.uid()`.

**`public.my_entitlement() returns jsonb`** — one RPC for the client, granted to
`authenticated`. Returns `{entitled, source: 'comp'|'trial'|'subscription'|'none',
trial_ends_at, status, plan, current_period_end, cancel_at_period_end}`.

---

## 2. Three endpoints

All three copy api/feedback.ts exactly: `export const config = { runtime: 'edge' }`,
a plain `Request` in and `Response` out, secrets from `process.env` with no `VITE_`
prefix, and the logic that deserves a test lifted into `src/lib/` so vitest can
reach it.

**No `stripe` npm package.** Both Stripe calls are form-encoded POSTs that `fetch`
handles, and signature verification is about twenty lines of Web Crypto. This is the
same call the repo already made for PDF, QR and the service worker, and it keeps the
dependency list at six.

| File | Does |
|---|---|
| `api/checkout.ts` | Verifies the caller's Supabase JWT against `/auth/v1/user`, then creates a Checkout Session and returns `{url}` |
| `api/portal.ts` | Verifies the JWT, looks up `stripe_customer_id`, returns a Billing Portal `{url}` |
| `api/stripe-webhook.ts` | Verifies the `Stripe-Signature`, then writes `entitlements` with the service role |

**Checkout session** — `mode=subscription`, the chosen price, `customer_email`,
`client_reference_id` and `subscription_data[metadata][supabase_user_id]` both set to
the Supabase user id, `automatic_tax[enabled]=true`,
`billing_address_collection=required`, `allow_promotion_codes=true`, and
`success_url` back to the app with a marker the client uses to re-read entitlement.

**Webhook** handles `checkout.session.completed`,
`customer.subscription.created|updated|deleted`, and `invoice.payment_failed`. On
every subscription event it **ignores the payload and re-fetches the subscription from
Stripe by id**, then writes that. Webhooks retry and arrive out of order; re-reading
current truth sidesteps the whole ordering problem for the cost of one API call.

New helpers, both unit-tested:

- `src/lib/stripeSignature.ts` — HMAC-SHA256 over `${timestamp}.${rawBody}`,
  constant-time compare against the `v1` scheme, reject a timestamp more than five
  minutes out.
- `src/lib/stripeEvents.ts` — subscription object in, `entitlements` row out. Pure,
  no I/O.

**Environment variables** in Vercel and `.env.example`: `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`. None get a `VITE_` prefix; the service
role key in the browser bundle would hand every account to anyone who opened devtools.

---

## 3. The client reads its standing

**`src/lib/entitlement.ts`** — shaped exactly like src/lib/auth.ts: a vanilla module
store with `{get, subscribe}` for `useSyncExternalStore`, no context, no provider.
Same as `authStore`, `syncStatusStore`, `liveStatusStore`.

- `Entitlement` = `{state: 'unknown'|'entitled'|'lapsed'|'never', source, trialEndsAt, ...}`
- `refreshEntitlement()` calls `supabase.rpc('my_entitlement')`, subscribes to
  `authStore` so it re-reads on sign-in and clears on sign-out, and re-reads on
  `visibilitychange` and on return from Checkout.
- `isEntitled()` for the non-React callers in `sync.ts` and `liveSession.ts`.
- **Fails closed on error, open on unknown.** A failed RPC must not lock a paying
  subscriber out of their own app mid-session, so `unknown` keeps working; a clean
  `entitled: false` gates.

**`src/lib/billing.ts`** — `startCheckout('monthly'|'yearly')` and `openPortal()`.
Both attach the access token from `supabase.auth.getSession()` and
`window.location.assign` the returned URL.

---

## 4. Three gates

Server-side RLS is the truth. These are the UX.

**Groups** — free is one. A new `canAddGroup(count)` in `entitlement.ts`, checked at
every path that increases the count, not just the obvious one:

- src/hooks/useRosters.ts:12 `addRoster`, called from `ManageRostersModal.tsx` and
  `GroupPicker.tsx`
- Group import in `ImportExportPanel.tsx` / `src/lib/groupImport.ts`, which would
  otherwise be a hole straight through the gate

The rule: **keep what you have, create no more.** Someone who made five groups during
a trial keeps all five working. Nothing is deleted, hidden, or made read-only when a
trial ends. (Jeff has not yet chosen between this and the tighter read-only variant —
ask before step 4.)

**Sync** — `startSync()` (sync.ts:1162, called from `App.tsx:205`) already returns
early on `!ACCOUNTS_ENABLED || !isSupabaseConfigured()`. It gains an entitlement
condition and a subscription to the entitlement store, so it starts when a trial does
and stops when one lapses.

Defence in depth needs a failure state. `describe()` and `isAccountFull()`
(sync.ts:432-446) are the existing pattern for a permanent error that retrying will
never fix — a sibling `isNotEntitled()` matches the RLS denial (`42501`), skips
`schedulePushRetry()`, and puts sync into `unready` with "Your subscription ended.
Your groups are safe on this device." Without this, a lapsed account retries forever
against a policy that will always say no.

**Live Share** — `sharingAvailable()` (liveSession.ts:243) is a single boolean
already composing `available()` and signed-in, and gains `isEntitled()`.
`startSharing()` at :247 already has the shape for a refusal with a message; it gains
an entitlement branch alongside the signed-out one. `ActionsSheet.tsx` shows the
Share card with a lock and opens the paywall rather than hiding it — a feature you
cannot see is a feature nobody subscribes for.

---

## 5. The UI

Everything reuses src/components/layout/accountStyles.ts — `card`, `row`, `rowTitle`,
`rowNote`, `rowIcon`, `primary`, `secondary`, `heading`, `blurb`. No new visual
vocabulary.

- **`src/components/layout/SubscriptionPanel.tsx`** — the state of things and the two
  prices. Trial: "12 days left". Active: plan, renewal date, a *Manage subscription*
  row into the Billing Portal. Comped: "Free for life. Thank you." Lapsed: the prices
  again. Monthly $4.99, yearly $39 with *Save 35%* on it.
- **`src/components/layout/PaywallSheet.tsx`** — what a gate opens. Names the specific
  thing they just reached ("Live Session Share is part of a subscription"), then the
  right call to action: *Start your 14-day free trial* into the sign-in panel if they
  have never had one, the two prices if they have.
- **`SettingsPanel.tsx`** gains a *Subscription* row following the existing
  `showAccountItem` / `showInstallItem` conditional prop pattern, with state owned by
  `App.tsx` like every other panel.
- **`AccountPanel.tsx`** gains a subscription row beside *Change My Email Address*
  and *Download My Data*.
- **`SignInBanner.tsx`** copy earns its keep: sign-in now starts a trial.

---

## 6. Copy and legal

- **src/lib/terms.test.ts:36-48 is a deliberate tripwire** and it is about to fire.
  Its own comment says the fix is not to delete it. Terms need real subscription
  clauses — price, renewal, cancellation, refunds — and the test rewritten to assert
  *those* rather than "There is no charge for any part of it today."
- **Privacy policy** names Stripe as a processor and says what leaves for them.
- **InstructionsPanel** free/paid explanation (the stale device-only copy is being
  fixed separately in the instructions rebuild).
- **Data retention on lapse**, stated plainly in the panel and the Terms: synced data
  is kept and stays readable and downloadable. Nothing is deleted.
- All new copy per house style — no em dashes, no repeated words, two short sentences.

---

## 7. Tests

- `src/lib/stripeSignature.test.ts` — a known secret and payload verifies; a tampered
  body, a wrong secret, and a six-minute-old timestamp each fail.
- `src/lib/stripeEvents.test.ts` — each subscription status maps to the right row;
  `deleted` clears entitlement.
- `src/lib/entitlement.test.ts` — comp beats everything; an expired trial with an
  active subscription is entitled; both expired is not; an RPC error leaves a working
  session alone.
- `src/App.walkthrough.test.ts` — a free user reaching the second-group gate, and an
  entitled one passing it. Remount to change entitlement, since a live subscriber
  freezes the store's cache.
- `src/lib/terms.test.ts` — rewritten as above.

---

## 8. Verification

**Prove each guard by breaking it.** One deliberate sabotage per assertion, each must
turn the suite or the check red before it is trusted.

1. **RLS, against a real project.** A script with the anon key and a signed-in,
   non-entitled user must fail to: update its own `entitlements` row, select from
   `comp_grants`, insert a `shared_sessions` row, upsert a `rosters` row. The same
   user with a comp grant must succeed at the last two. Then drop
   `and (select public.is_entitled())` from one policy and watch that check pass when
   it should not.
2. **Webhook end to end**, test mode. `stripe listen --forward-to` against a preview
   deploy: subscribe, confirm `entitlements` flips to `active`, cancel in the Portal,
   confirm `cancel_at_period_end`, then use a Stripe test clock to jump past the
   period end and confirm entitlement drops. Replay an old event and confirm it is
   rejected.
3. **The trial clock resists a reset.** Sign in, clear localStorage, reinstall the
   PWA, sign in on a second browser. Days remaining must not move.
4. **The lapse is graceful.** Set `trial_ends_at` into the past by hand with an outbox
   full of pending rows. Sync must stop, say why once, and not spin. Local data
   untouched, Download My Data still works.
5. **The gates, in a real browser.** Playwright-core in the scratchpad against the
   chromium on disk, session written into localStorage before boot. Free user: second
   group blocked, import blocked, Share locked. Entitled: all three pass.
6. `npx tsc -b`, `npm test`, `npx eslint src`. Never Prettier.

**Bump `APP_VERSION`** in the deploying commit. **Stop at the commit** — no push to
main until Jeff says so.

---

## Build order

1. Migration `0007`, applied by hand to a scratch project first, then verification #1
2. `entitlement.ts` + `my_entitlement()` wired to the store, nothing gated yet
3. The three endpoints, plus verification #2
4. The three gates, plus their failure states
5. `SubscriptionPanel` and `PaywallSheet`, then the settings and account rows
6. Copy, Terms, Privacy, and the `terms.test.ts` rewrite
7. Verifications #3-6, `APP_VERSION`, commit

Steps 1-3 are invisible to users and safe to land early. Nothing is gated until step 4,
which is the point of no return and wants Vercel Pro already in place.

## Open question, worth answering before step 4

The free tier is one group, and a trial user who made five keeps five. If Jeff would
rather they drop to one active group with the rest read-only, that changes the shape
in `RosterPage`, `GroupPicker` and `ManageRostersModal`, and wants deciding before the
gates are built.
