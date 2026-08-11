import type { Schedule, Player } from '../../types';
import { standings, hasAnyScore } from '../../lib/standings';
import { GuestChip } from './GuestChip';

/**
 * Who is winning.
 *
 * Props are a schedule and a list of players and nothing else: no stores, no
 * completed rounds, no interaction. That is what will let the same table be
 * drawn from a session pulled off the wire as from the one in this browser.
 *
 * Screen only, like the rest of the schedule page. The printed sheet is read out
 * before the games.
 */
export function StandingsPanel({ schedule, players }: { schedule: Schedule; players: Player[] }) {
  const rows = standings(schedule, players);
  const scored = hasAnyScore(schedule);

  return (
    <div className="bg-white rounded-lg shadow border border-[#ddd] px-3 pt-[1.125rem] pb-6">
      <h3 className="text-[1.35rem] font-extrabold text-[#222] mb-4">Standings</h3>

      {!scored ? (
        <p className="text-sm text-gray-500">
          No scores yet. Tap the scoreboard on any court to write one down.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left">
                <th className="py-1 pr-2 font-medium text-gray-700">Player</th>
                <th className="py-1 px-2 text-right font-medium text-gray-700">W</th>
                <th className="py-1 px-2 text-right font-medium text-gray-700">L</th>
                <th className="py-1 px-2 text-right font-medium text-gray-700">Diff</th>
                <th className="py-1 pl-2 text-right font-medium text-gray-700">Pts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.player.id} className="border-t border-gray-100">
                  <td className="py-1 pr-2">
                    <span className="flex items-center gap-1">
                      <span className="truncate">{row.player.name}</span>
                      <GuestChip player={row.player} />
                    </span>
                  </td>
                  <td className="py-1 px-2 text-right font-semibold tabular-nums">{row.wins}</td>
                  <td className="py-1 px-2 text-right tabular-nums">{row.losses}</td>
                  {/* Signed, because a differential without its sign is a
                      different number. Negatives already carry theirs. */}
                  <td
                    className={`py-1 px-2 text-right tabular-nums ${
                      row.differential > 0
                        ? 'text-green-700'
                        : row.differential < 0
                          ? 'text-red-700'
                          : 'text-gray-500'
                    }`}
                  >
                    {row.differential > 0 ? `+${row.differential}` : row.differential}
                  </td>
                  <td className="py-1 pl-2 text-right tabular-nums">{row.pointsFor}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-gray-500">
            Ranked by wins, then points difference, then points scored.
          </p>
        </div>
      )}
    </div>
  );
}
