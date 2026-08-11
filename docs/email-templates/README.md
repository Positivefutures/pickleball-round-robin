# Sign-in email templates

`magic-link.html` is pasted into Supabase → Authentication → Emails → **Magic
Link**, subject **Your sign-in code**. It lives here because the dashboard is not
version control: the previous template existed nowhere but that text box, and had
to be recovered by reading a delivered message.

**The one rule: no `{{ .ConfirmationURL }}`, and no `href` of any kind.**

The client runs `flowType: 'pkce'` (see `src/lib/supabase.ts`), so a sign-in link
only works in the browser that asked for it. It keeps a `code_verifier` in that
browser's localStorage, and the link is useless without it. On a phone the mail
app rarely opens links in that same jar: iOS Mail hands them to the default
browser, the Gmail app opens its own, and an app launched from the home screen
has storage Safari cannot see. Tapping such a link lands you back at the sign-in
screen with no session and no explanation, which is a loop with no way out.

The 6-digit `{{ .Token }}` has no tie to any browser, so it works everywhere. It
is the only way in, and that is deliberate.

## Confirm email must stay off

Authentication → Providers → Email → **Confirm email** is **off**, and turning it
on brings back a second template. `signInWithOtp` picks the template by user
state, not by API call: an unconfirmed user gets **Confirm sign up** instead of
this one. Editing one and not the other means every new user's first email is the
wrong one. Off since 2026-08-08, which retires that template entirely.

## Proving a change

Send to a **fresh** `jeff+something@` address and read what arrived, through the
Gmail connector. The dashboard preview substitutes nothing and proves nothing.
Two things to check in the delivered message: it contains a 6-digit code, and it
contains no `href`.
