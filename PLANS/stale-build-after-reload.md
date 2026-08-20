# Stale build after Reload, on an installed PWA

Reported after the 20 Aug 2026 session. Two phones side by side, both installed
to the home screen, both signed in. On one, the Reload banner was tapped and the
app came back still looking older and missing things the current build has. Also
seen across several of the reporter's own installed copies, with no clear
pattern.

Investigated in the order asked. **The headline is that two separate things are
going on, and one of them is not a stale bundle at all.**

---

## 1. What version is each device on

`APP_VERSION` was already on screen — in the page footer, grey, `text-xs`, under
however many rounds the session had. Technically visible, useless for the actual
question, which is two phones held up next to each other.

It is now in the settings drawer, at the foot, beside the contact address:

```
Version 3.64 · build 2370d82
```

Two halves, because they answer different questions. `APP_VERSION` is the number
that gets quoted and it is typed by hand, so a deploy can forget it. `BUILD_ID`
is the commit sha, written in by `vite.config.ts` from `VERCEL_GIT_COMMIT_SHA`
(falling back to local `git rev-parse`), so it cannot disagree with the code it
was built from.

- Same version, same build → the same code. Any difference is state, not build.
- Same version, different build → a deploy that forgot to bump.
- Different on both → genuinely stale.

The drawer opens from any tab, in one tap, at any scroll position.

---

## 2. The Reload banner, end to end

The chain was already right in the ordinary case, and I checked it rather than
read it. `applyUpdate` posts `skip-waiting` to `registration.waiting`, and
reloads on `controllerchange` — it does **not** reload immediately and race the
activation.

I built a minimal service-worker rig mirroring `sw.ts` (no `skipWaiting` on
install, `clients.claim` on activate, the same message handler) and ran a real
update through **Chromium and WebKit**, WebKit being what an iPhone runs whether
the app was opened from Safari or from a home-screen icon. In both engines:

- `registration.waiting` is populated **before** `statechange` fires with
  `installed`, so the banner never appears with an empty waiting slot.
- `postMessage({type:'skip-waiting'})` is followed by `controllerchange` within
  a few milliseconds.

So the happy path is sound, and the first hypothesis — that the banner fires
against a slot that is not filled yet — is **wrong**. Worth saying plainly,
because it was the obvious suspect.

**What was actually wrong** is that an event was the only exit. `applyUpdate`
was one line, and it had two ways of doing nothing at all:

1. **An empty waiting slot.** A waiting worker activates on its own as soon as
   the last page it would replace goes away, and iOS discards a backgrounded
   app's pages whenever it wants the memory. The new worker then claims the
   page, which carries on running the JavaScript it already had in memory — an
   older interface, missing whatever the new build added — with nothing left in
   `waiting` to message. The update store never goes back to `none`, so the
   banner is still up, and the tap had nowhere to go. **This matches the report
   exactly.** The fix is a plain reload: the new worker is already in charge, so
   the shell it serves is the new one.
2. **A handover that never lands.** Nothing measured does this, but with an
   event as the only exit, a browser that misbehaved left the button dead for as
   long as the app stayed open. There is now a 3-second backstop.

The module docblock also claimed a home-screen app "never" lets a page go. It
does, and that sentence was load-bearing, so it has been corrected.

**Residual case, stated rather than papered over:** if the message is delivered
and the old worker somehow stays in control, the backstop reload is served by
that old worker from its own cache, so the page comes back on the same build.
What it will not do is come back silently — `startAppUpdates` runs again, finds
the same worker waiting, and puts the banner straight back up, so the next tap
retries the handover. The cure would be clearing the shell out of the caches
first, which does force the network; that is deliberately not done, because the
caches are shared with the worker that is waiting and a session played on a
court with no signal is worth more than the last few percent of this.

---

## 3. What happens on activate

Clean, and no change needed. `activate` deletes every `pbrr-*` cache that is not
the current one, and the cache name carries a hash of the precache list, so a
new build gets a new cache and the old one goes. The HTML entry is cache-first,
but from the *new* worker's cache, which was populated at install — so a stale
`index.html` cannot survive a worker swap.

**One real hole, now closed.** The cache name is a hash of the file *list*, and
the worker script's bytes are otherwise identical between builds. A deploy that
changed only `index.html` — a meta tag, an og: image, the analytics snippet —
would produce a byte-identical `sw.js`, which is not an update as far as the
browser is concerned: no `updatefound`, no banner, and no way to reach the
change until something moved an asset hash. `sw.js` now carries the build id, so
every deploy is a new worker. Cache reuse is unaffected, since the cache name
still keys off the list.

---

## 4. How often it checks

Already correct, no change. `reg.update()` runs on **every** `visibilitychange`
to visible, which is exactly the "resumed rather than launched" case — an
installed app can go weeks without a navigation, and the browser's own check
rides on navigations. Covered by tests that already existed.

---

## 5. Vercel cache headers

Measured against production, not assumed. Everything is served
`public, max-age=0, must-revalidate` — `/`, `/index.html`, `/sw.js`,
`/site.webmanifest`, and the hashed assets. **`/sw.js` in particular is not
served with a long max-age**, so that hypothesis is ruled out. There is no
`vercel.json` at the repo root; these are Vercel's defaults and they are right.

Also confirmed: assets from a previous deploy 404 on the production alias
(`/assets/index-BqTdHnwp.js` → 404). Harmless here, because the app ships as
whole chunks named in the precache list rather than lazily-imported ones.

Worth knowing for next time: a verification loop that curls the live site can
report the old bundle for minutes after a good deploy, because the edge serves
a cached `index.html`. Re-fetch with a cache-buster before concluding anything.

---

## The second possibility, which is not ruled out — it is confirmed

The report says **functionality** differed, not only appearance. That part is
very likely not a stale bundle, and finding the bundle bug would have hidden it.

**3.63 shipped the night before this session and changed two defaults.** The
important one:

```ts
export const standingsShared = createStoredValue<boolean>('pb-standings-shared', false);
```

It was `true`. And `createStoredValue` never writes a default to storage — it
returns the fallback when the key is absent. So:

- A phone whose host **never touched** Share Standings has no key, and after
  updating to 3.63 reads the **new** default: standings sharing **off**.
- A phone whose host **ever moved** that switch has the key written, and keeps
  whatever it says.

Two installed copies, the same build, different behaviour, no clear pattern —
which is the report, word for word, and none of it is a stale bundle. The same
shape applies to `scoreEditingAllowed`, which 3.63 also made sticky across a
stop and restart of sharing.

This was a known and accepted consequence at the time, flagged when 3.63 went
out. It is written down here because it is the first thing to check the next
time "this phone is missing something" comes in: **compare the two build lines
first**. If they match, it is state, and the switches in Share Live Session are
where to look.

---

## What changed in the code

| File | Why |
|---|---|
| `src/lib/appUpdate.ts` | Reload never silently no-ops; 3s backstop; corrected docblock |
| `src/lib/appInfo.ts` | `BUILD_ID`, read through `typeof` so tests import cleanly |
| `vite.config.ts` | Injects the sha into the app and into `sw.js` |
| `src/components/layout/SettingsPanel.tsx` | The version line |
| `src/lib/appUpdate.test.ts` | The end-to-end test, with the browser's half of the handover wired into the fake |

The test asked for is `from an old build to a new one → leaves the new worker
running the page after a single tap of Reload`. It needed the fake extended:
every existing test stopped at "was a message sent", which is the right place to
stop for what this module sends and the wrong place to stop for whether the swap
happened. A fake that never answers that is how a dead Reload button went four
releases without being noticed.
