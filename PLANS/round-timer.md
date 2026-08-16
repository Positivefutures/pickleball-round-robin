# Round Timer

## Context

Rounds in this app don't currently carry any notion of duration — the host has to eyeball the clock and shout when a round should end. Jeff supplied a mockup (`INBOX/TIMER.png`) and six SVG icons (`timer.svg`, `flash.svg`, `iphone.svg`, `silence.svg`, `volume-up.svg`, plus `replay.svg` reused from the icon bank already in `INBOX/`) for a per-round countdown timer: tap a clock icon on a round's header, set a number of minutes, start it, and get alerted (sound and/or a flashing screen) when time's up. The phone is meant to be left face-up at the net so players can read a huge countdown from the baseline — that framing drives most of the harder decisions below (screen must stay on, digits must be enormous, the alert must find the host even if they wandered off to another tab).

Four decisions were confirmed with Jeff before this plan was written (all recommended options, see below): synthesize the 5 alarm tones with Web Audio instead of sourcing audio files; persist timer state through a reload, not just an in-app tab switch; auto-stop a round's timer if its DONE box gets checked while it's running; and hold a Wake Lock while the panel is open so the screen doesn't dim mid-round.

The codebase was read in depth before writing this (`RoundCard.tsx`, `SchedulePage.tsx`, `App.tsx`, `lib/store.ts`/`stores.ts`, `lib/groupSessions.ts`, `lib/liveSession.ts`, `lib/appUpdate.ts`, `ActionsSheet.tsx`, `TourSheet.tsx`, `Toggle.tsx`, `stepperLook.ts`, `SessionConfig.tsx`, `icons.tsx`, `schedule/icons.tsx`, `GroupPicker.tsx`, `RemovePlayerDialog.tsx`, `panelStyles.ts`, `PanelGlyph.tsx`, and the actual `INBOX/*.svg` contents), and every claim below — file names, line numbers, existing constants, existing icons — was verified against the real files, not assumed.

## Confirmed decisions

- **Alarms**: synthesize 5 short tones with the Web Audio API. No audio files, nothing added to `public/` or `src/lib/precache.ts`.
- **Persistence**: timer state (round, end time, phase, settings) survives a full page reload via `createStoredValue`, not just an in-app tab switch — store an absolute `endsAt` timestamp and recompute remaining time from `Date.now()`, the same pattern already used in `lib/appUpdate.ts` and `live/LiveSessionPage.tsx`.
- **DONE while running**: checking a round's DONE box while its timer is running auto-stops and resets that timer (silences any alarm) rather than blocking the checkbox.
- **Wake Lock**: hold `navigator.wakeLock` while the Round Timer panel is the visible view; release the instant it closes. New capability for this codebase — needs the re-acquire-on-`visibilitychange` handling the API itself requires (the browser silently drops the lock when the tab is hidden).

## Approach

### State: `src/lib/roundTimer.ts` (new)

```ts
export type TimerPhase = 'idle' | 'running' | 'paused' | 'alarming';
export type AlarmToneId = 'bell' | 'double-beep' | 'triple-chirp' | 'whistle' | 'buzzer';

export interface RoundTimerState {
  roundNumber: number | null;   // null = never opened
  phase: TimerPhase;
  minutes: number;              // 1–60, default 12
  endsAt: number | null;        // absolute ms deadline, set only while 'running'
  remainingMs: number;          // authoritative while idle/paused
  soundOn: boolean;
  flashOn: boolean;
  alarmTone: AlarmToneId;
}
```

Persisted via a new `stores.roundTimer = createStoredValue<RoundTimerState>('pb-round-timer', DEFAULT_ROUND_TIMER_STATE)` in `src/lib/stores.ts`, next to `completedRounds`. A second, **non-persisted** module-level flag (`timerPanelOpen`, same `{get, subscribe}` shape as `liveStatusStore` in `lib/liveSession.ts`) tracks whether the sheet is manually open — a reload should land the host on whatever tab they reloaded to, not inside the sheet.

Exported actions: `openRoundTimer(roundNumber)` (same-round → reopen; different round mid-phase → `{blocked, blockedByRound}`; idle/new → claim it), `closeRoundTimerPanel()`, `startTimer()`, `stopTimer()` (pause, freeze remaining, kill alarm), `resetTimer()` (snap to full duration, also stops), `stopAndResetIfRound(roundNumber)` (the DONE-checkbox hook), `clearRoundTimerForNewSchedule()`, `setMinutes/setSoundOn/setFlashOn/setAlarmTone` (only meaningful while idle), and `liveRemainingMs(state, now)` — a pure helper so both the panel's render and the watchdog agree on "how much time is left" without duplicating the math.

