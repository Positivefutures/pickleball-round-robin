# Error monitoring

How you find out when the app breaks for somebody else. Written to be read by
whoever is administering the app, which today is Jeff.

---

## The short version

**This is done and live.** The Sentry account exists, the app is pointed at it,
and a crash now reaches you by email without anybody pressing anything.

There is one optional two minute tidy-up left, in Sentry's own settings, at
[One setting worth changing](#one-setting-worth-changing).

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

## How it is wired up

You created the Sentry account and the project on 2026-08-09. The address of
that project, its DSN, is written into `src/lib/monitoring.ts` and shipped with
the app.

**That address is in the public repository on purpose.** A DSN only allows
crashes to be sent in. It reads nothing back out, it grants no access to the
account, and it is meant to be visible in the app, where anybody can read it out
of the downloaded code anyway. Nothing is protected by hiding it.

The reason to commit it rather than keep it in a Vercel setting is that a value
living only in a dashboard is a value that gets lost. A new project, a restored
account, a forgotten step, and reporting stops. **That failure is silent:** the
app carries on working perfectly and simply tells nobody. Committed, it cannot
happen.

If it ever needs to point somewhere else, set `VITE_SENTRY_DSN` in Vercel, which
wins over the committed one.

### One setting worth changing

**Turn off IP addresses.** In Sentry: Settings → Security & Privacy → turn on
**Prevent Storing of IP Addresses**. The app never sends one, but Sentry can
infer it from the connection, and there is no reason to keep it. The privacy
policy says no IP address is kept, so this makes the page match the settings.

---

## Checking that it worked

Do this once, after the next deploy, and then never again.

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

**If the link does nothing at all**, the site is running an older build. The
crash screen and this link arrived together, so a build without one has neither.
Check the version in the app's footer against the newest commit.

**If the crash screen appears but Sentry stays empty**, check whether
`VITE_SENTRY_DSN` has been set to something in Vercel, since it overrides the
address in the code.

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

In Vercel, add `VITE_SENTRY_DSN` and leave the value **empty**, then redeploy.
An empty value is the off switch; deleting the variable falls back to the
address in the code, which is the opposite of what you wanted.

Nothing else changes: the app still catches its crashes, still shows the screen,
and still offers the email. It just stops telling you automatically.

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
| Do I have to do anything? | No. One optional setting, to stop Sentry keeping IP addresses |
| How do I know it works? | Visit `?crashtest` and look for it in Sentry |
| Are names sent? | No, and that is tested against the real network traffic |
| Is the key in the public repo a problem? | No. It only accepts crashes in |
| How do I turn it off? | Set `VITE_SENTRY_DSN` in Vercel to an empty value |
