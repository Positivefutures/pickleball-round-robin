import type { Schedule, Player } from '../../types';
import { getDisplayName } from '../../utils/helpers';
import { APP_URL } from '../../lib/appInfo';
import { ROUND_TYPE_META, courtMatchesType, roundTypeOf } from '../../lib/roundTypes';

interface Props {
  schedule: Schedule | null;
  players: Player[];
}

/** Written once so it cannot drift from the address the app is served at. */
const HOST = new URL(APP_URL).host;

export function PrintSchedule({ schedule, players }: Props) {
  if (!schedule) return null;

  return (
    <div className="hidden print-only">
      {/*
        A table, only so that its head and foot repeat.

        Killing the browser's own header and footer needs a zero page margin,
        and a zero page margin leaves no room down either edge of the sheet.
        Padding cannot give it back: vertical padding lands on the first and
        last page only, so page two would start hard against the paper. A
        thead and a tfoot are the one thing a browser reserves space for on
        every page, which is what these two empty bands are.
      */}
      <table className="print-sheet">
        <thead>
          <tr>
            <td>
              <div className="print-band-top" />
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <h1
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10pt',
                  fontSize: '18pt',
                  fontWeight: 'bold',
                  marginBottom: '12pt',
                }}
              >
                <img src="/logo.png" alt="" style={{ height: '28pt', width: 'auto' }} />
                <span>Pickleball Round Robin</span>
              </h1>

              {schedule.rounds.map((round) => {
                const roundType = roundTypeOf(round);
                return (
                  <div key={round.roundNumber} className="round-card" style={{ marginBottom: '16pt' }}>
                    <h2 style={{ fontSize: '15.4pt', fontWeight: 'bold', marginBottom: '8pt', borderBottom: '1px solid #ccc', paddingBottom: '4pt' }}>
                      ROUND {round.roundNumber}
                      {roundType && (
                        <span style={{ fontSize: '9pt', fontWeight: 'normal', marginLeft: '8pt', color: ROUND_TYPE_META[roundType].printColor }}>
                          ({ROUND_TYPE_META[roundType].badge})
                        </span>
                      )}
                    </h2>

                    {/* Fixed widths so the columns sit in the same place on every round.
                        Left to itself the court column widens for "(normal game)" and
                        that round alone comes out shifted. */}
                    <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', marginBottom: '6pt' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '26%', textAlign: 'left', padding: '4pt 8pt', borderBottom: '1px solid #999', fontSize: '10pt' }}>
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
                              COURT {court.courtNumber}
                              {/* The roster would not stretch to this court in the round's
                                  format, so it plays an ordinary game. Without the note the
                                  printed round reads as if the format had gone wrong. */}
                              {roundType && !courtMatchesType(court, roundType) && (
                                <span style={{ fontWeight: 'normal', color: '#666' }}> (normal game)</span>
                              )}
                            </td>
                            <td style={{ padding: '4pt 8pt', borderBottom: '1px solid #eee', fontSize: '12.5pt', fontWeight: 'bold' }}>
                              {court.team1.map((p) => getDisplayName(p, players)).join(' & ')}
                            </td>
                            <td style={{ padding: '4pt 8pt', borderBottom: '1px solid #eee', fontSize: '12.5pt', fontWeight: 'bold' }}>
                              {court.team2.map((p) => getDisplayName(p, players)).join(' & ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {round.sitOuts.length > 0 && (
                      <p style={{ fontSize: '12.5pt', color: '#666', marginTop: '2pt' }}>
                        Sitting out: {round.sitOuts.map((p) => getDisplayName(p, players)).join(', ')}
                      </p>
                    )}
                  </div>
                );
              })}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>
              <div className="print-band-bottom" />
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Fixed, so the browser paints it on every page inside the band above. */}
      <div className="print-footer">{HOST}</div>
    </div>
  );
}
