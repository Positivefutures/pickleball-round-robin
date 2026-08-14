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
 * What leaving a schedule costs, in one sentence.
 *
 * There are three doors out of a schedule: the Setup tab, the Players tab, and
 * New Round Robin in the Actions sheet. Each names itself, and each says this,
 * so no route out can quietly undersell what it throws away.
 */
export const DISCARD_WARNING =
  "This will discard the current schedule including any swaps you've made " +
  "and rounds you've marked complete.";
