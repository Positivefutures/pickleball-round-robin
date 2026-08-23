import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BallIcon,
  ChevronLeftIcon,
  StepPlayersIcon,
  StepScheduleIcon,
  StepSetupIcon,
  ShuffleIcon,
  SyncDevicesIcon,
  TipIcon,
} from '../icons';
import { ShareSessionIcon } from '../schedule/actionIcons';
import { SHOTS } from './instructionShots';
import { APP_NAME } from '../../lib/appInfo';

interface Props {
  onClose: () => void;
}

/**
 * The manual, as a list of topics.
 *
 * Tap a topic, read a short page about it, come back. Nobody reads a manual
 * front to back, so the front page is the index, and each chapter carries a
 * Next link for the few who do.
 *
 * The pictures are real screenshots of the app running a fictional demo group,
 * regenerated in one command by scripts/instructions-shots.mjs. If the UI
 * changes, rerun the script rather than letting the manual drift.
 */

type ChapterId =
  | 'quick-start'
  | 'players'
  | 'setup'
  | 'schedule'
  | 'actions'
  | 'share'
  | 'account'
  | 'settings'
  | 'know';

interface Chapter {
  id: ChapterId;
  title: string;
  note: string;
  icon: ReactNode;
}

/** The ☰ the Settings chapter is about. Drawn here; icons.tsx has no menu. */
function MenuGlyph({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

const ICON = 'h-7 w-7 text-brand-teal';

const CHAPTERS: Chapter[] = [
  {
    id: 'quick-start',
    title: 'Quick start',
    note: 'A schedule in under a minute',
    icon: <BallIcon className={ICON} />,
  },
  {
    id: 'players',
    title: '1. Players & groups',
    note: 'Add people, ratings, and groups',
    icon: <StepPlayersIcon className={ICON} />,
  },
  {
    id: 'setup',
    title: '2. Set up the session',
    note: 'Courts, rounds, partners, formats',
    icon: <StepSetupIcon className={ICON} />,
  },
  {
    id: 'schedule',
    title: '3. Run the schedule',
    note: 'Rounds, swaps, scores, standings',
    icon: <StepScheduleIcon className={ICON} />,
  },
  {
    id: 'actions',
    title: 'Mid-session changes',
    note: 'The Actions button, card by card',
    icon: <ShuffleIcon className={ICON} />,
  },
  {
    id: 'share',
    title: 'Share the session live',
    note: 'A QR code everyone can watch',
    icon: <ShareSessionIcon className={ICON} />,
  },
  {
    id: 'account',
    title: 'Your account & sync',
    note: 'One account, all your devices',
    icon: <SyncDevicesIcon className={ICON} />,
  },
  {
    id: 'settings',
    title: 'The settings menu',
    note: 'Everything behind the ☰ button',
    icon: <MenuGlyph className={ICON} />,
  },
  {
    id: 'know',
    title: 'Good to know',
    note: 'How the app thinks',
    icon: <TipIcon className={ICON} />,
  },
];

function Shot({ name, alt, caption }: { name: string; alt: string; caption?: string }) {
  const size = SHOTS[name];
  return (
    <figure className="my-4">
      <img
        src={`/instructions/${name}.webp`}
        alt={alt}
        width={size.width}
        height={size.height}
        loading="lazy"
        className="h-auto w-full rounded-xl border border-gray-200 bg-gray-50 shadow-sm"
      />
      {caption && (
        <figcaption className="mt-1.5 text-center text-sm text-gray-500">{caption}</figcaption>
      )}
    </figure>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <h4 className="pt-2 font-semibold text-gray-800">{children}</h4>;
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-gray-600">{children}</p>;
}

// A labelled line: the thing you tap, then what it does.
function Item({ term, children }: { term: string; children: ReactNode }) {
  return (
    <p className="text-gray-600">
      <span className="font-semibold text-gray-800">{term}</span> — {children}
    </p>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
      {children}
    </p>
  );
}

// ------------------------------------------------------------- the chapters --

function QuickStart() {
  return (
    <>
      <ol className="ml-5 list-decimal space-y-1 text-gray-600 marker:font-semibold marker:text-gray-800">
        <li>Add everyone on the <strong>1. Players</strong> tab.</li>
        <li>Tap <strong>Continue to Setup</strong>. Set your courts and rounds.</li>
        <li>Tick who actually showed up.</li>
        <li>Tap <strong>Generate Schedule</strong> and play.</li>
      </ol>
      <Tip>
        You need at least 4 players. Courts hold 4, but you can be two short: three courts
        wants 12 and will run on 10, with the last court playing a 2v1 or a game of singles.
      </Tip>
      <Shot
        name="quick-schedule"
        alt="A generated schedule: Round 1 with two courts, each showing two teams"
        caption="The result: every round, court by court."
      />
    </>
  );
}

function Players() {
  return (
    <>
      <Sub>Adding someone</Sub>
      <P>
        Type a name, set their rating with − and + (3.0 to 5.0), pick M or F, then tap
        Add Player. Rating and gender are what the app uses to even out the teams.
      </P>
      <Shot
        name="players"
        alt="The group list: names with gender, rating, and a pencil on each row"
        caption="Tap a row to tick someone. The pencil opens them."
      />
      <Sub>Changing someone</Sub>
      <P>
        Tap the pencil at the end of a player's row. Their name, rating, gender and
        groups are all in there. Tapping the row itself ticks them instead.
      </P>
      <P>
        To take somebody out of a group, open them with the pencil and untick it. If
        it's the only group they're in, you'll be asked whether to delete them from
        the app entirely.
      </P>
      <Shot
        name="player-edit"
        alt="The Edit Player dialog: name, rating, gender, and group checkboxes"
        caption="One player, everything about them."
      />
      <Sub>Groups</Sub>
      <Item term="My Groups">switches between your groups.</Item>
      <Item term="Manage">adds, renames, and deletes groups.</Item>
      <Item term="Show All Players">
        lists everybody in the app rather than this group, so you can find a player
        without going looking for the group they're in.
      </Item>
      <Item term="Add to Another Group">
        tick several people in the list, then put them all in another group at once.
      </Item>
      <Tip>
        One person can be in as many groups as you like — a Tuesday crowd and a weekend
        crowd can share players without typing anyone twice.
      </Tip>
    </>
  );
}

function Setup() {
  return (
    <>
      <Sub>Courts and rounds</Sub>
      <P>
        Set how many courts you have and how many rounds to play. Everything under
        these two follows from them.
      </P>
      <Sub>Who's playing</Sub>
      <P>
        Tick everyone who turned up. Select All and Deselect All are there for a fast
        start, and the <strong>Spots Filled</strong> line above the names says how many
        people the courts hold and how many will sit out each round.
      </P>
      <Shot
        name="setup"
        alt="The Setup page: courts, rounds, Keep Score, and Set Round Types"
        caption="The whole session on one page."
      />
      <Sub>Keep Score?</Sub>
      <P>
        Switch it on and every court gets a scoreboard. The scores you write down feed
        a standings table under the schedule.
      </P>
      <Sub>Set Partners</Sub>
      <P>
        For couples who want to play together all session. Tap one player, then tap
        their partner. Pairs are listed above the player list; tap the broken-link icon
        to split one up.
      </P>
      <Shot
        name="partners"
        alt="Set Partners: one linked pair listed above the player list"
        caption="A pair stays a team for the whole session."
      />
      <Sub>Round types</Sub>
      <P>
        <strong>Set Round Types</strong> opens a list with a row for every round. Tap
        the pill on a row to choose what that round is played as:{' '}
        <strong>Gendered</strong> (men against men, women against women),{' '}
        <strong>Mixed</strong> (a man and a woman on each team) or{' '}
        <strong>Equal Skill</strong> (grouped by rating). Rows left on{' '}
        <strong>Normal</strong> are an ordinary round robin.
      </P>
      <P>
        Drag a row by its handle to move a type to a different round, and press Done
        when the list reads the way you want the afternoon to go. The ⓘ beside the
        title explains the formats without setting any of them.
      </P>
      <P>
        A special round beats Set Partners, but only where it has to. A pair is split
        for that round alone if they do not suit the format, then they are back
        together.
      </P>
      <P>
        Changing this once the session is under way rebuilds every round still to be
        played. The rounds already done are marked <strong>DONE</strong> in the list
        and keep their games and scores.
      </P>
      <Shot
        name="round-types"
        alt="The Set Round Types list: a row per round, each with a pill naming its format"
        caption="One row per round, and one tap to set it."
      />
    </>
  );
}

function Schedule() {
  return (
    <>
      <P>
        Each round shows every court, its two teams, and a <strong>Diff</strong> badge
        — the rating gap between the teams. Green is an even match, red is lopsided.
      </P>
      <Shot
        name="round-card"
        alt="A round card: courts with scoreboards, team names, Diff badges, and padlocks"
        caption="One round. The scoreboards appear when Keep Score is on."
      />
      <Item term="COURT 1">
        tap the heading to set the number your centre gave you. It changes that round
        and every round after it.
      </Item>
      <Item term="Complete">
        tick it as each round finishes; the round collapses out of the way.
      </Item>
      <Item term="Swap two players">tap one player, then tap the other.</Item>
      <Item term="Padlock">
        keeps a pair together, then <strong>Reshuffle</strong> rebuilds everything else
        around them. Tap either name to reach their pencil without undoing it.
      </Item>
      <Item term="Player Summary">
        at the bottom: games played, and who has partnered or played against whom.
      </Item>
      <Item term="Printer button, top right">
        print or save a PDF — a clean sheet to post by the courts.
      </Item>
      <Sub>Scores</Sub>
      <P>
        With <strong>Keep Score?</strong> on, tap the scoreboard on any court. The pad
        holds every score a game is won by, and Clear starts the entry over.
      </P>
      <Shot
        name="keypad"
        alt="The score pad for one court, with both teams named and a Save button"
        caption="Tap a court's scoreboard to open its pad."
      />
      <Sub>Standings</Sub>
      <P>
        The table lives under the rounds: wins, losses, point difference, and points
        scored, updated as results go in.
      </P>
      <Shot
        name="standings"
        alt="The Standings table: players ranked with wins, losses, Diff, and points"
        caption="Standings build themselves from the scores."
      />
      <Tip>
        Rounds you've already marked complete are never rewritten — they stay exactly
        as they were played.
      </Tip>
    </>
  );
}

function Actions() {
  return (
    <>
      <P>
        The <strong>Actions</strong> button sits above the schedule. Real sessions
        drift: somebody leaves, a friend turns up, a court frees up. Every fix is a
        card on this sheet.
      </P>
      <Shot
        name="actions"
        alt="The Actions sheet: nine cards including Add Player, Reshuffle, and Share Session"
        caption="Every mid-session change, one sheet."
      />
      <Item term="Add Player">brings somebody from the group into the session.</Item>
      <Item term="Remove Player">
        takes somebody out of the rounds still to play. Tap a player on the
        schedule instead to sub somebody in for them.
      </Item>
      <Item term="Add Guest">
        somebody playing today only. Guests are never saved to the group.
      </Item>
      <Item term="Share Session">
        puts the session on everyone's phone. It has a chapter of its own.
      </Item>
      <Item term="Reshuffle">rebuilds the rounds you haven't played yet.</Item>
      <Item term="New Round Robin">
        clears the schedule but keeps the same crowd selected for the next one.
      </Item>
      <Item term="Add Round">
        one more round, planned around the games already scheduled.
      </Item>
      <Item term="Add / Remove Court">
        a court opened up, or the centre took one back.
      </Item>
      <Tip>
        Whatever you change, rounds already marked complete are left alone. Only the
        rounds still to play are rebuilt.
      </Tip>
    </>
  );
}

function Share() {
  return (
    <>
      <P>
        Open <strong>Actions</strong>, then <strong>Share Session</strong>. The
        app makes a link and a QR code. Anyone who scans it watches the session on
        their own phone: courts, matchups, and scores as you write them down.
      </P>
      <Shot
        name="share-qr"
        alt="The Share Live Session sheet: a QR code, two switches, the link, and a Stop Sharing button"
        caption="The code, the switches and the link, on one card."
      />
      <P>
        Names, courts and scores are shared. Player ratings are not. Watching needs no
        app and no account, just the link.
      </P>
      <P>
        <strong>Share Standings</strong> starts on. Switch it off and the standings
        table leaves the page they are watching, along with every link to it.
      </P>
      <P>
        The link stops working after 24 hours, and <strong>Stop Sharing</strong> takes
        it down sooner. Sharing needs you signed in, because the session has to be kept
        somewhere the other phones can reach.
      </P>
    </>
  );
}

function Account() {
  return (
    <>
      <P>
        The app works without an account. An account is how your groups survive a lost
        phone, and how a second device gets them.
      </P>
      <Shot
        name="account-signin"
        alt="The My Account panel, signed out, asking for an email address"
        caption="My Account, in the settings menu."
      />
      <Sub>Signing in</Sub>
      <P>
        Type your email and the app sends you a login code. There is no password. New
        here, and the same step creates your account.
      </P>
      <Sub>What syncs</Sub>
      <P>
        Your groups, players and settings follow your account onto any device you sign
        in on. The session being run right now stays on the phone running it — two
        phones both ticking rounds complete is a fight with no winner. Share Live
        Session is how other phones watch.
      </P>
      <Sub>Also in My Account</Sub>
      <Item term="Change My Email Address">moves the account to a new address.</Item>
      <Item term="Download My Data">everything the account holds, as a file.</Item>
      <Item term="Delete Account">
        removes the account and everything synced to it, for good.
      </Item>
    </>
  );
}

function Settings() {
  return (
    <>
      <P>The ☰ button, top right of any screen.</P>
      <Item term="My Account">
        sign in, sync, and everything in the chapter above.
      </Item>
      <Item term="Add to Home Screen">
        keeps the app one tap away and opens it full screen.
      </Item>
      <Item term="Share App">
        sends a link to the app however you normally share — text, email, AirDrop.
      </Item>
      <Item term="Settings">
        font size, the rating new players start at, and what a court card shows: the
        ratings beside each name, the Diff pill, and the gender marks on Gendered and
        Mixed rounds. These stay on the device you set them on.
      </Item>
      <Item term="Import / Export Groups">
        saves a group as a spreadsheet file, or loads one in. Importing always creates
        a new group; players you already have join it rather than being duplicated.
      </Item>
      <Item term="Donate">
        this app is free; if you'd like to chip in, this opens my Ko-fi page.
      </Item>
      <Item term="Suggest a Feature / Report a Bug">
        sends your message from inside the app. Bug reports carry your app version and
        browser — never any player details.
      </Item>
    </>
  );
}

function Know() {
  return (
    <>
      <P>
        <strong>Your groups live on this device.</strong> Signed in, they also sync to
        your account and every other device you sign in on. Without an account,
        clearing your browser data clears your groups — use Export to keep a copy.
      </P>
      <P>
        A session survives a refresh, so you can close the tab mid-round robin and come
        back to it.
      </P>
      <P>
        Each group keeps its own session. Switch groups mid-afternoon and the session
        you left is waiting when you switch back. A live share does stop when you
        switch, so start it again if the other group's session was being watched.
      </P>
      <Sub>How the schedule thinks</Sub>
      <P>
        The schedule keeps a set of promises, in order. Sit-outs come first: nobody
        sits twice before everyone has sat once, who opens the bench is luck, and the
        rotation repeats in the order the first cycle set.
      </P>
      <P>
        Partners are next. You team up with someone new every round until you've
        played with everyone available, and never the same person twice running.
        After that comes meeting the whole group, as teammate or opponent.
      </P>
      <P>
        Even games still count, just a little less. The app aims for a small rating
        gap between teams and will stretch it slightly rather than repeat a
        partnership. Whoever missed a special game type goes first when it returns,
        courts lean all-gendered or two-and-two over three-and-one, and the short
        court (2v1 or singles) is passed around like the bench is.
      </P>
    </>
  );
}

const BODY: Record<ChapterId, () => ReactNode> = {
  'quick-start': QuickStart,
  players: Players,
  setup: Setup,
  schedule: Schedule,
  actions: Actions,
  share: Share,
  account: Account,
  settings: Settings,
  know: Know,
};

// ---------------------------------------------------------------- the panel --

export function InstructionsPanel({ onClose }: Props) {
  const [chapterId, setChapterId] = useState<ChapterId | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // A chapter opens at its top, not wherever the last page was left.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [chapterId]);

  const index = CHAPTERS.findIndex((c) => c.id === chapterId);
  const chapter = index >= 0 ? CHAPTERS[index] : null;
  const next = chapter ? (CHAPTERS[index + 1] ?? null) : null;

  return (
    <div className="no-print fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between gap-4 bg-brand-teal px-4 py-2.5 text-white sm:px-6">
        {chapter ? (
          <button
            type="button"
            onClick={() => setChapterId(null)}
            className="-ml-1 flex items-center gap-1 rounded-md px-2 py-1 text-lg font-bold transition-colors hover:bg-white/10"
          >
            <ChevronLeftIcon className="h-5 w-5" strokeWidth={3} />
            All Topics
          </button>
        ) : (
          <h2 className="text-2xl font-bold tracking-tight">Instructions</h2>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border-2 border-white/80 px-3 py-1 font-bold transition-colors hover:bg-white/10"
        >
          Close
        </button>
      </div>

      {/* overscroll-contain: hitting the end here must not scroll the app behind it */}
      <div ref={scroller} className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-2xl">
          {chapter ? (
            <>
              <h3 className="mb-4 flex items-center gap-2.5 text-2xl font-bold text-gray-900">
                {chapter.icon}
                {chapter.title}
              </h3>
              <div className="space-y-3">{BODY[chapter.id]()}</div>
              <div className="mt-8 border-t border-gray-200 pt-4">
                {next ? (
                  <button
                    type="button"
                    onClick={() => setChapterId(next.id)}
                    className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-left transition-colors hover:bg-gray-50"
                  >
                    <span>
                      <span className="block text-sm text-gray-500">Next</span>
                      <span className="block font-bold text-gray-900">{next.title}</span>
                    </span>
                    <ChevronLeftIcon className="h-5 w-5 rotate-180 text-gray-400" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setChapterId(null)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-4 py-3 font-bold text-gray-900 transition-colors hover:bg-gray-50"
                  >
                    <ChevronLeftIcon className="h-5 w-5 text-gray-400" strokeWidth={2.5} />
                    Back to All Topics
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="mb-4 text-gray-600">
                {APP_NAME} builds balanced doubles matchups for a round robin — everyone
                plays with and against different people, and sit-outs are shared out
                evenly. Tap a topic to read about it.
              </p>
              <div className="space-y-2">
                {CHAPTERS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setChapterId(c.id)}
                    className="flex w-full items-center gap-3.5 rounded-lg border border-gray-200 px-4 py-3 text-left transition-colors hover:bg-gray-50"
                  >
                    {c.icon}
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-gray-900">{c.title}</span>
                      <span className="block text-sm text-gray-500">{c.note}</span>
                    </span>
                    <ChevronLeftIcon className="h-5 w-5 shrink-0 rotate-180 text-gray-400" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