**Countdown mechanism — two tickers, different jobs:**
- A global watchdog (`startRoundTimerWatchdog()`, called once from `App.tsx` beside the existing `startSync()`/`startLive()` calls) runs every second, always, regardless of which tab is mounted. It never counts down a number — it compares `Date.now()` against the stored `endsAt` and flips `phase` to `'alarming'` the moment it's past due, exactly like `appUpdate.ts` checks for a waiting build. This is what makes the alarm fire even if the host left the Schedule tab, and what makes a reload land on the correct remaining time instead of a stale one.
- The panel's own on-screen tick is a local 250ms interval purely for smooth digits — it calls `liveRemainingMs()` fresh each render and is never the source of truth, so it doesn't matter that background tabs throttle it.

**Single-timer enforcement** lives entirely in `openRoundTimer()` — the one gate every `RoundCard` click goes through, so it can't be bypassed from a second round.

**Schedule regeneration**: hook `clearRoundTimerForNewSchedule()` into the two places a schedule is actually *replaced* (not just edited) — `handleGenerate` in `App.tsx` (~line 619-637, right beside the existing `setCompletedRounds([]); setRemovedIds([]); ...` reset block) and `clearSession()` in `src/lib/groupSessions.ts` (~line 98-112, beside `stores.scheduleBasis.set(null)`). As a defensive fallback (round renumbering from a removal/reshuffle could in principle orphan a `roundNumber`), the watchdog's per-tick recompute also checks that the stored `roundNumber` still exists in `stores.schedule.get()?.rounds` and clears it if not.

### Icons: `src/components/schedule/timerIcons.tsx` (new)

Following the existing convention (`className`-only prop, hand-pasted `currentColor` paths, no icon library) — `TimerIcon` (from `timer.svg`), `VolumeUpIcon` / `SilenceIcon` (Play Sound on/off), `FlashIcon` / `IphoneOutlineIcon` (Flash Screen on/off — `FlashIcon` needs its two `<g transform="translate(...)">` wrappers preserved, `IphoneOutlineIcon` keeps its non-zero-origin `viewBox="-106 0 469 469.33"` as-is), and `ReplayIcon` (from `replay.svg`, for RESET TIMER). Two new hand-drawn glyphs: `PlayTriangleIcon` (START TIMER) and `StopSquareIcon` (STOP TIMER, a plain square) — **do not** reuse the existing `StopIcon` in `components/icons.tsx` (that's `stop.svg`'s "raised palm in a broken ring," already used for "Stop Sharing" in `LiveShareView.tsx:260`; wrong shape for a media-stop button).

### Audio: `src/lib/alarmSounds.ts` (new)

A lazily-created singleton `AudioContext`. Each of the 5 tones is a small function that schedules its own oscillators/gains on the context's sample-accurate clock:

| Tone | Design |
|---|---|
| `bell` | 880 Hz sine + a quieter 2112 Hz overtone, fast attack, ~1.2s decay |
| `double-beep` | two 1000 Hz sine beeps, 120ms each |
| `triple-chirp` | three 90ms sweeps, 600→1200 Hz |
| `whistle` | one sine ramping 1800→2400→1800 Hz over 500ms |
| `buzzer` | two detuned sawtooths (220/225 Hz) for a harsh beat |

`startAlarmLoop(id)` fires a shot then reschedules itself via `setTimeout` keyed to that tone's own period, until `stopAlarmLoop()` — which ramps every tracked gain to 0 immediately rather than waiting out a decay tail. `previewTone(id)` (used by the alarm picker) calls the exact same shot function and auto-stops after 2s — no separate preview code path. `warmUpAudio()` is called from `startTimer()`'s click handler to unlock the context via that user gesture, since the watchdog's later alarm trigger has no gesture of its own.

### Wake Lock: `src/hooks/useWakeLock.ts` (new)

`useWakeLock(active: boolean)`. Acquires `navigator.wakeLock.request('screen')` when `active` becomes true; since the browser auto-releases the lock on tab-hide without notifying the holder in a way that's safe to assume, it listens for the lock's own `'release'` event to null out its ref, and re-acquires on `visibilitychange` back to `'visible'`. Releases on cleanup. Called as `useWakeLock(visible)` inside the panel, where `visible` is the same boolean gating the panel's render.

### The panel: `src/components/schedule/RoundTimerPanel.tsx` (new)

