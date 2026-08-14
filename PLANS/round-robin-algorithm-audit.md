# Round Robin Algorithm Audit: Fix Fairness, Then Document It

> On approval, copy this file to `PLANS/round-robin-algorithm-audit.md` in the project (plans live in the project PLANS folder).

## Context

Jeff asked for a full audit of the round robin generator, fixes for what's broken, and user-facing documentation. His ranked priorities: (1) fair sit-outs with a random first sitter and an identically repeating cycle, (2) never partner the same person twice while never-partnered people remain, (3) don't face the same opponent too often, everyone plays with or against everyone, (4) evenly matched games, (5) fair rotation of special game types. Mid-planning he added a sixth, lowest priority: prefer all-gendered or 2M+2F court makeups over 3:1 gender splits in normal rounds (3 men + 1 woman being the worst case).

The audit (instrumented runs of the real generator, thousands of schedules) found three real defects and confirmed everything else works:

1. **Repeat partners** (the reported Mike & Jay rounds 8+9 bug). Three measured causes: (a) history stores counts only, never *when* — back-to-back repeats cost the same as far-apart ones, and 100% of consecutive repeats happened while fresh partners were available; (b) group-of-four selection (`buildGreedyCourts`) merges partner and opponent counts into one number so it cannot tell "partnered once" from "opposed once", and all novelty/coverage terms key on that merged count hitting zero, which saturates around round 7 of a 12-player session — half the cost function switches off exactly where the bug appears; (c) `HARD_CAP_PENALTY = 200` on the 0.5 rating gap outranks a first repeat partnership (10) about 20:1 — 44% of repeats were bought to keep a court balanced.
2. **Biased first sitter.** `Math.random() - 0.5` used as a sort comparator ([sitout.ts:164](src/lib/sitout.ts#L164), [sitout.ts:213](src/lib/sitout.ts#L213)) — the first player in the roster array sits out round 1 ~2.9x too often.
3. **No cycle repetition.** Once everyone has sat once, the order re-randomizes. Jeff's Joe/Jill rule is not implemented.

**Decisions confirmed with Jeff today:** variety beats the 0.5 balance cap (cap becomes a strong preference, not a wall); docs go both in-app and as a repo markdown doc; 3:1 gender courts are a lowest-priority nudge (note: when the number of men playing is odd, one 3:1 court is mathematically unavoidable).

## What must not change (pinned by tests and past decisions)

- Sit-out spread ≤ 1; couples sit as units; padlocked players never sit; latecomers (0 games) don't displace people who haven't sat ([pairing.test.ts:245-290](src/lib/pairing.test.ts#L245-L290)).
- Completed rounds kept verbatim; out-of-order completion; `extendSchedule` carries rotation across the boundary; history is replayed from saved rounds (survives reload/reshuffle).
- Precedence: padlock > special game type > Set Partners. Partner-play fixture path ([partnerPlay.ts](src/lib/partnerPlay.ts)) untouched. Short court from format leftovers on special rounds. `courtRatingDiff` keeps averaging uneven sides. Short-game spread ≤ 2. `frequency` means rounds 1, 1+N, 1+2N. `DEFAULT_COURTS = 3` is load-bearing.
- Repo conventions: probabilistic test bounds are measured before asserted (comment states distribution and run count); prove each new guard by one deliberate sabotage; tests are not typechecked (`tsc -b` for src only); lint via `npx eslint src`; never Prettier; no deploy unless Jeff says so.

## Implementation steps

### Step 0: Measurement harness (before touching anything)

New file `src/lib/scheduleQuality.measure.test.ts`, gated with `describe.runIf(process.env.MEASURE === '1')` so `npm test` skips it. Sweeps players 9-16 x courts 2-4 (valid combos) x rounds 8-13, with and without special types, ~30-50 schedules per config. Reports:
- Repeat-partner-while-fresh-available events (normal rounds); consecutive-round repeat partners.
- Sit-out spread; round-1 sitter distribution (chi-square vs uniform, 13 players/3 courts); cycle-2 order fidelity (13/3 x 26 rounds and 14/3 x 14 rounds).
- Rating-gap distribution: % within 0.5, p95, max (normal vs special rounds separately).
- Special-round miss-count spread; short-game spread; count of 3:1 gender courts vs the feasible minimum.

Run once on current code; record the baseline in the file header (should reproduce the audit: ~2.9x round-1 bias, repeats-while-fresh > 0).

### Step 1: Unbiased sit-out randomness

[sitout.ts](src/lib/sitout.ts): give each candidate/unit a pre-assigned `rand: Math.random()` key and compare those in the sort (the repo's established pattern, see `chooseShortCourtPlayers` and `unitsOf`). Replaces both `Math.random() - 0.5` comparators (lines 164 and 213).

### Step 2: Identical sit-out cycle repetition

- Add `sitOutOrder: string[]` to `PairingHistory` ([types/index.ts:103-128](src/types/index.ts#L103-L128)): player ids in the order they first sat out.
- Populate in `updateHistory` ([pairing.ts:63-94](src/lib/pairing.ts#L63-L94)): append each sitter not already present. Because `updateHistory` is the shared build-and-replay path, the order survives reload, reshuffle, and `extendSchedule` with no persistence change.
- In `determineSitOuts`, insert a tie-break into both comparator chains: gamesPlayed desc → avoid back-to-back → specialMiss → **cycle order (lower first-sat position first, Infinity if never sat)** → rand. Units use the min position over members.
- Why this repeats the cycle: at a cycle boundary everyone ties on gamesPlayed, and the cycle-order key deterministically re-selects cycle 1's order. Latecomer rule unaffected (gamesPlayed still ranks above). `sitOutCounts` stays as-is but gets a doc comment noting it is write-only and ordering lives in `sitOutOrder`.

### Step 3: Unify the two cost functions (pure refactor, no weight changes yet)

- Extract a single-court scorer `scoreCourt(court, history, allPlayerIds?)` in [scoring.ts](src/lib/scoring.ts); `scoreAssignment` becomes the sum (it is already purely per-court). Coverage term only when `allPlayerIds` is passed.
- Rewrite `pickBestSplit` ([assign.ts:180-232](src/lib/assign.ts#L180-L232)) to score its 3 candidate splits with `scoreCourt` (no coverage, keeps the hot loops cheap). Delete its private weight set (exp 1.5, partner 8, opponent 6, novelty 5). `splitBand` in specialRounds.ts inherits this for free.
- Deduplicate `getInteractionCount` (private copy in scoring.ts vs export in assign.ts; specialRounds.ts imports from `./assign`).
- Full suite must be green before Step 4. Separate commit, so distribution shifts bisect cleanly to refactor vs reweight.

### Step 4: Partner variety, recency, and the new weight table

Recency bookkeeping ([pairing.ts](src/lib/pairing.ts), [types/index.ts](src/types/index.ts)): add `roundsRecorded: number` and `lastPartneredRound: Record<string, number>` (keyed by existing `partnerKey`) to `PairingHistory`, maintained in `updateHistory`. Replay populates both automatically.

New weight table in [scoring.ts](src/lib/scoring.ts), starting values (Step 5's harness is the authority, tune there):

```
BALANCE_WEIGHT          3    (unchanged, keeps minimizing gaps)
MAX_RATING_DIFF         0.5  (unchanged target)
CAP_OVERAGE_WEIGHT      50   (was 200: strong preference, not a wall)
PARTNER_REPEAT_WEIGHT   40   (was 10)
PARTNER_RECENCY_WEIGHT  25   (new: * max(0, 3 - gap); back-to-back +50, two-ago +25)
FRESH_PARTNER_BONUS     15   (new: team whose members never partnered; keys on
                              partnerCounts === 0, so it does NOT saturate when
                              everyone has merely met)
OPPONENT_REPEAT_WEIGHT  10   (unchanged)
NOVELTY_BONUS           25   (unchanged, never-met pair anywhere on court)
COVERAGE_WEIGHT         5    (unchanged)
REPEAT_EXPONENT         2.0  (now the only exponent anywhere)
GENDER_LOPSIDED_3M1W    4    (new, lowest priority: court of 3 men + 1 woman)
GENDER_LOPSIDED_3W1M    2    (new: court of 3 women + 1 man)
```

The inversion, in numbers: avoiding a repeat at the cost of a 0.75 gap now costs ~15 vs ~55 for the repeat — variety wins ~3.5:1 (old regime: balance won ~3:1). Indifference lands near a 1.6 rating gap, so farcical courts are still refused. A back-to-back repeat costs 90 — chosen only when a special round genuinely forces it, and history then counts the pair, which deters re-pairing them in normal rounds (Jeff's gendered-round exception, exactly).

**Gender shape (Jeff's newest factor, lowest priority):** court makeups rank all-gendered (4:0) = mixed (2:2) > 3 women + 1 man > 3 men + 1 woman. The two penalties above implement exactly that: 4:0 and 2:2 courts cost nothing, 3W+1M costs 2, 3M+1W costs 4. They sit below one repeat opponent (10) so they decide ties without ever costing a fresh partnership or a fair sit-out. When the number of men playing is odd, one 3:1 court is mathematically forced (courts can only be 4:0 or 2:2 otherwise); the solver then builds exactly one and prefers the 3W+1M shape.

`buildGreedyCourts` ([assign.ts:236-337](src/lib/assign.ts#L236-L337)) separation: pair-debt count becomes `2*partnerCount + opponentCount`; pick3/pick4 scoring replaces binary never-met with graded freshness (+2 never partnered, +1 more never met). Loop counts unchanged, no perf impact.

### Step 5: Re-measure, tune, recalibrate

Run the harness on the new code. Tune until: repeats-while-fresh ~0 in normal rounds, consecutive repeats 0, special fairness and short-game spread unchanged vs baseline, 3:1 courts at or near the feasible minimum. Then recalibrate from measurement (bounds and their comments):
- [pairing.test.ts:72-79](src/lib/pairing.test.ts#L72-L79) rating-cap test: supposed to move; rewrite bounds and comment from the new distribution.
- [pairing.test.ts:124-129](src/lib/pairing.test.ts#L124-L129) partner repeats ≤ 3: likely tightens; re-measure over ~2000 runs as the original did.
- extendSchedule measured comments (~L314-387) refreshed if they move; shortCourts bounds expected unchanged (confirm, don't touch).

### Step 6: New pinned tests (each sabotage-proved once)

In [pairing.test.ts](src/lib/pairing.test.ts), all with special types disabled and no partnerships unless stated:
1. Cycle repeats identically (deterministic): 13/3 x 26 rounds — sitters in rounds 14-26 equal rounds 1-13; 14/3 x 14 rounds — sitter sets repeat in order. Sabotage: remove the cycle-order comparator.
2. Round-1 sitter approx uniform: ~400 one-round 13/3 schedules, chi-square under a measured bound. Sabotage: restore `Math.random() - 0.5`.
3. No repeat partner while fresh partners remain: 12 equal-rated players (so the balancer can't answer a variety question), 3 courts, 8 rounds — zero repeat partnerships, or the near-zero measured bound. Sabotage: revert PARTNER_REPEAT_WEIGHT to 10.
4. No back-to-back repeat partners: same setup plus a mixed-ratings variant with a measured bound. Sabotage: zero PARTNER_RECENCY_WEIGHT.
5. Gender shape: roster with even men count — normal rounds produce no 3:1 courts (or measured near-zero); odd men count — exactly one, preferring 3W+1M. Sabotage: zero the gender weights.

### Step 7: Documentation (Jeff edits copy closely: short sentences, no em dashes, no repeated words)

1. Rewrite "How the schedule thinks" in [InstructionsPanel.tsx:502-508](src/components/layout/InstructionsPanel.tsx#L502-L508) as the ranked rules in plain language: sit-outs rotate fairly and the order repeats each cycle; new partners before repeat partners; you meet everyone; even games matter but variety wins a conflict; special game types rotate to whoever missed out; courts lean all-one-gender or two-and-two.
2. New `docs/how-the-scheduler-thinks.md` (docs/ exists): the ranked rules, what happens when they conflict, the forced-repeat exception on special rounds, why history survives reshuffles and reloads, a worked 13-player example. Written for hosts and players, support/marketing usable.
3. Update PRODUCT-CONTEXT.md §4 (~L127-155) to the new reality: soft cap, recency and fresh-partner terms, cycle-repetition guarantee, gender-shape preference.

### Step 8: Final gates

`npm test`, `npx tsc -b`, `npx eslint src`. Final `MEASURE=1` run; paste numbers into the harness header and recalibrated comments. Bump `APP_VERSION` only if deploying, and do not deploy unless Jeff says to; stop at the commit.

## Risks

- WithLocks/WithPartners paths inherit everything via `scoreAssignment`/`pickBestSplit`; couples' repeat penalties are constant across candidates so they cancel — harness includes one partnerships config to confirm.
- Special rounds inherit the scoring too; harness reports their gaps separately so gendered/mixed balance doesn't silently degrade. The gender-shape term must not apply on special rounds' format courts (they are 4:0 or 2:2 by construction; leftovers courts get it like any normal court).
- The cap test goes red between Steps 4 and 5 by design; both land in the same session, separate commits.
- Out-of-order completion makes recency an approximation (a rebuilt middle round sees later rounds as recent) — same accepted class as `previousSitOutIds` today; documented in a comment.
