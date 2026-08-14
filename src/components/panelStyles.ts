/**
 * The edge every popup panel and dialog is drawn with.
 *
 * It used to be a 3px #444 box with a small shadow, which was the loudest thing
 * on the screen: a near-black frame around white, sitting on a backdrop that is
 * already dimmed to 40% black. The dimming is what separates a panel from the
 * app behind it, so the border only ever has to finish the edge.
 *
 * So: 2px, in teal taken halfway to white, with a bigger shadow and a rounder
 * corner. The tint is quiet enough not to argue with the teal glyph and the teal
 * buttons inside, and it puts these panels in the same family as the My Account
 * and Donate cards, which are the same shape in their own green.
 *
 * Chrome only. Padding, width, background and scrolling stay with each panel,
 * because a confirm dialog and the instructions-sized ones do not share those.
 *
 * A string rather than a component: nineteen panels across four folders use it,
 * and a wrapper would have had to take every one of their layouts as a prop.
 */
export const panelCard = 'rounded-2xl border-2 border-[#7FBEC4] shadow-xl';
