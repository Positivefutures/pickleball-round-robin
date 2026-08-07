import type { ReactNode } from 'react';

/**
 * Icons used across the app, drawn inline so there is no icon library to ship or
 * keep up to date. Every one is a filled path that takes the colour of the text
 * beside it, and defaults to 1rem square, the size that sits level with body
 * text. Some carry the grid they were drawn on rather than the usual 24.
 *
 * Icons that only ever appear on a court live in `schedule/icons.tsx`.
 */
function Solid({
  className = 'w-4 h-4',
  viewBox = '0 0 24 24',
  children,
}: {
  className?: string;
  /** Only for artwork that arrived drawn on a different grid. */
  viewBox?: string;
  children: ReactNode;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      fill="currentColor"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

/** Two people, filled. The Players step. */
export function StepPlayersIcon({ className }: { className?: string }) {
  return (
    <Solid className={className}>
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </Solid>
  );
}

/** A cog, outlined. The Setup step. */
export function StepSetupIcon({ className }: { className?: string }) {
  return (
    <Solid className={className}>
      <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.09-.16-.26-.25-.44-.25-.06 0-.12.01-.17.03l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.06-.02-.12-.03-.18-.03-.17 0-.34.09-.43.25l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.09.16.26.25.44.25.06 0 .12-.01.17-.03l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.06.02.12.03.18.03.17 0 .34-.09.43-.25l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zm-1.98-1.71c.04.31.05.52.05.73 0 .21-.02.43-.05.73l-.14 1.13.89.7 1.08.84-.7 1.21-1.27-.51-1.04-.42-.9.68c-.43.32-.84.56-1.25.73l-1.06.43-.16 1.13-.2 1.35h-1.4l-.19-1.35-.16-1.13-1.06-.43c-.43-.18-.83-.41-1.23-.71l-.91-.7-1.06.43-1.27.51-.7-1.21 1.08-.84.89-.7-.14-1.13c-.03-.31-.05-.54-.05-.74s.02-.43.05-.73l.14-1.13-.89-.7-1.08-.84.7-1.21 1.27.51 1.04.42.9-.68c.43-.32.84-.56 1.25-.73l1.06-.43.16-1.13.2-1.35h1.39l.19 1.35.16 1.13 1.06.43c.43.18.83.41 1.23.71l.91.7 1.06-.43 1.27-.51.7 1.21-1.07.85-.89.7.14 1.13zM12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
    </Solid>
  );
}

/** A month calendar, outlined. The Schedule step. */
export function StepScheduleIcon({ className }: { className?: string }) {
  return (
    <Solid className={className}>
      <path d="M7 11h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-8 4h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z" />
      <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z" />
    </Solid>
  );
}


/**
 * The Players step follows the same two-weight rule as the design Jeff
 * supplied: a heading carries a solid glyph in colour, a button carries the
 * line version of the same shape in white. The pairs below are drawn to match
 * rather than reused from a set, so the solid and line versions of "add a
 * player" sit at the same weight as each other.
 */

/** One person and a plus, solid. Heads the Add Player panel. */
export function AddPlayerSolidIcon({ className }: { className?: string }) {
  return (
    <Solid className={className}>
      <circle cx="9" cy="7" r="4.4" />
      <path d="M9 13.4c-4.42 0-8 2.3-8 5.15V20h16v-1.45c0-2.85-3.58-5.15-8-5.15z" />
      <path d="M17.9 2.8h2.4v3.1h3.1v2.4h-3.1v3.1h-2.4V8.3h-3.1V5.9h3.1z" />
    </Solid>
  );
}

/**
 * Three people, solid. Marks a group: the My Groups panel and the group's own
 * list. This is Jeff's own artwork, `INBOX/My Groups.svg`, with the paths taken
 * across untouched — hence the 512 grid it was drawn on rather than the 24 the
 * rest of this file uses. The drawing is wider than it is tall and sits centred
 * in its square, which is how the file itself is set up.
 */
export function GroupSolidIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 512 512">
      <path d="M318.72,293.065c-12.87-7.03-27.63-11.02-43.32-11.02h-37.29c-16.13,0-31.27,4.22-44.38,11.61c-27.57,15.52-46.19,45.07-46.19,78.96v27.94h218.43v-27.94C365.97,338.285,346.87,308.425,318.72,293.065z" />
      <path d="M421.7,257.225h-31c-18.1,0-34.97,5.35-49.12,14.57c6.8,4.46,13.19,9.67,19.08,15.56c22.77,22.77,35.31,53.05,35.31,85.26v13.14H512v-38.23C512,297.735,471.49,257.225,421.7,257.225z" />
      <path d="M121.3,257.225h-31c-49.79,0-90.3,40.51-90.3,90.3v38.23h117.54v-13.14c0-32.21,12.55-62.49,35.32-85.26c5.67-5.67,11.8-10.71,18.32-15.06C156.88,262.775,139.73,257.225,121.3,257.225z" />
      <path d="M406.153,121.416c-0.159,0-0.324,0.001-0.484,0.003c-33.558,0.277-60.622,29.282-60.33,64.655c0.291,35.205,27.565,63.652,60.906,63.652c0.16,0,0.324-0.001,0.484-0.003c16.455-0.136,31.81-7.068,43.238-19.521c11.162-12.164,17.232-28.192,17.093-45.134C466.769,149.863,439.495,121.416,406.153,121.416z" />
      <path d="M105.754,121.416c-0.159,0-0.324,0.001-0.484,0.003c-33.558,0.277-60.622,29.282-60.33,64.655c0.29,35.205,27.565,63.652,60.906,63.652c0.16,0,0.324-0.001,0.484-0.003c16.454-0.136,31.81-7.068,43.238-19.521c11.163-12.164,17.233-28.192,17.093-45.134C166.37,149.863,139.096,121.416,105.754,121.416z" />
      <path d="M256.76,111.445c-38.69,0-70.16,33.25-70.16,74.13c0,29.54,16.44,55.1,40.17,67c9.1,4.57,19.27,7.12,29.99,7.12c10.72,0,20.89-2.55,29.99-7.12c23.73-11.9,40.17-37.46,40.17-67C326.92,144.695,295.45,111.445,256.76,111.445z" />
    </Solid>
  );
}

