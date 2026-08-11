# Handoff: launch checklist item 13, outbox retry and backoff

Written 2026-08-09, at the end of the session that finished item 11. Everything
below was checked against the repo at commit `1caded5`, not remembered.

---

## Where things stand

Items 1 to 11 are done. The working tree is clean and in sync with `origin/main`.
The live site is on `APP_VERSION` **1.9.8**, and the last commit is `1caded5`,
"Set out the terms, and put them beside the policy".

Two items still carry Jeff's name and are **not** blocking this work:

- **Item 3**, whether to pay to lift Resend's 100 sign-in emails a day
- **Item 4**, one full restore into a scratch Supabase project, and whether to
  automate the backup schedule

Do not start those. They are decisions, not code.

---

## The job

**Item 13 in `launch-checklist.md`, which is Phase 5 of the accounts plan.**

The plan is at
`~/.claude/plans/pickleball-round-robin-generator-linked-mitten.md`, and its
phasing table on line 592 defines Phase 5 as:

> Outbox hardening: retry/backoff, `online` and focus triggers, sync status UI.
> Turns "syncs when things go well" into "syncs at a court on one bar".

Read that plan before writing anything. Phase 4 has shipped, so the two-device
merge already exists and this builds on it rather than replacing it.

### Why this one is next

It is the most likely way the app fails a real person. The scenario is concrete:
a host is running a session at an outdoor court on one bar of signal, the phone
sleeps between rounds, and the network comes and goes. Everything else on the
remaining list is growth work. This is the core feature not working.

### What is actually there today

- `src/lib/outbox.ts`, 149 lines. **No retry, no backoff, no attempt counter.**
  Grepping for `retry`, `backoff` or `attempt` in that file returns nothing, so
  this is genuinely unbuilt rather than half built.
- `src/lib/sync.ts`, 1023 lines. The engine Phase 4 landed.
- Existing tests: `src/lib/outbox.test.ts`, `src/lib/sync.test.ts`, and
  `src/lib/account.test.ts` all touch the outbox.

### One thing to settle early

The phase bundles a **sync status UI** with the retry logic. Decide whether that
ships in the same commit or splits out the way 2b was split from 2, and say
which before building. Jeff took the split recommendation last time.

---

## How this project works

These are all recorded in memory, repeated here so the first turn does not have
to rediscover them.

- **Deploying is a push to `main`.** The Vercel CLI token is dead. Confirm the
  deploy through the Vercel MCP connector or by fetching the live site, never by
  assuming.
- **Bump `APP_VERSION` in `src/lib/appInfo.ts` in the same commit as the
  deploy**, or bug reports name the wrong build.
- **Lint with `npx eslint src`.** Plain `npm run lint` spends five minutes on a
  stray backup folder.
- **Never run Prettier.** There is no config, so it rewrites whole files.
- **Tests are not typechecked.** `tsconfig` excludes `*.test.ts`, so a green
  `tsc -b` proves nothing about them.
- **The repository is public.** No secrets in any commit. The database
  connection string lives only in the macOS Keychain as `pbrr-supabase-db`.
- **The service role key bypasses RLS**, so it proves nothing and must never
  appear in a test.
- **There is no server tier.** No `api/` directory. Anything needing privilege
  goes in a `security definer` Postgres function, in a migration.

### The bar for calling it done

- `tsc -b` clean, `npx eslint src` clean
- The full suite green. It was **366 tests across 26 files** at 1.9.8, so the
  count should go up, not sideways
- **Every new guard proved by breaking it.** One deliberate sabotage per
  assertion, each seen to turn the suite red, each restore verified byte for
  byte with sha256. This has found two real holes already
- Retry behaviour proved against simulated flapping network, not just against a
  clean offline-then-online transition

### Jeff's copy rules, for anything a user reads

No em dashes. No repeated words. Two short sentences.

### Finish with the report

End the work with the end-of-work report in Jeff's format: the checklist first
with subnotes, then a plain summary written for the director of the project
rather than a developer. No file names, no test counts, no bundle sizes in the
summary half.
