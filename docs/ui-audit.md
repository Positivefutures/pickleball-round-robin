# UI Audit

An inventory of every UI element actually in the app, taken from the code on
2026-08-18 (branch `main`, at `0b49cbf`). Nothing here is aspirational: if it is
listed, it is in `src/`, and the file and the count say where and how often.

**Sources of truth read for this audit**

| What | Where |
|---|---|
| Palette, type-scale overrides, print rules, animations | [src/index.css](src/index.css) |
| Tailwind defaults it builds on | Tailwind v4.1.18, config-in-CSS (`@theme static`). There is **no `tailwind.config.js`** |
| Shared style strings | [panelStyles.ts](src/components/panelStyles.ts), [formLook.ts](src/components/formLook.ts), [stepperLook.ts](src/components/stepperLook.ts), [accountStyles.ts](src/components/layout/accountStyles.ts), [roundLook.ts](src/components/schedule/roundLook.ts), [scoreTone.ts](src/components/schedule/scoreTone.ts) |
| Components | 96 `.tsx`/`.ts` files under [src/components/](src/components/) |

**Scale of the surface**: 166 `<button>` elements, 20 `<input>`, 4 `<select>`,
1 `<textarea>`, 4 `<table>`, 25 files with a `fixed inset-0` backdrop, 102
distinct hex literals, 55 distinct `text-*` sizes, 13 distinct `rounded-*`
values, 10 distinct `shadow-*` values.

---

## 1. Foundations

### 1.1 Colour — declared tokens