/**
 * A ticked box. The blue Select Players button.
 *
 * `INBOX/checkbox.svg` verbatim, drawn on the same 24 grid as the rest of this
 * file, so it needs no transform. The supplied `Select Players.svg` is not used:
 * it holds no paths at all, only three PNGs in an SVG wrapper, and would have
 * put raster artwork back into the app.
 */
export function SelectPlayersIcon({ className }: { className?: string }) {
  return (
    <Solid className={className}>
      <path d="m16.2 22h-8.4c-1.8 0-2.8 0-3.6-.4s-1.4-1-1.7-1.7c-.5-.9-.5-1.9-.5-3.7v-8.4c0-1.8 0-2.8.4-3.6s1-1.4 1.7-1.7c.9-.5 1.9-.5 3.7-.5h8.4c1.8 0 2.8 0 3.6.4s1.4 1 1.7 1.7c.5.9.5 1.9.5 3.7v8.4c0 1.8 0 2.8-.4 3.6s-1 1.4-1.7 1.7c-.9.5-1.9.5-3.7.5zm-8.4-18c-1.5 0-2.3 0-2.7.2s-.7.5-.9.9-.2 1.2-.2 2.7v8.4c0 1.5 0 2.3.2 2.7s.5.7.9.9 1.2.2 2.7.2h8.4c1.5 0 2.3 0 2.7-.2s.7-.5.9-.9.2-1.2.2-2.7v-8.4c0-1.5 0-2.3-.2-2.7s-.5-.7-.9-.9-1.2-.2-2.7-.2zm2.7 12c-.3 0-.5-.1-.7-.3l-3-3c-.4-.4-.4-1 0-1.4s1-.4 1.4 0l2.3 2.3 5.3-5.3c.4-.4 1-.4 1.4 0s.4 1 0 1.4l-6 6c-.2.2-.4.3-.7.3z" />
    </Solid>
  );
}

/**
 * A chain link. The Set Partners button on Setup.
 *
 * `INBOX/link.svg` verbatim, so it keeps the 512 grid it was drawn on rather
 * than the 24 most of this file uses.
 */
