# Make "Add to Home Screen" as easy as the platforms allow

## Context

The ask: is there an operating system feature, or a link, or a button that adds the app
to a phone's home screen?

**The short answer.** There is no OS feature and no link. No URL, protocol handler, or
markup can add a site to a home screen — Apple and Google both refuse it on purpose,
because a page that could install itself would be abused within a day. What exists is:

| Platform | One-tap button possible? |
|---|---|
| Android Chrome / Edge / Samsung | **Yes** — `beforeinstallprompt` opens the real system dialog |
| Desktop Chrome / Edge | **Yes** — same API |
| **iOS Safari** | **No API at all.** Share → Add to Home Screen is the only path |
| iOS Chrome / Firefox / Edge | No API. Each has its own menu item, not Safari's |
| Desktop Firefox | No install path at all |

So the button already exists everywhere a button is possible, and this app already
builds it (`useInstallPrompt` + `InstallPanel` + `InstallBanner` + a settings item).
The remaining work is not "add a button". It is three things:

1. **The Android button often never appears**, because of an event race (below). Those
   users fall through to generic "open your browser's menu" text when they could have
   had one tap. This is the single highest-impact fix.
2. **iOS Chrome, Firefox and Edge users are given Safari's instructions**, which are
   wrong for them, complete with a Safari screenshot.
3. **The manifest is thin**, so Android letterboxes the icon in a white circle and shows
   the plain install dialog instead of the rich app-store-style one.

Decisions taken: build the maskable icon and the screenshots; keep the existing
4-player gate on the banner (do not nag a stranger).

---

## 1. Stop losing the Android install prompt

