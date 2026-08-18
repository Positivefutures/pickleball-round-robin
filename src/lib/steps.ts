export type Step = 'roster' | 'setup' | 'schedule';

export const STEPS: { key: Step; label: string }[] = [
  { key: 'roster', label: '1. Players' },
  { key: 'setup', label: '2. Setup' },
  { key: 'schedule', label: '3. Schedule' },
];

/**
 * The step's name in a sentence: "Returning to Setup discards the session".
 *
 * Not the tab's label, which is numbered because the three of them are a route
 * and the numbers are how a host knows where they are in it. A number read out
 * in the middle of a sentence is a step in a recipe.
 */
export function stepName(step: Step): string {
  return step === 'roster' ? 'Players' : step === 'setup' ? 'Setup' : 'Schedule';
}
