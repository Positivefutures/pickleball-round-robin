import { useState, type ReactElement } from 'react';
import { Example, Finding, Labelled, Row, Section, SubHeading } from '../kit';

import { StepIndicator } from '../../components/layout/StepIndicator';
import type { Step } from '../../lib/steps';
import { RoundTypeBadge } from '../../components/schedule/RoundTypeBadge';
import { LivePill } from '../../components/LivePill';
import { TypeGlyphs } from '../../components/setup/typeGlyphs';
import { ScorePanel, ScoreColon } from '../../components/schedule/Scoreboard';
import { PANEL_TONE, type Tone } from '../../components/schedule/scoreTone';
import { BalanceIndicator } from '../../components/schedule/BalanceIndicator';
import { GenderMark } from '../../components/schedule/GenderMark';
import { ROUND_TYPES, pillMeta } from '../../lib/roundTypes';
import type { Player } from '../../types';
import {
  ROUND_FILL,
  ROUND_EDGE,
  TEAM1_EDGE,
  TEAM2_EDGE,
  ROUND_HEADING_TEXT,
  PLAYER_NAME_TEXT,
} from '../../components/schedule/roundLook';

import { SitOutList } from '../../components/schedule/SitOutList';
import type { SitOutSlot } from '../../components/schedule/SchedulePage';
import { SitOutChooser, type SitOutDraft } from '../../components/setup/SitOutChooser';

import * as appIcons from '../../components/icons';
import * as timerIcons from '../../components/schedule/timerIcons';
import * as actionIcons from '../../components/schedule/actionIcons';

type IconFn = (props: { className?: string }) => ReactElement;

/**
 * Every glyph in a module, read off the module itself.
 *
 * A namespace import rather than a written list, so an icon added tomorrow
 * appears here without anybody remembering to add it — and one that is deleted
 * disappears rather than leaving a broken cell.
 */
function iconsIn(module: Record<string, unknown>): [string, IconFn][] {
  return Object.entries(module)
    .filter(([name, value]) => typeof value === 'function' && /^[A-Z]/.test(name))
    .map(([name, value]) => [name, value as IconFn]);
}

const PLAYER: Player = {
  id: 'demo',
  name: 'Ada Lovelace',
  rating: 4,
  gender: 'F',
  rosterIds: ['demo'],
};

