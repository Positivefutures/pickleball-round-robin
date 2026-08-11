# Let a special game type land on round 1

## Context

Special Game Types shipped in v1.40.0. Using it, Jeff hit a wall: with Gendered and Mixed both
switched on, both dropdowns start at 2, so **round 1 can never be a special round**. There is no
setting that puts one there.

Digging in found two more faults of the same family:

- **Short sessions get nothing.** "Every 4 rounds" in a 3-round session produces no special rounds at
  all, because the first one is not due until round 4.
- **Unlocking the dropdown to 1 would be broken on its own.** With two types both set to every 1
  round, the tie-break falls through to a fixed order and the same type wins every time:
  `G G G G G G G G` — Mixed never plays.

The root cause of the first two is that `planRoundTypes` seeds each type's first appearance at
round `frequency` rather than round 1, so "every N rounds" means rounds N, 2N, 3N… The fix is to make
it mean rounds 1, 1+N, 1+2N…, drop the minimum-frequency clamp, and add the two tie-breaks that keep
types from starving each other.

Decisions confirmed with Jeff:

- **Both fixes**: count from round 1, and allow any type to be set to every 1 round.
- **Jeff orders the types himself** in the panel; the order settles which one takes a contested round.
- **Setup previews the round numbers** each type will land on.

---

## The algorithm

