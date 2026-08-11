/**
 * The one glyph that only ever appears on the schedule. Everything else the
 * app draws lives in `components/icons.tsx`.
 */

/**
 * A bin. Marks taking somebody off for the rest of the session.
 *
 * Takes the colour of the text beside it rather than carrying its own red, the
 * same contract as every other icon in the app. It sat on a court once, hard
 * coded to #dc2626 and sized in the file; now it sits in a row whose words are
 * already red, and two reds that had to be kept in step was one too many.
 */
export function TrashIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d="M9 3v1H4v2h16V4h-5V3H9zM6 8v11a2 2 0 002 2h8a2 2 0 002-2V8H6zm3 2h2v9H9v-9zm4 0h2v9h-2v-9z" />
    </svg>
  );
}