Declared in `@theme static` in [src/index.css](src/index.css#L26). `static`
means all eight are always on the document, so `var(--color-…)` is safe from an
inline style whether or not a utility uses it.

| Token | Hex | Utilities generated | Usages | Semantic job |
|---|---|---|---|---|
| `--color-brand-orange` | `#f54702` | `bg-`/`text-`/`border-`/`ring-brand-orange` | 46 (23 bg, 9 border, 5 text, 1 ring, 5 as `var()`) | Leads. The tab you are on, and the buttons that move you somewhere else |
| `--color-brand-orange-dark` | `#d03c02` | `bg-`/`text-brand-orange-dark` | 11 | Hover only. Not a fifth brand colour |
| `--color-brand-orange-light` | `#fff3eb` | `bg-brand-orange-light` | 7 | Background for black text, bordered in orange. Warning notices, pending pair |
| `--color-brand-teal` | `#007d88` | `bg-`/`text-`/`border-`/`ring-`/`accent-brand-teal` | 87 (31 bg, 24 text, 13 border, 5 ring, 5 accent, 9 as `var()`) | Confirms. The button that does the thing, the switch that is on |
| `--color-brand-teal-dark` | `#006770` | `bg-`/`text-`/`border-brand-teal-dark` | 29 | Hover only |
| `--color-brand-teal-light` | `#e8f7f8` | `bg-brand-teal-light` | 19 | Pale fills: tiles, selected rows, rating badges, stepper value |
| `--color-panel-edge` | `#a2a7ab` | `border-panel-edge` | 29 | The line around a panel and around Actions-sheet rows. Replaced three near-identical greys (`#ddd`, `#D8DEE4`, `#E7E8EA`) |
| `--color-notice-yellow` | `#fdf3c7` | `bg-notice-yellow` | 1 (`ActionsSheet.tsx:748`) | The fill behind a notice that only informs, as against the orange one that warns |

Two more colours are written straight into `index.html`/`index.css` rather than
the theme: `#fbfaf6` (cream — `#top-pin` background and `theme-color`) and
`#d2d2d2` (the pin's hairline). Both are duplicated in `Header.tsx` as `CREAM`
and `RULE`.

### 1.2 Colour — Tailwind palette in use

Tailwind v4 ships its palette in OKLCH, so these are the *computed* hexes, not
values you can grep for.

| Class | oklch | ≈ hex | Usages | Doing |
|---|---|---|---|---|
| `gray-50` | `98.5% 0.002 247.8` | `#f9fafb` | 20 bg | Page background (`.app-panel`), hover on white rows |
| `gray-100` | `96.7% 0.003 264.5` | `#f3f4f6` | 18 bg, 4 border | Keypad keys, sit-out chip, icon-button hover |
| `gray-200` | `92.8% 0.006 264.5` | `#e5e7eb` | 21 border | Toggle-off track, and the grey button's hover. The button's own fill came down to `gray-100` on 2026-08-21 |
| `gray-300` | `87.2% 0.010 258.3` | `#d1d5dc` | 22 bg, 14 border | Grey button hover; the form-field border |
| `gray-400` | `70.7% 0.022 261.3` | `#99a1af` | 20 text, 5 border | Empty-state text, chevrons, toggle-off edge |
| `gray-500` | `55.1% 0.027 264.4` | `#6a7282` | 34 text | Quiet secondary copy |
| `gray-600` | `44.6% 0.030 256.8` | `#4a5565` | 41 text | Body copy inside panels |
| `gray-700` | `37.3% 0.034 259.7` | `#364153` | 50 text | `FIELD_LABEL`; grey-button ink |
| `gray-800` | `27.8% 0.033 256.8` | `#1e2939` | 19 text, 5 bg | `.app-shell` surround; blank score panel |
| `gray-900` | `21.0% 0.034 264.7` | `#101828` | 7 text | Instructions-panel headings |
| `slate-500/700/900` | — | — | 8 text | Banners only (Install, SignIn, Update) |
| `green-50/100/200/700/900` | — | — | 12 | Install banner, SwapHint, alarm ticks |
| `red-50/200/500/600/700/300` | — | — | 15 | `Problem` box, validation, three Delete buttons |
| `amber-50/100/200/300/700/800/900` | — | — | 18 | Eight separate "amber note" boxes |
| `orange-50/100/200` | — | — | 4 | UpdateBanner only |
| `blue-50/100/200/500/700` | — | — | 20 | Team 1 side of a court, selected seat |
| `purple-100/400/700` | — | — | 3 | Gendered round pill |
| `teal-100/400/700` | — | — | 3 | Mixed round pill |
| `indigo-400` | — | — | 1 | `PairList` remove ✕ |
| `yellow-100/700/800` | — | — | 3 | Draw score panel |

### 1.3 Colour — hex literals

**102 distinct hex values** appear in `src/`. The ones written in more than one
file:

| Hex | Count | Files | Job |
|---|---|---|---|
| `#999` | 26 | 20 | The border on the grey cancel button. Nowhere else |
| `#222` | 20 | 17 | `PanelHeading` title ink, and 16 files repeating it |
| `#FFFFFF` | 10 | 7 | Literal white where `white` would do |
| `#1F293D` | 9 | 6 | Account/dialog ink (`accountStyles.field`, `CodeEntry`) |
| `#3D495A` | 9 | 4 | Quiet-tile / share-panel ink |
| `#FEFEFE` | 9 | 4 | Account, Share and Donate card fill |
| `#F8F9FB` | 7 | 6 | Cool near-white fill |
| `#495668` | 6 | 6 | `accountStyles.blurb` ink |
| `#051829` | 6 | 6 | Navy — Header, TourSheet, ActionsSheet, MakeYourOwn, SetupPage |
| `#69727F` | 5 | 5 | `accountStyles.muted` |
| `#FBFAF6` | 5 | 3 | Cream |
| `#0D1F44` | 5 | 3 | Stepper ink |
| `#F1F3F6` | 4 | 4 | Row hover |
| `#A6D1D5` | 4 | 4 | Pale-teal edge |
| `#3A4353` | 4 | 3 | Row-icon ink |
| `#CCCFD9` | 4 | 1 | Stepper edge |
| `#D5F0F2` | 3 | 3 | Teal tile hover |
| `#636A77` | 3 | 3 | `QUIET_TEXT`, declared separately in three files |
| `#9B2C2C`, `#EDF0F4`, `#6B7684`, `#626D7E`, `#F1F8F9`, `#EEE` | 3 each | 1–3 | — |

Plus 79 hexes appearing once or twice.

### 1.4 Type scale

No webfont. The app inherits Tailwind's `ui-sans-serif, system-ui, …` stack.

Two steps are **overridden** in `:root` ([index.css](src/index.css#L214)), each
raised 2px so body copy is legible at arm's length. Tailwind v4 stores line
heights as unitless *ratios*, so the ratios carry through the override
untouched.

| Class | Size | ×ratio | Line height | Usages | Where |
|---|---|---|---|---|---|
| `text-xs` | **0.875rem / 14px** (default 0.75rem — overridden) | 1.333 | 18.7px | 28 in 20 files | Captions, `PartnerSummary` table |
| `text-sm` | **1rem / 16px** (default 0.875rem — overridden) | 1.429 | 22.9px | **131 in 56 files** | The app's body copy. Most-used size by 4× |
| `text-base` | 1rem / 16px | 1.5 | 24px | 17 in 13 files | Banner headlines, round-card links |
| `text-lg` | 1.125rem / 18px | 1.556 | 28px | 30 in 21 files | Account panel fields and buttons |
| `text-xl` | 1.25rem / 20px | 1.4 | 28px | 12 in 7 files | `accountStyles.status`, empty state |
| `text-2xl` | 1.5rem / 24px | 1.333 | 32px | 4 in 3 files | Large score panel |
| `text-3xl` | 1.875rem / 30px | 1.2 | 36px | 4 in 3 files | Code-entry digits |
| `text-4xl` | 2.25rem / 36px | 1.111 | 40px | 3 in 3 files | `accountStyles.heading` |
| `text-5xl` | 3rem / 48px | 1.0 | 48px | 1 | Rating readout |

**Named absolute sizes** — deliberately outside the scale so large-text mode
cannot move them:

| Constant | Value | Usages | What |
|---|---|---|---|
| `ROUND_HEADING_TEXT` ([roundLook.ts](src/components/schedule/roundLook.ts#L74)) | `text-[1.35rem]` | 19 in 15 files | ROUND 3 / COURT 1 / DONE, and `PanelHeading`'s title |
| `PLAYER_NAME_TEXT` ([roundLook.ts](src/components/schedule/roundLook.ts#L92)) | `text-[1.18125rem]` | 5 files | A player's name on a court. The one exception to the rule above: it also carries a plain `player-name` class, and `.text-large .player-name` in index.css takes it to `1.35rem`. The courts are what somebody turns that mode on to read |
| StepIndicator label | `text-[1.0125rem]` | 1 | The three nav tabs. `@min-[40rem]:text-[1.28rem]` once the bar is wide enough, which is a container query and not a breakpoint |
| `RESHUFFLE_LINE` | `text-[1.0625rem]` | 1 | ActionsSheet reshuffle copy |

**Plus 16 unnamed one-off arbitrary sizes**: `text-[15px]` (×4), `text-[13px]`
(×3), `text-[1.05rem]` (×3), `text-[1.125rem]` (×2), and one each of
`text-[0.7rem]`, `text-[1rem]`, `text-[1.15rem]`, `text-[1.2rem]`,
`text-[1.25rem]`, `text-[1.4rem]`, `text-[1.6rem]`, `text-[1.9rem]`,
`text-[2rem]`, `text-[18px]`, `text-[1.2em]`,
`text-[clamp(1.365rem,4.42vw,2.275rem)]`. Two of them restate a scale step
exactly — `text-[1rem]` is `text-sm`/`text-base` and `text-[1.25rem]` is
`text-xl` — so they scale differently in large-text mode for no stated reason.

**Weights** — only five in use, and effectively three:

| Class | Usages | Files |
|---|---|---|
| `font-bold` | 160 | 61 |
| `font-medium` | 49 | 22 |
| `font-extrabold` | 33 | 27 |
| `font-semibold` | 16 | 11 |
| `font-normal` | 2 | 2 |

**Explicit line heights**: `leading-snug` (18), `leading-tight` (7),
`leading-none` (6), `leading-[1.1]` (1), `leading-relaxed` (1).

**Large-text mode** (`.text-large`, toggled from the header) multiplies
`xs`/`sm`/`base`/`lg`/`xl` by 1.35 and sets un-classed text to 1.35rem.
`2xl` and up are deliberately unscaled. Print resets the whole ladder to pt.

### 1.5 Spacing

`--spacing: 0.25rem`, so `p-3` = 0.75rem. **65 distinct padding values** are in
use. The ones that carry real weight:

| Value | Usages | Job |
|---|---|---|
| `px-4` | 79 | Button and row horizontal padding |
| `px-3` | 47 | Form field, chip |
| `py-2` | 45 | Form field vertical |
| `py-2.5` | 43 | **Button vertical** |
| `py-3` | 37 | Row vertical, larger button |
| `p-6` | 22 | Panel padding |
| `gap-3` | 53 | Row / tile gap |
| `gap-2` | 45 | Icon-to-label gap |

Arbitrary spacing one-offs: `pt-[1.125rem]` (8, the page-card top),
`pt-[0.83rem]`, `pb-[1.2rem]`, `px-[0.6rem]`, `pt-[25px]`, `py-[3px]`,
`pb-[max(1.5rem,env(safe-area-inset-bottom))]`, `pb-[max(1.75rem,…)]`.

### 1.6 Border radii

| Class | Value | Usages | Files | What wears it |
|---|---|---|---|---|
| `rounded-md` | 0.375rem / 6px | 96 | 43 | **Buttons, form fields, chips** |
| `rounded-lg` | 0.5rem / 8px | 51 | 25 | Cards, tiles, rows, banners |
| `rounded` | 0.25rem / 4px | 31 | 26 | Icon-only buttons (the ✕ on a banner) |
| `rounded-full` | 9999px | 20 | 15 | Round-type pills, active-tab bar |
| `rounded-xl` | 0.75rem / 12px | 14 | 10 | Tab buttons, notes, SessionConfig cards |
| `rounded-2xl` | 1rem / 16px | 5 | 5 | `panelCard`, StepIndicator track, ActionsButton |
| `rounded-[6px]` | 6px | 2 | 2 | Toggle track, small score panel |
| `rounded-[4px]` / `[7px]` / `[8px]` / `[10px]` / `[14px]` / `[1.25rem]` | — | 1 each | 1 each | Toggle knob, chevron key, large score panel, banner logo, … |

### 1.7 Shadows

| Class | Value | Usages | Files |
|---|---|---|---|
| `shadow` (bare) | `--shadow` | 20 | 13 |
| `shadow-sm` | `0 1px 3px /.1, 0 1px 2px -1px /.1` | 11 | 10 |
| `shadow-lg` | `0 10px 15px -3px /.1, …` | 5 | 5 |
| `shadow-md` | `0 4px 6px -1px /.1, …` | 4 | 4 |
| `shadow-xl` | `0 20px 25px -5px /.1, …` | 3 | 2 (`panelCard` + tour bubble) |
| `shadow-2xl` | `0 25px 50px -12px /.25` | 1 | 1 |
| `shadow-[0_-10px_40px_rgba(0,0,0,0.3)]` | arbitrary | 2 | 2 (ActionsSheet, TimerSheet) |
| `shadow-[0_4px_10px_rgba(0,0,0,0.18)]` | arbitrary | 1 | 1 (ActionsButton) |
| `shadow-[0_-6px_24px_rgba(0,0,0,0.18)]` | arbitrary | 1 | 1 |
| `shadow-[0_2px_3px_rgba(0,0,0,0.6)]` | arbitrary | 1 | 1 |

### 1.8 Z-index

`z-50` (28 uses, 26 files) is every overlay. `z-10` (8) is `.app-panel` and
`#top-pin`. `z-0`, `z-20`, `z-30`, `z-40` appear once each. As recorded in
[index.css](src/index.css#L166), `.app-panel`'s `z-10` traps anything mounted
inside it, so an overlay must mount outside the panel to cover the others.

---

## 2. Component inventory

### 2.1 Buttons

**There is exactly one shared button component**, and it is not the ordinary
one.

| Name | File | Variants / props | Usages | Used by |
|---|---|---|---|---|
| `TileButton` | [TileButton.tsx](src/components/TileButton.tsx) | `tone: 'quiet' \| 'teal' \| 'red'`; `Icon`, `label`, `onClick`, `disabled?`, `title?`, `dataTutorial?` | 6 importers | RoundTimerPanel, LiveShareView, SharePanel, ActionsSheet, InstallPanel, DownloadMyData |
| `TILE_ROW` | same file | class string `flex gap-3` | 6 | the same panels |
| `TILE_ALONE` | same file | `mx-auto flex w-full max-w-[11rem]` | 1 | LiveShareView |
| `Toggle` | [Toggle.tsx](src/components/Toggle.tsx) | `checked`, `onChange`, `label`. Two states only | 5 | SessionConfig, RoundTimerPanel, LiveShareView, RoundTypePlanner, SchedulePage |
| `RatingStepper` | [RatingStepper.tsx](src/components/RatingStepper.tsx) | `value`, `onChange`. No size prop | 1 | PlayerForm |
| `Keypad` | [Keypad.tsx](src/components/schedule/Keypad.tsx) | `label`, `onDigit`, `onBackspace`, `extraKey?` | 2 | ScoreDialog, CourtNumberDialog |
| `ActionsButton` | [ActionsButton.tsx](src/components/schedule/ActionsButton.tsx) | none — one fixed 125×72 orange FAB | 1 | SchedulePage |
| `LivePill` | [LivePill.tsx](src/components/LivePill.tsx) | `onClick?`, `label?`, `className?`. With `onClick` it is a button; without, a span | 4 importers | App (the tab row), GroupPicker, ManageRostersModal, LiveShareView, LiveSessionPage |

**Everything else is a hand-written `<button>`.** 166 of them. They fall into
five recurring shapes, each written out afresh at every site:

| Shape | Canonical string | Sites | Files |
|---|---|---|---|
| **Grey / cancel** | `px-4 py-2.5 border border-[#999] bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors font-bold` | **22** | 18 |
| **Teal / confirm** | `px-4 py-2.5 bg-brand-teal text-white rounded-md hover:bg-brand-teal-dark transition-colors font-bold` | **19** | 15 |
| **Orange / lead** | `px-4 py-1.5 bg-brand-orange text-white rounded-md hover:bg-brand-orange-dark transition-colors text-sm font-bold` | **8** | 6 |
| **Red / destructive** | `px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-bold` | 4 | 3 |
| **Icon-only ✕** | `shrink-0 rounded p-1 text-<tone>-500 transition-colors hover:bg-<tone>-100` | 6 | 6 |

Three of those shapes have a *second*, competing definition:

| Competing definition | File | Differs how |
|---|---|---|
| `accountStyles.primary` | [accountStyles.ts](src/components/layout/accountStyles.ts#L91) | `w-full rounded-lg … px-4 py-3.5 text-lg`, disabled `bg-[#9DC3C7]` — a different radius, size and disabled treatment from the 19 teal buttons |
| `accountStyles.secondary` | same, `#L96` | `bg-[#F7F7F8]` + `border-panel-edge` rather than `bg-gray-100` + `border-[#999]` |
| `accountStyles.danger` | same, `#L143` | `bg-[#B42318] hover:bg-[#96170F]` — a different red from `bg-red-600` |
| `ManageRostersModal.PRIMARY / GREY / DANGER` | [ManageRostersModal.tsx](src/components/roster/ManageRostersModal.tsx#L25) | Private copies of the three shapes, `py-2.5`, with disabled states the inline ones lack |

**Padding variants of "the teal primary button" in the wild**: `py-2` (PlayerForm,
LiveSessionPage), `py-2.5` (13 sites), `py-3` (SharePanel), `py-3.5`
(accountStyles), `px-6 py-2.5` (RosterPage, SetupPage). Five sizes, no names.

**Class order is inconsistent.** Roughly half the strings are in Tailwind's
sorted order (`rounded-md bg-brand-teal px-4 py-2.5 font-bold …`) and half in an
older hand order (`px-4 py-2.5 bg-brand-teal text-white rounded-md hover:…`).
Grep for one and you miss the other.

### 2.2 Modals, dialogs and sheets

| Name | File | Shape | Uses `panelCard` |
|---|---|---|---|
| `panelCard` | [panelStyles.ts](src/components/panelStyles.ts) | `rounded-2xl border-2 border-[#7FBEC4] shadow-xl` — chrome only | **21 importers** |
| `PanelHeading` | [PanelGlyph.tsx](src/components/PanelGlyph.tsx#L38) | teal glyph + centred `text-[1.35rem] font-extrabold text-[#222]` title | 12 importers |
| `PanelGlyph` | same file | `h-14 w-14 text-brand-teal`, centred | 4 direct |
| `AccountShell` | [AccountShell.tsx](src/components/layout/AccountShell.tsx) | backdrop + card + hero image + heading + status | 4 (AccountPanel, SignInPanel, DeleteAccountPanel, MergeChoicePanel) |
| `accountStyles.backdrop` | [accountStyles.ts](src/components/layout/accountStyles.ts#L47) | `no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40` | 1 importer (AccountShell) |
| `accountStyles.card` | same `#L43` | `mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain ${panelCard} bg-[#FEFEFE] px-6 py-6` | 1 |

**Dialogs, all hand-rolling their own backdrop** (25 files carry
`fixed inset-0`): `EditPlayerDialog`, `TimerBlockedDialog`, `ScoreDialog`,
`RemovePlayerDialog`, `CourtNumberDialog`, `DiscardScheduleDialog`,
`PlayerMenu`, `ManageRostersModal`, `AddToGroupDialog`, `GroupPicker`,
`RosterPage`(×2), `SharePanel`, `ImportExportPanel`, `InstructionsPanel`,
`FeedbackPanel`, `PreferencesPanel`, `DonatePanel`, `InstallPanel`,
`CodePrompt`, `RoundTypePicker`, `RoundTypesInfoPanel`, `TourSheet`,
`TutorialOverlay`.

**Bottom sheets**: `ActionsSheet` and `TimerSheet` share the pattern
(`absolute inset-0 bg-black/40` + a `.sheet-panel` that transitions, honoured by
`prefers-reduced-motion` in CSS) but share no code. `TimerSheet` additionally
uses the `.timer-sheet` class (`94vh` then `94dvh`).

`useScrollLock` ([hooks/useScrollLock.ts](src/hooks/useScrollLock.ts)) is the
one thing they all do share — 10 importers.

### 2.3 Form inputs, labels and validation

| Name | File | Definition | Usages |
|---|---|---|---|
| `FIELD_LABEL` | [formLook.ts](src/components/formLook.ts) | `block text-sm font-bold text-gray-700` | 2 importers (PlayerForm ×3, FeedbackPanel ×3) |
| `accountStyles.label` | [accountStyles.ts](src/components/layout/accountStyles.ts#L86) | `mb-1.5 block text-sm font-bold text-[#1F293D]` | 3 importers, 4 sites |
| `accountStyles.field` | same `#L88` | `w-full rounded-lg border border-panel-edge bg-white px-3.5 py-3 text-lg text-[#1F293D] placeholder:text-[#7F8497] focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30` | 3 importers, 4 sites |
| `ManageRostersModal.FIELD` | [ManageRostersModal.tsx](src/components/roster/ManageRostersModal.tsx) | `w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent` | 4 sites. One of them adds `bg-white`: the edit block is tinted, and Tailwind's reset makes a field transparent |
| `CodeEntry` | [CodeEntry.tsx](src/components/CodeEntry.tsx) | 4-box code field, `BOX` = `h-16 w-14 rounded-lg border-2 …` | 2 importers |
| `RatingStepper` | [RatingStepper.tsx](src/components/RatingStepper.tsx) | −/value/+ | 1 |
| `Toggle` | [Toggle.tsx](src/components/Toggle.tsx) | on/off switch | 5 |

**Inline field definitions** (not using any of the above): `FeedbackPanel` (×3),
`AddToGroupDialog`, `ImportExportPanel` (`<select>`), `PlayerForm`.

**Validation states**: exactly one pattern, written out twice, never named —
`border-red-500 bg-red-50 ring-2 ring-red-300 focus:ring-red-500`
([FeedbackPanel.tsx:130](src/components/layout/FeedbackPanel.tsx#L130),
[PlayerForm.tsx:215](src/components/roster/PlayerForm.tsx#L215)).

**Focus rings**: `focus:ring-green-500` — 8 sites in 6 files. Green is not a
brand colour. `focus:ring-brand-teal/30` — 2 sites. `focus-visible:ring-2` — 3
sites. **The great majority of the 166 buttons have no focus style at all.**

**Checkbox / radio**: `accent-brand-teal` at 5 sites, sized `w-4 h-4` in four of
them and unsized in `PlayerSelector`.

### 2.4 Cards and panels

| Pattern | Definition | Sites | Files |
|---|---|---|---|
| **Page card** (unnamed) | `bg-white rounded-lg shadow border border-panel-edge px-3 pt-[1.125rem] pb-6` | **9** | RosterPage (×3), SetupPage (×3), StandingsPanel, PartnerSummary, RosterPage empty variant |
| `panelCard` | `rounded-2xl border-2 border-[#7FBEC4] shadow-xl` | 21 importers | see 2.2 |
| `accountStyles.note` | `mt-4 rounded-xl border px-3.5 py-3` (colour set by caller) | 4 importers | AccountPanel, SignInPanel, DeleteAccountPanel, MergeChoicePanel |
| Round card | `ROUND_FILL #7CAED0` / `ROUND_EDGE #2B76A9`, 2px | [RoundCard.tsx](src/components/schedule/RoundCard.tsx) | 1, with `CourtMatchup` drawing the white courts on it |
| `SessionConfig` cards | `rounded-xl border bg-[#FAFCFC] px-3 py-3 hover:bg-[#F1F8F9]` | 2 | SessionConfig only |

### 2.5 Alerts, banners and notices

**Five dismissible banners, five hand-built copies of one shape** —
`no-print flex items-center gap-3 rounded-lg border border-<c>-200 bg-<c>-50 px-4 py-3`:

| Component | File | Colour | Icon | Has action button |
|---|---|---|---|---|
| `InstallBanner` | [InstallBanner.tsx](src/components/layout/InstallBanner.tsx#L41) | green-200/green-50 | app logo | yes (teal) |
| `SignInBanner` | [SignInBanner.tsx](src/components/layout/SignInBanner.tsx#L28) | brand-teal / brand-teal-light | `ShieldCheckIcon` | yes (teal) |
| `UpdateBanner` | [UpdateBanner.tsx](src/components/layout/UpdateBanner.tsx#L29) | orange-200/orange-50 | `NewVersionIcon` | yes (`#FA5D02`, a *third* orange) |
| `PrintNotice` | [PrintNotice.tsx](src/components/layout/PrintNotice.tsx#L34) | amber-200/amber-50 | none | no |
| `SwapHint` | [SwapHint.tsx](src/components/schedule/SwapHint.tsx#L24) | green-200/green-50 | `TipIcon` | no |

**Notice boxes** (non-dismissible, inline):

| Pattern | Sites | Where |
|---|---|---|
| Orange warning: `flex items-start gap-3 rounded-lg border-2 border-brand-orange bg-brand-orange-light p-4` + `WarningIcon` | 3 | ActionsSheet ×2, App.tsx |
| Yellow info: same shape, `bg-notice-yellow` + `InfoIcon` | 1 | ActionsSheet:748 |
| Amber note: `rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900` | **8** | RemovePlayerDialog, ActionsSheet, FeedbackPanel, SignInPanel, PartnerPlayNotice, GroupPicker, AccountPanel ×2, MergeChoicePanel |
| `Problem` (red) | 4 importers | [AccountShell.tsx:48](src/components/layout/AccountShell.tsx#L48) — `mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[#7F1D1D]` |
| `accountStyles.good` (teal) | 3 importers | `border-[#A6D1D5] bg-brand-teal-light text-[#04565D]` |
| `CourtMissNote` | 1 | on-card note, white on the round fill |
| `PartnerPlayNotice`, `SpotsFilled` | 1 each | Setup page notices |

The amber-note shape has **four different radii and paddings** across its eight
sites: `rounded-md px-3 py-2` (×5), `rounded-xl px-3.5 py-3` (×2), `mt-4
rounded-md px-3 py-2` (×1), and `border-amber-300` instead of `-200` in two.

### 2.6 Badges, pills and chips

| Name | File | Variants | Usages |
|---|---|---|---|
| `ROUND_TYPE_META` / `pillMeta` | [lib/roundTypes.ts](src/lib/roundTypes.ts#L25) | 4 tones: `gendered` purple-100/700/400, `mixed` teal-100/700/400, `skill` amber-100/800/400, and `NORMAL_ROUND_META` gray-100/700/400 | 5 importers |
| `RoundTypeBadge` | [RoundTypeBadge.tsx](src/components/schedule/RoundTypeBadge.tsx) | wraps the above | 2 |
| `TypeGlyphs` | [typeGlyphs.tsx](src/components/setup/typeGlyphs.tsx) | `size: 'panel' \| 'picker' \| 'badge'` | 5 |
| `GenderMark` | [GenderMark.tsx](src/components/schedule/GenderMark.tsx) | M / F | 1 |
| Rating badge | [PlayerList.tsx:109](src/components/roster/PlayerList.tsx#L109) | inline: `rating-badge inline-block bg-brand-teal-light text-black border border-brand-teal px-2 py-0.5 rounded text-sm font-medium` | 1, but has CSS hooks in `index.css` for large-text mode |
| Round-type pill (picker) | [RoundTypePicker.tsx:49](src/components/setup/RoundTypePicker.tsx#L49) | `rounded-full border-2 px-4 py-3 text-base` | 1 |
| Round-type pill (sheet) | [ActionsSheet.tsx:1095](src/components/schedule/ActionsSheet.tsx#L1095) | `min-h-14 rounded-full border-2 px-2 text-sm` | 1 |
| Sit-out chip | [SitOutList.tsx:60](src/components/schedule/SitOutList.tsx#L60) | selected / swapped / resting | 1 |
| Score panel | [Scoreboard.tsx](src/components/schedule/Scoreboard.tsx) | `size: 'sm' \| 'lg'` × `PANEL_TONE` 4 tones (`blank`/`win`/`loss`/`draw`) | `ScorePanel` 3, `ScoreColon` 2 |

### 2.7 Tabs and navigation

| Name | File | Variants | Usages |
|---|---|---|---|
| `StepIndicator` | [StepIndicator.tsx](src/components/layout/StepIndicator.tsx) | Per step: `active` (orange border + white card + bar), `ready` (`#d3d7de` border, `#fbfbfc` bg), `idle` (flat, disabled), `answering` (flat, pressable). Props: `current`, `available`, `answering?`, `onNavigate` | 1 (App.tsx) |
| `Header` | [Header.tsx](src/components/layout/Header.tsx) | banner + two chrome buttons (`bg-white/95 ring-1 ring-black/10`), settings toggled state. `wordmark` draws the app's own mark instead of plain type; `badge` picks the robin or the groups mark; `eyebrow`, `corner`, `titleHref` and `onTitleClick` are each used by one caller | 2 |
| `AppWordmark` | [AppWordmark.tsx](src/components/layout/AppWordmark.tsx) | `size`, `subtitleColor?`. The app's name in `brand-orange` over what it is in `#051829`, the second line always 20/26 of the first | 2 (Header, SettingsPanel) |
| `SettingsPanel` | [SettingsPanel.tsx](src/components/layout/SettingsPanel.tsx) | drawer rows: `flex w-full items-center gap-3 rounded-md px-3 py-3 text-left font-bold hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60` | 1 |
| `ActionsButton` + `ActionsSheet` | [schedule/](src/components/schedule/) | The FAB and its 9-tile sheet | 1 each |

`Header` is the one component in the app that sizes itself off the **window**
rather than off its own box: its height, both pieces of artwork and the wordmark
inside it are all `vw`. That is why `/style-guide` draws it at `100vw` in a box
that scrolls sideways, and why the frame buttons on that page do nothing to it.
`index.html` holds a copy of the same geometry for `#top-pin`, the strip that
keeps iOS 26 from blurring the banner's top edge, and `topPin.test.ts` fails if
the two ever drift apart.

`StepIndicator` carries **six colour constants of its own** (`TRACK #f4f5f7`,
`IDLE_TEXT #61697c`, `IDLE_ICON #6f768d`, `DIVIDER #dee1e7`,
`READY_BORDER #d3d7de`, `READY_BG #fbfbfc`), none shared with anything else.

### 2.8 Tables and lists

| Name | File | Shape |
|---|---|---|
| `PlayerList` | [PlayerList.tsx](src/components/roster/PlayerList.tsx) | `<table class="roster-table w-full">`. Has dedicated `.text-large .roster-table` rules in [index.css](src/index.css#L241) |
| `StandingsPanel` | [StandingsPanel.tsx](src/components/schedule/StandingsPanel.tsx#L139) | `<table class="w-full text-sm border-collapse">` |
| `PartnerSummary` | [PartnerSummary.tsx](src/components/schedule/PartnerSummary.tsx#L73) | `<table class="text-xs border-collapse">` |
| `PrintSchedule` | [PrintSchedule.tsx](src/components/print/PrintSchedule.tsx) | `.print-sheet` table with empty thead/tfoot reserving page bands. 14 inline `style` objects |

**Row patterns** — two definitions of the same row, in two files:

| Name | Definition | Sites |
|---|---|---|
| `accountStyles.row` | `flex w-full items-center gap-3 rounded-lg border border-panel-edge bg-white px-4 py-3 text-left transition-colors hover:bg-[#F1F3F6] disabled:cursor-not-allowed disabled:opacity-60` | 2 importers, 3 sites |
| `ActionsSheet.ROW` | `flex w-full items-center gap-3 rounded-lg border border-panel-edge bg-white px-4 py-3 text-left transition-colors hover:bg-[#F1F3F6]` | 6 sites |
| `ActionsSheet.NEW_ROW` | as `ROW`, tinted teal | 2 sites |
| `accountStyles.rowDanger` | as `row`, `border-[#E7C3C0]`, `hover:bg-[#FDF3F2]` | 1 |
| `InstructionsPanel` rows | `flex w-full items-center … rounded-lg border border-gray-200 px-4 py-3 … hover:bg-gray-50` | 3 |

`accountStyles.row` and `ActionsSheet.ROW` are **byte-identical apart from the
two `disabled:` classes**.

Also: `useListReorder` ([hooks/](src/hooks/useListReorder.ts)) and
`DragHandleIcon` back the drag-to-reorder list in `RoundPlanRow`.

### 2.9 Loading and empty states

There is **no shared spinner, skeleton or empty-state component**. Everything is
a one-off:

| Kind | Where | What it is |
|---|---|---|
| Loading | [LiveSessionPage.tsx:352](src/components/live/LiveSessionPage.tsx#L352) | `<Notice title="Loading this session…" />` — a local component in that file |
| Loading | Buttons throughout | `disabled` + swapped label text. No spinner anywhere |
| Empty | [RosterPage.tsx:441](src/components/roster/RosterPage.tsx#L441) | page card, `py-12 text-center`, `text-xl font-medium text-gray-400` + `text-sm text-gray-400` |
| Empty | [Scoreboard.tsx:86](src/components/schedule/Scoreboard.tsx#L86) | `<span class="text-gray-300">–</span>` |
| Error | [ErrorBoundary.tsx](src/components/layout/ErrorBoundary.tsx) | full-screen card with teal + orange buttons |
| Error | `Problem` (AccountShell) | red note, 4 importers |

**Disabled treatment** is not consistent either: `disabled:opacity-40` (6 sites),
`disabled:opacity-50` (14), `disabled:opacity-60` (3),
`disabled:bg-[#9DC3C7]`/`disabled:bg-[#DDB3AF]` (accountStyles),
`disabled:cursor-not-allowed` (18, but not on every dimmed button).

### 2.10 Icons

Four icon modules, 66 exported glyphs.

| Module | Exports | Notes |
|---|---|---|
| [icons.tsx](src/components/icons.tsx) | 54 | The main set. Two internal wrappers, `Solid` and `Stroked`, set `aria-hidden` |
| [schedule/timerIcons.tsx](src/components/schedule/timerIcons.tsx) | 9 | Timer-specific; 6 importers |
| [schedule/actionIcons.tsx](src/components/schedule/actionIcons.tsx) | 3 | Badged glyphs; ring their corner disc in `--chip-tint` set by `TileButton` |
| [schedule/icons.tsx](src/components/schedule/icons.tsx) | 1 (`TrashIcon`) | **Imported by nothing** |
| [setup/typeGlyphs.tsx](src/components/setup/typeGlyphs.tsx) | `TypeGlyphs` | Composed glyph, 3 sizes |

Sizing is per-call, not per-component: `h-8 w-8` (TileButton), `h-14 w-14`
(PanelGlyph), `h-6 w-6`, `w-5 h-5`, `h-7 w-7` (`InstructionsPanel.ICON`),
`w-[42px] h-[42px]`, `h-9 w-9`, `w-[30px] h-[30px]`, `h-[25px] w-[25px]`,
`w-4 h-4` (the timerIcons/schedule-icons default).

---

## 3. Findings

Recommendations only. Nothing below has been changed.

### F1 — One grey button, twenty-two times · **high**

`px-4 py-2.5 border border-[#999] bg-gray-100 text-gray-700 rounded-md
hover:bg-gray-200 transition-colors font-bold` is written out 22 times across 18
files, in two different class orders, sometimes with `disabled:` classes and
sometimes without, sometimes `w-full` and sometimes `flex-1`. `#999` exists in
this codebase for no other reason.

**Recommend** a `Button` component with `variant="secondary"` and
`size="sm|md|lg"`, absorbing all 22. Keep the class strings in one module the
way `panelCard` already is, so the migration can be done a file at a time.

### F2 — Three button systems, none of them the default · **high**

The same three semantic buttons exist three times over:

| | inline (the 45 sites) | `accountStyles` | `ManageRostersModal` |
|---|---|---|---|
| primary | `rounded-md bg-brand-teal px-4 py-2.5` | `rounded-lg bg-brand-teal px-4 py-3.5 text-lg w-full` | `rounded-md … px-4 py-2.5` + disabled |
| secondary | `bg-gray-100 border-[#999]` | `bg-[#F7F7F8] border-panel-edge` | `bg-gray-100 border-[#999]` + disabled |
| danger | `bg-red-600 hover:bg-red-700` | `bg-[#B42318] hover:bg-[#96170F]` | `bg-red-600` + disabled |

`ManageRostersModal`'s own comment says it exists so that "a red Delete that is a
different red from the last red Delete" cannot happen — and there is one, in
`accountStyles`.

**Recommend** merging onto one set. `accountStyles`' sizes are the accessible
ones (44px+ targets, `text-lg`); the inline `py-2.5` set is 40px. Pick
`accountStyles`' proportions, name the sizes, and let panels opt into `w-full`.

**Partly started, 2026-08-21.** `TileButton` — the one real component, and not
one of the three sets above — now takes `size: 'md' | 'lg'`, the first named
size anywhere in the app. It is one pair, not a scale, and only the round timer
asks for `lg`. It does not touch the three class-string sets, which is still the
whole of this finding.

### F3 — Five banners, one shape · **high**

`InstallBanner`, `SignInBanner`, `UpdateBanner`, `PrintNotice` and `SwapHint` are
the same box — flex row, `gap-3`, `rounded-lg`, `border-<c>-200 bg-<c>-50`,
`px-4 py-3`, optional icon, optional action, optional dismiss ✕ — in five
colours, in five files, with the ✕ redefined five times.

**Recommend** one `Banner` with `tone: 'info' | 'success' | 'warning' |
'update'`, `icon?`, `action?`, `onDismiss?`. `UpdateBanner` also introduces
`#FA5D02`/`#DE5202`, a **third orange** two shades off `--color-brand-orange`;
fold it into the token.

### F4 — Eight amber notes, four sets of measurements · **medium**

The `border-amber-200 bg-amber-50 text-amber-900` note appears at eight sites
with `rounded-md px-3 py-2`, `rounded-xl px-3.5 py-3`, and `border-amber-300`
variants. Two of them (`accountStyles.note` callers) are already half-named —
`note` supplies the box and the caller supplies the colour every time.

**Recommend** finishing that job: `note` takes a `tone`, and the six inline ones
adopt it. That also collects `Problem` (red) and `good` (teal), which are the
same box.

### F5 — The page card is a copy-paste · **medium**

`bg-white rounded-lg shadow border border-panel-edge px-3 pt-[1.125rem] pb-6`
appears 9 times across RosterPage, SetupPage, StandingsPanel and PartnerSummary,
including that unexplained `pt-[1.125rem]`. `.roster-panel` is applied to two of
them because `index.css` needs a hook for large-text mode; the other seven do not
get that adjustment.

**Recommend** a `PagePanel` component carrying the class **and** the
`roster-panel` hook, so large-text mode applies uniformly.

### F6 — Two rows that are the same row · **medium**

`accountStyles.row` and `ActionsSheet.ROW` differ only by
`disabled:cursor-not-allowed disabled:opacity-60`. `InstructionsPanel` has a
third near-copy on `border-gray-200`/`hover:bg-gray-50`.

**Recommend** one `Row` (or one exported string) with the disabled classes
always on — a disabled `<button>` ignores hover anyway, so nothing regresses.

### F7 — Focus rings are green, and mostly absent · **high (accessibility)**

`focus:ring-green-500` sits on 8 form controls across 6 files. Green is not in
the palette; it is a survivor of the pre-brand scheme, the same one
`accountStyles`' comment describes purging from the account panels. Meanwhile
only 3 of 166 buttons carry any `focus-visible:` style, and the app is used
one-handed on a phone but also on a laptop from the printout flow.

**Recommend** one `focus-visible:ring-2 focus-visible:ring-brand-teal
focus-visible:ring-offset-2` applied by the shared `Button`/`Field`, and delete
`focus:ring-green-500`. This is the highest-value single change in the list.

**Not affected by `--color-start-green`.** A green was named in `@theme static`
on 2026-08-21 for the round timer's Start key, where go/stop is read before any
label is. That is a fill on two tiles, decided and written down; the eight
`focus:ring-green-500`s are still an unnamed leftover on the wrong control, and
still the thing to delete.

### F8 — Three greys doing the panel-edge job, again · **medium**

`--color-panel-edge` was created to end exactly this, and it worked for panels.
But `#999` (26 uses, buttons), `border-gray-300` (14, form fields) and
`border-gray-200` (21, instruction rows) now draw three different 1px lines on
adjacent surfaces. `#999` is `#999999`, `gray-300` is `#d1d5dc`, `gray-200` is
`#e5e7eb`, and `panel-edge` is `#a2a7ab` — so `#999` and `panel-edge` are within
a hair of one another and are two different names.

**Recommend** `#999` → `border-panel-edge` (they are 4% apart in luminance);
decide whether form fields want the panel edge or a deliberately lighter one, and
name whichever survives.

### F9 — Two `TrashIcon`s and two `ReplayIcon`s, with different artwork · **medium**

[schedule/icons.tsx](src/components/schedule/icons.tsx) exports a `TrashIcon`
with a completely different path from [icons.tsx](src/components/icons.tsx#L818)'s,
and **nothing imports it** — the whole module is dead. `ReplayIcon` exists in
both `icons.tsx` and `timerIcons.tsx`, both live: `RoundTimerPanel` draws the
timer one and `LiveShareView` draws the other, in the same app.

**Recommend** delete `src/components/schedule/icons.tsx`; pick one `ReplayIcon`.

### F10 — Orphans · **low**

| Export | File | Status |
|---|---|---|
| `STEPPER_EDGE` | [stepperLook.ts:16](src/components/stepperLook.ts#L16) | Exported, imported by nobody — and its value `#CCCFD9` is then written as a literal three more times *in the same file* |
| `TEAL` | [accountStyles.ts:23](src/components/layout/accountStyles.ts#L23) | Exported, unused inside and outside the file. `ActionsSheet` and `SessionConfig` each declare their own private `TEAL` with the identical value |
| `TEAL_FILL` | same, `#L33` | Used once inside the file, exported and never imported |
| ~~`StopSquareIcon`~~ | [timerIcons.tsx](src/components/schedule/timerIcons.tsx) | **Fixed 2026-08-21** — the glyph on both Stop keys, the watcher's and the host's |
| `src/components/schedule/icons.tsx` | whole module | Never imported (see F9) |
| `CrashTest` | [ErrorBoundary.tsx](src/components/layout/ErrorBoundary.tsx) | Deliberate — a crash-reporting test hook, not dead code |

### F11 — 102 hex literals, 16 one-off type sizes · **medium**

Beyond the ones already named: `#222` (20 sites, 17 files) is the panel-title
ink and is a token waiting to be declared. `#051829` (6 files) is the navy the
header, tour, actions sheet and setup page all share. `#636A77` is declared three
times, privately, in three files as `QUIET_TEXT`. `#FBFAF6` (cream) is declared
in `index.html`, `index.css`, `Header.tsx`, `TourSheet.tsx` and `MakeYourOwn.tsx`.

The type scale has 9 named steps and 20 arbitrary ones. Four of the arbitrary
ones are named constants with good reasons (they must not scale in large-text
mode). The other 16 are not, and two of those restate a scale step exactly.

**Recommend** adding `--color-ink` (`#222`), `--color-ink-navy` (`#051829`),
`--color-ink-quiet` (`#636A77`), `--color-cream` (`#FBFAF6`) to the `@theme
static` block, which will also make them visible as `var()` for inline styles —
the pattern the palette comment already sets out. Then take one pass at the 16
unnamed sizes: most are within 1px of a scale step.

### F12 — Class order is unsorted, so grep lies · **low but pervasive**

Roughly half the class strings are in Tailwind's canonical order and half are
not. This is why the grey button reads as 22 sites and not one search result.
Note that Prettier must not be run here — it has no config in this repo and
would rewrite every file to double quotes and trailing commas. A
Tailwind-only class sorter, or simply sorting as files are touched, would fix the
searchability without that.

### F13 — Disabled and loading have no shared answer · **medium**

Four different opacities (40/50/60 and two custom background colours), and
`disabled:cursor-not-allowed` on some but not all of them. There is no spinner
in the app at all; slow actions swap their label. That is a defensible choice
for a phone-side-of-court app, but it should be a stated one rather than an
accident.

**Recommend** one `disabled:` treatment on the shared `Button`, and decide
explicitly whether a `loading` prop swaps the label or shows a spinner.

---

## 4. What is already right

Worth saying, because a findings list reads as a demolition otherwise:

- **`panelCard`** — 21 importers, one string, one comment explaining the
  reasoning. This is the model the rest should follow.
- **`--color-panel-edge`** — a token created specifically to kill three drifting
  greys, and it held.
- **`roundLook.ts` and `scoreTone.ts`** — colour and size shared across files
  that draw the same thing from different data sources, with the reason written
  down.
- **`TileButton`** — a real component with real variants and a documented
  rationale for pale-not-solid.
- **The absolute type constants** (`ROUND_HEADING_TEXT`, `PLAYER_NAME_TEXT`) —
  arbitrary values with a stated reason to be outside the scale.
- **`index.css`** — the iOS 26 blur defence, the scroll architecture and the
  print rules are documented to a standard most codebases never reach.

The pattern in the failures is consistent: **where a thing was extracted, it
stayed extracted and stayed correct.** What is missing is extraction of the
ordinary button, the ordinary banner, the ordinary note and the ordinary page
card — the four things used most often and named least.
