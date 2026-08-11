# Make signing in one road: the code, and nothing else

## Context

Signing in offers two ways in, and one of them is a trap on a phone.

**The loop, and what actually causes it.** The client runs `flowType: 'pkce'`
([src/lib/supabase.ts:43](src/lib/supabase.ts#L43)). When someone asks for a code,
the SDK writes a `code_verifier` into **that browser's** localStorage and emails a
link carrying `token=pkce_...`. Supabase redeems that token and bounces the phone
to `app.pbroundrobin.com/?code=...`. Exchanging the code needs the verifier, and
the verifier is only in the jar the request came from.

On a phone the mail app almost never opens the link in that jar. iOS Mail hands
links to the default browser. The Gmail app opens its own in-app browser. And an
app launched from the home screen has a storage jar Safari cannot see at all. So
the exchange fails, `getSession()` returns null, the state lands on `signed-out`,
and because `hasAuthCallback()` was true at boot
([App.tsx:122](src/App.tsx#L122)) the app has already opened My Account. Signed
out plus My Account open equals `SignInPanel`, which asks for an email address.
Exactly where they started, with nothing said. That is the loop.

Confirmed against a real delivered email rather than assumed: the button links to
`.../auth/v1/verify?token=pkce_...&type=magiclink&redirect_to=https://app.pbroundrobin.com`.

**Deleting the button is necessary and not sufficient.** Two things keep the loop
alive afterwards:

1. Links already emailed stay live for an hour after the template changes.
2. The app reads `error_description` in `hasAuthCallback()` and then **never
   looks at it again**. An expired link opens My Account and says nothing at all.
   Nothing strips `?code=` or `?error=` either, so a reload replays it.

So the app needs to say what happened when a link fails, or the same dead end
survives the fix.

**Also settled, so it does not get re-litigated:** Confirm email has been off in
Supabase since 2026-08-08, so the link-only *Confirm signup* template is retired
and every user now gets *Magic link or OTP*. Only one template needs editing.
`verifyOtp({ type: 'email' })` is already confirmed to accept a signup token.
Turning Confirm email back on re-arms all of that.

**Decisions taken:** the email carries the code and nothing tappable. The "Check
your email" screen replaces the deleted line with a spam prompt.

---

## 1. The email: code only

The template lives in the Supabase dashboard and exists nowhere else, which is
why the current one had to be reverse-engineered out of a delivered message.
Fix that too.

- **`docs/email-templates/magic-link.html`** (new) — the template, in git, with a
  header comment naming where it is pasted: Authentication → Emails → **Magic
  Link**. Same card, robin and green rule as now, minus the `Sign me in` anchor
  and the `OR USE CODE` divider, with the code moved up into the space they
  leave. The `Using the app from your phone home screen?` line goes as well; it
  is the same confusing sentence as the one on screen.
  Body copy: `Enter this code in the app:`, the `{{ .Token }}` block, then
  `This code expires in one hour. If you didn't request it, you can safely
  ignore this email.`
- **`{{ .ConfirmationURL }}` must not appear anywhere in the file.** That is the
  whole of the fix. Any link built from it can loop.
- **`docs/email-templates/README.md`** (new) — three lines: which dashboard
  screen, that Confirm email must stay off, and that the delivered mail is the
  only proof a template works.

`emailRedirectTo` in [sendSignInEmail](src/lib/auth.ts#L186) **stays**. It costs
nothing and it is the only thing keeping the links already in flight landing on
the app rather than on Supabase's default site URL for the next hour.

## 2. Read the arrival once, then clean the URL

[src/lib/supabase.ts](src/lib/supabase.ts) — `hasAuthCallback()` answers yes or
no and is called at boot. Widen it into one reader with one truth, captured
before the SDK strips the query string:

```ts
export type LinkArrival =
  | { kind: 'none' }
  | { kind: 'code' }       // ?code=..., a PKCE code we may not be able to spend
  | { kind: 'expired' }    // error_code=otp_expired
  | { kind: 'error' };     // anything else Supabase sent back
```

- `linkArrival()` — memoised into a module-level variable on first call, so the
  answer survives the SDK consuming the URL. `hasAuthCallback()` keeps its name
  and its callers, and becomes `linkArrival().kind !== 'none'`.
- `clearAuthParams()` — new. Drops `code`, `error`, `error_code` and
  `error_description` from both the search and the hash via
  `history.replaceState`. Called once `initAuth()` has settled, so a reload
  cannot replay a spent code and the address bar stops carrying a token.

## 3. Say what happened, instead of starting over in silence

A new screen would be more surface than this needs. The panel that already
appears is the right place, with a line above it saying why.

- [src/components/layout/SignInPanel.tsx](src/components/layout/SignInPanel.tsx)
  — new optional `notice?: string | null` prop, rendered above the email field
  in the amber `note` style from
  [accountStyles.ts:88](src/components/layout/accountStyles.ts#L88) with
  `role="status"`. Amber rather than the red `Problem`: nobody did anything
  wrong.
- [src/App.tsx](src/App.tsx#L122) — beside `showAccount`, derive the notice from
  `linkArrival()` and hold it in state. `closeAccount` clears it, so it shows
  once on the panel the link opened and does not reappear if someone signs out
  by hand later in the same page load.
- [src/components/layout/AccountPanel.tsx](src/components/layout/AccountPanel.tsx#L302)
  — pass it straight through to `SignInPanel`.

This is correct by construction rather than by timing: the panel already holds on
`Checking...` while `auth.status` is `unknown`, and only reaches `SignInPanel`
once signed-out is confirmed. A link that **worked** ends on the signed-in panel,
where the notice is never rendered.

Copy, for editing:

- expired → `That link has expired. Ask for a new code below.`
- code or error → `That link did not sign you in. Ask for a code below instead.`

## 4. The screen copy

[src/components/layout/SignInPanel.tsx](src/components/layout/SignInPanel.tsx#L93-L100)

- `We sent a link and a code to X.` → `We sent a 6 digit code to X.`
- Delete `Using the app from your home screen? Type the code. The link signs you
  in to your browser instead.` outright.
- Under the code field, quietly: `Not there? Check your spam folder.`

Then the stale comments, which will otherwise send the next reader back down the
link path: the module docblock at [auth.ts:3-18](src/lib/auth.ts#L3-L18) is
written entirely around "either one gets you in", `sendSignInEmail`'s one-liner
at [auth.ts:174](src/lib/auth.ts#L174) says it sends both, and the `flowType`
comment at [supabase.ts:38-46](src/lib/supabase.ts#L38-L46) explains a link flow
that no longer exists. PKCE itself stays: it is still the right setting, and the
verifier problem stops mattering once nothing is emailed that depends on it.

## 5. Tests

[src/components/layout/SignInPanel.test.ts](src/components/layout/SignInPanel.test.ts)
— the test at line 244, `explains why the code exists at all on an installed
app`, asserts the deleted sentence word for word and goes with it. Replacing it:

- the sent screen names a 6 digit code and **does not contain the word "link"**
- the spam prompt is on the sent screen
- a `notice` renders above the email field, and the field is still there, so the
  failed arrival explains itself rather than restarting

**`src/lib/supabase.test.ts`** (new, happy-dom) — `linkArrival()` across the four
URL shapes, that it stays memoised after the URL is rewritten underneath it, and
that `clearAuthParams()` leaves unrelated query parameters alone.

[src/App.walkthrough.test.ts](src/App.walkthrough.test.ts) — the guard that
matters most, inside `withDatabase` so Supabase is configured: boot with
`?error=access_denied&error_code=otp_expired` on the URL and assert My Account
opens carrying the expired notice. That is the loop, end to end, in the real App.

**Prove each new assertion by breaking it** ([house rule](launch-checklist.md)):
one deliberate sabotage apiece, each must turn the suite red, each reverted.

---

## Verification

1. `npx tsc --noEmit`, then `npm test`. Tests are not typechecked, so a green
   `tsc` says nothing about them.
2. `npx eslint src` only. Never Prettier on this repo.
3. `npm run build && npm run preview`, then drive headless Chrome at 390x844:
   - load `/?error=access_denied&error_code=otp_expired`, screenshot, confirm My
     Account is open and carries the expired notice, and confirm the URL has been
     cleaned of both parameters
   - load `/?code=fake`, confirm the same for the generic wording
   - open My Account normally and confirm no notice appears anywhere
4. Paste the template into the dashboard, send to a **fresh** `jeff+something@`
   address, and read the delivered mail through the Gmail connector. Two things
   to check, neither by eye: the message contains a 6 digit code, and it contains
   **no `href` at all**. Then sign in with that code on a phone.
5. Confirm Authentication → Providers → Email still has Confirm email **off**,
   or the retired link-only signup template comes back.

**Not deploying.** This stops at the commit, and the `APP_VERSION` bump waits
with it.
