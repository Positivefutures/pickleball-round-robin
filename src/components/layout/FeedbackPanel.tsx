import { useRef, useState } from 'react';
import {
  buildBody,
  buildSubject,
  diagnosticLines,
  mailtoUrl,
  toClipboardText,
  MAX_SUMMARY,
  MAX_DETAILS,
  type FeedbackContext,
  type FeedbackKind,
} from '../../lib/feedback';
import { FEEDBACK_EMAIL } from '../../lib/appInfo';

interface Props {
  kind: FeedbackKind;
  context: FeedbackContext;
  onClose: () => void;
}

const COPY: Record<
  FeedbackKind,
  { title: string; intro: string; summary: string; details: string; hint: string }
> = {
  feature: {
    title: 'Suggest a Feature',
    intro: 'Ideas are welcome — the short ones are often the best ones.',
    summary: 'Your idea, in one line',
    details: 'Tell me more (optional)',
    hint: 'What would it do, and when would you use it?',
  },
  bug: {
    title: 'Report a Bug',
    intro: 'Sorry about that. A few details make it much easier to fix.',
    summary: 'What went wrong, in one line',
    details: 'What happened?',
    hint: 'What you did, what you expected, and what happened instead.',
  },
};

export function FeedbackPanel({ kind, context, onClose }: Props) {
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [summaryMissing, setSummaryMissing] = useState(false);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const summaryRef = useRef<HTMLInputElement>(null);

  const copy = COPY[kind];
  const attached = diagnosticLines(context, kind);

  // Returns null (and points at the field) when there is nothing worth sending.
  function compose() {
    if (!summary.trim()) {
      setSummaryMissing(true);
      summaryRef.current?.focus();
      return null;
    }
    const subject = buildSubject(kind, summary);
    return { subject, body: buildBody(kind, summary, details, context) };
  }

  function handleSend() {
    const message = compose();
    if (!message) return;
    window.location.href = mailtoUrl(FEEDBACK_EMAIL, message.subject, message.body);
    setSent(true);
  }

  async function handleCopy() {
    const message = compose();
    if (!message) return;
    try {
      await navigator.clipboard.writeText(
        toClipboardText(FEEDBACK_EMAIL, message.subject, message.body)
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the text is still on screen to select by hand
      setCopied(false);
    }
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
        <h2 className="text-center text-[1.35rem] font-extrabold text-[#222]">{copy.title}</h2>

        {sent ? (
          <>
            <p className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
              Your email app should have opened with everything filled in — send it and it
              comes straight to me. Thank you!
            </p>
            <p className="mt-3 text-sm text-gray-600">
              Nothing happened? This device may not have an email app set up. Use Copy
              instead and paste it wherever suits you.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={handleCopy}
                className="flex-1 rounded-md bg-blue-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-blue-700"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-md border border-[#999] bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-300"
              >
                Done
              </button>
            </div>
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

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={handleSend}
                className="flex-1 rounded-md bg-green-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-green-700"
              >
                Send
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="flex-1 rounded-md bg-blue-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-blue-700"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-gray-500">
              Send opens your email app. Copy puts the message on your clipboard instead.
            </p>

            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-md border border-[#999] bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-300"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
