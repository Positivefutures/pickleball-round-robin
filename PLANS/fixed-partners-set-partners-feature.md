# Fixed Partners ("Set Partners") Feature

## Context

In many round-robin nights, some players want to play *together* as a fixed couple for the whole
evening (sometimes it's all couples, sometimes just a few). The app has no way to express this
today — it only has an ephemeral per-round "lock" on the Schedule tab.

This feature lets the host, during Setup, mark two selected players as a **fixed partnership**.
The scheduler then keeps each couple on the **same team every round**, mixes up who they play
*against* round to round, and — critically — handles **sit-outs** so couples sit out *together*
whenever 2+ people must sit, while single (unpaired) players absorb odd sit-out slots. On the
Schedule tab the host can still break any couple for a single round using the existing lock icon.

Decisions confirmed with the user:
- Button label: **"Set Partners"**.
- Partnerships **persist** across refresh and "Start New Session" (like player selection); cleared
  only on a group switch.
- Partnerships **override** gendered-games mode (a mixed couple's court just skips the gendered
  constraint — mirrors how existing locks already override gendered play).

Priority order for the algorithm (from the user): **(1) fair sit-outs**, then **(2) opponent
variety** (don't keep facing the same people; everyone plays with/against everyone), then
**(3) skill-balanced games**. This matches the existing scoring weights, so no re-tuning is needed.

---

## Data model

New concept — a **placement-agnostic** fixed pair (distinct from `LockedPair`, which pins a pair to
a specific court/team for one round).

`src/types/index.ts` — add:
```ts
export interface Partnership {
  player1Id: string;
  player2Id: string;
}
```

Persistence (follow the existing pattern exactly):
- `src/lib/migrations.ts`: add `partnerships: 'pb-partnerships'` to `KEYS`, and a key-presence-guarded
  seed block in `runMigrations()` (`if (getItem('pb-partnerships') === null) write([])`). Idempotent,
  no version counter (consistent with the current migration style).
- `src/App.tsx`: `const [partnerships, setPartnerships] = useLocalStorage<Partnership[]>(KEYS.partnerships, [])`.
- Prune stale partnerships in the existing membership-cleanup `useEffect` (App.tsx:74-82) and whenever
  a player is deselected: drop any partnership whose member is no longer in `selectedIds` /
  `rosterPlayers`. On group switch, `clearSession()` (App.tsx:101-107) already clears selection — also
  clear partnerships there. Do **not** clear them in the `keepSelection` path of "Start New Session".

Helper (new, in `src/utils/helpers.ts` or `src/lib/partnerships.ts`): a `partnerKey(a,b)` /
`arePartners(id1,id2,partnerships)` lookup and a `Set` of partnered ids, reused across UI + algorithm.

---

## Setup UI

`src/components/setup/SetupPage.tsx` — restructure the top button row and add a pairing mode.

1. **Move "Back to Players" above** the Session Configuration card (its own row at the very top).
2. In the row that currently holds "Back to Players" (both the top row at :79-85 and it stays paired
   with Generate Schedule), replace the left button with a **"Set Partners"** toggle button.
3. Introduce a `mode: 'select' | 'pair'` state (lift into `App.tsx` or keep local to `SetupPage`).
   - **select mode** (default): renders the existing `<PlayerSelector>` (unchanged).
   - **pair mode**: renders a new `<PartnerPairing>` component in place of `PlayerSelector`, showing
     **only the selected players**. The "Set Partners" button becomes **"Done Pairing"** (toggles back).
   - "Generate Schedule" remains available in both modes (some players may stay unpaired — that's fine).

New component `src/components/setup/PartnerPairing.tsx` (mirror `PlayerSelector`'s stateless,
props-driven grid at PlayerSelector.tsx:42-68):
- Props: `players` (the selected ones), `partnerships`, `pendingId` (first tap), `onTapPlayer(id)`,
  `onUnpair(partnership)`.
- Behavior: tap player A → highlighted as pending; tap player B → `onCreatePartnership(A,B)`; the pair
  **moves to the top** of the list, rendered as a linked row (the two names joined by a chain/link
  glyph) with an **unlink button** (break icon) to dissolve it. Tapping A then tapping A again clears
  the pending selection. Already-paired players are not tappable for a new pair (must unlink first).
- Render order: paired rows first (grouped), then remaining unpaired selected players.
- Reuse an inline SVG icon in the style of `src/components/schedule/icons.tsx` /
  `CourtMatchup.tsx`'s `LockIcon` for the link + unlink affordances.

Pairing state handlers live in `App.tsx` (mirroring `togglePlayer`/`selectAll`): `createPartnership`,
`removePartnership`, plus the `pendingId` two-tap state.

---

## Algorithm (`src/lib/pairing.ts`)

Thread `partnerships: Partnership[]` through the three entry points (`generateSchedule`,
`reshuffleSchedule`, `regenerateRemaining`) and into `buildRound`. Two new pieces:

### 1. Partner-aware assignment — `findBestAssignmentWithPartners(activePlayers, effectiveCourts, history, partnerships, allPlayers)`
Modeled on `findBestAssignmentWithLocks` (pairing.ts:260-368) but **placement-agnostic**:
- Split active players into **partnership-teams** (fixed 2-player teams) and **free singles**.
- N iterations (≈1000): shuffle the partnership-teams and singles, then pack courts. Each court has two
  team slots; fill each slot with either a whole partnership-team or a pair of singles.
  - A court that ends up **all singles** → run `pickBestSplit` (pairing.ts:44-96) for the optimal 2v2.
  - A court containing a partnership → keep that team fixed; the opposing team is another partnership or
    two singles; compute `ratingDiff` directly (as the locks path does at :341-348).
- Score every candidate with `scoreAssignment` (unchanged) and keep the best. This automatically
  optimizes opponent variety + skill balance *around* the fixed couples.
- Feasibility guard: the number of **active** partnership-teams must be ≤ `2 * effectiveCourts`
  (can't have more couples than team slots). The sit-out step below guarantees this.

`buildRound` dispatch (pairing.ts:509-524) gains a branch: if `partnerships` present →
`findBestAssignmentWithPartners`; existing manual `roundLocks` still take the locks branch; gendered is
skipped for partnership courts per the "partners win" decision (partnerships imply `isGendered=false`
for their courts, simplest: if any partnership active, treat the round like the locks case and disable
the whole-round gendered constraint, consistent with pairing.ts:496).

### 2. Unit-aware sit-outs — extend `determineSitOuts` (`src/lib/sitout.ts`)
Currently picks individual players by `gamesPlayed` desc + avoid-consecutive + random (sitout.ts:23-38).
Make it **unit-aware** when partnerships exist:
- Units = partnership-units (size 2) + single-units (size 1). Sort units by **average `gamesPlayed`**
  of members (desc), with the same avoid-consecutive-sit-out and random tie-breaks.
- Greedily select whole units until the required sit-out count is reached. Because a court is always 4,
  `numSitOuts` has the **same parity** as active count, and an odd active count always contains a
  single — so "couples sit together, a single fills any odd slot" is **always feasible** (no impossible
  case). When `numSitOuts` is odd, ensure exactly one single-unit is included for parity.
- Apply the feasibility cap: if active partnership-teams would exceed `2 * effectiveCourts`, prefer
  sitting whole partnership-units until they fit.
- Locked players (existing `excludeIds`) still never sit; partnered players are treated as a unit here.

Keep the current per-player behavior as the path when `partnerships` is empty (no regression — existing
tests must stay green).

---

## Schedule tab integration

Goal: couples show as **locked** each round (existing padlock UI), and the host can **break a couple
for one round only**, then Reshuffle.

- `generateSchedule` already produces rounds where each couple is a team. In
  `src/components/schedule/SchedulePage.tsx`, **initialize the `locks` state from the partnerships**
  instead of `{}` (SchedulePage.tsx:63): for each round, scan `round.courts` for any team whose two
  players form a partnership and emit a `LockedPair {player1Id, player2Id, courtIdx, team}`. This makes
  every couple render with the filled padlock via the existing `RoundCard`/`CourtMatchup` lock rendering
  (CourtMatchup.tsx:176-185) with **zero UI changes**.
- Breaking a couple for a round = the existing `handleToggleLock` unlock path (SchedulePage.tsx:106-115)
  removes that lock; pressing **Reshuffle** (`onRegenerate(locks)` → `App.handleGenerate`) rebuilds with
  that pair freed for that round while all still-locked couples stay together. Pass `partnerships` into
  `reshuffleSchedule` so *un-broken* couples remain paired even on rounds the host reshuffles.
- `App.handleGenerate` (App.tsx:140-154), `handleRemovePlayer` (:163-176 → `regenerateRemaining`) and the
  `SchedulePage` prop wiring get `partnerships` threaded through. Mid-session player removal must drop any
  partnership containing the removed player before regenerating.

Note: because partnerships flow as their own argument (not only as captured locks), a Reshuffle keeps
couples together but lets them move courts/opponents round to round — preserving variety.

---

## Files touched (summary)

- `src/types/index.ts` — add `Partnership`.
- `src/lib/migrations.ts` — `KEYS.partnerships` + seed block.
- `src/lib/pairing.ts` — `findBestAssignmentWithPartners`, thread `partnerships` through
  `buildRound` / `generateSchedule` / `reshuffleSchedule` / `regenerateRemaining`.
- `src/lib/sitout.ts` — unit-aware `determineSitOuts`.
- `src/utils/helpers.ts` (or new `src/lib/partnerships.ts`) — `partnerKey` / `arePartners` helpers.
- `src/App.tsx` — partnerships state, handlers, pruning, thread into generate/reshuffle/remove.
- `src/components/setup/SetupPage.tsx` — move Back button, add "Set Partners" toggle + mode.
- `src/components/setup/PartnerPairing.tsx` — **new** pairing UI.
- `src/components/schedule/SchedulePage.tsx` — seed `locks` from partnerships; thread `partnerships`.
- Footer version bump in `src/App.tsx:274` (e.g. `v1.10.0`).

---

## Tests & verification

Unit (Vitest, `npm test` — colocated `*.test.ts`, patterns in `src/lib/pairing.test.ts`):
- `sitout.test.ts` (new or in pairing.test): couples always sit as a unit when 2+ sit; a single fills an
  odd sit-out; sit-out counts stay as fair as possible (couples spread evenly, ≤ ~1 imbalance among
  same-type units).
- `pairing.test.ts`: with partnerships, every round keeps each couple on the same team; opponent variety
  still improves across rounds; existing no-partnership tests unchanged (regression).
- Feasibility: more couples than team slots → excess couples sit out, no court ever splits a couple.
- `migrations.test.ts`: fresh install seeds `pb-partnerships = []`; idempotent re-run unchanged.

End-to-end (manual, `npm run dev`):
1. Roster → Setup: select ~13 players, click **Set Partners**, pair a few couples (verify they jump to
   the top with a link + unlink icon; unlink works; unpaired players remain).
2. Generate Schedule: confirm each couple is teammates in every round, couples render **locked**
   (padlock), and when 1 person sits it's an **unpaired** player; with 2+ sitting, couples sit together.
3. On a round, click a couple's padlock to break them, press **Reshuffle**: that round frees the couple,
   other rounds keep them together.
4. Refresh mid-setup → partnerships persist. "Start New Session" → partnerships kept. Switch group →
   partnerships cleared.
5. `npm run build` (tsc + vite) passes; `npm run lint` clean.
