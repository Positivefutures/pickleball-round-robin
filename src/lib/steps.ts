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