export function Bits() {
  return (
    <>
      <Section
        id="nav"
        title="Navigation"
        blurb="One nav component, with four states per step."
      >
        <StepIndicatorDemo />
        <Finding id="F11">
          <code>StepIndicator</code> carries six colour constants of its own —{' '}
          <code>#f4f5f7</code>, <code>#61697c</code>, <code>#6f768d</code>, <code>#dee1e7</code>,{' '}
          <code>#d3d7de</code>, <code>#fbfbfc</code> — none of them shared with anything else in
          the app.
        </Finding>
      </Section>

      <Section
        id="badges"
        title="Badges, pills and chips"
        blurb={
          <>
            Round types are the one place in the app with a real, named variant table:{' '}
            <code>ROUND_TYPE_META</code> in <code>lib/roundTypes.ts</code>, with{' '}
            <code>pillMeta()</code> handling the <code>null</code> case as a fourth tone.
          </>
        }
      >
        <Example
          name="<RoundTypeBadge type />"
          note="type: 'gendered' | 'mixed' | 'skill'"
          source={`import { RoundTypeBadge } from './RoundTypeBadge';

<RoundTypeBadge type="gendered" />`}
        >
          <Row>
            {ROUND_TYPES.map((t) => (
              <Labelled key={t} label={`type="${t}"`}>
                <RoundTypeBadge type={t} />
              </Labelled>
            ))}
          </Row>
        </Example>

        <Example
          name="pillMeta(type)"
          note="badgeClass + badgeEdgeClass. Pass null for a normal round — it is not a fourth type"
          source={`import { pillMeta } from '../../lib/roundTypes';

const meta = pillMeta(round.roundType);

<span className={\`rounded-full border-2 px-4 py-3 font-bold \${meta.badgeClass} \${meta.badgeEdgeClass}\`}>
  {meta.badge}
</span>`}
        >
          <Row>
            {[null, ...ROUND_TYPES].map((t) => {
              const meta = pillMeta(t);
              return (
                <Labelled key={String(t)} label={`pillMeta(${t === null ? 'null' : `'${t}'`})`}>
                  <span className={`inline-flex items-center rounded-full border-2 px-4 py-2 text-sm font-bold ${meta.badgeClass} ${meta.badgeEdgeClass}`}>
                    {meta.badge}
                  </span>
                </Labelled>
              );
            })}
          </Row>
        </Example>

        <Example
          name="<LivePill onClick? label? text? />"
          note="Green. On a watcher's page it states a fact; on the host's side it is a button that opens Share Live Session"
          source={`import { LivePill } from '../LivePill';

// The watchers' page: nothing to open.
<LivePill />

// The host's side: the tab row, the group picker, Manage Groups.
<LivePill label="This session is live: open Share Live Session" onClick={openShare} />

// Share Live Session, above the code, where it is the whole statement.
<LivePill text="SESSION IS LIVE" />`}
        >
          <Row>
            <Labelled label="no onClick — a span">
              <LivePill />
            </Labelled>
            <Labelled label="onClick — a button">
              <LivePill onClick={() => {}} />
            </Labelled>
            <Labelled label='text="SESSION IS LIVE"'>
              <LivePill text="SESSION IS LIVE" />
            </Labelled>
          </Row>
        </Example>

        <Example
          name="<TypeGlyphs type size />"
          note="size: 'panel' | 'picker' | 'badge'"
          source={`import { TypeGlyphs } from './typeGlyphs';

<TypeGlyphs type="mixed" size="picker" />`}
        >
          <div className="flex flex-col gap-4">
            {(['panel', 'picker', 'badge'] as const).map((size) => (
              <div key={size} className="flex items-center gap-4">
                <code className="w-20 shrink-0 text-[0.75rem] text-slate-500">{size}</code>
                <Row>
                  {ROUND_TYPES.map((t) => (
                    <span key={t} className="flex items-center text-brand-teal">
                      <TypeGlyphs type={t} size={size} />
                    </span>
                  ))}
                </Row>
              </div>
            ))}
          </div>
        </Example>

        <Example
          name="<ScorePanel value tone size active /> + <ScoreColon size />"
          note="tone: 'blank' | 'win' | 'loss' | 'draw' · size: 'sm' | 'lg'"
          source={`import { ScorePanel, ScoreColon } from './Scoreboard';
import { toneFor } from './scoreTone';

<ScorePanel value={11} tone={toneFor(score, 'team1')} size="lg" />
<ScoreColon size="lg" />
<ScorePanel value={7} tone={toneFor(score, 'team2')} size="lg" />`}
        >
          <div className="flex flex-col gap-5">
            {(['lg', 'sm'] as const).map((size) => (
              <div key={size} className="flex flex-wrap items-center gap-5">
                <code className="w-8 shrink-0 text-[0.75rem] text-slate-500">{size}</code>
                {(Object.keys(PANEL_TONE) as Tone[]).map((tone) => (
                  <Labelled key={tone} label={`tone="${tone}"`}>
                    <div className="flex items-center gap-1.5">
                      <ScorePanel value={tone === 'blank' ? undefined : 11} tone={tone} size={size} />
                      <ScoreColon size={size} />
                      <ScorePanel value={tone === 'blank' ? undefined : tone === 'draw' ? 11 : 7} tone={tone} size={size} />
                    </div>
                  </Labelled>
                ))}
              </div>
            ))}
          </div>
        </Example>

        <Example
          name="<BalanceIndicator ratingDiff />"
          note="three unnamed thresholds: ≤0.2 green, ≤0.4 yellow, above that red"
          source={`import { BalanceIndicator } from './BalanceIndicator';

<BalanceIndicator ratingDiff={courtRatingDiff(court)} />`}
        >
          <Row>
            {[0.1, 0.3, 0.8].map((d) => (
              <Labelled key={d} label={`ratingDiff={${d}}`}>
                <BalanceIndicator ratingDiff={d} />
              </Labelled>
            ))}
          </Row>
        </Example>

        <Example
          name="<GenderMark player />"
          note="absolute left-0 — it must have a positioned parent, which is the player's box"
          source={`import { GenderMark } from './GenderMark';

{/* GenderMark is absolutely positioned and hangs off the left edge of the seat.
    The parent must be \`relative\` or it escapes to the page. */}
<div className={\`relative rounded-md border px-3 py-2 \${TEAM1_EDGE}\`}>
  <GenderMark player={player} />
  <span className={PLAYER_NAME_TEXT}>{player.name}</span>
</div>`}
        >
          <div className="flex flex-col gap-2.5" style={{ maxWidth: '18rem' }}>
            <div className={`relative rounded-md border bg-blue-50 px-3 py-2 ${TEAM1_EDGE}`}>
              <GenderMark player={PLAYER} />
              <span className={`${PLAYER_NAME_TEXT} font-bold`}>Ada Lovelace</span>
            </div>
            <div className={`relative rounded-md border bg-orange-50 px-3 py-2 ${TEAM2_EDGE}`}>
              <GenderMark player={{ ...PLAYER, name: 'Alan Turing', gender: 'M' }} />
              <span className={`${PLAYER_NAME_TEXT} font-bold`}>Alan Turing</span>
            </div>
          </div>
        </Example>
      </Section>

      <Section
        id="schedule"
        title="Schedule surfaces"
        blurb={
          <>
            The round card and the courts on it are painted from{' '}
            <code>schedule/roundLook.ts</code>, which exists so that the host's card and a watcher's
            card cannot drift apart. The constants are shown on the real fill below.
          </>
        }
      >
        <Example
          name="ROUND_FILL · ROUND_EDGE · TEAM1_EDGE · TEAM2_EDGE"
          note="the card, its 2px line, and one edge colour per side of a court"
          source={`import { ROUND_FILL, ROUND_EDGE, TEAM1_EDGE, TEAM2_EDGE, ROUND_HEADING_TEXT, PLAYER_NAME_TEXT } from './roundLook';

<div className="rounded-lg border-2 p-3" style={{ backgroundColor: ROUND_FILL, borderColor: ROUND_EDGE }}>
  <h3 className={\`\${ROUND_HEADING_TEXT} font-extrabold text-white\`}>ROUND 3</h3>
  <div className={\`rounded-md border bg-blue-50 \${TEAM1_EDGE}\`}>
    <span className={PLAYER_NAME_TEXT}>Ada Lovelace</span>
  </div>
</div>`}
        >
          <div
            className="max-w-md rounded-lg border-2 p-3"
            style={{ backgroundColor: ROUND_FILL, borderColor: ROUND_EDGE }}
          >
            <h3 className={`${ROUND_HEADING_TEXT} font-extrabold text-white`}>ROUND 3</h3>
            <div className="mt-2 rounded-md border-2 bg-white p-2" style={{ borderColor: ROUND_EDGE }}>
              <div className={`${ROUND_HEADING_TEXT} font-extrabold text-gray-800`}>COURT 1</div>
              <div className="mt-2 flex flex-col gap-1.5">
                <div className={`rounded-md border bg-blue-50 px-3 py-2 ${TEAM1_EDGE}`}>
                  <span className={`${PLAYER_NAME_TEXT} font-bold`}>Ada Lovelace</span>
                </div>
                <div className={`rounded-md border bg-orange-50 px-3 py-2 ${TEAM2_EDGE}`}>
                  <span className={`${PLAYER_NAME_TEXT} font-bold`}>Grace Hopper</span>
                </div>
              </div>
            </div>
          </div>
        </Example>

        <div>
          <SubHeading>Swap animations</SubHeading>
          <p className="mt-1.5 max-w-2xl text-[0.875rem] leading-relaxed text-slate-600">
            <code>.seat-swapped</code> lights a place up whole — edge and fill together — and lets
            it fade back over two seconds. Both{' '}
            <code>--seat-swapped-from</code> and <code>--seat-swapped-fill</code> must be handed in,
            because <code>var()</code> with nothing behind it invalidates the whole declaration.
            Press the button to replay it.
          </p>
          <SwapDemo />
        </div>

        <Example
          name="<SitOutList lockedIds pencilSlot onLockedTap onToggleLock />"
          note="the sit-out lock: a padlock under each name, shut and black-edged when locked. Tap a locked name for its pencil; it offers no swap"
          source={`import { SitOutList } from './SitOutList';

<SitOutList
  players={round.sitOuts}
  roundIdx={roundIdx}
  lockedIds={round.lockedSitOutIds}
  pencilSlot={pencilSlot?.kind === 'sitout' ? pencilSlot : null}
  onLockedTap={onLockedTap}
  onToggleLock={onToggleSitOutLock}
  …
/>`}
        >
          <SitOutLockDemo />
        </Example>
      </Section>

      <Section
        id="choose-sit-outs"
        title="Choose Sit-Outs"
        blurb={
          <>
            The page between Setup and the schedule when the switch over the player list is on.
            A <strong>sit-out slot</strong> per seat on each round&rsquo;s bench: dashed when
            empty, the Select Players box with a bin when filled. The picker is a panel on the
            same edge as every dialog.
          </>
        }
      >
        <Example
          name="<SitOutChooser players numRounds seats draft onChange onBack onGenerate />"
          note="two rounds, two seats, one slot filled. Tap an empty slot for the picker"
          source={`import { SitOutChooser } from './SitOutChooser';

<SitOutChooser
  players={generatePlayers}
  numRounds={numRounds}
  seats={sitOutSeats(selectedIds.length, numCourts)}
  draft={draft}
  onChange={setDraft}
  onBack={back}
  onGenerate={(pins) => onGenerate(pins)}
/>`}
        >
          <SitOutChooserDemo />
        </Example>
      </Section>

      <Section
        id="icons"
        title="Icons"
        blurb={
          <>
            67 glyphs across three modules, listed by reading the modules themselves rather than
            from a written list. Colour always comes from the text beside them —{' '}
            <code>currentColor</code> — and both wrappers set <code>aria-hidden</code>. Size is
            passed per call, not baked in.
          </>
        }
      >
        <IconGrid title="components/icons.tsx" subtitle="56 glyphs · the main set" module={appIcons} />
        <IconGrid title="components/schedule/timerIcons.tsx" subtitle="11 glyphs · default className is w-4 h-4" module={timerIcons} />
        <IconGrid title="components/schedule/actionIcons.tsx" subtitle="3 glyphs · badged, ringing their corner disc in --chip-tint" module={actionIcons} />

        <Finding id="F9">
          <code>components/schedule/icons.tsx</code> exports a fourth <code>TrashIcon</code> with
          completely different artwork, and nothing imports it — the whole module is dead. It is not
          shown above for that reason. <code>ReplayIcon</code> exists in two modules and{' '}
          <strong>both are live</strong>: <code>RoundTimerPanel</code> draws the timer one,{' '}
          <code>LiveShareView</code> draws the other.
        </Finding>
        <Finding id="F10" fixed>
          <code>StopSquareIcon</code> was exported and used nowhere. It is now the glyph on both
          Stop keys: the watcher's, which silences an alarm the host has not reached yet, and the
          host's own, which since 2026-08-21 is the single tile a ringing timer is answered with.
        </Finding>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ demos */

function StepIndicatorDemo() {
  const [current, setCurrent] = useState<Step>('setup');
  return (
    <Example
      name="<StepIndicator current available answering onNavigate />"
      note="press a tab — this is the live control, wired to local state"
      source={`import { StepIndicator } from './StepIndicator';

<StepIndicator
  current={step}
  available={['roster']}          // steps you can go back to — never includes current
  answering={['schedule']}        // pressable, but drawn shut. Generate is the only way on
  onNavigate={setStep}
/>`}
    >
      <div className="max-w-md">
        <StepIndicator
          current={current}
          available={current === 'roster' ? [] : ['roster']}
          answering={['schedule']}
          onNavigate={setCurrent}
        />
      </div>
    </Example>
  );
}

function SwapDemo() {
  const [key, setKey] = useState(0);
  return (
    <div className="mt-3 flex flex-col items-start gap-3">
      <div
        key={key}
        className={`seat-swapped rounded-md border bg-blue-50 px-3 py-2 ${TEAM1_EDGE}`}
        style={
          {
            '--seat-swapped-from': '#0E3E5D',
            '--seat-swapped-fill': 'var(--color-blue-100)',
          } as React.CSSProperties
        }
      >
        <span className={`${PLAYER_NAME_TEXT} font-bold`}>Ada Lovelace</span>
      </div>
      <button
        type="button"
        onClick={() => setKey((k) => k + 1)}
        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[0.75rem] font-bold text-slate-700 transition-colors hover:bg-slate-100"
      >
        Replay the Swap
      </button>
    </div>
  );
}

const noop = () => {};

const DEMO_BENCH: Player[] = [
  { id: 'd1', name: 'Ada Lovelace', rating: 4.0, gender: 'F', rosterIds: [] },
  { id: 'd2', name: 'Grace Hopper', rating: 3.5, gender: 'F', rosterIds: [] },
  { id: 'd3', name: 'Alan Turing', rating: 4.5, gender: 'M', rosterIds: [] },
];

function SitOutLockDemo() {
  const [locked, setLocked] = useState<string[]>(['d1']);
  const [pencil, setPencil] = useState<SitOutSlot | null>(null);
  return (
    <div
      className="max-w-md rounded-lg border-2 p-3"
      style={{ backgroundColor: ROUND_FILL, borderColor: ROUND_EDGE }}
    >
      <SitOutList
        players={DEMO_BENCH}
        roundIdx={0}
        selectedSlot={null}
        onPlayerTap={noop}
        onOpenPlayerMenu={noop}
        allPlayers={DEMO_BENCH}
        lockedIds={locked}
        pencilSlot={pencil}
        onLockedTap={(slot) =>
          setPencil((p) => (p?.sitOutIdx === slot.sitOutIdx ? null : slot))
        }
        onToggleLock={(_, id) => {
          setPencil(null);
          setLocked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
        }}
      />
    </div>
  );
}

function SitOutChooserDemo() {
  const [draft, setDraft] = useState<SitOutDraft>({ 1: ['d1', null] });
  return (
    <div className="max-w-md">
      <SitOutChooser
        players={DEMO_BENCH}
        numRounds={2}
        seats={2}
        draft={draft}
        onChange={setDraft}
        onBack={noop}
        onGenerate={noop}
      />
    </div>
  );
}

function IconGrid({
  title,
  subtitle,
  module,
}: {
  title: string;
  subtitle: string;
  module: Record<string, unknown>;
}) {
  const entries = iconsIn(module);
  return (
    <div>
      <SubHeading>
        {title} — {entries.length} exported
      </SubHeading>
      <p className="mt-1 text-[0.8125rem] text-slate-500">{subtitle}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {entries.map(([name, Icon]) => (
          <div
            key={name}
            className="flex min-w-0 flex-col items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-3"
          >
            <span className="text-brand-teal">
              <Icon className="h-7 w-7" />
            </span>
            <code className="w-full truncate text-center text-[0.6875rem] leading-tight text-slate-600" title={name}>
              {name}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
}
