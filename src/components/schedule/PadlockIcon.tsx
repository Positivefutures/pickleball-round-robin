/**
 * The padlock on the schedule: shut and black when it holds, open and grey when
 * it is there to be tapped.
 *
 * Drawn between the two players of a team, where it keeps the pair together
 * through a reshuffle, and under a sit-out's name, where it keeps that player on
 * the bench for the round. One drawing for both, so the two read as the same
 * promise about the same button.
 */
export function PadlockIcon({ locked }: { locked: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={locked ? '#000000' : '#d1d5db'}
      className="w-4 h-4"
    >
      {locked ? (
        <path d="M12 2C9.24 2 7 4.24 7 7v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V7c0-2.76-2.24-5-5-5zm-3 5c0-1.66 1.34-3 3-3s3 1.34 3 3v3H9V7z" />
      ) : (
        <path d="M12 2C9.24 2 7 4.24 7 7v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-7V7c0-1.66 1.34-3 3-3s3 1.34 3 3v1h2V7c0-2.76-2.24-5-5-5z" />
      )}
    </svg>
  );
}
