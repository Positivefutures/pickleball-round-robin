import { useState } from 'react';
import type { Player } from '../../types';
import { SitIcon, TrashIcon } from '../icons';
import { PanelHeading } from '../PanelGlyph';
import { panelCard } from '../panelStyles';
import { cancel } from '../layout/accountStyles';
import { useScrollLock } from '../../hooks/useScrollLock';
import { generateButton } from './setupButtons';
import { pinsFromSlots } from '../../lib/sitout';

/**
 * Who sits out, round by round, as far as the host has said: a player id per
 * slot, or null for a slot left to the rotation.
 *
 * Positional rather than a list per round, so taking somebody out of the first
 * slot leaves the second where it is instead of sliding it across.
 */
export type SitOutDraft = Record<number, (string | null)[]>;

interface Props {
  /** Everybody ticked, which is everybody who can be chosen. */
  players: Player[];
  numRounds: number;
  /** Slots per round: how many sit out each round. */
  seats: number;
  draft: SitOutDraft;
  onChange: (next: SitOutDraft) => void;
  onBack: () => void;
  /** The sit-outs chosen, by round number, exactly as the page shows them. */
  onGenerate: (pins: Record<number, string[]>) => void;
}

/**
 * Choose Sit-Outs: the page between Setup and the schedule, when the switch over
 * the player list is on.
 *
 * Each round has a slot for every seat on its bench. The host fills as many or
 * as few as they like, and Generate keeps the ones filled exactly where they are
 * and shares the rest out fairly around them. Somebody benched for round 1
 * because they are arriving late plays until everyone else has sat.
 *
 * A page rather than a panel, because sixteen rounds of slots is taller than a
 * phone and a page is the thing that already scrolls.
 */
export function SitOutChooser({
  players,
  numRounds,
  seats,
  draft,
  onChange,
  onBack,
  onGenerate,
}: Props) {
  const [picking, setPicking] = useState<{ round: number; slot: number } | null>(null);
  useScrollLock(picking !== null);

  const byId = new Map(players.map((p) => [p.id, p]));
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name));

  /** A round's slots, as wide as the bench, whatever the draft was left holding. */
  function slotsOf(round: number): (string | null)[] {
    const held = draft[round] ?? [];
    return Array.from({ length: seats }, (_, i) => {
      const id = held[i] ?? null;
      return id !== null && byId.has(id) ? id : null;
    });
  }

  function setSlot(round: number, slot: number, id: string | null) {
    const slots = slotsOf(round);
    slots[slot] = id;
    onChange({ ...draft, [round]: slots });
  }

  const rounds = Array.from({ length: numRounds }, (_, i) => i + 1);

  const buttonRow = (
    <div className="flex justify-between">
      <button type="button" onClick={onBack} className={`${cancel} px-4 py-3.5`}>
        &larr; Back
      </button>
      <button
        type="button"
        // What is on the page, not the draft behind it: the draft can still
        // hold somebody unticked since, or a round past the session's end.
        onClick={() =>
          onGenerate(pinsFromSlots(Object.fromEntries(rounds.map((r) => [r, slotsOf(r)]))))
        }
        className={generateButton}
      >
        Generate Schedule &rarr;
      </button>
    </div>
  );

  return (
    <div className="space-y-6 pt-8">
      {buttonRow}

      <div className="bg-white rounded-lg shadow border border-panel-edge px-3 pt-[1.125rem] pb-6">
        <h2 className="text-[1.35rem] font-extrabold text-[#222]">Choose Sit-Outs</h2>
        <p className="text-sm text-gray-500 mt-1">
          Tap a slot to choose who sits out that round. Empty slots will be filled fairly.
        </p>

        <div className="mt-5 space-y-5">
          {rounds.map((round) => (
            <div key={round} data-round={round}>
              <h3 className="mb-2 font-bold text-[#222]">Round {round}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {slotsOf(round).map((id, slot) => {
                  const player = id ? byId.get(id) : undefined;
                  if (!player) {
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setPicking({ round, slot })}
                        className="flex items-center justify-center p-2.5 rounded-md border-2 border-dashed border-gray-300 text-sm font-bold text-gray-500 transition-colors hover:bg-gray-50"
                      >
                        Tap to Choose
                      </button>
                    );
                  }
                  // The Select Players box, ticked. The bin stands where that
                  // box has the gender and the rating. The name wraps rather
                  // than being cut, as it does on the schedule: two people told
                  // apart by a last initial would otherwise read the same.
                  return (
                    <div
                      key={slot}
                      className="flex items-center gap-2 p-2.5 rounded-md border bg-brand-teal-light border-brand-teal"
                    >
                      <span className="min-w-0 break-words font-medium text-sm">{player.name}</span>
                      <button
                        type="button"
                        onClick={() => setSlot(round, slot, null)}
                        aria-label={`Remove ${player.name} from round ${round}`}
                        className="ml-auto shrink-0 rounded p-0.5 text-gray-500 transition-colors hover:bg-white hover:text-gray-700"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {buttonRow}

      {picking && (
        <SitOutPicker
          round={picking.round}
          players={sorted.filter((p) => !slotsOf(picking.round).includes(p.id))}
          onPick={(id) => {
            setSlot(picking.round, picking.slot, id);
            setPicking(null);
          }}
          onCancel={() => setPicking(null)}
        />
      )}
    </div>
  );
}

/**
 * Who can fill a slot: everybody ticked who is not already sitting out that
 * round. Linked partners included, because a partner sitting out a round is
 * simply a couple broken for it.
 */
function SitOutPicker({
  round,
  players,
  onPick,
  onCancel,
}: {
  round: number;
  players: Player[];
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-label={`Round ${round}: Who Sits Out?`}
        onClick={(e) => e.stopPropagation()}
        className={`bg-white ${panelCard} p-6 mx-4 max-w-md w-full max-h-[85vh] flex flex-col`}
      >
        <PanelHeading icon={SitIcon} title={`Round ${round}: Who Sits Out?`} />
        <div className="mt-4 -mx-1 px-1 overflow-y-auto grid grid-cols-2 gap-2">
          {players.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => onPick(player.id)}
              className="flex items-center gap-2 p-2.5 rounded-md border bg-white border-gray-200 text-left transition-colors hover:bg-gray-50"
            >
              <span className="min-w-0 break-words font-medium text-sm">{player.name}</span>
              <span className="text-xs text-gray-400 ml-auto">{player.gender}</span>
              <span className="text-xs text-gray-500">{player.rating.toFixed(1)}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={onCancel} className={`${cancel} mt-5 w-full px-4 py-2.5`}>
          Cancel
        </button>
      </div>
    </div>
  );
}
