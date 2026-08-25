import { useState } from 'react';
import type { Player, Partnership, RoundPlan } from '../../types';
import { PlayerSelector } from './PlayerSelector';
import { PartnerPairing } from './PartnerPairing';
import { PartnerPlayNotice } from './PartnerPlayNotice';
import { PairList } from './PairList';
import { SessionConfig } from './SessionConfig';
import { RoundTypesInfoPanel } from './RoundTypesInfoPanel';
import { LinkIcon, StepSetupIcon } from '../icons';
import { CornerDots } from '../CornerDots';
import { PanelBadge } from '../PanelGlyph';
import { resolvePairs } from '../../lib/partnerships';
import { minPlayersForCourts } from '../../lib/assign';
import { useScrollLock } from '../../hooks/useScrollLock';

interface Props {
  players: Player[];
  selectedIds: string[];
  partnerships: Partnership[];
  numCourts: number;
  numRounds: number;
  roundPlan: RoundPlan;
  /** Rounds already marked complete, which the planner locks. */
  completedRounds: number[];
  scoringEnabled: boolean;
  onScoringChange: (on: boolean) => void;
  onTogglePlayer: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onCreatePartnership: (id1: string, id2: string) => void;
  onRemovePartnership: (id1: string, id2: string) => void;
  /** Breaks every couple at once, the counterpart of Deselect All. */
  onClearPartnerships: () => void;
  onCourtsChange: (n: number) => void;
  onRoundsChange: (n: number) => void;
  /** Done on the round types list: the whole plan, once, from the draft. */
  onPlanCommit: (next: RoundPlan) => void;
  /**
   * The open list's draft, held by App so that Generate — which is on this page,
   * under the list — can build from what the host is looking at.
   */
  planDraft: RoundPlan | null;
  onPlanDraft: (next: RoundPlan | null) => void;
  /**
   * Set when the host has just pressed the Schedule tab, which never takes
   * anybody there. Generate is the only way onto that page, and this is what
   * says so — beside the button, rather than as a dialog in front of the page.
   */
  promptGenerate?: boolean;
  onGenerate: () => void;
}

