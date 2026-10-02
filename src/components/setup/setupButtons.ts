/**
 * Generate Schedule, the button that moves the afternoon on from Setup.
 *
 * It is drawn on Setup, above and below the player list, and again at the foot
 * of Choose Sit-Outs, where it does the same job one page later. One string so
 * the three cannot drift apart.
 *
 * py-3.5 is the height Continue to Setup is drawn at on the Players tab, and the
 * button beside it in each row is drawn to match.
 */
export const generateButton =
  'px-6 py-3.5 bg-brand-teal text-white rounded-md hover:bg-brand-teal-dark transition-colors font-bold';
