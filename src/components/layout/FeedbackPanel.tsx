import { useRef, useState, useSyncExternalStore } from 'react';
import {
  diagnosticLines,
  sendFeedback,
  MAX_EMAIL,
  MAX_SUMMARY,
  MAX_DETAILS,
  type FeedbackContext,
  type FeedbackKind,
} from '../../lib/feedback';
import { authStore } from '../../lib/auth';
import { PanelGlyph } from '../PanelGlyph';
import { BugIcon, SendMailIcon } from '../icons';

interface Props {
  kind: FeedbackKind;
  context: FeedbackContext;
  onClose: () => void;
}

/**
 * A glyph apiece, and they are not the same one. Both panels look alike and sit
 * next to each other in the settings drawer, so the shape at the top is the
 * fastest way to tell which one is open.
 */
const COPY: Record<
  FeedbackKind,
  {
    title: string;
    intro: string;
    summary: string;
    details: string;
    hint: string;
    Icon: (props: { className?: string }) => React.ReactElement;
  }
> = {
  feature: {
    title: 'Suggest a Feature',
    intro: 'Ideas are welcome — the short ones are often the best ones.',
    summary: 'Your idea, in one line',
    details: 'Tell me more (optional)',
    hint: 'What would it do, and when would you use it?',
    Icon: SendMailIcon,
  },
  bug: {
    title: 'Report a Bug',
    intro: 'Sorry about that. A few details make it much easier to fix.',
    summary: 'What went wrong, in one line',
    details: 'What happened?',
    hint: 'What you did, what you expected, and what happened instead.',
    Icon: BugIcon,
  },
};

export function FeedbackPanel({ kind, context, onClose }: Props) {
  const auth = useSyncExternalStore(authStore.subscribe, authStore.get, authStore.get);

  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  // Whoever they are signed in as, which is nearly always the address they
  // would have replied from anyway. Only the first render: they are free to put
  // a different one in, and signing in mid-report is not a thing that happens.
  const [replyTo, setReplyTo] = useState(() =>
    auth.status === 'signed-in' ? (auth.email ?? '') : ''
  );
  const [summaryMissing, setSummaryMissing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const summaryRef = useRef<HTMLInputElement>(null);

  const copy = COPY[kind];
  const attached = diagnosticLines(context, kind);

  async function handleSend() {
    if (!summary.trim()) {
      setSummaryMissing(true);
      summaryRef.current?.focus();
      return;
    }

    setSending(true);
    setProblem(null);
    const result = await sendFeedback({ kind, summary, details, replyTo, context });
    setSending(false);

    if (result.ok) setSent(true);
    else setProblem(result.message ?? 'That did not send. Please try again.');
  }

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-lg border-[3px] border-[#444] bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <PanelGlyph icon={copy.Icon} />
        <h2 className="text-center text-[1.35rem] font-extrabold text-[#222]">{copy.title}</h2>

        {sent ? (
          <>
            <p className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
              Sent. It has come straight to me. Thank you!
            </p>
            {replyTo.trim() && (
              <p className="mt-3 text-sm text-gray-600">
                I have your email address, so I can write back if I need to.
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-md border border-[#999] bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-300"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 mb-4 text-center text-sm text-gray-600">{copy.intro}</p>

            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="fb-summary">
              {copy.summary}
            </label>
            <input
              id="fb-summary"
              ref={summaryRef}
              type="text"
              value={summary}
              maxLength={MAX_SUMMARY}
              onChange={(e) => {
                setSummary(e.target.value);
                setSummaryMissing(false);
              }}
              aria-invalid={summaryMissing}
              className={`w-full rounded-md border px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 ${
                summaryMissing
                  ? 'border-red-500 bg-red-50 ring-2 ring-red-300 focus:ring-red-500'
                  : 'border-gray-300 focus:ring-green-500'
              }`}
            />

            <label
              className="mb-1 mt-4 block text-sm font-medium text-gray-700"
              htmlFor="fb-details"
            >
              {copy.details}
            </label>
            <textarea
              id="fb-details"
              value={details}
              rows={4}
              maxLength={MAX_DETAILS}
              placeholder={copy.hint}
              onChange={(e) => setDetails(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-500"
            />

            <label className="mb-1 mt-4 block text-sm font-medium text-gray-700" htmlFor="fb-email">
              Your email (if you&rsquo;d like a reply)
            </label>
            <input
              id="fb-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={replyTo}
              maxLength={MAX_EMAIL}
              placeholder="you@example.com"
              onChange={(e) => setReplyTo(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-500"
            />

            <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Sent with your message
              </p>
              <ul className="space-y-0.5 text-xs text-gray-600">
                {attached.map((line) => (
                  <li key={line} className="truncate" title={line}>
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-gray-500">
                No names, ratings or player details are included.
              </p>
            </div>

            {/* Amber rather than red. Nothing they wrote caused it, and what
                they wrote is still in the boxes above to send again. */}
            {problem && (
              <p
                role="status"
                className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              >
                {problem}
              </p>
            )}

            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending}
              className="mt-5 w-full rounded-md bg-brand-teal px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="mt-3 w-full rounded-md border border-[#999] bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-300 disabled:opacity-50"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
