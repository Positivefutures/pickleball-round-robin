import { useState } from 'react';
import { CodeEntry } from '../CodeEntry';
import { CODE_LENGTH } from '../../lib/scoreCode';
import { checkCode, type CodeCheck } from '../../lib/liveViewer';
import { LockIcon } from '../icons';
import { PanelHeading } from '../PanelGlyph';
import { panelCard } from '../panelStyles';
import { useScrollLock } from '../../hooks/useScrollLock';

/**
 * Asked once, the first time somebody watching taps a score.
 *
 * There is no Done button. The code is exactly four digits, so the fourth one
 * is the whole of the answer and a button after it would be a tap that only
 * ever means yes. That is also why the boxes come back empty on a refusal
 * rather than waiting to be cleared by hand.
 *
 * What it does not do is decide anything. The database is asked, every time,
 * and the code is carried on to the caller only when the database has said so.
 * Nothing about the answer is worked out on this phone, because everything on
 * this phone belongs to whoever is holding it.
 */

const QUIET_TEXT = '#636A77';

interface Props {
  shareKey: string;
  /** Given the code that worked, to be kept for the edits that follow. */
  onUnlocked: (code: string) => void;
  onCancel: () => void;
}

export function CodePrompt({ shareKey, onUnlocked, onCancel }: Props) {
  const [value, setValue] = useState('');
  const [state, setState] = useState<'typing' | 'checking' | CodeCheck>('typing');
  // Bumped on every refusal, and used as the boxes' key. Remounting them is
  // what puts the caret back in the first one, and it costs one number rather
  // than an imperative handle reaching into the component to move focus.
  const [attempt, setAttempt] = useState(0);

  useScrollLock(true);

  async function submit(code: string) {
    setState('checking');
    const answer = await checkCode(shareKey, code);
    if (answer === 'ok') {
      onUnlocked(code);
      return;
    }
    setState(answer);
    setValue('');
    setAttempt((n) => n + 1);
  }

  function handleChange(next: string) {
    if (state === 'checking') return;
    setValue(next);
    // Whatever went wrong last time stops being said the moment they start
    // again. A complaint left standing over a half-typed code reads as being
    // about the code being typed.
    if (state !== 'typing') setState('typing');
    if (next.length === CODE_LENGTH) void submit(next);
  }

  const message =
    state === 'wrong'
      ? 'That code is not right. Ask whoever is running this session.'
      : state === 'offline'
        ? 'You are offline. Try again when you are back on.'
        : state === 'error'
          ? 'Could not check that just now. Try again.'
          : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Enter the score editing code"
        className={`mx-4 w-full max-w-sm bg-white ${panelCard} p-6`}
      >
        <div className="mb-4">
          <PanelHeading icon={LockIcon} title="Enter the Code" />
        </div>

        <p className="mb-4 text-center text-[15px] leading-snug text-[#3D495A]">
          Whoever is running this session can give you the four digit code. It
          lets you change any score here.
        </p>

        <CodeEntry
          key={attempt}
          autoFocus
          value={value}
          onChange={handleChange}
          label="Score editing code"
          describedBy="code-prompt-status"
        />

        {/* One line, always here, so nothing below it moves when it fills. */}
        <p
          id="code-prompt-status"
          role="status"
          className={`mt-3 min-h-[2.5rem] text-center text-sm ${message ? 'font-medium text-red-700' : ''}`}
          style={message ? undefined : { color: QUIET_TEXT }}
        >
          {message ?? (state === 'checking' ? 'Checking…' : '')}
        </p>

        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-md border border-[#999] bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
