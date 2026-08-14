# Pickleball Round Robin Generator: product context

A single description of what this app is, what it does, how it is built, what it
costs to run, who it competes with, and what has and has not been decided.
Written to be dropped into a Claude Project as background for planning what
comes next: subscriptions, pricing, a website, the app stores, and taking it to
market.

Accurate as of app version **2.11**, 2026-08-11.

---

## 1. The one paragraph version

Pickleball Round Robin Generator builds fair doubles matchups for a social round
robin. A host adds their players once, ticks who turned up, says how many courts
and rounds they have, and gets a schedule where everyone plays with and against
different people and the sit-outs are shared out evenly. It runs in a browser,
installs to a phone home screen, works with no signal at the court, and needs no
account. It is live at **https://app.pbroundrobin.com/** and it is free today.

The person it is built for is the volunteer who organises a weekly session. They
are standing on a court with a phone, twenty people are waiting, and somebody
just showed up who was not on the list. **That volunteer is also the person we
expect to pay.**

---

## 2. Where it lives

| Thing | Value |
|---|---|
| App | https://app.pbroundrobin.com/ |
| Apex domain | pbroundrobin.com, redirects to the app |
| Feedback address | jeff@pbroundrobin.com |
| Donations | https://ko-fi.com/pbroundrobin |
| Privacy policy | /privacy.html |
| Terms of service | /terms.html |
| Hosting | Vercel, Hobby (free) plan |
| Database and auth | Supabase, Free plan |
| Crash reporting | Sentry, Developer (free) plan |
| Transactional email | Resend, for feedback and bug reports |

A rename to **Roundrobinator** is under consideration. See section 13.

---

## 3. The shape of the product

Three steps, shown as tabs across the top. A host moves forward through them and
can jump back at any time.

### Step 1: Players

The pool of people who play. Added once and reused every week.

- A player has a **name**, a **rating** from 3.0 to 5.0 in tenths, and a
  **gender** of M or F. Rating and gender are what the scheduler uses to even
  out the teams.
- **Groups.** A player can belong to any number of groups. A Tuesday morning
  crowd and a weekend crowd can share people without typing anyone twice. Groups
  are added, renamed and deleted from a Manage panel.
- **Bulk select.** Tick several people and add them all to another group at once.
- **Import and export.** A group saves out as a spreadsheet file and loads back
  in. An import always creates a new group, and players who are already in the
  pool join it rather than being duplicated.
- **Default player rating** is a setting, so a host adding thirty people at 3.5
  is not adjusting every one of them.

### Step 2: Setup

What today's session looks like.

- **Courts and rounds.** How many courts are available, and how many rounds to
  play. A live "Spots Filled" line says how many players are needed and how many
  will sit out each round.
- **Who is playing.** Tick who turned up. Select All and Deselect All for speed.
- **Set Partners.** Couples who want to play together all session. Tap one
  player, then their partner. The scheduler keeps them on the same team every
  round but is free to choose their court and their opponents.
- **Special game types.** Three formats that can be dropped into the session on
  a repeating cycle:
  - **Gendered**, men against men and women against women
  - **Mixed**, a man and a woman on each team
  - **Equal Skill**, grouped by rating

  Each has an on/off, a frequency (every N rounds), and an order that settles
  which one wins a round they both fall due on. Everything else stays an
  ordinary round robin. A special round beats Set Partners, but only where it
  has to: a pair that does not suit the format is split for that round alone.

### Step 3: Schedule

The generated session, and everything that happens to it during play.

- Each round shows every court, both teams, and a **Diff** badge giving the
  rating gap between the sides. Green is an even match, red is lopsided.
- **Court numbering.** Tap a court heading and rename it to the number your
  centre actually gave you. The change runs forward from that round and never
  rewrites a round already played.
- **Mark a round complete.** It collapses out of the way, and it is never
  rewritten by anything afterwards.
- **Score entry.** A keypad per court, with the common winning scores on it and
  a key that clears. Scores feed a **standings table**: wins, losses, played,
  points for, and point differential, ranked.
- **Swap two players.** Tap one, tap the other.
- **Padlock a pair**, then **Reshuffle** rebuilds everything else around them.
- **Player Summary** at the bottom: games played, and who has partnered or
  played against whom.
