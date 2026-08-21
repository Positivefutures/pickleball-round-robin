/**
 * The chrome the two orange banners share.
 *
 * The orange is the one Jeff drew in `INBOX/New Version.png`, and it is
 * deliberately not `brand-orange`: that is #f54702, and this is a shade warmer.
 * It lived as a lone constant inside UpdateBanner until the install offer was
 * asked to match it, which is the moment to name it rather than paste it a
 * second time.
 *
 * Green used to be what told the install offer apart from the new-version bar.
 * That job now falls to what each one says and to when it appears: the two ask
 * for different things, and only one of them is ever waiting on a build.
 */

/** The fill and the hover on anything solid — the icon tile and the button. */
export const bannerOrange = 'bg-[#FA5D02] hover:bg-[#DE5202]';

/** The bar itself: pale fill, a line a shade darker, the same box on both. */
export const bannerOrangeEdge = 'rounded-lg border border-orange-200 bg-orange-50';

/** What the dismiss cross lights up with inside that bar. */
export const bannerOrangeHover = 'hover:bg-orange-100';
