import type { CourtScore } from '../../types';
import { winnerOfScore, type Side } from '../../lib/standings';

/**
 * What a score panel wears.
 *
 * Its own file rather than sitting beside the board, so the board and the box
 * that fills it in can both read from one source and never disagree about what a
 * winner looks like. (Also what fast refresh wants: a component file that only
 * exports components.)
 */

export type Tone = 'blank' | 'win' | 'loss' | 'draw';

/**
 * Only the panels take colour. The players below keep their blue and orange
 * whatever the score says: two colour systems on one card, one for which side
 * you are on and one for whether you won, and mixing them makes both unreadable.
 */
export const PANEL_TONE: Record<Tone, string> = {
  blank: 'border-gray-800 bg-white text-gray-300',
  win: 'border-green-700 bg-green-100 text-green-800',
  loss: 'border-red-700 bg-red-100 text-red-800',
  // Both sides the same, and neither of the other two colours. A level game is
  // its own result, not a quiet win for whoever is drawn on the left.
  draw: 'border-yellow-700 bg-yellow-100 text-yellow-800',
};

/** Which tone each side wears, given a score or the lack of one. */
export function toneFor(score: CourtScore | undefined, side: Side): Tone {
  if (!score) return 'blank';
  const won = winnerOfScore(score);
  if (won === null) return 'draw';
  return won === side ? 'win' : 'loss';
}