- **Print or save a PDF**, for a clean sheet to post by the courts.

### The Actions sheet

Everything that goes wrong on a real afternoon, handled without starting over.
All of it edits only the rounds not yet played.

- Add a Player, Add a Guest (a one-session person who is not in the group)
- Sub a Player, for somebody leaving and somebody taking their place
- Add a Round
- Add a Court, Remove a Court, for the club handing one over at half past nine
- Reshuffle
- Share Live Session
- Start New Session, which keeps the same crowd selected for the next one

---

## 4. The scheduler, which is the actual product

Everything else is a shell around this. The engine generates hundreds of
candidate arrangements per round three different ways (greedy court-building,
random sampling, and a matcher that builds teams straight off the
never-partnered graph), scores each with one weighted cost function, and takes
the best. The priorities, in order, as decided August 2026 (see
`PLANS/round-robin-algorithm-audit.md` and `docs/how-the-scheduler-thinks.md`):

- **Sit-outs are rotated evenly and predictably.** Nobody sits twice before
  everyone has sat once, who sits first is genuinely random (an unbiased
  shuffle; the old comparator favoured the top of the roster 3x), and once the
  first cycle completes, later cycles repeat it in the same order.
- **Repeat partners are the cardinal sin.** A repeat partnership costs 4x what
  it used to, a never-partnered team earns a bonus, and the engine remembers
  *when* each pair last partnered: a repeat within two rounds is fined on top,
  so back-to-back repeats measure zero in normal play. Measured repeats now sit
  at the structural floor (with 12 players and 12 rounds some repeats are
  mathematically forced; the engine adds almost none beyond that).
- **Repeat opponents** are penalised squared, and a novelty bonus plus a
  coverage term push toward everyone playing everyone at least once.
- **Team balance** is scored on the rating gap with a 0.5 target. It is a
  strong preference, not a wall: the engine trades the target away rather than
  repeat a partnership (about 2% of courts in a typical session), but refuses
  genuinely lopsided courts. The old 200x hard cap inverted the priorities and
  bought balanced courts by repeating partners; that was the Mike-and-Jay bug.
- **Special round misses are tracked.** If the roster only stretched to so many
  gendered courts, whoever missed out goes first next time.
- **Court gender shape is a tie-break.** All-gendered and two-and-two courts
  are preferred over 3:1, and three men with one woman is avoided hardest. It
  ranks below everything above, so it never costs a fresh partnership; roughly
  one court a round still lands 3:1 early in a session because meeting everyone
  outranks the shape.
- **Short courts are rotated too.** A roster that does not divide by four is no
  reason to sit anybody down. The last court plays whoever is left: three is a
  2v1, two is a game of singles. Who takes that court rotates, and among
  rotation ties the pair side goes to the freshest pairing.

All of this history is replayed out of the saved rounds, not just accumulated in
memory, so the rotation survives a reshuffle, a reload, and a player leaving
mid-session. The quality numbers above are measured, not aspirational: a
MEASURE=1 harness (`src/lib/scheduleQuality.measure.test.ts`) sweeps roster and
court combinations and prints repeat, balance, sit-out and gender-shape
distributions, with the baseline kept in its header.

**This is the hard part and the defensible part.** A spreadsheet or a generic
round robin tool gives you a fixed rotation table. This handles a roster that
changes between rounds while keeping the fairness properties intact.

---

## 5. Accounts and sync

Optional, and layered on top of an app that has always worked without them.

- **Guest mode is the default and the primary path.** No account is needed to
  use anything in section 3. Everything is stored in the browser.
- **Sign-in is passwordless, code only.** Asking to sign in sends one email
  carrying a six digit code. There is deliberately no magic link: a link works
  in the browser that asked for it and nowhere else, and on a phone the mail app
  hands links to a different browser, so the tap that looks easiest is the one
  that fails.
- **What an account keeps:** groups, players, and preferences. That is what a
  host would lose by changing phone.
- **Sync is a real merge, not an overwrite.** A device only pushes rows the user
  actually touched, held in a persisted outbox. When a local group or player is
  recognised as one the account already holds, the local copy adopts the
  account's id, so both devices refer to the same person forever after and every
  later sync is an ordinary idempotent upsert.
- **Download my data** and **Delete my account** both ship.
- Row Level Security on every table is the whole of the protection, and it has
  been proven with two real accounts.

