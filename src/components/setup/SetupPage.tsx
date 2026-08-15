import { useState } from 'react';
import type { Player, Partnership, RoundType, SpecialGameTypes, SpecialTypeSetting } from '../../types';
import { PlayerSelector } from './PlayerSelector';
import { PartnerPairing } from './PartnerPairing';
import { PartnerPlayNotice } from './PartnerPlayNotice';
import { PairList } from './PairList';
import { SessionConfig } from './SessionConfig';
import { SpecialTypesPanel } from './SpecialTypesPanel';
import { LinkIcon } from '../icons';
import { resolvePairs } from '../../lib/partnerships';
import { minPlayersForCourts } from '../../lib/assign';
import { useScrollLock } from '../../hooks/useScrollLock';

interface Props {
  players: Player[];
  selectedIds: string[];
  partnerships: Partnership[];
  numCourts: number;
  numRounds: number;
  specialTypes: SpecialGameTypes;
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
  onSpecialTypeChange: (type: RoundType, patch: Partial<SpecialTypeSetting>) => void;
  onSpecialTypeMove: (type: RoundType, direction: -1 | 1) => void;
  /**
   * Set when the host has just pressed a Schedule tab that could not take them
   * there. The setup has moved on from the schedule they made, so the only way
   * back to a schedule is to build a new one, and this is what says so — beside
   * the button that does it, rather than as a dialog in front of the page.
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
  specialTypes,
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
  onSpecialTypeChange,
  onSpecialTypeMove,
  promptGenerate = false,
  onGenerate,
}: Props) {
  const [showError, setShowError] = useState(false);
  const [mode, setMode] = useState<'select' | 'pair'>('select');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [specialTypesOpen, setSpecialTypesOpen] = useState(false);

  // Hold the page still behind the panel, so Setup is exactly where it was
  // when Done closes it.
  useScrollLock(specialTypesOpen);

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

  // Paired players are listed in the pairs panel instead of the checkbox grid,
  // so the two views never show the same player twice. Unlinking a pair drops
  // both back into the grid, still selected.
  const pairs = resolvePairs(partnerships, selectedPlayers);
  const pairedIds = new Set(pairs.flatMap((pr) => [pr.p1.id, pr.p2.id]));
  const selectablePlayers = players.filter((p) => !pairedIds.has(p.id));

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
    <div>
      {/* Only on the upper row. The page opens at the top, so this is the row
          the host is looking at, and one bouncing box is a signpost where two
          would be a page shouting. */}
      {tourAnchor && promptGenerate && <GeneratePrompt />}
      <div className="flex justify-between">
        <button
          onClick={handleToggleMode}
          disabled={mode === 'select' && !canPair}
          className="flex items-center gap-2 px-4 py-1.5 bg-brand-orange text-white rounded-md hover:bg-brand-orange-dark transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
          className="px-6 py-2.5 bg-brand-teal text-white rounded-md hover:bg-brand-teal-dark transition-colors font-medium"
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
    <div className="space-y-6">
      {/* No back button: the Players tab above the page is the way back. */}
      <div className="relative overflow-hidden bg-white rounded-lg shadow border border-[#ddd] px-3 pt-[1.125rem] pb-6">
        {/* Decoration, held in the corner the mockup puts it in. A third of the
            panel is the share it has there, so it keeps that share on a phone
            rather than swallowing the corner; 144px is its own size and it never
            grows past it. Behind everything and untappable, so a long word
            passes over it rather than being pushed down a line. */}
        <img
          src="/corner-dots.png"
          alt=""
          width={144}
          height={126}
          className="pointer-events-none absolute right-1.5 top-1.5 w-[23.3%] max-w-[101px] select-none"
        />
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
            numPlayers={selectedIds.length}
            specialTypes={specialTypes}
            onOpenSpecialTypes={() => setSpecialTypesOpen(true)}
            scoringEnabled={scoringEnabled}
            onScoringChange={onScoringChange}
          />
        </div>
      </div>

      {makeButtonRow(true)}

      {/* Above both the pair list and the player list, and drawn in both modes.
          What kind of evening this is going to be outranks either of them. */}
      <PartnerPlayNotice players={selectedPlayers} partnerships={partnerships} />

      {mode === 'select' && pairs.length > 0 && (
        <div className="bg-white rounded-lg shadow border border-[#ddd] px-3 pt-[1.125rem] pb-6">
          <div className="mb-3">
            {/* Heading and link on one line, the same shape as Select Players
                below. The sentence sits under both, where it has the width. */}
            <div className="flex justify-between items-center gap-3">
              <h3 className="text-[1.35rem] font-extrabold text-[#222]">
                Partners
              </h3>
              <button
                onClick={onClearPartnerships}
                className="text-sm text-brand-teal hover:text-brand-teal-dark font-medium"
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
        className="bg-white rounded-lg shadow border border-[#ddd] px-3 pt-[1.125rem] pb-6"
      >
        {mode === 'select' ? (
          <PlayerSelector
            players={selectablePlayers}
            selectedIds={selectedIds}
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

      {specialTypesOpen && (
        <SpecialTypesPanel
          specialTypes={specialTypes}
          onChange={onSpecialTypeChange}
          onMove={onSpecialTypeMove}
          onClose={() => setSpecialTypesOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Where the schedule went, said beside the button that brings it back.
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
      <div className="relative motion-safe:animate-bounce rounded-lg bg-brand-teal px-3.5 py-2 text-sm font-bold text-white shadow-md">
        Tap Generate Schedule
        <span
          aria-hidden="true"
          className="absolute -bottom-1 right-7 h-3 w-3 rotate-45 rounded-[2px] bg-brand-teal"
        />
      </div>
    </div>
  );
}