export function SetupPage({
  players,
  selectedIds,
  partnerships,
  numCourts,
  numRounds,
  roundPlan,
  completedRounds,
  scoringEnabled,
  onScoringChange,
  onTogglePlayer,
  onSelectAll,
  onDeselectAll,
  onCreatePartnership,
  onRemovePartnership,
  onClearPartnerships,
  onCourtsChange,
  onRoundsChange,
  onPlanCommit,
  planDraft,
  onPlanDraft,
  promptGenerate = false,
  onGenerate,
}: Props) {
  const [showError, setShowError] = useState(false);
  const [mode, setMode] = useState<'select' | 'pair'>('select');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  /**
   * Whether the round types list is open.
   *
   * Here rather than in a store, which is what makes "collapsed again when they
   * come back" free: App mounts this page only while the Setup tab is showing,
   * so leaving the tab unmounts it and this goes with it.
   */
  const [plannerOpen, setPlannerOpen] = useState(false);

  // Hold the page still behind the panel, so Setup is exactly where it was
  // when Done closes it. Not for the list, which is inline and has to scroll
  // with the page — sixteen rounds are taller than a phone.
  useScrollLock(infoOpen);

  // Not four a court any more: the last court will play a 2v1 or a game of
  // singles rather than send anybody home. What it will not do is put one person
  // on a court alone, which is where this floor comes from.
  const playersNeeded = minPlayersForCourts(numCourts);
  const canGenerate = selectedIds.length >= playersNeeded;

  // One message, whatever is ticked. It used to ask for four first and then
  // change its mind to fourteen once four were ticked, which is the app
  // sending somebody to do a job and moving the goalposts on them. The floor
  // is the floor from the start.
  const errorMessage = canGenerate
    ? ''
    : `Need at least ${playersNeeded} players for ${numCourts} court${
        numCourts === 1 ? '' : 's'
      } (have ${selectedIds.length})`;

  const selectedPlayers = players.filter((p) => selectedIds.includes(p.id));

  // A couple's halves keep their alphabetical seats on the checkbox grid, in
  // the Partners panel's colours with a link where the checkbox was, and only
  // that panel can break them apart — Jeff's call on 2026-08-25, replacing a
  // morning of pair cells at the head of the grid. Every name in the count is
  // still a box on the page, and a linked box can only be counted in.
  const pairs = resolvePairs(partnerships, selectedPlayers);


  function handleGenerate() {
    if (canGenerate) {
      setShowError(false);
      onGenerate();
    } else {
      setShowError(true);
    }
  }

  function handleToggleMode() {
    setPendingId(null);
    setMode((m) => (m === 'select' ? 'pair' : 'select'));
  }

  // Two-tap pairing: first tap arms a player, second tap links them.
  function handleTapPlayer(id: string) {
    if (pendingId === null) {
      setPendingId(id);
      return;
    }
    if (pendingId === id) {
      setPendingId(null);
      return;
    }
    onCreatePartnership(pendingId, id);
    setPendingId(null);
  }

  // Needs at least two selected players before pairing is meaningful.
  const canPair = selectedIds.length >= 2;

  /**
   * The row is drawn twice, above the player list and below it, so a long list
   * never leaves Generate off the bottom of the screen. Only one of them may
   * carry the tour's anchor — two elements with the same `data-tutorial` and the
   * overlay would box whichever it found first. The upper one wins: the list of
   * fourteen is taller than a phone, so the tour scrolls its head to the top of
   * the screen and the lower row is a long way past the bottom of it.
   */
  const makeButtonRow = (tourAnchor = false) => (
    /* my-10 rather than the page's own space-y-6. This row is the twin of
       Continue to Setup on the Players tab — the one press that moves the
       afternoon on — and the two pages should hold it in the same amount of
       air. Overrides the space-y above and below it; the top one collapses
       with it rather than adding to it. */
    <div className="my-10">
      {/* Only on the upper row. The page opens at the top, so this is the row
          the host is looking at, and one bouncing box is a signpost where two
          would be a page shouting. */}
      {tourAnchor && promptGenerate && <GeneratePrompt />}
      <div className="flex justify-between">
        <button
          onClick={handleToggleMode}
          disabled={mode === 'select' && !canPair}
          /* py-3.5 on both buttons in this row, which is the height Continue to
             Setup is drawn at. They sit at opposite ends of one line, so a row
             of two heights reads as one of them being an afterthought. */
          className="flex items-center gap-2 px-4 py-3.5 bg-brand-orange text-white rounded-md hover:bg-brand-orange-dark transition-colors text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {/* The link belongs to pairing players up. The same button ends that
              mode, where it would be saying the wrong thing. */}
          {mode === 'select' ? (
            <>
              <LinkIcon className="w-[21px] h-[21px]" />
              Set Partners
            </>
          ) : (
            'Done Pairing'
          )}
        </button>
        <button
          onClick={handleGenerate}
          data-tutorial={tourAnchor ? 'generate-schedule' : undefined}
          className="px-6 py-3.5 bg-brand-teal text-white rounded-md hover:bg-brand-teal-dark transition-colors font-bold"
        >
          Generate Schedule &rarr;
        </button>
      </div>
      {showError && errorMessage && (
        <p className="text-red-600 text-sm text-right mt-2">{errorMessage}</p>
      )}
    </div>
  );

  return (
    /* pt-8 matches the Players tab, which opens the same gap under the tab row
       so the badge on the first card is not sitting on it. The two pages are
       one page apart and the tabs must not shuffle between them. */
    <div className="space-y-6 pt-8">
      {/* No back button: the Players tab above the page is the way back. */}
      <div className="relative">
        <div className="relative overflow-hidden bg-white rounded-lg shadow border border-panel-edge px-3 pt-7 pb-6">
          {/* Decoration, held in the corner the mockup puts it in. Two cards on
              the Players tab carry the same corner a tenth smaller, which is why
              it is a component rather than an `<img>` written out here. */}
          <CornerDots />
          <div className="relative">
            <h2
              data-tutorial="setup-title"
              className="text-[1.35rem] font-extrabold text-[#051829] mb-4"
            >
              Setup Round Robin
            </h2>
            <SessionConfig
              numCourts={numCourts}
              numRounds={numRounds}
              onCourtsChange={onCourtsChange}
              onRoundsChange={onRoundsChange}
              roundPlan={roundPlan}
              lockedRounds={completedRounds}
              expanded={plannerOpen}
              /* Nothing to ask before it opens. Setting a round type here can
                 only ever change what the next Generate builds, because a
                 schedule already under way is not reachable from this page. */
              onToggleExpanded={() => setPlannerOpen((open) => !open)}
              onOpenInfo={() => setInfoOpen(true)}
              onPlanCommit={onPlanCommit}
              planDraft={planDraft}
              onPlanDraft={onPlanDraft}
              scoringEnabled={scoringEnabled}
              onScoringChange={onScoringChange}
            />
          </div>
        </div>
        {/* The tab's own shape, which is also the shape on the Setup tile in
            the Actions sheet. Select Players below keeps its plain top edge:
            one badge on the page is a landmark, four are wallpaper. */}
        <PanelBadge icon={StepSetupIcon} />
      </div>

      {makeButtonRow(true)}

      {/* Above both the pair list and the player list, and drawn in both modes.
          What kind of evening this is going to be outranks either of them. */}
      <PartnerPlayNotice players={selectedPlayers} partnerships={partnerships} />

      {mode === 'select' && pairs.length > 0 && (
        <div className="bg-white rounded-lg shadow border border-panel-edge px-3 pt-[1.125rem] pb-6">
          <div className="mb-3">
            {/* Heading and link on one line, the same shape as Select Players
                below. The sentence sits under both, where it has the width. */}
            <div className="flex justify-between items-center gap-3">
              <h3 className="text-[1.35rem] font-extrabold text-[#222]">
                Partners
              </h3>
              <button
                onClick={onClearPartnerships}
                className="text-sm text-brand-teal hover:text-brand-teal-dark font-bold"
              >
                Unlink All
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              These players stay together all session. Tap the broken-link icon to
              separate a pair and return them to the list below.
            </p>
          </div>
          <PairList pairs={pairs} onUnpair={onRemovePartnership} />
        </div>
      )}

      {/* The tour anchors on the panel, not on PlayerSelector inside it: this
          wrapper survives the swap to PartnerPairing, and it is the right rect
          anyway — the card points at the whole area, not at the heading. */}
      <div
        data-tutorial="select-players"
        className="bg-white rounded-lg shadow border border-panel-edge px-3 pt-[1.125rem] pb-6"
      >
        {mode === 'select' ? (
          <PlayerSelector
            players={players}
            pairs={pairs}
            selectedIds={selectedIds}
            numCourts={numCourts}
            onToggle={onTogglePlayer}
            onSelectAll={onSelectAll}
            onDeselectAll={onDeselectAll}
          />
        ) : (
          <PartnerPairing
            players={selectedPlayers}
            partnerships={partnerships}
            pendingId={pendingId}
            onTapPlayer={handleTapPlayer}
            onUnpair={onRemovePartnership}
          />
        )}
      </div>

      {makeButtonRow()}

      {infoOpen && <RoundTypesInfoPanel onClose={() => setInfoOpen(false)} />}
    </div>
  );
}