### Row caps per account

| Item | Cap |
|---|---|
| Players | 2,000 |
| Groups | 500 |
| Shared live sessions | 20 |

These exist for availability, not as a paywall. They are set far above anything
a real host produces, and they are not the place to put a plan limit.

---

## 6. Live session sharing

The one feature that touches people who are not the host.

A host taps Share Live Session and gets a QR code. The people in the session
point a camera at it and watch the schedule on their own phones as it updates:
who is on which court, this round and the ones ahead.

- The viewer needs no account and no install. It is the only part of the app
  that runs for a signed-out stranger.
- Security is the key's own size. Ten symbols out of thirty-two is about 2^50,
  and nobody types it because it arrives as a QR code.
- **Ratings and group membership are stripped before publishing.** Viewers see
  names and courts, never what the host thinks of anyone's level.
- The session still lives on the host's phone. Publishing is one way, so two
  phones at one court can never disagree about round three.
- **The host must be signed in to share.** This is currently the strongest
  reason for a casual host to make an account.

**This is also the only growth loop in the product.** Twenty players scanning a
host's QR code is twenty people who now know the app exists. It is currently
built as a feature and measured as nothing.

---

## 7. It is a real app on a phone

- **Installs to the home screen** on iOS and Android, with a guided panel per
  platform because the mechanics differ and iOS has no install API at all.
- **Works offline.** A service worker precaches the shell. A new build downloads
  itself, then waits and shows a Reload banner rather than swapping under
  somebody mid-session.
- **Printing works everywhere, by two different roads.** An installed iOS app
  cannot print: WebKit only ever hosted the print dialog in Safari's own UI, so
  the call silently does nothing. So the app writes its own PDF and hands it to
  the OS share sheet, which offers Print. The PDF layout is a deliberate copy of
  the printed page, down to the point sizes, and a test renders both and
  compares them.
- **Large text toggle**, for reading at arm's length across a court.
- **Crash handling.** A real screen with an honest sentence and a way to send
  the details, plus Sentry behind it.
- **In-app feedback.** Suggest a Feature and Report a Bug send from the app
  itself and attach the app version and browser, never player details.

---

## 8. How it is built, and why that matters commercially

- **Vite, React 19, TypeScript, Tailwind 4.** A static bundle on a CDN.
- **Almost no server.** The browser talks straight to Supabase with the
  publishable key. There is exactly one serverless function, `api/feedback.ts`,
  which sends feedback and bug reports through Resend. Anything else needing
  privilege the browser lacks goes into a `security definer` Postgres function.
- **Traffic is close to free.** The only surface that scales with users is
  Supabase.
- **No dependency bloat.** The PDF writer is hand written rather than pulled
  from a library, because the smallest capable package is a third of a megabyte
  and nobody should download that at a court to print eight rounds.
- **Heavily tested.** Around 60 test files covering the scheduler, the merge
  logic, the PDF parity, the sync, and full headless walkthroughs of the real
  app.

**The commercial consequence:** marginal cost per user is close to zero, and
stays that way. Pricing does not have to cover infrastructure. It has to be
about what the product is worth to the person organising the session.

---

## 9. What it costs to run today

Nothing. Not by luck, by structure.

- **Vercel Hobby has no billing cycle.** Exceed an allowance and the feature
  stops until it refills. There is no invitation to pay to keep going.
- **Supabase Free states that it does not charge.** Exceed a limit and you get
  an email, then a grace period, then requests are refused.
- **Sentry Developer** drops events past 5,000 a month rather than billing. The
  14-day Business trial at signup is a conversion nudge, not a bill: it falls
  back to Developer automatically. Do not enter a card.

Measured 2026-08-09: 10.7 MB of the 500 MB database allowance, and only 224 KB
of that is app data. That works out to roughly **75 KB per account**, so the
free database allowance alone holds several thousand of them.

### The real risks, in order

1. **Downtime, not money.** Vercel's harshest failure is that blowing the
   monthly traffic allowance takes the site down for the rest of the month, with
   no way to buy out of it in the moment. The escape is upgrading in advance.
2. **Underuse, not overuse.** Supabase pauses a free project that sees too
   little database activity across seven days. Sign-in, sync and the backup
   script stop together.
