import type { Schedule, Player } from '../../types';

interface Props {
  schedule: Schedule;
  players: Player[];
}

export function PartnerSummary({ schedule, players }: Props) {
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name));

  // Build partner and opponent count maps
  const partnerCounts: Record<string, Record<string, number>> = {};
  const opponentCounts: Record<string, Record<string, number>> = {};

  for (const round of schedule.rounds) {
    for (const court of round.courts) {
      for (const team of [court.team1, court.team2]) {
        if (team.length === 2) {
          const [a, b] = team;
          if (!partnerCounts[a.id]) partnerCounts[a.id] = {};
          if (!partnerCounts[b.id]) partnerCounts[b.id] = {};
          partnerCounts[a.id][b.id] = (partnerCounts[a.id][b.id] ?? 0) + 1;
          partnerCounts[b.id][a.id] = (partnerCounts[b.id][a.id] ?? 0) + 1;
        }
      }
      for (const p1 of court.team1) {
        for (const p2 of court.team2) {
          if (!opponentCounts[p1.id]) opponentCounts[p1.id] = {};
          if (!opponentCounts[p2.id]) opponentCounts[p2.id] = {};
          opponentCounts[p1.id][p2.id] = (opponentCounts[p1.id][p2.id] ?? 0) + 1;
          opponentCounts[p2.id][p1.id] = (opponentCounts[p2.id][p1.id] ?? 0) + 1;
        }
      }
    }
  }

  // Count games played per player
  const gamesPlayed: Record<string, number> = {};
  for (const round of schedule.rounds) {
    for (const court of round.courts) {
      for (const p of [...court.team1, ...court.team2]) {
        gamesPlayed[p.id] = (gamesPlayed[p.id] ?? 0) + 1;
      }
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-bold text-gray-800 mb-4">Player Summary</h3>

      <div className="mb-4">
        <h4 className="font-medium text-gray-700 mb-2">Games Played</h4>
        <div className="flex flex-wrap gap-2">
          {sorted.map((p) => (
            <span
              key={p.id}
              className="bg-gray-100 px-3 py-1 rounded text-sm"
            >
              {p.name}: {gamesPlayed[p.id] ?? 0}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <h4 className="font-medium text-gray-700 mb-2">
          Partner / Opponent Matrix
        </h4>
        <p className="text-xs text-gray-500 mb-2">
          <span className="text-green-600 font-medium">Green</span> = partnered,{' '}
          <span className="text-red-600 font-medium">Red</span> = opponents
        </p>
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="p-1 border border-gray-200 bg-gray-50"></th>
              {sorted.map((p) => (
                <th
                  key={p.id}
                  className="p-1 border border-gray-200 bg-gray-50 font-medium"
                  style={{ writingMode: 'vertical-lr', maxWidth: '2rem' }}
                >
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id}>
                <td className="p-1 border border-gray-200 bg-gray-50 font-medium whitespace-nowrap">
                  {row.name}
                </td>
                {sorted.map((col) => {
                  if (row.id === col.id) {
                    return (
                      <td
                        key={col.id}
                        className="p-1 border border-gray-200 bg-gray-100 text-center"
                      >
                        -
                      </td>
                    );
                  }
                  const pCount = partnerCounts[row.id]?.[col.id] ?? 0;
                  const oCount = opponentCounts[row.id]?.[col.id] ?? 0;
                  return (
                    <td
                      key={col.id}
                      className="p-1 border border-gray-200 text-center"
                    >
                      {pCount > 0 && (
                        <span className="text-green-600 font-medium">
                          {pCount}
                        </span>
                      )}
                      {pCount > 0 && oCount > 0 && '/'}
                      {oCount > 0 && (
                        <span className="text-red-600 font-medium">
                          {oCount}
                        </span>
                      )}
                      {pCount === 0 && oCount === 0 && (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
