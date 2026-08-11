# Interface pass: header, tabs, actions, score panel, gender marks

## Context

A batch of interface corrections Jeff has collected from using the app. Most are
sizing: things that read too small on a phone (tabs, the Actions button, the
action cards, names in the score box) and one thing that reads too big in large
text mode (the group name in the My Groups dropdown). Three are behaviour:
Reshuffle currently fires the moment it is tapped with no way back, Share Live
Session makes people tap through an explainer before they can get to the code,
and gendered and mixed rounds give no sign of who is a man and who is a woman.

Styling is Tailwind v4 with no config file. Large text mode is a `.text-large`
class on the app root that rescales `--text-xs` … `--text-xl` by 1.35
([index.css:18-25](src/index.css#L18-L25)); an arbitrary size like
`text-[1rem]` is immune to it. That distinction decides several of the changes
below.

---

## 1. Space between the header and the tabs

[App.tsx:806](src/App.tsx#L806) — `-mt-3` → `mt-1`. The strip behind it is
`bg-gray-50`, so the 4px reads as a light seam rather than a dark bar. Rewrite
the comment above it, which currently explains the overlap.

## 2. Header 25% larger

[Header.tsx:17](src/components/layout/Header.tsx#L17) —
`clamp(88px, 21vw, 132px)` → `clamp(110px, 26.25vw, 165px)`. Every other
measurement in that file is a multiple of `HEIGHT`, so the badge inset, the
court window and the title padding all follow on their own. Both images are
264px tall, so they are still being scaled down at 165px.

**The title font stays as it is.** It is `text-[clamp(1.05rem,3.4vw,1.75rem)]`
and it is the group name on Setup and Schedule, which item 3 is about shrinking,
not growing.

## 3. Group name in the My Groups dropdown

[RosterPage.tsx:207](src/components/roster/RosterPage.tsx#L207) —
`text-xl` → `text-[1.25rem]`. Same 20px, but written as an arbitrary value so
large text mode no longer takes it to 27px.

## 4. Tab labels one size in both modes

[StepIndicator.tsx:71](src/components/layout/StepIndicator.tsx#L71) —
`text-xs` → `text-[1.0125rem]`, which is exactly what large text mode gives
`text-xs` today (0.75 × 1.35). Replace the comment at lines 68-70, which says
`text-xs` was picked so the toggle would reach it.

Watch for wrapping: "3. Schedule" at 16.2px semibold beside a 23px icon in a
third of a 375px screen is tight. Check it on a 375px viewport; if it wraps,
drop the icon to `w-5 h-5` rather than shrinking the type back.

## 5. "0 selected" as large as the player names

[RosterPage.tsx:350](src/components/roster/RosterPage.tsx#L350) —
`text-sm` → `text-base`. The names in [PlayerList.tsx:142](src/components/roster/PlayerList.tsx#L142)
carry no size class at all, so they inherit 1rem, and 1.35rem in large mode.
`text-base` matches in both.

## 6. Actions button 20% larger

[ActionsButton.tsx](src/components/schedule/ActionsButton.tsx) — every measure
in the file × 1.2:

| | now | after |
|---|---|---|
| button | `h-[60px] w-[104px]` | `h-[72px] w-[125px]` |
| label | `text-[15px]` | `text-[18px]` |
| tiles | `h-[21px] w-[21px]`, `gap-1`, `rounded-[6px]` | `h-[25px] w-[25px]`, `gap-[5px]`, `rounded-[7px]` |
| tile icons | `h-3 w-3` | `h-[15px] w-[15px]` |
| tile overhang | `-top-3.5` | `-top-[17px]` |
| halftone | `h-[74px] w-[150px]` | `h-[89px] w-[180px]` |
| foot padding | `pb-2` | `pb-2.5` |

The wrapper's `pt-[22px]` becomes `pt-[25px]` to keep the same 24px of clear air
above the tiles that its comment describes (`16 + 25 − 17 = 24`).

## 7. Action cards 25% larger

[ActionsSheet.tsx:431,440,443](src/components/schedule/ActionsSheet.tsx#L431-L443):
chip `h-11 w-11` → `h-[55px] w-[55px]`, glyph `h-6 w-6` → `h-[30px] w-[30px]`,
label `text-[0.8rem]` → `text-[1rem]`. The grid stays three across; the sheet
measures its own content height, so the taller cards are handled already.

## 8. Names in the score box

[ScoreDialog.tsx:128-136](src/components/schedule/ScoreDialog.tsx#L128-L136).
Each name is `w-[6.5rem] truncate text-xs` — 104px of a ~336px panel, cut with
an ellipsis. Replace with `min-w-0 flex-1 max-w-[10rem] break-words text-sm`,
dropping `truncate`. `text-sm` is what the court cards use
([CourtMatchup.tsx:92](src/components/schedule/CourtMatchup.tsx#L92)), and each
name gets up to 160px and wraps to a second line instead of being cut. Keep the
`title` attribute and the `w-[5px]` spacer; leave the score panels and the nudge
rows alone, since their widths belong to the `Scoreboard` rhythm. Update the
comment to say the names now wrap.

## 9. Male and female marks on gendered and mixed rounds

Gender is already on the model (`Player.gender: 'M' | 'F'`,
[types/index.ts:1-21](src/types/index.ts#L1-L21)) and the round type is already
computed by `roundTypeOf(round)` in
[RoundCard.tsx:62](src/components/schedule/RoundCard.tsx#L62).

- **New icons** in [icons.tsx](src/components/icons.tsx): `MaleIcon` and
  `FemaleIcon`, paths hand-inlined from `INBOX/male.svg` (viewBox `0 0 50 50`)
  and `INBOX/female.svg` (viewBox `0 0 512 512`) through the existing `Solid`
  wrapper, with the citing JSDoc the file's other icons carry. Nothing goes in
  `public/`, so `precache.ts` is untouched.
- **New `GenderIcon`** at `src/components/schedule/GenderIcon.tsx`, alongside
  `GuestChip` and following its shape: takes a `Player`, returns the right glyph
  at `h-3.5 w-3.5 shrink-0 text-gray-500`. Neutral grey rather than blue and
  pink, so it reads as a mark on the name and not a second badge.
- **Thread a `showGender` boolean** from `RoundCard`
  (`roundType === 'gendered' || roundType === 'mixed'`) into `CourtMatchup` →
  `TeamColumn` → `PlayerButton`, and into `SitOutList` → `SitOutBox`. Render the
  glyph immediately before the name span in both. Shown for every court in such
  a round, including one `courtMatchesType` marks as off format.
- Default the prop to `false`, which leaves
  [CourtMatchup.test.ts](src/components/schedule/CourtMatchup.test.ts) passing
  untouched. Score panel and printed sheet are out of scope per Jeff.

## 10. Reshuffle asks first

[ActionsSheet.tsx:264-274](src/components/schedule/ActionsSheet.tsx#L264-L274) —
Reshuffle is the one card that runs on tap instead of opening a view. Give it a
view like every other card:

- add `'reshuffle'` to the `View` union, which lets `Card['view']` collapse to
  plain `Exclude<View, 'menu' | 'done' | 'new-player'>`;
- delete the special case in `openAction` so the generic `setView(card.view)`
  runs;
- add `reshuffle: { title: 'Reshuffle' }` to `HEADINGS`;
- add a `CONFIRM` view carrying the copy below and one `PRIMARY` button reading
  **Reshuffle**, which calls `actions.onReshuffle()` then
  `finish(...)` exactly as the old branch did. One button, no Cancel, matching
  Add a Court — back and close are in the sheet header.

Copy (for editing):

> The 3 rounds still to be played are built again from scratch. Anything marked
> complete is kept, along with the pairs you have locked.
>
> *(quiet line)* Scores on the rounds being rebuilt go with them.

"3 rounds" comes from the existing `roundWord(openRounds.length)` helper.

**Tests.** `action(/^Reshuffle$/)` in
[App.walkthrough.test.ts](src/App.walkthrough.test.ts) now only opens the panel.
Add a `reshuffle()` helper beside `action()` that clicks the card and then the
confirm button, and point lines 190, 288, 333, 1197 and 1586/1596 at it.

## 11. Back and X, bold and 20% larger

Both are SVGs, not glyphs, so "bold" is stroke width.

- [icons.tsx:186](src/components/icons.tsx#L186) — give the `Stroked` wrapper an
  optional `strokeWidth` prop defaulting to `2`, and pass it through from
  `ChevronLeftIcon` and `CloseIcon`.
- [ActionsSheet.tsx:384,406](src/components/schedule/ActionsSheet.tsx#L384) —
  `h-6 w-6` → `h-[29px] w-[29px]`, `strokeWidth={3}`. Both are used nowhere else
  in the app, so nothing else moves.

## 12. Add a Court copy

[ActionsSheet.tsx:670-675](src/components/schedule/ActionsSheet.tsx#L670-L675):

> A court will be added to the {N rounds} still to be played. The {n} players
> sitting out will be placed on it.

Written "will be added" — the line as given reads "will added". Singular handled
("The 1 player sitting out will be placed on it"), and when nobody is waiting
the existing fallback stays: *"Nobody is waiting, so it starts empty and you can
tap players into it."* The amber warning below it is unchanged.

Update [App.walkthrough.test.ts:1175](src/App.walkthrough.test.ts#L1175), which
asserts the old wording.

## 13. Remove a Court copy

[ActionsSheet.tsx:723-726](src/components/schedule/ActionsSheet.tsx#L723-L726):

> The court will be removed from the {N rounds} still to be played. Rounds
> already played are kept.

## 14. Share Live Session goes straight to the code

[LiveShareView.tsx](src/components/schedule/LiveShareView.tsx):

- A `useRef` guard plus a `useEffect` that calls `startSharing()` once on mount
  when `sharingAvailable()` and `status.state === 'off'`. Two guards, because
  StrictMode runs mount effects twice in dev.
- While there is no URL yet, show the privacy line and "Making a link…" rather
  than the old explainer. If `status.state === 'problem'` with no URL, show the
  message with a **Try Again** button.
- Move *"Names, courts and scores are shared. Player ratings are not."* onto the
  QR panel, since the panel that used to carry it is gone.
- **Stop Sharing** sets a `stopped` flag, and while it is set the old intro
  panel renders again with its "Share This Session" button. Without it the
  effect would immediately republish the session the host just took down.
- Rename `Share&hellip;` → `Share link&hellip;`
  ([line 128](src/components/schedule/LiveShareView.tsx#L128)). The
  `/^Share…|^Share\.\.\./` assertion at
  [App.walkthrough.test.ts:818](src/App.walkthrough.test.ts#L818) is the
  settings Share App panel, a different component, and is unaffected.

---

## Verification

1. `npx tsc --noEmit` and `npm run test`. Tests are not typechecked, so a green
   `tsc` says nothing about the two test files touched — run the suite.
2. Prove the three behaviour changes by breaking them: make the Reshuffle
   confirm button a no-op and watch the walkthrough tests go red; the same for
   the Add a Court sentence.
3. `npm run lint -- src` only. A bare `npm run lint` walks a stray backup folder
   for five minutes. Never run Prettier here.
4. Screenshot the real UI rather than reasoning about it, at 375px and at 768px,
   in both text modes:
   - Players tab — tab labels not wrapping, the header gap, "0 selected" after
     tapping Select Players, the My Groups name identical in both modes;
   - Schedule tab — banner height, Actions button, a court on a gendered round
     and one on a mixed round showing the right marks, the sit-out row;
   - Actions sheet — card icons and labels, the bolder back and close, Reshuffle
     opening its panel, Add a Court and Remove a Court copy;
   - the score box — names at court size, wrapped rather than cut, using the
     full width. Use a long name such as "Bartholomew Fitzwilliam-Smythe".
5. Share Live Session needs a signed-in session against Supabase: open the card
   and confirm the code appears without a second tap, then Stop Sharing and
   confirm it falls back to the intro panel rather than republishing.

Not deploying. Stop at the commit unless Jeff says otherwise, and `APP_VERSION`
gets bumped in the deploy commit, not this one.
