export type Step = 'roster' | 'setup' | 'schedule';

export const STEPS: { key: Step; label: string }[] = [
  { key: 'roster', label: '1. Players' },
  { key: 'setup', label: '2. Setup' },
  { key: 'schedule', label: '3. Schedule' },
];

/** The step's display name, so nothing else has to repeat these strings. */
export function stepLabel(step: Step): string {
  return STEPS.find((s) => s.key === step)?.label ?? step;
}

/**
 * What replacing a schedule costs, in one sentence.
 *
 * It used to be said by three doors — the Setup tab, the Players tab and New
 * Round Robin. The tabs no longer take anything away, so this is down to
 * Generate, which is the one thing that writes over a schedule.
 *
 * New Round Robin says its own version, in Jeff's words on 2026-08-15. The two
 * differ on purpose: this one is about a rebuild, where the swaps and the ticks
 * are what somebody would miss, and that one is about clearing the afternoon,
 * where it is the scores.
 */
export const DISCARD_WARNING =
  "This will discard the current schedule including any swaps you've made " +
  "and rounds you've marked complete.";
