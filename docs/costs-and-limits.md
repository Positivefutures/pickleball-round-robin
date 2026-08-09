# Costs and limits

What this app can cost, what happens when a free allowance runs out, and when
it is worth starting to pay. Written to be read by whoever is administering the
app, which today is Jeff.

Checked against both services' own documentation and the live project on
2026-08-09.

---

## The short version

**Neither service can charge you.** Vercel's free plan has no billing cycle at
all. Supabase's free plan says outright that you will not be charged on it.

That matters, because this checklist item was written as "set spending caps",
and there is no cap to set. Vercel only offers spend controls on its paid plan.
Supabase only offers its Spend Cap on its paid plan. On the free plans there is
nothing to cap, because there is no meter running.

So the risk is real but it is not a bill. **The risk is the app going quiet
without telling you.** Everything below is about that.

Three things to do, all in a browser, about fifteen minutes in total:

1. Confirm neither account has drifted onto a paid plan.
2. Learn to recognise one specific email from Supabase, because ignoring it
   takes sign-in offline.
3. Write down the number that means it is time to pay. It is below, already
   chosen.

---

## Can this app cost me money?

Not today, and not by accident.

**Vercel** hosts the app itself. Their free plan is called Hobby, and their own
documentation puts it plainly: "As the Hobby plan is a free tier there are no
billing cycles." If you go over an allowance, the feature stops until the
allowance refills. You are never invited to pay a little to keep going, because
there is no payment relationship to bill against.

**Supabase** runs the database and sends the sign-in codes. Their free plan
works the same way: "you will not be charged while using the Free Plan."

There is exactly one path to a bill, and it is a deliberate one: choosing to
upgrade. Worth knowing that Vercel offers a free trial of its paid plan, and a
trial is the usual way people end up on a paid plan without having decided to.

**So the one thing to check, once:** open each dashboard's billing page and
confirm it still says Hobby and Free.

