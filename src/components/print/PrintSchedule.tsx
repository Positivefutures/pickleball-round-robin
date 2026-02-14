import type { Schedule, Player } from '../../types';
import { getDisplayName } from '../../utils/helpers';

interface Props {
  schedule: Schedule | null;
  players: Player[];
}

export function PrintSchedule({ schedule, players }: Props) {
  if (!schedule) return null;

  return (
    <div className="hidden print-only">
      <h1 style={{ fontSize: '18pt', fontWeight: 'bold', marginBottom: '12pt', textAlign: 'center' }}>
        Pickleball Round Robin
      </h1>

      {schedule.rounds.map((round) => (
        <div key={round.roundNumber} className="round-card" style={{ marginBottom: '16pt' }}>
          <h2 style={{ fontSize: '15.4pt', fontWeight: 'bold', marginBottom: '8pt', borderBottom: '1px solid #ccc', paddingBottom: '4pt' }}>
            Round {round.roundNumber}
            {round.isGendered && (
              <span style={{ fontSize: '9pt', fontWeight: 'normal', marginLeft: '8pt', color: '#666' }}>
                (Gendered Round)
              </span>
            )}
          </h2>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6pt' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '4pt 8pt', borderBottom: '1px solid #999', fontSize: '10pt' }}>
                </th>
                <th style={{ textAlign: 'left', padding: '4pt 8pt', borderBottom: '1px solid #999', fontSize: '10pt' }}>
                  SERVING
                </th>
                <th style={{ textAlign: 'left', padding: '4pt 8pt', borderBottom: '1px solid #999', fontSize: '10pt' }}>
                  RECEIVING
                </th>
              </tr>
            </thead>
            <tbody>
              {round.courts.map((court) => (
                <tr key={court.courtNumber}>
                  <td style={{ padding: '4pt 8pt', borderBottom: '1px solid #eee', fontWeight: 'bold', fontSize: '10pt' }}>
                    Court {court.courtNumber}
                  </td>
                  <td style={{ padding: '4pt 8pt', borderBottom: '1px solid #eee', fontSize: '12.5pt' }}>
                    {court.team1.map((p) => getDisplayName(p, players)).join(' & ')}
                  </td>
                  <td style={{ padding: '4pt 8pt', borderBottom: '1px solid #eee', fontSize: '12.5pt' }}>
                    {court.team2.map((p) => getDisplayName(p, players)).join(' & ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {round.sitOuts.length > 0 && (
            <p style={{ fontSize: '9pt', color: '#666', marginTop: '2pt' }}>
              Sitting out: {round.sitOuts.map((p) => getDisplayName(p, players)).join(', ')}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
