# Error monitoring

How you find out when the app breaks for somebody else. Written to be read by
whoever is administering the app, which today is Jeff.

---

## The short version

**There is one job left, it takes about ten minutes in a browser, and it needs
no credit card.** Create a Sentry account, copy one long line of text out of it,
and paste that into Vercel. Step by step instructions are further down.

Everything else is already done and already live. Until you do this, a crash is
shown to the person it happened to and is not sent to you.

---

## Why this exists

Before 2026-08-09 a crash looked like this: the screen went white. No message,
no button, nothing. Somebody halfway through running a session for twelve people
would reasonably conclude they had just lost their entire group.

And you would never hear about it. There is no server in this app, so there are
no logs anywhere to go and look at. The only way a bug has ever reached you is
somebody bothering to write in.

Two separate problems, and they have two separate fixes.

---

## What already works, with no account and no setup

**The app now catches its own crashes.** Instead of a white page, it shows:

> **Something went wrong**
>
> Your groups and players are saved on this device. Nothing has been lost.
>
> The app hit a problem it could not carry on from. Reloading usually fixes it.
>
> [ Reload ] [ Tell me what happened ]

**Tell me what happened** opens their email app with the whole thing already
filled in: what broke, where in the code, which version, how many groups and
players they have. The same details a bug report carries, without them having to
describe anything.

That is live now. It is the half that matters most to the person standing at a
court, and it needed nobody's permission.

**What it does not do** is tell you unless they press the button, and most people
will not. That is what the rest of this page is for.

---

## What Sentry adds

Sentry is a service that collects crashes. When one happens, the app sends it up
automatically, and you get an email. It groups the same fault together, so a bug
hitting thirty people is one item in a list rather than thirty emails.

**It is free for what this app needs**, and it cannot bill you:

| | |
|---|---|
| Cost | $0 |
| Credit card | Not required to sign up |
| Crashes included | 5,000 a month |
| History kept | 30 days |
| People who can log in | 1, which is you |

At 5,000 in a month it simply stops accepting more until the month turns over.
You are not charged and nothing else breaks. For scale: three accounts and a
handful of users should produce single digits a month, and if it ever produces
5,000 you have a much more interesting problem than the bill.

---

## Setting it up

Ten minutes. Do it in one sitting, because the value you copy in step 4 is
easiest to find during signup.

**1. Sign up.** Go to [sentry.io](https://sentry.io) and choose the free
Developer plan. Sign in with GitHub if you would rather not have another
password. It does not ask for a card.

**2. Create a project.** It will ask what kind. Choose **React**. Name it
`pickleball-round-robin` so it matches the repository.

**3. Skip the code it shows you.** Sentry will display a page of code to paste
into the app. Ignore all of it. That work is already done, and pasting it again
would report everything twice.

**4. Copy the DSN.** It is a long line starting with `https://` and containing
`ingest`. If the setup page has moved on, it is always at:

> Settings → Projects → pickleball-round-robin → Client Keys (DSN)

**A DSN is not a password.** It is an address that only allows sending crashes
in, not reading anything out, and it is meant to be visible in the app. Nothing
bad happens if it ends up somewhere public.

**5. Paste it into Vercel.** Go to
[vercel.com](https://vercel.com) → the pickleball project → Settings →
Environment Variables, and add:

| Field | Value |
|---|---|
| Key | `VITE_SENTRY_DSN` |
| Value | the line you copied |
| Environments | tick all three |

**6. Redeploy.** Vercel does not apply a new environment variable to the site
already built. In Vercel, open the Deployments tab, find the newest one, and use
the "..." menu → Redeploy. Alternatively, the next time anything is pushed to
GitHub it will pick it up on its own.

**7. Turn off IP addresses.** In Sentry: Settings → Security & Privacy → turn on
**Prevent Storing of IP Addresses**. The app never sends one, but Sentry can
infer it from the connection, and there is no reason to keep it.

---

## Checking that it worked

Do this once, right after step 6, and then never again.

Open this address on your phone or in a browser:

```
https://app.pbroundrobin.com/?crashtest
```

The app will crash on purpose. You should see the "Something went wrong" screen.
Press **Reload** and you are back to normal, with nothing lost. That link is the
only thing that causes it, and it is harmless.

Then open Sentry. Within a minute or so there should be one new issue named
**Test crash, asked for by the ?crashtest link**, and opening it should show
**Release** matching the version number in the app's footer.

**If the crash screen appears but Sentry stays empty**, the DSN did not reach the
site. The usual cause is skipping step 6, so redeploy and try again.

Those two things together are the whole proof: the person sees something useful,
and you are told.

---

## What gets sent, and what never does

This matters because the app holds real people's names and can be used with no
account at all.

**Sent:** the error message, where in the code it happened, and the version.

**Never sent:** player names, group names, ratings, schedules, email addresses,
what page they were on, what they clicked, or their IP address.

The app removes names from the error message itself before sending, by checking
against the names actually stored on that device. It removes rather more than it
strictly needs to. If somebody happens to name a player "Type", the message
`TypeError` arrives as `[name]Error`, which is a worse message and not a leak.
That is the right way round.

**This has been tested against what actually goes out over the network**, not
just against what the app intended to send. See
`src/lib/monitoring.delivery.test.ts`.

**One consequence to remember:** Sentry is now a company that processes data on
this app's behalf, alongside Vercel, Supabase and Ko-fi. The privacy policy has
to name it. That is item 10 on the launch checklist and it is already noted
there.

---

## Turning it off

Delete `VITE_SENTRY_DSN` from Vercel and redeploy. Nothing else changes: the app
still catches its crashes, still shows the screen, and still offers the email.
It just stops telling you automatically.

That is worth knowing because it means this can never be the thing that breaks
the app.

---

## Honest limitations

- **It only catches crashes.** A feature that quietly does the wrong thing
  without throwing an error is invisible to this, and always will be. Feedback
  from actual people is still how you learn about those.
- **Stack traces name the built file, not the original code.** A report will say
  something like `index-BPQzxtzB.js:1:48213`. That is enough to work with,
  because the version number identifies the exact commit. Making it prettier
  means uploading source maps on every deploy, which is more moving parts than
  it is worth today.
- **Somebody offline when they crash is not reported.** The report is attempted
  once and not queued. They still see the screen and can still email it.
- **Five per visit, and each distinct fault once.** A component crashing on every
  render would otherwise spend the month's allowance in about a second.

---

## Summary card

| Question | Answer |
|---|---|
| Can this cost money? | No. Free plan, no card, stops rather than charges |
| What does a crash look like now? | A screen saying the data is safe, with Reload |
| Do I have to do anything? | Once. Sign up and paste the DSN into Vercel |
| How do I know it works? | Visit `?crashtest` and look for it in Sentry |
| Are names sent? | No, and that is tested against the real network traffic |
| How do I turn it off? | Delete the Vercel variable and redeploy |