- Vercel: [vercel.com/account/billing](https://vercel.com/account/billing)
- Supabase: [supabase.com/dashboard/org/_/billing](https://supabase.com/dashboard/org/_/billing)

That is the whole of the "set a spending cap" job. There is no switch to flip,
only a thing to confirm.

---

## What happens when a free allowance runs out

Both services stop rather than charge, but they stop differently, and the
difference matters.

| Service | Allowance | What happens if you exceed it |
|---|---|---|
| Vercel | 100 GB of traffic a month | That feature stops, and **you wait 30 days** |
| Vercel | 1,000,000 requests a month | Same, 30 days |
| Vercel | 100 deployments a day | No more deploys until the next day |
| Vercel | 50,000 analytics events a month | Analytics stops collecting, resumes after 7 days |
| Supabase | 500 MB of database | Warning, a grace period, then the database refuses all requests |
| Supabase | 5 GB of data sent out a month | Same |
| Supabase | 50,000 people signing in a month | Same |

**The Vercel one is the harsher of the two.** There is no partial service and no
way to buy your way out in the moment. Blow through the traffic allowance on the
first of the month and the site is unavailable until the first of the next one.
The only escape is to upgrade.

**The Supabase one gives you warning.** They email you, then allow a grace
period, and only then start refusing requests. One detail is worth knowing in
advance: the grace period is close to a one-time courtesy. Their documentation
says that after you have used one, the dashboard keeps showing a notice, and if
you exceed the limits again you are restricted immediately with no second grace
period. The notice clears on its own after several quiet months.

If Supabase does restrict the project, the app itself keeps working, because it
does not need the database. Signing in and syncing stop.

---

## Where we actually are

Measured against the live project on 2026-08-09:

| Allowance | Limit | Currently using |
|---|---|---|
| Database size | 500 MB | 10.7 MB, and only 0.2 MB of that is app data |
| Accounts | 50,000 a month | 3 |
| Groups | no limit | 13 |
| Players | no limit | 62 |

The gap is worth stating plainly, because it should stop anyone spending money
against the wrong fear. **Almost all of that 10.7 MB is Postgres's own
furniture**, the tables a database keeps about itself. The pickleball data,
every group and every player, is 224 KB.

At the current rate that is roughly 75 KB per account, so the 500 MB allowance
has room for **several thousand accounts** before database size is a
conversation. Traffic is not close either. The app is a set of static files on a
content delivery network, and each sync moves a few kilobytes of text.

**None of the usage ceilings on this page is going to be reached in the
foreseeable future.** The two limits that will actually be felt are elsewhere:
the 100 sign-in emails a day from item 3, and the one below.

---

## What stops one person filling it

Since 2026-08-09 the database enforces its own limits, so a single account
cannot use up the 500 MB on everyone else's behalf. This matters because the key
the app signs in with is inside the page, where anyone can read it, so anyone
can create an account and start sending data.

**Each account can hold 2,000 players and 500 groups.** The busiest real account
today holds 31 players and 6 groups, so nobody is going to meet these by using
the app. There are matching limits on how large any single entry can be, because
a limit on how many without a limit on how big would not be a limit at all.

**If someone ever does hit one**, the app tells them their account is full and
says the number. Nothing is lost. Their data is still on their own phone, which
is the copy they actually use, and it simply stops copying up to the account.

Reaching one would mean either an account being used as storage rather than for
pickleball, or a limit set too low. Either is worth knowing about, and both are
in `supabase/migrations/0003_row_caps.sql` if a number needs changing.

---

## The limit that will actually bite

**Supabase pauses free projects that go quiet.**

Their rule: if a free project gets too little database activity over a 7-day
period, they pause it. A few requests a day is enough to stay alive. This is not
a punishment for overuse, it is the opposite, and it is the single most likely
way this app breaks.

With three accounts, a quiet week is entirely plausible.

**What breaks when it pauses:**

- Nobody can sign in, and nobody can sync.
- The backup script cannot connect either, so backups start failing at the same
  moment.

**What does not break:**

- The app. It works with no account, so anyone using it that way notices
  nothing.

That combination is what makes this nasty. Most people would not report it,
because for most people nothing is wrong.

**You get two emails from Supabase**, and this is the one piece of vigilance
this whole document asks for:

1. A warning, roughly a week before the pause.
2. A confirmation, once it has happened.

**If the warning arrives**, open the Supabase dashboard and look at the project.
Visiting is enough activity to prevent it.

**If it has already paused**, open the project in the dashboard and click
**Resume project**. It comes back with all its data. There is a full year to do
this, so a missed email is not a disaster, but signing in is broken for everyone
until you do.

The permanent fix is the paid plan. Projects on Supabase Pro are never paused
for inactivity. That is the strongest single argument for the $25, and a better
one than any of the usage numbers.

---

## The Ko-fi question, answered

The checklist asked whether the donate button puts this project outside the
terms of Vercel's free plan. It does not, and their documentation says so
directly.

Vercel restricts the Hobby plan to non-commercial personal use, and gives
examples of what counts as commercial: requesting or processing payment from
visitors, advertising the sale of a product or service, being paid to build or
host the site, or carrying advertisements. Then it adds this, in its own
highlighted note:

> Asking for Donations **does not** fall under commercial usage.

Two things make the answer clearer still. The app does not process any payment.
The Donate panel is a link out to `ko-fi.com/pbroundrobin`, so no money ever
moves on a page Vercel is hosting. And there is no advertising anywhere in it.

**Settled. The donate button is fine, and needs no change.**

### What would change the answer

Three things, and it is worth knowing them now rather than discovering them:

1. **Charging for anything.** A subscription, a paid tier, an unlock. That is
   item 22 on the checklist, and the day it ships this app needs Vercel Pro.
   Not as a judgement call, as a plain reading of their terms.
2. **Selling through Ko-fi.** Ko-fi supports memberships, a shop, and paid
   commissions alongside plain donations. Donations are carved out. Selling is
   not. If the Ko-fi page ever offers something in exchange for money, this
   question reopens.
3. **Paying someone to work on it.** Vercel's definition includes financial gain
   for "anyone involved in any part of the production of the project, including
   a paid employee or consultant writing the code." Hiring a developer arguably
   trips that, even with nothing being sold. Worth asking their support before
   assuming either way.

---

## When to start paying, and how much

Both numbers are decided here so nobody has to decide them under pressure.

### Supabase Pro, $25 a month

For a project this size that is the whole cost. The plan includes a $25 base fee
plus an allowance that covers the small database instance this app runs on.

**Upgrade when any one of these is true:**

- **The project pauses for inactivity while real people are using it.** Once is
  a lesson. Twice is a decision.
- **Any usage figure passes 70%** of its allowance: 350 MB of database, or 3.5
  GB of monthly data out.
- **Losing a week of data stops being acceptable.** Pro includes daily backups
  taken automatically, which is the thing the weekly script in
  [docs/backups.md](backups.md) is standing in for.

Of those three, the first is the one likely to happen, and the third is the one
worth paying for. The middle one is years away.

### Vercel Pro, $20 a month

**Upgrade when the app starts charging anyone for anything.** That is the whole
trigger. It is a terms question, not a capacity question, and no usage number
should push this decision, because none of them is close.

**Expected order:** Supabase Pro first, and possibly for a long time on its own.
Vercel Pro only arrives with a paid tier, and both together are $45 a month,
which is a real reason to know whether a paid tier will actually earn it.

---

## Where to look

Once a month, or before anything that might bring a crowd:

- **Supabase usage:** [supabase.com/dashboard/org/_/usage](https://supabase.com/dashboard/org/_/usage)
  Database size, egress and monthly active users, against their limits.
- **Vercel usage:** [vercel.com/account/usage](https://vercel.com/account/usage)
  Traffic and requests.

Neither will be interesting for a while. Looking anyway is how you notice the
month they become interesting.

---

## Summary card

| Question | Answer |
|---|---|
| Can this cost money today? | No. Both are on plans that cannot bill you |
| Is there a spend cap to set? | No. Spend caps only exist on the paid plans |
| What happens at a Vercel limit? | The feature stops for 30 days |
| What happens at a Supabase limit? | Warning, grace period, then requests refused |
| How close are we? | Not close. 11 MB of 500 MB, 3 accounts of 50,000 |
| Can one account fill it? | No. 2,000 players and 500 groups each, enforced by the database |
| What will break first? | Supabase pausing the project after a quiet week |
| Is the donate button allowed? | Yes. Donations are explicitly not commercial |
| What makes it not allowed? | Charging for anything. Then Vercel Pro is required |
| First upgrade to expect | Supabase Pro, $25 a month, for daily backups and no pausing |