/**
 * Where the schedule is, said beside the button that opens it.
 *
 * It is the button's own teal and it hangs directly over it with a tail, so the
 * sentence and the thing to press read as one object rather than as a notice
 * about something elsewhere on the page. Right-aligned for the same reason:
 * Generate sits at the right end of the row underneath.
 *
 * `motion-safe` because a box that bounces without stopping is exactly what
 * somebody who has turned motion off has turned off. It still points, still
 * says the same words, and simply holds still.
 *
 * `role="status"` rather than an alert: this is the answer to a press the host
 * just made, not an interruption.
 */
function GeneratePrompt() {
  return (
    <div className="mb-3 flex justify-end no-print" role="status">
      {/* Pale teal inside a dark teal line, not a solid teal block. It is a
          note pointing at the button, and at full strength it read as a second
          button sitting above the real one. The tail is painted after the box
          it hangs off, so it covers the border it crosses and the two read as
          one shape. */}
      <div className="relative motion-safe:animate-bounce rounded-lg border-2 border-brand-teal-dark bg-brand-teal-light px-3.5 py-2 text-sm font-bold text-brand-teal-dark shadow-md">
        Tap Generate Schedule
        <span
          aria-hidden="true"
          className="absolute -bottom-[7px] right-7 h-3 w-3 rotate-45 rounded-br-[2px] border-b-2 border-r-2 border-brand-teal-dark bg-brand-teal-light"
        />
      </div>
    </div>
  );
}
