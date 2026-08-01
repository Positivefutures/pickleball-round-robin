// Crossing arrows — the standard "shuffle" glyph.
export function ShuffleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M16 3h5v5" />
      <path d="M4 20 21 3" />
      <path d="M21 16v5h-5" />
      <path d="M15 15l6 6" />
      <path d="M4 4l5 5" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="#dc2626"
      className="w-4 h-4"
    >
      <path d="M9 3v1H4v2h16V4h-5V3H9zM6 8v11a2 2 0 002 2h8a2 2 0 002-2V8H6zm3 2h2v9H9v-9zm4 0h2v9h-2v-9z" />
    </svg>
  );
}