export function LinkIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 512 512">
      <path d="m307.148 35.148-104.067 104.066c-.201.2-.326.443-.526.645 25.637-3.734 51.974-1.174 76.388 8.346l70.63-70.63c23.399-23.399 61.454-23.399 84.853 0 23.399 23.397 23.399 61.454 0 84.851-3.99 3.992-110.083 110.085-104.066 104.066-23.584 23.586-62.276 22.577-84.853 0-11.693-11.693-30.731-11.693-42.426 0l-18.214 18.214c5.052 8.584 10.844 16.844 18.214 24.214 44.44 44.44 120.934 47.99 169.061.526.201-.2.443-.326.645-.526l104.066-104.066c46.862-46.864 46.862-122.842 0-169.706-46.864-46.864-122.841-46.864-169.705 0z" />
      <path d="m233.285 363.568-70.858 70.858c-23.397 23.399-61.454 23.399-84.851 0-23.399-23.399-23.399-61.454 0-84.853 3.99-3.99 110.31-110.31 104.293-104.293 23.584-23.584 62.276-22.577 84.853 0 11.693 11.695 30.732 11.695 42.426 0l18.214-18.214c-5.052-8.584-10.844-16.844-18.214-24.212-44.355-44.357-120.793-48.131-169.061-.527-.201.2-.443.326-.645.527l-104.294 104.294c-46.862 46.862-46.864 122.842 0 169.706 46.864 46.862 122.844 46.862 169.706 0l104.293-104.295c.201-.2.326-.441.526-.645-25.637 3.734-51.973 1.174-76.388-8.346z" />
    </Solid>
  );
}

/**
 * The male and female symbols linked. Marks the Mixed Games format.
 *
 * `INBOX/mixed.svg` verbatim, keeping the 64 grid it was drawn on.
 */
export function MixedGamesIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 64 64">
      <path d="m63.99992 23.27309c0-8.82236-7.17764-16-16-16s-16 7.17764-16 16c0 7.78328 5.58816 14.2783 12.96117 15.70283v5.66392h-3.42c-1.67768 0-3.03883 1.36049-3.03883 3.03883s1.36114 3.03883 3.03883 3.03883h3.42v2.97156c0 1.67834 1.36114 3.03883 3.03883 3.03883s3.03883-1.36048 3.03883-3.03883v-2.97156h3.42c1.67768 0 3.03883-1.36048 3.03883-3.03883s-1.36114-3.03883-3.03883-3.03883h-3.42v-5.66392c7.373-1.42454 12.96117-7.91955 12.96117-15.70283zm-25.92235 0c0-5.47094 4.4514-9.92235 9.92235-9.92235s9.92235 4.45141 9.92235 9.92235c0 5.4716-4.4514 9.92301-9.92235 9.92301s-9.92235-4.45141-9.92235-9.92301zm-19.03883 1.75261v-7.85483l1.27541 1.15687c.58165.52823 1.31234.78806 2.04039.78806.82829 0 1.65263-.33633 2.25274-.99712 1.12637-1.2431 1.03273-3.16478-.20971-4.29247l-6.35595-5.76507c-.00387.00198-.00602.00371-.00989.00569-.53928-.48834-1.24738-.79375-2.03182-.79375-.78592 0-1.49542.30649-2.03503.79639-.00272-.00313-.00396-.00519-.00668-.00833l-6.35595 5.76507c-1.24244 1.12769-1.33608 3.04938-.20971 4.29247.60012.66145 1.42446.99712 2.25275.99712.72805 0 1.45874-.26049 2.04039-.78806l1.27541-1.15687v7.85483c-7.37301 1.42454-12.96117 7.91947-12.96117 15.70217 0 8.82236 7.17764 16 16 16s16-7.17764 16-16c0-7.7827-5.58817-14.27763-12.96118-15.70217zm-3.03882 25.62452c-5.47094 0-9.92235-4.4514-9.92235-9.92235s4.45141-9.92235 9.92235-9.92235 9.92235 4.45141 9.92235 9.92235-4.45141 9.92235-9.92235 9.92235z" />
    </Solid>
  );
}