Mounted **unconditionally in `App.tsx`**, not owned by `SchedulePage` — this is the one deliberate deviation from how every other schedule dialog (`ScoreDialog`, `CourtNumberDialog`, etc.) is wired, and it's structural: `SchedulePage` only renders when `step === 'schedule'` (`App.tsx` ~line 1459) and fully unmounts on every tab switch, so nothing owned there could force itself back open from the Roster or Setup tab. Placed in `App.tsx` alongside `TourSheet`/`TutorialOverlay`, after `.app-panel` closes (same reason those two live there — a transformed ancestor would carry a `fixed` child off-screen with it) and last among the overlays, so it paints above `ActionsSheet`/`GroupPicker`/the settings drawer by DOM order alone.

```ts
const visible = manuallyOpen || state.phase === 'alarming';
useWakeLock(visible);
if (!visible || state.roundNumber === null) return null;
```

Because `visible` is that OR, closing the sheet mid-alarm (stray X-tap) snaps it right back open on the next render — only `STOP TIMER` actually leaving `'alarming'` phase dismisses it. This is also the mechanism that satisfies "you can leave this screen, the timer keeps running": the watchdog flips the phase regardless of mounted tab, and that flip alone is what brings the panel back to whatever screen the host is standing on.

Layout, mapped to the mockup with the two requested deviations (no "11/12/13 min" quick-picks; the "Court bell" row is a real picker):
- Slide-up mechanics copy `ActionsSheet.tsx`/`TourSheet.tsx` verbatim (`sheet-panel` class, already wired to `prefers-reduced-motion` in `index.css:189-190`; `translate-y-full → translate-y-0` flip).
- Countdown digits at `clamp(5rem, 26vw, 13rem)`, `tabular-nums` so the width doesn't jitter.
- Minutes stepper: large circular +/-. Reuses `STEPPER_VALUE` from `stepperLook.ts` verbatim (scaled up), but **not** `STEPPER_KEY` as-is — it already bakes in `rounded-lg`, and appending `rounded-full` on top is a real risk (same-specificity Tailwind utilities on the same property resolve by stylesheet order, not string order, and `rounded-lg` is used everywhere else in the app). Instead, a new `BIG_STEPPER_KEY` constant lifts just the color/weight/hover portion and adds its own `rounded-full`.
- "When time is up": two rows (Play Sound, Flash Screen), each swapping its leading icon by state and using `Toggle` from `components/Toggle.tsx` for the on/off control.
- Alarm tone picker (`AlarmTonePicker.tsx`, new): an inline expanding list styled like `GroupPicker.tsx`'s rows (`border-brand-teal bg-brand-teal-light` + `CheckIcon` selected, `border-gray-300 hover:bg-gray-100` otherwise) rather than a second centered modal stacked on an already-full-bleed sheet. Selecting a row sets `alarmTone` and calls `previewTone()` in the same click.
- The Minutes stepper, the two toggle rows, and the tone picker are all **hidden** (not just disabled) whenever `phase !== 'idle'` — none of them make sense mid-countdown, paused, or expired.
- At `phase === 'alarming'`, the big digits are replaced with "TIME'S UP" — always shown regardless of sound/flash settings, so there's always *some* visual signal even with both alerts off.
- Panel theme: light (matching the mockup, `#FFFFFF`/`#0D1F44` ink — reusing `STEPPER_INK`) whenever idle/paused/editing; dark (`#000000`/`#FFFFFF`) while running, for the stated battery reason. While alarming with Flash Screen on, alternate between those exact two theme pairs every 250ms (a full light↔dark cycle every 500ms = 2Hz) — **deliberately capped under 3 flashes/second**, called out explicitly since a full-screen high-contrast strobe is exactly what WCAG's flash-threshold guidance exists to bound. Flash Screen off just keeps it dark/static through the alarm.

### `RoundCard.tsx`

New props `onOpenTimer: () => void; hasActiveTimer?: boolean`. The header's right-hand `<label>` (currently the sole child after the left block, lines ~189-212) becomes one item in a small `flex items-center gap-3` group alongside a new timer button — keeping the outer `justify-between` row resolving to exactly two flex children, as it does today:

```tsx
<div className="flex items-center gap-3">
  {!isComplete && (
    <button type="button" onClick={onOpenTimer} aria-label="Round timer" className="text-white hover:text-white/75 transition-colors no-print">
      <TimerIcon className={`h-6 w-6 ${hasActiveTimer ? 'animate-pulse' : ''}`} />
    </button>
  )}
  <label className={/* unchanged */}>DONE<input /* unchanged */ /></label>
</div>
```

### `SchedulePage.tsx`

