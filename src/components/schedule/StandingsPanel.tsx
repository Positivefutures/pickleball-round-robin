import { useState } from 'react';
import type { RefObject } from 'react';
import type { Schedule, Player } from '../../types';
import type { StandingsRow } from '../../lib/standings';
import { standings, hasAnyScore } from '../../lib/standings';
import { ChevronDownIcon } from '../icons';

/** Which column the table is being read down. */
type SortKey = 'name' | 'wins' | 'losses' | 'differential' | 'pointsFor';

/** `desc` is the biggest first, which is the first thing a tap gives you. */
type Direction = 'desc' | 'asc';

interface Column {
  key: SortKey;
  label: string;
  /** Player runs left; every number runs right, under its own heading. */
  align: 'left' | 'right';
  /** Padding, which differs at the two ends of the row. */
  pad: string;
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'Player', align: 'left', pad: 'pr-2' },
  { key: 'wins', label: 'W', align: 'right', pad: 'px-2' },
  { key: 'losses', label: 'L', align: 'right', pad: 'px-2' },
  { key: 'differential', label: 'Diff', align: 'right', pad: 'px-2' },
  { key: 'pointsFor', label: 'Pts', align: 'right', pad: 'pl-2' },
];

function valueOf(row: StandingsRow, key: SortKey): string | number {
  return key === 'name' ? row.player.name : row[key];
}

/**
 * Who is winning.
 *
 * Props are a schedule and a list of players and nothing else: no stores, no
 * completed rounds. That is what lets the same table be drawn from a session
 * pulled off the wire as from the one in this browser. The sort lives here
 * rather than above, because it is a way of looking at the table and not a fact
 * about the session — nobody else needs to know about it, and it should not
 * survive the panel closing.
 *
 * **Every heading is a button, and three taps is a full circle.** The first
 * gives you biggest first, which is what somebody wants from a column of wins.
 * The second turns it round. The third puts the table back the way it came, so
 * there is always a way out that does not need the ranking rules explained.
 *
 * Ties keep the order the ranking gave them: `sort` is stable, so two players on
 * four wins stay in the order that broke their tie on points.
 *
 * Screen only, like the rest of the schedule page. The printed sheet is read out
 * before the games.
 */
export function StandingsPanel({
  schedule,
  players,
  panelRef,
  onBackToTop,
}: {
  schedule: Schedule;
  players: Player[];
  /** Where View Standings on a round card scrolls to. */
  panelRef?: RefObject<HTMLDivElement | null>;
  /**
   * Back to the top of the page. Optional because the live view draws this same
   * table on a page of its own, and nobody has asked for the link there.
   */
  onBackToTop?: () => void;
}) {
  const rows = standings(schedule, players);
  const scored = hasAnyScore(schedule);
  const [sort, setSort] = useState<{ key: SortKey; dir: Direction } | null>(null);

  function toggle(key: SortKey) {
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: 'desc' };
      return cur.dir === 'desc' ? { key, dir: 'asc' } : null;
    });
  }

  const ordered = (() => {
    if (!sort) return rows;
    const flip = sort.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = valueOf(a, sort.key);
      const bv = valueOf(b, sort.key);
      const cmp =
        typeof av === 'string' ? av.localeCompare(bv as string) : av - (bv as number);
      return cmp * flip;
    });
  })();

  const sortedColumn = sort && COLUMNS.find((c) => c.key === sort.key);

  return (
    <div
      ref={panelRef}
      // Scrolled to from every round card above, so it needs a little air over
      // its heading once it lands rather than sitting against the top edge.
      className="scroll-mt-4 bg-white rounded-lg shadow border border-[#ddd] px-3 pt-[1.125rem] pb-6"
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-[1.35rem] font-extrabold text-[#222]">Standings</h3>
        {/* The way back. Unlike View Standings on the rounds, this is not tied
            to scoring: the panel only exists when scoring is on, so by the time
            anybody can read this the question has been answered. */}
        {onBackToTop && (
          <button
            type="button"
            onClick={onBackToTop}
            className="flex shrink-0 items-center gap-1 text-sm font-medium text-brand-teal transition-colors hover:text-brand-teal-dark no-print"
          >
            Back to Top
            <ChevronDownIcon className="h-4 w-4 rotate-180" />
          </button>
        )}
      </div>

      {!scored ? (
        <p className="text-sm text-gray-500">
          No scores yet. Tap the scoreboard on any court to write one down.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              {/* 1.2em rather than a fixed size: it is a fifth larger than the
                  row beneath it whatever that row is, so the heading still
                  outranks the body in large text instead of falling behind it. */}
              <tr className="text-left text-[1.2em] font-bold text-gray-700">
                {COLUMNS.map((col) => {
                  const active = sort?.key === col.key;
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      className={`py-1 ${col.pad} ${col.align === 'right' ? 'text-right' : ''}`}
                      aria-sort={
                        active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'
                      }
                    >
                      <button
                        type="button"
                        onClick={() => toggle(col.key)}
                        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 transition-colors ${
                          active
                            ? 'border-brand-teal bg-brand-teal-light'
                            : 'border-transparent hover:bg-gray-100'
                        }`}
                      >
                        {col.label}
                        {/* Pointing the way the column runs: down for biggest
                            first, up for smallest. Absent until tapped, so an
                            untouched table carries no arrows to read into. */}
                        {active && (
                          <ChevronDownIcon
                            className={`h-4 w-4 ${sort.dir === 'asc' ? 'rotate-180' : ''}`}
                          />
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {ordered.map((row) => (
                <tr key={row.player.id} className="border-t border-gray-100">
                  <td className="py-1 pr-2">
                    <span className="flex items-center gap-1">
                      <span className="truncate">{row.player.name}</span>
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
          {/* The ranking line would be a lie once the table is sorted by
              something else, so it stands down and says how to get back. */}
          <p className="mt-3 text-xs text-gray-500">
            {sortedColumn
              ? `Tap ${sortedColumn.label} once more to go back to the ranking.`
              : 'Ranked by wins, then points difference, then points scored.'}
          </p>
        </div>
      )}
    </div>
  );
}
