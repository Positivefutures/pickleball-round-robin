import type { ReactNode } from 'react';

interface Props {
  onClose: () => void;
}

const CONTENTS = [
  { id: 'instr-quick-start', label: 'Quick start' },
  { id: 'instr-players', label: '1. Players' },
  { id: 'instr-setup', label: '2. Setup' },
  { id: 'instr-schedule', label: '3. Schedule' },
  { id: 'instr-settings', label: 'Settings menu' },
  { id: 'instr-good-to-know', label: 'Good to know' },
];

function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-2 border-t border-gray-200 pt-6">
      <h3 className="mb-3 text-xl font-bold text-gray-900">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
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

export function InstructionsPanel({ onClose }: Props) {
  return (
    <div className="no-print fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between gap-4 bg-brand-teal px-6 py-2.5 text-white">
        <h2 className="text-2xl font-bold tracking-tight">Instructions</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border-2 border-white/80 px-3 py-1 font-medium transition-colors hover:bg-white/10"
        >
          Close
        </button>
      </div>

      {/* overscroll-contain: hitting the end here must not scroll the app behind it */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <p className="text-gray-600">
            This app builds balanced doubles matchups for a round robin — everyone plays
            with and against different people, and sit-outs are shared out evenly.
          </p>

          <nav className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Contents
            </h3>
            <ul className="grid gap-1 sm:grid-cols-2">
              {CONTENTS.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => jumpTo(c.id)}
                    className="text-left font-medium text-green-700 hover:text-green-900 hover:underline"
                  >
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <Section id="instr-quick-start" title="Quick start">
            <ol className="ml-5 list-decimal space-y-1 text-gray-600 marker:font-semibold marker:text-gray-800">
              <li>Add everyone on the <strong>Players</strong> tab.</li>
              <li>Tap <strong>Continue to Setup</strong>. Set your courts and rounds.</li>
              <li>Tick who actually showed up.</li>
              <li>Tap <strong>Generate Schedule</strong> and play.</li>
            </ol>
            <Tip>
              You need at least 4 players. Courts hold 4, but you can be two short:
              three courts wants 12 and will run on 10, with the last court playing
              a 2v1 or a game of singles.
            </Tip>
          </Section>

          <Section id="instr-players" title="1. Players">
            <h4 className="font-semibold text-gray-800">Adding someone</h4>
            <p className="text-gray-600">
              Type a name, set their rating with − and + (3.0 to 5.0), pick M or F, then tap
              Add Player. Rating and gender are what the app uses to even out the teams.
            </p>

            <h4 className="pt-1 font-semibold text-gray-800">Changing someone</h4>
            <p className="text-gray-600">
              Tap a player's row in the list. Their gender and rating are replaced by{' '}
              <strong>Edit</strong> and <strong>Remove</strong> buttons. Tap the row again,
              or anywhere else, to put it back.
            </p>
            <p className="text-gray-600">
              Remove takes a player out of the current group only. If it's the only group
              they're in, you'll be asked whether to delete them from the app entirely.
            </p>

            <h4 className="pt-1 font-semibold text-gray-800">Groups</h4>
            <Item term="My Groups">switches between your groups.</Item>
            <Item term="Manage">adds, renames, and deletes groups.</Item>
            <Item term="Select Players">
              tick several people, then <strong>Add to Group</strong> puts them all in
              another group at once.
            </Item>
            <Tip>
              One person can be in as many groups as you like — a Tuesday crowd and a
              weekend crowd can share players without typing anyone twice.
            </Tip>
          </Section>

          <Section id="instr-setup" title="2. Setup">
            <h4 className="font-semibold text-gray-800">Courts and rounds</h4>
            <p className="text-gray-600">
              Set how many courts you have and how many rounds to play. Watch the{' '}
              <strong>Spots Filled</strong> line: it tells you how many players you need,
              and how many will sit out each round.
            </p>

            <h4 className="pt-1 font-semibold text-gray-800">Who's playing</h4>
            <p className="text-gray-600">
              Tick everyone who turned up. Select All and Deselect All are there for a fast
              start.
            </p>

            <h4 className="pt-1 font-semibold text-gray-800">Set Partners</h4>
            <p className="text-gray-600">
              For couples who want to play together all session. Tap one player, then tap
              their partner. Pairs are listed above the player list; tap the broken-link
              icon to split one up.
            </p>

            <h4 className="pt-1 font-semibold text-gray-800">Special game types</h4>
            <p className="text-gray-600">
              <strong>Select Special Game Types</strong> opens three formats you can drop into
              the session: <strong>Gendered</strong> (men against men, women against women),
              <strong> Mixed</strong> (a man and a woman on each team) and{' '}
              <strong>Equal Skill</strong> (grouped by rating). Say Yes to any of them and
              choose how often it comes round. Everything else stays a normal round robin.
            </p>
            <p className="text-gray-600">
              A special round beats Set Partners, but only where it has to. A pair is split for
              that round alone if they do not suit the format, then they are back together.
            </p>
          </Section>

          <Section id="instr-schedule" title="3. Schedule">
            <p className="text-gray-600">
              Each round shows every court, its two teams, and a <strong>Diff</strong> badge
              — the rating gap between the teams. Green is an even match, red is lopsided.
            </p>
            <Item term="COURT 1">
              tap the heading to set the number your centre gave you. It changes that
              round and every round after it.
            </Item>
            <Item term="Complete">
              tick it as each round finishes; the round collapses out of the way.
            </Item>
            <Item term="Swap two players">tap one player, then tap the other.</Item>
            <Item term="Padlock">
              keeps a pair together, then <strong>Reshuffle</strong> rebuilds everything
              else around them.
            </Item>
            <Item term="Trash icon">
              someone had to leave. The rounds you haven't played yet rebuild around the
              smaller group.
            </Item>
            <Item term="Player Summary">
              at the bottom: games played, and who has partnered or played against whom.
            </Item>
            <Item term="Printer button, top right">
              print or save a PDF — a clean sheet to post by the courts.
            </Item>
            <Item term="New Session">
              clears the schedule but keeps the same crowd selected for the next one.
            </Item>
            <Tip>
              Rounds you've already marked complete are never rewritten — they stay exactly
              as they were played.
            </Tip>
          </Section>

          <Section id="instr-settings" title="Settings menu">
            <p className="text-gray-600">The ☰ button, top right of any screen.</p>
            <Item term="Share App">
              sends a link to the app however you normally share — text, email, AirDrop.
            </Item>
            <Item term="Add to Home Screen">
              keeps the app one tap away and opens it full screen. Note the home screen
              copy starts empty — use Import / Export Group to bring a group across.
            </Item>
            <Item term="Toggle Font Size">bigger text for reading at arm's length.</Item>
            <Item term="Default Player Rating">
              the rating new players start at, so you're not adjusting every time.
            </Item>
            <Item term="Import / Export Group">
              saves a group as a spreadsheet file, or loads one in. Importing always creates
              a new group; players you already have join it rather than being duplicated.
            </Item>
            <Item term="Donate">
              this app is free; if you'd like to chip in, this opens my Ko-fi page.
            </Item>
            <Item term="Suggest a Feature / Report a Bug">
              writes the message for you and opens your email app to send it. Bug reports
              attach your app version and browser — never any player details.
            </Item>
          </Section>

          <Section id="instr-good-to-know" title="Good to know">
            <p className="text-gray-600">
              <strong>Everything is stored on this device only.</strong> No account, no
              sync. Clearing your browser data clears your groups — use Export to keep a
              copy or move a group to another phone.
            </p>
            <p className="text-gray-600">
              A session survives a refresh, so you can close the tab mid-round robin and
              come back to it.
            </p>
            <p className="text-gray-600">
              Switching groups while a session is running clears that session. You'll be
              asked first.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