3. **The sign-in email ceiling.** Supabase caps the project at 30 emails an
   hour. A busy enough hour leaves people staring at a code that never arrives.
   There is a kill switch, `ACCOUNTS_ENABLED`, that hides accounts entirely
   without a rollback, because the app has always worked without one.

---

## 10. The cost of charging anything

This is the number that shapes every pricing decision, and it is easy to miss.

**Vercel Hobby is restricted to non-commercial use.** Donations are explicitly
allowed, and Vercel's own documentation says so: "Asking for Donations does not
fall under commercial usage." The Ko-fi panel links out, so no money moves on a
Vercel-hosted page.

**The day the app charges anyone for anything, Vercel Pro at $20/month becomes
required.** So the first dollar of revenue costs $240 a year.

| Cost | When it starts | Per year |
|---|---|---|
| Vercel Pro | The day anything is charged | $240 |
| Apple Developer Program | Only for the App Store | $99 |
| Google Play | One-time $25 | negligible |
| Supabase Pro | At 70% of any allowance, or the second inactivity pause | $300 |

**Break-even, web only, at $25 a year per host:** roughly **10 paying hosts**
after Stripe fees. Add the App Store and it is about 16. Add Supabase Pro and it
is about 30.

Thirty paying hosts is a low bar in absolute terms, and a high one against three
accounts and no marketing. **The binding constraint today is audience, not
monetisation.** Charging before there is anyone to charge optimises the wrong
thing, and it costs $240 a year to do it.

---

## 11. What already exists pointing at subscriptions

- The `profiles` table already carries **`subscription_status`** (defaulting to
  `'free'`), **`plan`**, and **`current_period_end`**. They are reserved, unused,
  and waiting.
- **Stripe is the intended processor** for the web, chosen so card data is never
  touched by this app.
- **Ko-fi donations** are live in the Settings menu today. This is the only
  money surface that exists.
- Nothing in the app is gated. Every feature described above is available to
  everyone, and most of it without an account.

### The principle that keeps billing sane across channels

**Entitlement lives in the database, keyed to the account, not the platform.**
Supabase is the brain. Web, iOS and Android are doors into the same house, with
the same accounts and the same data. However somebody pays, the backend flips
one row to premium.

That means launching on Stripe now throws nothing away. A subscriber who later
downloads the app logs in and is already premium. New App Store users subscribe
through Apple, and land in the same column.

| Channel | Take |
|---|---|
| Web, Stripe | about 2.9% + 30 cents |
| iOS | 30% year one, 15% after, or **15% flat under the Small Business Program** (under $1M a year) |
| Android | similar to Apple |

**Tool worth knowing:** RevenueCat handles subscriptions across all three
platforms with one integration, free under about $2,500 a month of tracked
revenue, and it works with Capacitor.

**Canada caveat.** US apps can now use external "subscribe on our website" links
at 0% commission after Epic v. Apple, but that is the US storefront only.
Canadian iOS users fall under standard In-App Purchase rules. This is also in
flux: a December 2025 ruling may let Apple charge a fee on external links.

---

## 12. The competition

**Established apps in the space:**

- **Dink!** Schedule, RSVP and round robin. Free with in-app purchases. Groups,
  live scoring, substitutions, notifications. The most complete competitor.
- **DinkDrop Round Robin.** Free with in-app purchases. Offline, no login.
  Rankings and win rates.
- **Pickleheads.** Their round robin tool is exclusive to their mobile app, and
  well reviewed.
- **Robin Pickleball.** Singles and doubles, brackets and round robin.

**And a shovelware factory.** One developer (Tradein IT) has published a dozen
near-identical apps: "Pickleball Round Robin", "Round robin generator",
"Pickleball Mixer & Scheduler" and more. Their flagship has too few ratings to
display a score.

### What this means

- **Free with in-app purchase is the established pattern.** Nobody in this space
  charges at the door. A paid-only app would be fighting the category.
- **Every obvious descriptive name is claimed.** Going brandable is the only
  route left, and out-keywording a shovelware factory is not a strategy.
- **The competition is shallow.** Thin apps with little real usage.
- **Cross-device sync is a genuine differentiator.** The competitors are
  offline and no-login, which means a host who changes phone starts over. The
  Supabase account work is the thing they do not have.