Subscribes to `stores.roundTimer` via `useSyncExternalStore` (read-only, for `hasActiveTimer`). `handleOpenTimer(roundNumber)` calls `openRoundTimer()`; if blocked, sets local state to show a new `TimerBlockedDialog` (owned locally here, like `RemovePlayerDialog` — it's a transient notice, not something that needs to survive a tab switch). The existing DONE-toggle handler gains one line: `stopAndResetIfRound(roundNumber)` before it flips `completedRounds`.

`TimerBlockedDialog.tsx` (new) follows the exact `RemovePlayerDialog.tsx` shape (`fixed inset-0 z-50 ... bg-black/40`, `panelCard`, `PanelHeading icon={WarningIcon}`) rather than `window.alert` — verified via grep that this app uses `window.alert`/`window.confirm` nowhere outside tests; every blocking message is one of these in-app dialogs. Message: `Stop Round {X}'s timer before starting this one.`

### Colors

| Element | Value | Source |
|---|---|---|
| START TIMER | `bg-[#018D31] hover:bg-[#017129]` | Reused verbatim from `LiveShareView.tsx`'s green primary — no new hex |
| STOP TIMER | `bg-red-600 hover:bg-red-700` | The app's existing destructive pattern (`DANGER` in `ManageRostersModal.tsx`, `RemovePlayerDialog.tsx`) |
| RESET TIMER | `bg-slate-600 hover:bg-slate-700` | New, neutral — clearly distinct from both Start's green and Stop's red |
| Panel light mode | `#FFFFFF` bg / `#0D1F44` ink | `STEPPER_INK`, ties back to the Minutes stepper's own palette |
| Panel dark mode | `#000000` bg / `#FFFFFF` ink | True black for max OLED savings |

## Critical files

- `src/lib/roundTimer.ts` — new, the controller (state shape, actions, watchdog)
- `src/lib/alarmSounds.ts` — new, Web Audio synthesis + loop + preview
- `src/hooks/useWakeLock.ts` — new
- `src/components/schedule/timerIcons.tsx` — new
- `src/components/schedule/RoundTimerPanel.tsx` — new, mounted from `App.tsx`
- `src/components/schedule/AlarmTonePicker.tsx` — new
- `src/components/schedule/TimerBlockedDialog.tsx` — new
- `src/components/schedule/RoundCard.tsx` — timer button next to DONE
- `src/components/schedule/SchedulePage.tsx` — wires the button, DONE-hook, blocked dialog
- `src/App.tsx` — starts the watchdog, mounts `<RoundTimerPanel />`, hooks `handleGenerate`
- `src/lib/stores.ts` — new `roundTimer` persisted store
- `src/lib/groupSessions.ts` — `clearSession()` clears the timer too

## Verification

Manual, via `npm run dev`:
1. Start a 1-minute timer on Round 1, confirm digits count down, panel goes dark, editing rows disappear.
2. STOP TIMER mid-count → freezes (not full duration) and reverts to a single START button; tapping it again resumes from the frozen value, not from the top.
3. RESET TIMER → snaps back to the full configured minutes and stops.
4. Start a timer, switch to Setup (unmounts `SchedulePage`), switch back to Schedule → countdown is correct, not stalled or reset.
5. With Sound + Flash both on, let a 1-minute timer expire while on the Roster tab → the panel forces itself open over Roster, sound loops, background strobes visibly slower than 3/sec; STOP TIMER silences both immediately.
6. Repeat with both toggles off → "TIME'S UP" still shows, nothing plays.
7. Start Round 1's timer, tap Round 2's timer icon → `TimerBlockedDialog` names Round 1, Round 2 doesn't start; tapping Round 1's icon again reopens its live countdown with no dialog.
8. Start Round 1's timer, check its DONE box → timer silently stops/resets, panel closes if open.
9. Start a 5-minute timer, hard-reload the page → countdown resumes at the correct remaining time.
10. Start a timer, regenerate the schedule from Setup → no round shows an active timer icon afterward.

Automated (matches this app's existing headless, fake-timer-based test convention — no RTL, components mounted via `react-dom`/`act()`, see `App.walkthrough.test.ts` / `App.tour.test.ts`):
- `src/lib/roundTimer.test.ts` — pure controller logic under `vi.useFakeTimers()` + `vi.setSystemTime()`: `openRoundTimer` same-round/different-round/blocked branches, stop→resume-from-frozen, reset-to-full-duration, `stopAndResetIfRound`, watchdog phase flip past deadline.
- `src/lib/alarmSounds.test.ts` — mock `AudioContext`, assert `startAlarmLoop`/`stopAlarmLoop` schedule and silence correctly.
- `src/App.roundTimer.test.ts` — mounts the real `App` (mirrors `App.tour.test.ts`), covers the cross-cutting behaviors that need the full tree: forced reopen after a tab switch, the blocked-dialog naming the right round, DONE-toggle auto-stop, and the Generate/New-Round-Robin clearing hooks.
