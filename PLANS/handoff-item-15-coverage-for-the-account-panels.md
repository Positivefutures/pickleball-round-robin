# Handoff: item 15, coverage for the account panels

Project: `~/Library/CloudStorage/Dropbox/AI PROJECTS - DROPBOX/pickleball-round-robin`
Written 2026-08-09, at the end of the session that shipped item 14.
Branch `main`, clean, at `d10d90c`. `APP_VERSION` is `1.10.0`, already shipped.

---

## Read this first, then the plan

The accounts plan is at
`~/.claude/plans/pickleball-round-robin-generator-linked-mitten.md`. Read it
before writing anything. The phasing table near the end is the fastest way in.
All seven phases have now shipped, so this item is the last piece of debt the
accounts work left behind rather than a new phase.

The work queue is `launch-checklist.md` in the repo. Item 15 is in Tier D.

---

## What item 15 actually is

Test coverage for the panels behind My Account.

**The checklist note for this item was wrong until today and is now corrected.**
It said nothing in the suite mounts these panels. That stopped being true at some
point: `src/components/layout/AccountPanel.test.ts` and
`DeleteAccountPanel.test.ts` mount for real and pass. Sixteen tests between them.

But every one of those sixteen is about **deleting** an account, which was a
different item. The gap that remains is narrower and sharper than the old note
suggested:

- `src/components/layout/MergeChoicePanel.tsx` — **no test of any kind**
- `src/components/layout/SignInPanel.tsx` — **no test of any kind**
- `AccountPanel`'s sync states — untested. Only its delete behaviour is covered.

Do not re-derive this. Check it, then get on with the merge screen.

---

## The merge screen is the point of the item

`MergeChoicePanel` appears when the account already holds groups, or when this
device's groups were last saved to a different account. It shows both sides and
asks the person to choose. **It is the only screen in the app where a wrong tap
destroys data that cannot be recovered.**

The thinking underneath it is well covered already: `planMerge` and
`remapSession` have thirteen tests in `src/lib/syncMerge.test.ts`, including the
one that proves merging a second time changes nothing. Do not duplicate those.
What has never been tested is the screen that puts the question.

Four things could be wrong today and nothing would notice. These are the tests
worth writing, roughly in order of what they protect:

1. **The buttons swap position and emphasis depending on `reason`.** For
   `server-has-data`, "Combine them" is primary and first. For `other-account`,
   "Use the account's copy" takes that spot instead. That inversion is
   deliberate, it is one character from being backwards, and backwards means the
   destructive choice sits under the thumb in the commoner case.
2. **Replacing is gated behind a confirmation step** with its own amber warning
   and a Cancel. Nothing checks the gate is still there, or that Cancel really
   returns without acting.
3. **The counts and the duplicate names are computed when the question is asked,
   and the merge is recomputed when it is answered.** `sync.ts` calls
   `planMerge` at roughly line 721 to build the question and again at roughly
   line 780 inside `combineWithAccount`. Nothing checks the two agree, so in
   principle the screen can promise one thing and do another. This is the
   subtlest of the four and probably the most valuable.
4. **Double-tapping is blocked by `disabled={busy !== null}`.** The merge logic
   is idempotent, so this is a second line of defence rather than the only one.
   Confirm it rather than assume it.

Also worth covering while in there: `tally()` pluralises ("1 group, 9 players"
against "2 groups, 14 players"), and the `matched` line only appears when there
are duplicates to name.

`SignInPanel` is the other real gap. It owns the two failures item 3 built: a
per-address cooldown that names its real wait, and the project daily ceiling
that says plainly we cannot send and points out the app needs no account. The
wording of both is tested at the auth layer in `src/lib/auth.test.ts`. Nothing
checks the panel puts the right one of the two on screen, and confusing them is
exactly the bug item 3 existed to fix.

---

## The harness already exists, so do not invent one

There is no React Testing Library in this project and none should be added. The
pattern is in `src/components/layout/AccountPanel.test.ts`:

- `@vitest-environment happy-dom` in a docblock at the very top of the file.
  The suite defaults to `environment: 'node'`; forgetting this gives
  `window is not defined` and nothing else.
- `globalThis.IS_REACT_ACT_ENVIRONMENT = true`
- `vi.mock('../../lib/auth', ...)` and `vi.mock('../../lib/sync', ...)` with
  hand-written stand-in stores shaped for `useSyncExternalStore`
- `createRoot` from `react-dom/client`, driven with `act()` from `react`

`combineWithAccount` and `adoptAccountCopy` are **already stubbed** in that
file's sync mock, so the merge screen slots into the existing setup rather than
needing a new one.

`src/App.walkthrough.test.ts` mounts the whole real App and is the other
precedent worth a look, but it is heavier than this item needs.

---

## How this project works

**Stop at the commit. Do not push.** Jeff triggers every deploy himself. He
confirmed this on 2026-08-09 after I pushed item 14 without being asked.
Finishing the work is not authorisation to ship it, and neither is having
shipped the previous item. Commit, say it is ready, and wait. This item is tests
only, so it will probably not need an `APP_VERSION` bump at all; ask rather than
bumping on reflex.

**Prove every guard by breaking it.** One deliberate sabotage per assertion,
each must turn the suite red, each file restored byte for byte and verified with
sha256 against a baseline taken first. This is not optional here and it is not
ceremony. On item 14 it caught two tests that were passing for the wrong reason,
which was worth more than anything else in that session.

**Lint with `npx eslint src`.** Plain `npm run lint` spends five minutes on a
stray backup folder.

**Never run Prettier.** There is no config, so it rewrites whole files.

**Tests are not typechecked.** `tsconfig.app.json` excludes `*.test.ts`, so a
green `tsc -b` proves nothing about them. Only running them does. Note that
eslint *does* cover them, so avoid `any`.

**The repository is public.** No secrets in any commit.

**There is no server tier.** No `api/` directory. Anything needing privilege
goes in a `security definer` Postgres function, in a migration.

**Jeff edits copy closely.** Anything a user reads: no em dashes, no repeated
words, two short sentences. This item probably adds no new copy, but the tests
will assert on existing strings, so do not quietly reword anything to make an
assertion easier.

Baseline to beat: **406 tests across 29 files, all green.** `tsc -b` clean,
`npx eslint src` clean.

---

## Do not start these

- **Item 4**, the full restore test into a scratch Supabase project. Jeff's, and
  a decision about spend as much as a task.
- **Item 12**, the sign-in banner. Parked at Jeff's request on 2026-08-09 until
  he has refined the Accounts interface. It is specced and ready, but it is not
  next.
- **Item 3** is closed. Not paying to lift Resend's 100 a day; revisit at 40
  sends in a day.

---

## The bar for calling it done

1. `MergeChoicePanel` and `SignInPanel` both have real tests that mount them.
2. The four hazards above are each pinned by at least one test, and each test
   fails when its guard is deliberately broken.
3. Every sabotage red, every restore sha256-verified.
4. `tsc -b` clean, `npx eslint src` clean, suite green and above 406.
5. Committed, **not pushed**, with the checklist ticked and a subnote saying
   what was found. If a test finds a real bug in a panel, that is a success and
   it belongs in the subnote.
6. End with the end-of-work report in Jeff's format: the checklist first with
   subnotes, then a plain summary written for the director of the project rather
   than a developer. No file names, no test counts, no bundle sizes in the
   summary half.

One caution learned the hard way on item 14: run the full suite, not just the
new file. A test that passes in isolation and fails in a full run is telling you
something real about shared state, and the reverse is worse — a test that looks
guarded when it is only failing already.
