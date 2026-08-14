import { useSyncExternalStore } from 'react';
import type { Player, Roster } from '../../types';
import { CheckIcon } from '../icons';
import { GroupSolidIcon } from '../icons';
import { PanelHeading } from '../PanelGlyph';
import { liveStatusStore } from '../../lib/liveSession';
import { useSuspendsTour } from '../../lib/tourSuspend';
import { panelCard } from '../panelStyles';

interface Props {
  groups: Roster[];
  /** Every player in the app, so each group can show how many are in it. */
  players: Player[];
  activeId: string;
  /**
   * Named for where it was opened from. The Players tab calls it My Groups, to
   * match the panel underneath it; the banner calls it Change Groups, because
   * from there it is a move rather than a setting.
   */
  heading?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/**
 * Choosing which group you are working with.
 *
 * This was a native `<select>`, and the list a phone or a desktop browser opens
 * for one of those is the browser's, not ours: grey, no wider than the control
 * it came from, and animated to its own taste. Group names are long enough to
 * wrap in a box that narrow. So the list is drawn here instead, in the same
 * bordered card every other dialog in the app uses, with room for the name and
 * the size of the group beside it.
 */
export function GroupPicker({
  groups,
  players,
  activeId,
  heading = 'My Groups',
  onSelect,
  onClose,
}: Props) {
  const live = useSyncExternalStore(
    liveStatusStore.subscribe,
    liveStatusStore.get,
    liveStatusStore.get
  );

  // The first-run tour hands the group name over on its first card, so this can
  // open while the tour is up. It cannot simply stack over it — see
  // lib/tourSuspend — so the tour hides for as long as this is mounted.
  useSuspendsTour();

  function countFor(rosterId: string) {
    return players.filter((p) => p.rosterIds.includes(rosterId)).length;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      {/* As tall as the screen allows before anything scrolls, the same as
          Manage Groups. The list used to be held to 288px whatever the phone
          was, which is five groups, so a host with eight scrolled a short list
          inside a short box with empty screen underneath it. */}
      <div className={`bg-white ${panelCard} p-6 mx-4 max-w-md w-full max-h-[92vh] flex flex-col`}>
        {/* The same heading as the panel it was opened from. */}
        <div className="mb-4">
          <PanelHeading icon={GroupSolidIcon} title={heading} />
        </div>

        {/* The one thing a switch does not carry with it. The published copy is
            of this session, and pointing it at another group's would show the
            wrong scores to everyone holding the link. */}
        {(live.state === 'live' || live.state === 'publishing') && (
          <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Sharing stops when you change groups. Start it again from the new session.
          </p>
        )}

        {/* The one part that gives when there is not enough room, so the
            heading stays on and Close stays reachable however many groups
            there are. */}
        <div className="space-y-2 mb-5 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {groups.map((g) => {
            const current = g.id === activeId;
            const count = countFor(g.id);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onSelect(g.id)}
                // Not colour alone: the one you are in carries a tick as well.
                aria-current={current ? 'true' : undefined}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-md border text-left transition-colors ${
                  current
                    ? 'border-brand-teal bg-brand-teal-light'
                    : 'border-gray-300 bg-white hover:bg-gray-100'
                }`}
              >
                <span className="min-w-0 flex-1 text-lg font-bold text-[#222] break-words">
                  {g.name}
                </span>
                <span className="shrink-0 text-sm text-gray-500">
                  {count} player{count === 1 ? '' : 's'}
                </span>
                {/* The slot is there on every row, so one row carrying a tick
                    does not shunt its own count out of line with the rest. */}
                <span className="w-5 shrink-0">
                  {current && <CheckIcon className="w-5 h-5 text-green-700" />}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={onClose}
          className="w-full px-4 py-2.5 border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
        >
          Close
        </button>
      </div>
    </div>
  );
}
