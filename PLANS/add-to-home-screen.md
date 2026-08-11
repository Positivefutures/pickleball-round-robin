# Add to Home Screen

## Context

The app runs in a browser tab. Nothing tells anyone they can keep it on their home screen,
and on iOS the steps are genuinely non-obvious — a Share button most people never tap, then
a menu row well down a scroll list.

The icon work is already done (`public/apple-touch-icon.png`, `site.webmanifest`,
`display: standalone`). What's missing is telling people. Decided with the user:

- **A settings item plus a nudge**, so it's discoverable without ambushing a new visitor.
- **The nudge appears once the group reaches 4 players** — real data entered, schedule about
  to be built, the moment the app is obviously worth keeping.
- **Dismiss means never again** on that device; the settings item remains as the way back.

## The platform constraint that shapes this

**iOS has no install API.** Apple exposes nothing programmatic — the only thing that works
is showing where the Share button is and which row to tap. It must be illustrated with the
actual glyphs, or people won't find it.

**Chrome fires `beforeinstallprompt`**, which lets us open the real native install dialog
from our own button. But Chrome's installability criteria have historically also required a
registered service worker, and whether that still holds varies by version.

So: **capture `beforeinstallprompt` and use it when it arrives, but never depend on it.**
If the event has fired, the panel shows a one-tap **Install** button. If it hasn't — iOS
always, Chrome sometimes — the panel shows written steps for that browser. This is correct
under either Chrome behaviour and needs no service worker. Adding a no-op service worker
purely to trigger the prompt is deliberately **not** in scope: it is a new moving part with
real staleness risks, for a button that already has a working fallback.

## Files

### NEW `src/lib/install.ts` — pure, injectable inputs

```ts
export type InstallRoute = 'ios' | 'native' | 'manual';

isStandalone(): boolean          // display-mode: standalone, or navigator.standalone (iOS)
isIos(ua, maxTouchPoints): boolean
installRoute(opts): InstallRoute // 'native' when a prompt is held, else 'ios' | 'manual'
```

`isIos` must handle iPadOS 13+, which reports a `Macintosh` user agent — the tell is
`maxTouchPoints > 1`. Take `ua` and `maxTouchPoints` as parameters defaulting to
`navigator.*`, the pattern `src/lib/feedback.ts` and `src/lib/share.ts` already use, so this
is unit-testable without a browser.

### NEW `src/lib/install.test.ts`

Real user-agent strings: iPhone Safari, iPad Safari (Macintosh UA + touch points), Mac
Safari (Macintosh UA, no touch — must be false), Android Chrome, desktop Chrome. Plus
`installRoute` returning `native` only when a prompt is held.

### NEW `src/hooks/useInstallPrompt.ts`

Captures the `beforeinstallprompt` event (calling `preventDefault()` so Chrome's own banner
doesn't compete), exposes `canPrompt` and an async `promptInstall()`, and clears itself on
`appinstalled`. `BeforeInstallPromptEvent` is not in `lib.dom`, so it needs a local
interface declaration.

### NEW `src/components/layout/InstallPanel.tsx`

Modal card matching `DonatePanel.tsx`. Content by route:

- **native** — a single **Install** button calling `promptInstall()`.
- **ios** — three numbered steps, each with the real glyph inline so it's recognisable:
  1. Tap the **Share** button (box with an up arrow) — bottom of the screen in Safari
  2. Scroll down, tap **Add to Home Screen** (plus in a square)
  3. Tap **Add**
- **manual** — "Open your browser menu and choose Install or Add to Home Screen", naming
  Safari and Chrome.

### NEW `src/components/layout/InstallBanner.tsx`

A dismissible card rendered in normal flow (not an overlay — no scroll-lock or z-index
complexity): a line of copy, an **Add to Home Screen** button opening the panel, and a
close button.

### `src/App.tsx`

- `const [installDismissed, setInstallDismissed] = useLocalStorage('pb-install-dismissed', false)`
- `const [showInstall, setShowInstall] = useState(false)`, added to the `useScrollLock(...)`
  condition with the other overlays.
- Banner shows only when **all** hold: not standalone, not dismissed, `rosterPlayers.length >= 4`,
  and the route is `ios` or `native`. That last clause matters — desktop Firefox has no
  install path at all, and offering one there is a dead end.
- Rendered inside `<main>` above `<StepIndicator>` so it appears wherever the user is.

### `src/components/layout/SettingsPanel.tsx`

New item **Add to Home Screen** with a phone-and-plus icon, placed after Share App, hidden
when `isStandalone()` — there is nothing to do once it's installed.

### `src/components/layout/InstructionsPanel.tsx`

One line in the Settings menu section, matching the others.

## Verification

1. `npx tsc -b --noEmit`, `npx eslint src`, `npm test` (76 tests plus the new detection
   ones). `pairing.test.ts > does not over-repeat partners after regeneration` is flaky on
   `main`, ~1 run in 6 — pre-existing.
2. **Banner timing:** with a private window, add three players — no banner. Add a fourth —
   banner appears. Dismiss it, reload, add more players: it must not return.
3. **Settings item** opens the same panel, and still works after the banner is dismissed.
4. **Route detection** in Chrome DevTools device emulation: an iPhone UA must show the
   illustrated iOS steps, desktop Chrome the native button *if* `beforeinstallprompt` fired,
   otherwise the manual text. Confirm no route ever shows a blank panel.
5. **Already-installed suppression:** open the deployed app from the home-screen shortcut and
   confirm both the banner and the settings item are gone.
6. **On a real iPhone**, follow the printed steps literally and check they match what iOS
   actually shows — this is the one thing emulation cannot confirm, and wrong instructions
   here are worse than none.
