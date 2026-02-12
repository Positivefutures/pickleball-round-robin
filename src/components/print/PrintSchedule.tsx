import type { Schedule } from '../../types';

interface Props {
  schedule: Schedule | null;
}

export function PrintSchedule({ schedule }: Props) {
  if (!schedule) return null;

  return (
    <div className="hidden print-only">
      <h1 style={{ fontSize: '18pt', fontWeight: 'bold', marginBottom: '12pt', textAlign: 'center' }}>
        Pickleball Round Robin
      </h1>

      {schedule.rounds.map((round) => (
        <div key={round.roundNumber} className="round-card" style={{ marginBottom: '16pt' }}>
          <h2 style={{ fontSize: '14pt', fontWeight: 'bold', marginBottom: '8pt', borderBottom: '1px solid #ccc', paddingBottom: '4pt' }}>
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
                  Court
                </th>
                <th style={{ textAlign: 'left', padding: '4pt 8pt', borderBottom: '1px solid #999', fontSize: '10pt' }}>
                  Team A
                </th>
                <th style={{ textAlign: 'center', padding: '4pt 8pt', borderBottom: '1px solid #999', fontSize: '10pt' }}>
                </th>
                <th style={{ textAlign: 'left', padding: '4pt 8pt', borderBottom: '1px solid #999', fontSize: '10pt' }}>
                  Team B
                </th>
              </tr>
            </thead>
            <tbody>
              {round.courts.map((court) => (
                <tr key={court.courtNumber}>
                  <td style={{ padding: '4pt 8pt', borderBottom: '1px solid #eee', fontWeight: 'bold', fontSize: '10pt' }}>
                    Court {court.courtNumber}
                  </td>
                  <td style={{ padding: '4pt 8pt', borderBottom: '1px solid #eee', fontSize: '10pt' }}>
                    {court.team1.map((p) => p.name).join(' & ')}
                  </td>
                  <td style={{ padding: '4pt 8pt', borderBottom: '1px solid #eee', textAlign: 'center', fontSize: '10pt', color: '#999' }}>
                    vs
                  </td>
                  <td style={{ padding: '4pt 8pt', borderBottom: '1px solid #eee', fontSize: '10pt' }}>
                    {court.team2.map((p) => p.name).join(' & ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {round.sitOuts.length > 0 && (
            <p style={{ fontSize: '9pt', color: '#666', marginTop: '2pt' }}>
              Sitting out: {round.sitOuts.map((p) => p.name).join(', ')}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
