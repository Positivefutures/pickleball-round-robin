import { useState, type FormEvent } from 'react';
import type { CourtAssignment, CourtScore } from '../../types';
import type { Side } from '../../lib/standings';
import { ScorePanel, ScoreColon } from './Scoreboard';
import { Keypad } from './Keypad';
import { toneFor } from './scoreTone';
import { formatTeam } from '../../utils/helpers';
import { useScrollLock } from '../../hooks/useScrollLock';

/** Nobody wins a pickleball game by three figures. */
const MAX_DIGITS = 2;
const MAX_SCORE = 99;

interface Props {
  court: CourtAssignment;
  onDone: (score: CourtScore | null) => void;
  onCancel: () => void;
}

/**
 * Writing down a game.
 *
 * Its own keypad rather than a text box, so the OS keyboard never comes up and
 * the buttons never get shoved off the bottom of the screen. That is also why
 * this sits higher up the page than centred.
 *
 * Both sides are held as strings, not numbers. An empty panel has to be tellable
 * apart from a nought, and tapping 1 then 1 has to give eleven rather than two.
 */
export function ScoreDialog({ court, onDone, onCancel }: Props) {
  const [team1, setTeam1] = useState(court.score ? String(court.score.team1) : '');
  const [team2, setTeam2] = useState(court.score ? String(court.score.team2) : '');
  const [side, setSide] = useState<Side>('team1');

  useScrollLock(true);

  const value = side === 'team1' ? team1 : team2;
  const setValue = side === 'team1' ? setTeam1 : setTeam2;
  const other = side === 'team1' ? team2 : team1;

  // A half score is not a score, so both or neither. Both empty saves as a
  // deletion, which is how a score written down by mistake is taken back:
  // backspace both sides, then Save.
  const canSave = (team1 === '') === (team2 === '');

  // What the panels are wearing right now, so the winner turns green as it is
  // typed rather than only once it is saved.
  const live: CourtScore | undefined =
    team1 === '' || team2 === '' ? undefined : { team1: Number(team1), team2: Number(team2) };

  function pressDigit(digit: string) {
    const next = (value + digit).replace(/^0+(?=\d)/, '').slice(0, MAX_DIGITS);
    setValue(next);
    // Full side, empty other one: move across. It saves a tap on the ordinary
    // 11 then 7, and it never moves off a side the host is still filling.
    if (next.length === MAX_DIGITS && other === '') {
      setSide(side === 'team1' ? 'team2' : 'team1');
    }
  }

  /**
   * Eleven, in one tap.
   *
   * Games are played to 11 far more often than to anything else, so the winning
   * side is nearly always the same two digits. It replaces what is there rather
   * than adding to it, and then moves across exactly as typing 1 then 1 does.
   */
  function pressEleven() {
    setValue('11');
    if (other === '') setSide(side === 'team1' ? 'team2' : 'team1');
  }

  function nudge(delta: number) {
    const next = Math.min(MAX_SCORE, Math.max(0, Number(value || '0') + delta));
    setValue(String(next));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    onDone(team1 === '' ? null : { team1: Number(team1), team2: Number(team2) });
  }

  // Labelled "Score for …" rather than by the team alone, so the panel can be
  // found by what it is for. A single-digit score does not fill its side, so
  // tapping across is the only way to the other one.
  const sideButton = (which: Side, text: string) => (
    <button
      type="button"
      onClick={() => setSide(which)}
      className="flex flex-col items-center gap-1"
      aria-label={`Score for ${text}, ${
        (which === 'team1' ? team1 : team2) || 'not set'
      }`}
      aria-pressed={side === which}
    >
      <ScorePanel
        value={which === 'team1' ? team1 : team2}
        tone={toneFor(live, which)}
        active={side === which}
      />
    </button>
  );

  const nudgeRow = (which: Side) => (
    <div className="flex justify-center gap-1">
      <button
        type="button"
        onClick={() => { setSide(which); nudge(-1); }}
        disabled={(which === 'team1' ? team1 : team2) === ''}
        className="min-h-9 min-w-9 rounded-md border border-[#999] bg-gray-200 text-lg font-bold text-gray-700 transition-colors hover:bg-gray-300 disabled:opacity-40"
        aria-label={`One fewer for ${which === 'team1' ? 'the first side' : 'the second side'}`}
      >
        &minus;
      </button>
      <button
        type="button"
        onClick={() => { setSide(which); nudge(1); }}
        className="min-h-9 min-w-9 rounded-md border border-[#999] bg-gray-200 text-lg font-bold text-gray-700 transition-colors hover:bg-gray-300"
        aria-label={`One more for ${which === 'team1' ? 'the first side' : 'the second side'}`}
      >
        +
      </button>
    </div>
  );

  return (
    // No closing on the backdrop, unlike the panels that do. A stray tap beside
    // a keypad somebody is jabbing at would throw the whole entry away.
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-4">
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label={`Court ${court.courtNumber} score`}
        className="mx-4 max-h-[92vh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-lg border-[3px] border-[#444] bg-white p-6 shadow-lg"
      >
        <h2 className="mb-4 text-[1.35rem] font-extrabold text-[#222]">
          Court {court.courtNumber} Score
        </h2>

        {/* Set at the size a name is on a court, and given most of the box to
            say it in. These wrap where a court's own places cut with an
            ellipsis: a court is one of a grid that has to line up, and this is
            on its own, so a second line costs nothing and a shortened name in
            the one place the host is being asked who they are writing a score
            for costs plenty. */}
        <div className="mb-2 flex items-start justify-center gap-[8px] text-center">
          <p className="min-w-0 max-w-[10rem] flex-1 break-words text-sm font-medium text-gray-600" title={formatTeam(court.team1, court)}>
            {formatTeam(court.team1, court)}
          </p>
          <span className="w-[5px]" />
          <p className="min-w-0 max-w-[10rem] flex-1 break-words text-sm font-medium text-gray-600" title={formatTeam(court.team2, court)}>
            {formatTeam(court.team2, court)}
          </p>
        </div>

        <div className="flex items-center justify-center gap-[8px]">
          {sideButton('team1', formatTeam(court.team1, court))}
          <ScoreColon />
          {sideButton('team2', formatTeam(court.team2, court))}
        </div>

        <div className="mt-2 flex items-start justify-center gap-[8px]">
          <div className="w-[6.5rem]">{nudgeRow('team1')}</div>
          <span className="w-[5px]" />
          <div className="w-[6.5rem]">{nudgeRow('team2')}</div>
        </div>

        <Keypad
          label="Score keypad"
          onDigit={pressDigit}
          onBackspace={() => setValue(value.slice(0, -1))}
          backspaceDisabled={value === ''}
          extraKey={{ face: '11', onPress: pressEleven }}
        />

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-[#999] bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="flex-1 rounded-md bg-brand-teal px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </div>
        {!canSave && (
          <p className="mt-2 text-center text-sm text-amber-600">
            Both sides need a number.
          </p>
        )}
      </form>
    </div>
  );
}