**The bug.** `useInstallPrompt` attaches its `beforeinstallprompt` listener inside a
`useEffect`, so it is not live until React has mounted `App` from a deferred module
script. Chrome fires the event as soon as its install criteria are met, which needs an
active service worker with a fetch handler. On a **first** visit the worker registers
late, so the listener wins. On a **repeat** visit the worker is already active and Chrome
can fire before the module has even parsed. The event is single-shot and is then lost for
that page view: `canPrompt` stays `false`, `installRoute` returns `'manual'`,
`offerInstall` at [App.tsx:826](src/App.tsx#L826) goes false, the banner never renders,
and the settings panel offers useless generic text.

**Fix.** Capture the event in `<head>` before anything else runs, and have the hook adopt it.

- [index.html](index.html) — one small inline script in the head (verified: no CSP and no
  `vercel.json`, so inline is safe here). It stashes the event on `window`, calls
  `preventDefault()` to keep suppressing Chrome's own banner, dispatches a custom
  `installpromptready` event, and clears the stash on `appinstalled`. The head currently
  has no inline scripts, so it gets a comment explaining why this one has to be inline —
  matching the house style of the og:image comment above it.
- [src/hooks/useInstallPrompt.ts](src/hooks/useInstallPrompt.ts) — initialise state from
  the stashed global instead of `null`, and listen for `installpromptready` rather than
  `beforeinstallprompt`, so there is exactly one owner of the event. `promptInstall`
  reads and clears the global. Add a `declare global` augmentation for the window
  property next to the existing `BeforeInstallPromptEvent` interface (this file is
  typechecked, unlike the tests).

## 2. Give iOS non-Safari browsers the right instructions

`isIos()` at [src/lib/install.ts:21](src/lib/install.ts#L21) is true for Chrome (`CriOS`),
Firefox (`FxiOS`) and Edge (`EdgiOS`) on iPhone. Those users are told to tap Safari's
Share button and shown a Safari share-sheet screenshot. Their item lives in their own
browser's menu.

- [src/lib/install.ts](src/lib/install.ts) — add a fourth route, `'ios-other'`.
  New helper `isIosSafari(ua)` = iOS **and** not `CriOS|FxiOS|EdgiOS|OPiOS`.
  `installRoute` returns `native` → `ios` → `ios-other` → `manual`.
  (DuckDuckGo's iOS browser is indistinguishable from Safari by UA; it falls to `ios`,
  which is an acceptable near-miss rather than a wrong instruction.)
- [src/lib/install.test.ts](src/lib/install.test.ts) — add real UA strings for the three
  browsers; update the existing loop that asserts one of *three* routes is always
  returned to expect four.
- [src/App.tsx:826](src/App.tsx#L826) — the `!== 'manual'` gate is already correct;
  `ios-other` users do have a path, so the banner should reach them.

## 3. Manifest and icons

[public/site.webmanifest](public/site.webmanifest) — add `id: "/"` (identity insurance, so
a future `start_url` change does not create a second install), `scope: "/"`,
`description` (reuse the meta description verbatim), `purpose: "any"` on the two existing
icons, plus:

- **`public/icon-maskable-512.png`** — Android's mask needs the artwork inside the centre
  80% circle. Built from the existing `icon-512.png` robin, scaled into the safe zone on
  a full-bleed brand background. Declared `"purpose": "maskable"`, kept separate from the
  `any` icons so neither is compromised. Verified by sampling pixels, not by eyeballing.
- **`public/screenshot-*.png`** — 2 or 3 phone-viewport captures of the real app (roster,
  schedule), driven headlessly through the local chromium. Declared with
  `form_factor: "narrow"`; all narrow screenshots must share one aspect ratio. These are
  what turn Chrome's plain install dialog into the rich app-store-style one.

**Both must be registered in the precache lists or `precache.test.ts` fails.**
- Maskable icon → `RUNTIME_CACHED_PUBLIC`, beside `/icon-512.png` (fetched by the OS at
  install time, never rendered by the app).
- Screenshots → `NEVER_CACHED_PUBLIC`, on the `og-banner.png` precedent: they exist for
  the browser's dialog, not for people. This list is duplicated in
  [src/sw.ts](src/sw.ts) and `precache.test.ts` asserts the two agree, **so edit both**.

## 4. iOS head tags

[index.html](index.html) — add `apple-mobile-web-app-title` (pins the home screen label to
"Round Robin" rather than leaving it to a fallback chain), plus
`apple-mobile-web-app-capable` and `mobile-web-app-capable` as belt-and-braces for older
iOS that predates manifest `display` support. Confirm `apple-touch-icon.png` really is
180×180 before adding a `sizes` attribute to it.

**Deliberately not doing:** `status-bar-style: black-translucent` with
`viewport-fit=cover`. That paints the app under the notch and would need safe-area padding
threaded through the whole shell. Out of scope, and it would look broken without that work.

## 5. Rework InstallPanel

[src/components/layout/InstallPanel.tsx](src/components/layout/InstallPanel.tsx) — keep the
`{ canPrompt, onInstall, onClose }` props so [App.tsx:1088](src/App.tsx#L1088) is untouched.

- Handle all four routes; `ios-other` gets its own steps (the browser's own ⋯ menu, then
  Share → Add to Home Screen) and **not** the Safari screenshot, with a line offering
  Safari as the sure thing.
- iOS Safari route: add an arrow anchored to the bottom of the viewport, outside the card,
  pointing at where the Share button actually is on an iPhone. Only on iPhone-width
  viewports — on iPad that button is top right, so the arrow would be a lie.
- New copy follows the house rules: no em dashes, no repeated words, two short sentences.
  The existing `manual` string at line 100 has an em dash and gets rewritten with it.

## 6. Clear the menu item once installed

[src/App.tsx:153](src/App.tsx#L153) reads `useState(isStandalone)` once on purpose, so
after a successful native install the "Add to Home Screen" item lingers until reload. Add
an `appinstalled` listener that flips it. An event listener does not reintroduce the
per-keystroke `matchMedia` call the read-once comment was guarding against.

Also check whether [InstructionsPanel.tsx](src/components/layout/InstructionsPanel.tsx)'s
settings-menu section needs a wording touch.

---

## Verification

1. `npx tsc --noEmit` — the hook and `install.ts` are typechecked; the tests are not.
2. `npm test` — `install.test.ts` covers the new route; `precache.test.ts` fails loudly if
   any new file in `public/` is unlisted or if `sw.ts` and `precache.ts` disagree.
3. **Prove the guards by breaking them:** one deliberate sabotage per new assertion (drop
   a UA branch, remove one screenshot from the precache list) and confirm each turns the
   suite red before reverting.
4. `npm run build && npm run preview`, then drive a real browser at a 390×844 viewport:
   - dispatch a synthetic `beforeinstallprompt` **before** the app script runs, to prove
     the inline capture survives the race and the panel shows the native **Install** button;
   - spoof each iOS UA and screenshot the panel to confirm the right steps and the right
     image on each of the four routes.
5. Sample pixels on `icon-maskable-512.png` to confirm the artwork sits inside the centre
   80% safe circle. Validate the manifest parses and every declared `src` exists on disk.
6. `npm run lint -- src` only.

**Not deploying.** This stops at the commit. The `APP_VERSION` bump belongs in the same
commit as a deploy, so it waits until you say to ship.
