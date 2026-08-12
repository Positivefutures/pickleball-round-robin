/**
 * What labels a control, anywhere in the app.
 *
 * Bold and small, above the thing it names. Small because a label is not the
 * content, bold because at that size a label in the ordinary weight reads as a
 * note about the field rather than the name of it. Two surfaces had already
 * arrived here on their own — the account panels through `accountStyles.ts` and
 * the courts and rounds steppers on Setup — and this is the rest of the app
 * catching up with them.
 *
 * The colour is deliberately part of it. Where a surface has its own ink, as
 * the account panels and Setup do, the weight and the size are what carry over
 * and the colour stays theirs.
 */
export const FIELD_LABEL = 'block text-sm font-bold text-gray-700';