Three changes to `planRoundTypes` in [roundTypes.ts](src/lib/roundTypes.ts#L93-L124):

```ts
const nextDue = new Map(active.map((t) => [t, 1]));   // was cfg[t].frequency
const played  = new Map(active.map((t) => [t, 0]));   // new

due.sort((a, b) =>
  cfg[b].frequency - cfg[a].frequency ||   // rarest first: fewest chances to happen
  nextDue(a) - nextDue(b) ||               // then whoever has waited longest
  played(a) - played(b) ||                 // then whoever has had fewer turns
  cfg[a].order - cfg[b].order);            // then Jeff's order
```

`played` before `order` is load-bearing. Put the user's order above it and whichever type sits on top
wins every tie forever, which is the starvation bug in a new costume. Verified over 30 rounds across
every frequency combination and all six orderings: no enabled type ever gets zero rounds.

What this produces:

```
                              1 2 3 4 5 6 7 8
Gendered 4 + Mixed 2          G M — M G M — M      (was: — M — G M — M G)
Gendered 2 + Mixed 2          G M G M G M G M
Gendered 1 + Mixed 1          G M G M G M G M      (was: G G G G G G G G)
All three at 1                G M S G M S G M
Gendered 4, 3-round session   G — —                (was: — — —, nothing at all)
Mixed dragged above Gendered,
  both at 2                   M G M G M G M G
```

**A limitation to state plainly**: order only settles a tie. With Gendered every 4 and Mixed every 2,
dragging Mixed to the top changes nothing — Gendered is rarer, so it still takes round 1. The preview
makes that visible the moment it happens, which is the real answer to it.

---

## Ordering, and how it is stored

`SpecialTypeSetting` in [types/index.ts](src/types/index.ts) gains `order: number`. Keeping the
config a `Record<RoundType, …>` means every existing `cfg[t].frequency` read is untouched; only the
new `orderedTypes(cfg)` helper (sort `ROUND_TYPES` by `order`) knows about sequence.

`normalizeSpecialTypes` keeps clamping frequency, now to `[1, MAX_FREQUENCY]` — `minFrequency` is
deleted along with its only two callers. It also repairs `order`: backfills a missing one from the
`ROUND_TYPES` index and renumbers to 0,1,2 so a stored config can never hold duplicates. A migration
step in [migrations.ts](src/lib/migrations.ts#L95-L112) backfills `order` for anyone already carrying
a `pb-special-types` value from v1.40.0, so the repair does not wait for their next edit.

New `moveType(cfg, type, direction)` returns a config with that type swapped one place up or down.

**Reordering is ↑/↓ buttons, not drag.** HTML5 drag-and-drop does not work in iOS Safari, and this is
a phone-first app with an add-to-home-screen flow — drag would be dead exactly where it is most
used. Two small arrow buttons on each section heading are touch-friendly, keyboard-accessible and
need no library. The sections reorder in the panel as they move, so the panel order *is* the
priority order.

---

## UI

**[SpecialTypesPanel.tsx](src/components/setup/SpecialTypesPanel.tsx)** — render sections in
`orderedTypes(specialTypes)` order rather than `ROUND_TYPES`. Each heading row gains ↑ and ↓ buttons
(disabled at the ends, `aria-label` naming the type). Frequency options become `1…MAX_FREQUENCY` for
every type, with the "Round"/"Rounds" singular already handled. One new line of copy near the
controls, in Jeff's register — two short sentences, no em dashes:

> When two types want the same round, the rarer one goes first. Your order settles a tie.

New `onMove: (type: RoundType, direction: -1 | 1) => void` prop, threaded from `App` alongside the
existing `onSpecialTypeChange`.

**[SessionConfig.tsx](src/components/setup/SessionConfig.tsx)** — `summaryLines` is replaced by
`specialSummary(cfg, numRounds)`, which derives its round numbers **from `planRoundTypes` itself**,
so the preview can never drift from what Generate actually builds. `numRounds` is already a prop.

```
Special Game Types
Gendered every 4 rounds
  rounds 1, 5
Mixed every 2 rounds
  rounds 2, 4, 6, 8

[ Select Special Game Types ]
```

A type that wins no rounds in the current session (every 8 in a 4-round session) reads
`not in this session` on its second line, rather than showing an empty list — surfacing exactly the
kind of dead setting this whole change is about.

---

## Verification

Existing tests that assert the old semantics and must be rewritten, not just patched:

- [roundTypes.test.ts](src/lib/roundTypes.test.ts) — `plays a lone type on every Nth round` (mixed 3
  becomes rounds 1, 4, 7), `bumps the loser of a clash` (the worked example becomes
  `G M — M G M — M`), and the whole `normalizeSpecialTypes` clamp block, which now covers the
  `[1, 8]` clamp and `order` repair instead of a minimum.
- [specialRounds.test.ts](src/lib/specialRounds.test.ts) — `puts a couple back together on the
  ordinary rounds either side` reads rounds 1 and 3 as ordinary; with gendered every 2 counting from
  round 1 those are now the *gendered* rounds, so it moves to indices 1 and 3. The `everyRound()`
  helper uses frequency 1 and is unaffected.
- [App.walkthrough.test.ts](src/App.walkthrough.test.ts) — `holds two types apart when both are
  switched on` no longer describes anything; it becomes a check that both types keep their own
  frequency and that round 1 gets a type.

New coverage:

- Round 1 carries a type whenever anything is enabled, at every frequency 1–8.
- A 3-round session with a type set to every 4 still gets one special round.
- Two types at equal frequency alternate rather than one starving; asserted for all three pairs.
- Over 30 rounds, no enabled type gets zero rounds — swept across frequency combinations and all
  orderings, the same sweep used to validate the design.
- `moveType` reorders, is a no-op at the ends, and changes which type takes round 1 when the
  frequencies are equal.
- `specialSummary` round numbers match `planRoundTypes` exactly, and an out-of-reach type reports
  no rounds.

Then end to end:

```
npx tsc -b
npx vitest run          # repeat a few times; the pairing tests are probabilistic
npm run lint -- src     # src only; the repo root drags in a stray backup folder
npm run dev             # Setup > Select Special Game Types
```

In the browser: switch on Gendered and Mixed, confirm both dropdowns now offer 1, and watch the
Setup preview list round 1. Drag Mixed above Gendered with both at every 2 and confirm the preview
flips to Mixed first. Generate and check the badges match the preview round for round.

Bump `APP_VERSION` in [appInfo.ts](src/lib/appInfo.ts#L7) — 1.40.0 → 1.40.1, a fix rather than a
batch of features. It is stamped on every bug report, so a stale value sends you to the wrong code.