- **The scheduler quality is the other one**, and it is invisible until you use
  it. Nobody markets a cost function. What a host notices is that they played
  with different people and did not sit out twice in a row.

---

## 13. Distribution, and the name

### Today: the web

A PWA that installs to the home screen. No store, no review, no cut, ships in
minutes. This is the whole of distribution right now.

### Next: the app stores, via Capacitor

**No rebuild needed.** Capacitor wraps the existing React app in a native shell
and produces both iOS and Android builds from one codebase. React, Supabase and
Sentry code stays as it is. Effort is a few days to a couple of weeks, mostly
configuration and the submission process. Avoid cheap wrapper services (Median,
WebViewGold), which carry a high rejection risk, and avoid a React Native
rewrite, which is unnecessary here.

**The rejection risk to design against** is Apple's Guideline 4.2. The reviewer
asks one question: why does this need to be an app instead of a bookmark? Three
answers count, and this app either has or nearly has all three:

1. **Push notifications.** The strongest signal, and the one websites cannot do
   on iOS. Does not exist yet. "The schedule is up" to a whole group is a real
   feature, not a checkbox.
2. **Offline functionality.** Already there. The round robin logic is entirely
   client-side.
3. **Account-based cloud sync.** Already there.

An icon and a splash screen loading the website does not count.

### The name

The App Store listing name must be **globally unique** across the entire store,
exact match, first come first served, 30 characters. The home screen name does
not need to be unique. iOS gives 160 indexed characters total: 30 for the name,
30 for the subtitle, 100 for the keyword field. The strategy that works is a
short brandable name plus a keyword-loaded subtitle, because Apple penalises
keyword stuffing in names anyway.

**Candidate: Roundrobinator.** Search results are clean, with no app, company,
product or website using it. Fifteen characters. Coined, so trademark-safe and
ownable. The tradeoff is that it does not contain "pickleball", so sport search
traffic has to come from the subtitle and keywords. Suggested subtitle:
"Pickleball Round Robin Maker".

**Still to verify:** the domain on Namecheap or Porkbun (.com, .app, .ca), the
App Store name in App Store Connect, which is authoritative and instant, and a
trademark check at CIPO and USPTO TESS. Low risk on a coined word. Grabbing the
domains is cheap and time-sensitive.

**The cost of renaming** is not zero. The brand today is spread across
pbroundrobin.com, the app subdomain, jeff@pbroundrobin.com, ko-fi.com/pbroundrobin,
the manifest, fifteen og: tags, the privacy policy and the terms. It is a day of
work, and it is much cheaper now than after a launch.

---

## 14. Candidate tiers: a starting position to argue with

This is a read, not a decision. It assumes the buyer is the volunteer host
paying out of their own pocket, which is the answer given.

### The constraint everything else has to respect

The app's reputation is "free, no ads, no account needed", and that sentence is
in the manifest, the og: tags and the instructions. **The core loop must stay
free forever:** add players, set up a session, generate a schedule, run it,
print it. A host who arrives on a Tuesday morning with a phone and twenty people
must reach a working schedule without paying and without signing in. Break that
and you are just another thin app in a category full of them.

So the question is not "what do we take away". It is **what do we add that a
frequent host wants and a once-a-month host does not miss.**

### Free, forever

Everything in sections 3 and 4. The whole scheduler. Print and PDF. Import and
export, because gating your users' own data is hostile and it is also the
escape hatch that makes the free promise credible. One or two groups. Guest
mode with no account.

**And live session sharing.** The temptation is to gate it, because it requires
sign-in and touches the server. Resist it. It is the only growth loop in the
product, and twenty people scanning a QR code is the cheapest marketing this app
will ever get. Gating it charges the host for the privilege of advertising for
you.

### Paid, candidates in rough order of how well they fit

1. **Unlimited groups.** Free gets two. The host with one Tuesday crowd never
   notices. The host running five sessions a week is exactly the person getting
   the most value and the most obvious candidate to pay. It is a clean,
   explicable line that costs nothing to enforce.
2. **Push notifications to a group.** "The schedule is up." Does not exist yet.
   Genuinely useful, needs the native shell, and doubles as the Guideline 4.2
   answer. Probably the strongest single reason to build the app store version.
3. **History across sessions.** Standings, records and who-played-whom carried
   across weeks rather than reset each session. Does not exist yet. It is the
   feature a serious organiser asks for and a casual one never thinks about.
4. **Cross-device sync.** Real running cost, and a genuine differentiator
   against every competitor. The argument against gating it: it is also the
   thing that makes accounts worth having at all, and accounts are what make
   everything else possible. Consider keeping sync free and charging for what
   sits on top of it.

### Shape and price

**Annual, not monthly.** A host thinks in seasons, sessions are weekly, and an
annual charge dodges twelve 30-cent Stripe fees and most of the churn.

**Somewhere around $20 to $30 a year** is the range the category and the buyer
suggest. It is below the threshold where a volunteer stops to think, and 30
subscribers covers every fixed cost including the App Store and Supabase Pro.

**Keep Ko-fi.** It costs nothing, it is already live, and some people would
rather tip than subscribe.

### The sequencing argument

Nothing above should be built before there is an audience. The order that makes
sense is: **launch kit and landing page, then analytics so you know what people
actually do, then a paid tier aimed at whatever the analytics says the frequent
hosts are doing.** Building tiers against three accounts is guessing.

---

## 15. What is deliberately not there

Useful to know before designing around it.

- No password login, ever.
- No advertising anywhere.
- No player-facing identity. Players are names in a host's list, not users.
- No leagues, ladders, or season-long standings. Standings are per session.
- No court booking, no payments between players, no attendance tracking.
- No social features. Live sharing is read-only and unnamed.
- No push notifications.
- No router. The app has no URLs for internal screens, which is why the privacy
  policy and terms are separate static files.

---

## 16. State of play

Work is tracked in `launch-checklist.md`, ordered by risk. Current status:

**Done.** Name clearance. Domain pointed. Backups. Billing caps understood. RLS
proven with two accounts. Row caps. Error monitoring. Delete my account and
download my data. Privacy policy. Terms of service. Accounts and cross-device
sync, all phases. Guest mode. Share previews. The accounts kill switch.

**Outstanding, growth tier:**
- A monitored support address and a short FAQ
- Product analytics at the event level, beyond traffic
- An onboarding pass, timed against a real stranger reaching a working schedule,
  target under sixty seconds
- An invite flow, so a host pulls their whole playing group in rather than
  typing it
- A landing page at the apex domain, replacing the redirect
- The launch kit: one-line pitch, one paragraph, screenshots, a short recording,
  and the list of places to post

**Outstanding, only if subscriptions happen:**
- Stripe payments, including failed payments, cancellations and refunds
- Tax. GST and HST here, sales tax elsewhere. Stripe Tax automates most of it,
  and it is easier to set up before revenue than after

**Known usage:** three accounts as of 2026-08-09. This has not been marketed.

---

## 17. Open questions

Carried here so they are not mistaken for settled.

1. **When to rename, if at all.** Roundrobinator is clean and available, and
   renaming gets more expensive every week. But the domains are unverified and
   the current brand is already spread across a dozen places.
2. **Whether to gate sync.** It is the differentiator and it has a real cost,
   but it is also what makes an account worth having, and accounts are the
   foundation of everything paid.
3. **Whether clubs are a second product.** The answer given is that the
   volunteer host is the buyer, and nothing today speaks to a venue running many
   sessions with several organisers. Worth revisiting only if hosts start asking.
4. **What the app knows about its users, which is almost nothing.** Traffic-level
   analytics only. No event tracking, so no data on where people drop off, how
   many sessions get generated, or how large a typical group is. Every tier
   decision above is a guess until this exists.
5. **Whether the app stores are worth it at all.** They cost $99 a year, a
   review process, a 15% cut and a push notification feature built to satisfy a
   reviewer. The PWA already installs to a home screen. The counter-argument is
   that the App Store is where people actually look for a pickleball app, and
   every competitor listed in section 12 is there.

---

## 18. Voice

Worth matching in anything written for this product. The app's copy is plain,
short, and never oversells. It tells the truth about limits rather than hiding
them: "You need at least 4 players", "the home screen copy starts empty",
"this app is free; if you'd like to chip in". No exclamation marks, no
marketing register, no feature words like "powerful" or "seamless". The tagline
in the manifest is the whole tone: **"Build fair pickleball round robins in
seconds. Free, no ads, and no account needed."**
