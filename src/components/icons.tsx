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
 * Two male symbols linked, and two female. A pair of them marks the Gendered
 * Games format, because the format is both halves at once.
 *
 * `INBOX/men.svg` and `INBOX/women.svg` verbatim, both already on the 24 grid.
 */
export function MenGamesIcon({ className }: { className?: string }) {
  return (
    <Solid className={className}>
      <path d="m22 6h-4v2h2.586l-3.4 3.4a6.946 6.946 0 0 0 -3.253-1.333 6.946 6.946 0 0 0 -1.333-3.251l3.4-3.4v2.584h2v-4a2 2 0 0 0 -2-2h-4v2h2.586l-3.4 3.4a6.993 6.993 0 1 0 -5.117 12.531 7 7 0 1 0 12.531-5.115l3.4-3.4v2.584h2v-4a2 2 0 0 0 -2-2zm-20 5a5 5 0 1 1 5 5 5.006 5.006 0 0 1 -5-5zm11 11a5 5 0 0 1 -4.908-4.094 7.005 7.005 0 0 0 5.814-5.814 4.995 4.995 0 0 1 -.906 9.908z" />
    </Solid>
  );
}

export function WomenGamesIcon({ className }: { className?: string }) {
  return (
    <Solid className={className}>
      <path d="M24,7.5A7.486,7.486,0,0,0,12.005,1.51,7.5,7.5,0,1,0,6,14.849V19H3v2H6v3H8V21h3V19H8V14.976a7.442,7.442,0,0,0,4.005-1.486A7.456,7.456,0,0,0,16,14.975V19H13v2h3v3h2V21h3V19H18V14.849A7.513,7.513,0,0,0,24,7.5Zm-2,0A5.5,5.5,0,1,1,16.5,2,5.506,5.506,0,0,1,22,7.5ZM2,7.5a5.49,5.49,0,0,1,8.56-4.561,7.448,7.448,0,0,0,0,9.122A5.49,5.49,0,0,1,2,7.5Z" />
    </Solid>
  );
}

/**
 * An outlined star. Marks the Equal Skill Games format.
 *
 * `INBOX/star.svg` verbatim, so it keeps the 512 grid it was drawn on and the
 * ten units of headroom that file starts its box with.
 */
export function EqualSkillIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 -10 511.98685 511">
      <path d="m114.59375 491.140625c-5.609375 0-11.179688-1.75-15.933594-5.1875-8.855468-6.417969-12.992187-17.449219-10.582031-28.09375l32.9375-145.089844-111.703125-97.960937c-8.210938-7.167969-11.347656-18.519532-7.976562-28.90625 3.371093-10.367188 12.542968-17.707032 23.402343-18.710938l147.796875-13.417968 58.433594-136.746094c4.308594-10.046875 14.121094-16.535156 25.023438-16.535156 10.902343 0 20.714843 6.488281 25.023437 16.511718l58.433594 136.769532 147.773437 13.417968c10.882813.980469 20.054688 8.34375 23.425782 18.710938 3.371093 10.367187.253906 21.738281-7.957032 28.90625l-111.703125 97.941406 32.9375 145.085938c2.414063 10.667968-1.726562 21.699218-10.578125 28.097656-8.832031 6.398437-20.609375 6.890625-29.910156 1.300781l-127.445312-76.160156-127.445313 76.203125c-4.308594 2.558594-9.109375 3.863281-13.953125 3.863281zm141.398438-112.875c4.84375 0 9.640624 1.300781 13.953124 3.859375l120.277344 71.9375-31.085937-136.941406c-2.21875-9.746094 1.089843-19.921875 8.621093-26.515625l105.472657-92.5-139.542969-12.671875c-10.046875-.917969-18.6875-7.234375-22.613281-16.492188l-55.082031-129.046875-55.148438 129.066407c-3.882812 9.195312-12.523438 15.511718-22.546875 16.429687l-139.5625 12.671875 105.46875 92.5c7.554687 6.613281 10.859375 16.769531 8.621094 26.539062l-31.0625 136.9375 120.277343-71.914062c4.308594-2.558594 9.109376-3.859375 13.953126-3.859375zm-84.585938-221.847656s0 .023437-.023438.042969zm169.128906-.0625.023438.042969c0-.023438 0-.023438-.023438-.042969zm0 0" />
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

/**
 * One symbol on its own, marking a player as a man or a woman on a round whose
 * format turns on which they are. The pair above say what a format is; these two
 * say who somebody is, which is why they are separate icons rather than halves
 * of those.
 *
 * `INBOX/male.svg` and `INBOX/female.svg`, each keeping the grid it arrived on,
 * with one addition: a white disc behind the ring.
 *
 * **These two are not tintable the way the rest of the file is.** Every other
 * icon here is a shape that takes the colour of the text beside it and lets
 * whatever is behind show through the gaps. These sit half on and half off the
 * edge of a coloured place on a court, so an open ring would have had the box
 * colour on one side of it and the card on the other, and read as a smudge
 * rather than a symbol. The disc fills the ring so it reads as one mark on any
 * background, and it is drawn first so the artwork itself is untouched.
 */
export function MaleIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 50 50">
      <circle cx="19.75" cy="30.25" r="13.4" fill="#ffffff" />
      <path d="m45.8 1.7h-13.8c-1.4 0-2.5 1.1-2.5 2.5s1.1 2.5 2.5 2.5h7.7l-9.2 9.2c-7.1-5.3-17.2-4.8-23.6 1.6-7 7-7 18.5 0 25.5s18.5 7 25.5 0c6.4-6.4 7-16.6 1.6-23.6l9.2-9.2v7.8c0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5v-13.8c.1-1.4-1-2.5-2.4-2.5zm-16.8 37.8c-5.1 5.1-13.4 5.1-18.5 0s-5.1-13.4 0-18.5 13.4-5.1 18.5 0 5.1 13.4 0 18.5z" />
    </Solid>
  );
}

export function FemaleIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 512 512">
      <circle cx="256" cy="182.611" r="128" fill="#ffffff" />
      <path
        clipRule="evenodd"
        fillRule="evenodd"
        d="m284.904 362.926v35.509h23.594c15.962 0 28.906 12.944 28.906 28.906s-12.944 28.907-28.906 28.907h-23.594v26.845c0 15.962-12.944 28.907-28.906 28.907s-28.906-12.944-28.906-28.907v-26.845h-23.603c-15.957 0-28.906-12.948-28.906-28.907 0-15.958 12.949-28.906 28.906-28.906h23.603v-35.509c-87.699-13.981-153.705-90.192-153.705-180.315 0-100.699 81.911-182.611 182.611-182.611 100.699 0 182.615 81.911 182.615 182.611 0 90.125-66.007 166.334-153.709 180.315zm-153.709-180.315c0 68.805 55.999 124.798 124.802 124.798 68.806 0 124.802-55.991 124.802-124.798s-55.997-124.798-124.802-124.798c-68.802 0-124.802 55.993-124.802 124.798z"
      />
    </Solid>
  );
}

/**
 * A stroked wrapper for the handful of icons drawn as outlines rather than
 * filled shapes. Same sizing contract as `Solid`.
 */
function Stroked({
  className = 'w-4 h-4',
  strokeWidth = 2,
  children,
}: {
  className?: string;
  /** Raised where an icon has to carry weight rather than sit beside text. */
  strokeWidth?: number;
  children: ReactNode;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

/**
 * A refresh ring with a sparkle sitting in its gap. Heads the update banner.
 *
 * Drawn to match `INBOX/New Version.png`: the ring is open across the top left
 * and the sparkle stands in the opening, centred on the line the ring would
 * otherwise take. The ring is a touch heavier than the 2 this file's stroked
 * icons default to, which is what keeps it readable reversed out of orange at
 * this size.
 */
export function NewVersionIcon({ className }: { className?: string }) {
  return (
    <Stroked className={className}>
      <path d="M14.16 3.55a9.6 9.6 0 1 1-11.12 5.91" strokeWidth="2.25" />
      <path
        d="M7.25.3c0 2.53 3.74 4.6 4.4 4.6-.66 0-4.4 2.07-4.4 4.6 0-2.53-3.74-4.6-4.4-4.6.66 0 4.4-2.07 4.4-4.6z"
        fill="currentColor"
        stroke="none"
      />
    </Stroked>
  );
}

/**
 * A tray with an arrow leaving the top — the share glyph people already know.
 * On the Share App item in the settings drawer and on the panel's Share button,
 * which are the same action seen twice, so they must look the same.
 */
export function ShareIcon({ className }: { className?: string }) {
  return (
    <Stroked className={className}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </Stroked>
  );
}

/**
 * A box with an arrow leaving its corner: this link opens away from the app.
 * On the Donate callout.
 *
 * `INBOX/share.svg` verbatim, with its fill dropped so it takes the surrounding
 * text colour. Despite the filename this is an external-link mark, not the share
 * glyph above — keep the two apart.
 */
export function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <Solid className={className}>
      <path
        clipRule="evenodd"
        fillRule="evenodd"
        d="m21.0035 10c.5523 0 1-.44772 1-1v-6c0-.55228-.4477-1-1-1h-6.0036c-.5523 0-1 .44771-1 1 0 .55228.4477 1 1 1h3.5896l-8.60667 8.6066c-.39052.3905-.39052 1.0237 0 1.4142.39057.3906 1.02367.3906 1.41417 0l8.6065-8.60643v3.58563c0 .55228.4477 1 1 1zm-16.0035-5c-1.65685 0-3 1.34315-3 3v11c0 1.6569 1.34315 3 3 3h11c1.6569 0 3-1.3431 3-3v-6c0-.5523-.4477-1-1-1s-1 .4477-1 1v6c0 .5523-.4477 1-1 1h-11c-.55228 0-1-.4477-1-1v-11c0-.55228.44772-1 1-1h6c.5523 0 1-.44772 1-1s-.4477-1-1-1z"
      />
    </Solid>
  );
}

/**
 * Two stacked sheets. The Copy link button on the Share panel.
 *
 * `INBOX/copy.svg` verbatim, with its hard-coded black fill dropped so it takes
 * the button's text colour.
 */
export function CopyIcon({ className }: { className?: string }) {
  return (
    <Solid className={className}>
      <path d="m5.4521 22h9.0957c1.7485 0 3.1822-1.3118 3.4064-3h.5936c1.9034 0 3.4522-1.5488 3.4522-3.4521v-10.0958c0-1.9033-1.5488-3.4521-3.4521-3.4521h-9.0958c-1.9033 0-3.4521 1.5488-3.4521 3.4521v.5479h-.5479c-1.9033 0-3.4521 1.5488-3.4521 3.4521v9.0957c0 1.9034 1.5488 3.4522 3.4521 3.4522zm2.5479-16.5479c0-.8007.6514-1.4521 1.4521-1.4521h9.0957c.8008 0 1.4522.6514 1.4522 1.4521v10.0957c0 .8008-.6514 1.4522-1.4521 1.4522h-.5479v-7.5479c0-1.9033-1.5488-3.4521-3.4521-3.4521h-6.5479zm-4 4c0-.8007.6514-1.4521 1.4521-1.4521h9.0957c.8008 0 1.4522.6514 1.4522 1.4521v9.0957c0 .8008-.6514 1.4522-1.4521 1.4522h-9.0958c-.8007 0-1.4521-.6514-1.4521-1.4521z" />
    </Solid>
  );
}

/**
 * An outlined five-pointed star. Opens the Share panel's footer line.
 *
 * `INBOX/star.svg` verbatim, keeping the 511 grid and its -10 y-offset. The two
 * degenerate subpaths at the end are in the artwork as supplied; they draw
 * nothing and are left alone rather than hand-edited.
 */
export function StarIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 -10 511.98685 511">
      <path d="m114.59375 491.140625c-5.609375 0-11.179688-1.75-15.933594-5.1875-8.855468-6.417969-12.992187-17.449219-10.582031-28.09375l32.9375-145.089844-111.703125-97.960937c-8.210938-7.167969-11.347656-18.519532-7.976562-28.90625 3.371093-10.367188 12.542968-17.707032 23.402343-18.710938l147.796875-13.417968 58.433594-136.746094c4.308594-10.046875 14.121094-16.535156 25.023438-16.535156 10.902343 0 20.714843 6.488281 25.023437 16.511718l58.433594 136.769532 147.773437 13.417968c10.882813.980469 20.054688 8.34375 23.425782 18.710938 3.371093 10.367187.253906 21.738281-7.957032 28.90625l-111.703125 97.941406 32.9375 145.085938c2.414063 10.667968-1.726562 21.699218-10.578125 28.097656-8.832031 6.398437-20.609375 6.890625-29.910156 1.300781l-127.445312-76.160156-127.445313 76.203125c-4.308594 2.558594-9.109375 3.863281-13.953125 3.863281zm141.398438-112.875c4.84375 0 9.640624 1.300781 13.953124 3.859375l120.277344 71.9375-31.085937-136.941406c-2.21875-9.746094 1.089843-19.921875 8.621093-26.515625l105.472657-92.5-139.542969-12.671875c-10.046875-.917969-18.6875-7.234375-22.613281-16.492188l-55.082031-129.046875-55.148438 129.066407c-3.882812 9.195312-12.523438 15.511718-22.546875 16.429687l-139.5625 12.671875 105.46875 92.5c7.554687 6.613281 10.859375 16.769531 8.621094 26.539062l-31.0625 136.9375 120.277343-71.914062c4.308594-2.558594 9.109376-3.859375 13.953126-3.859375zm-84.585938-221.847656s0 .023437-.023438.042969zm169.128906-.0625.023438.042969c0-.023438 0-.023438-.023438-.042969zm0 0" />
    </Solid>
  );
}

/**
 * A pickleball paddle, outlined. Closes the Share panel's footer line.
 *
 * `INBOX/paddle.svg` verbatim, keeping the 64 grid it was drawn on, with its
 * hard-coded black fill dropped.
 */
export function PaddleIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 64 64">
      <path
        fillRule="nonzero"
        d="M57.6,31.316 C60.6865118,28.2206056 60.6865118,23.2113944 57.6,20.116 L43.85,6.364 C40.7552878,3.27583844 35.7447122,3.27583844 32.65,6.364 L17.765,21.249 C15.6345154,23.3651661 14.8929297,26.5087604 15.853,29.354 L18.718,37.954 L7,49.668 C6.18615627,49.5476105 5.36377834,49.8233468 4.787,50.41 C3.80305574,51.3969982 3.80305574,52.9940018 4.787,53.981 L9.987,59.181 C10.4599582,59.6563878 11.1034184,59.9228459 11.774,59.9210095 C12.4671368,59.9180839 13.1292457,59.6332399 13.608,59.132 C14.0843028,58.6603943 14.3512776,58.0172769 14.349,57.347 C14.3459552,57.216573 14.3332537,57.0865506 14.311,56.958 L26.016,45.249 L34.616,48.114 C35.4296879,48.3862329 36.28198,48.5253551 37.14,48.526 C39.234249,48.5226672 41.2410058,47.6857089 42.717,46.2 L57.6,31.316 Z M12.142,57.766 C11.9340975,57.9644769 11.6069025,57.9644769 11.399,57.766 L6.199,52.566 C6.09660622,52.4561947 6.04394665,52.3090708 6.05340628,52.1592302 C6.06286591,52.0093896 6.13360991,51.8700563 6.249,51.774 C6.34687191,51.6750041 6.48029114,51.6192933 6.6195,51.6192933 C6.75870886,51.6192933 6.89212809,51.6750041 6.99,51.774 L12.19,56.974 C12.2890885,57.0715466 12.3446152,57.2049551 12.3440051,57.344 C12.3390269,57.506819 12.2656979,57.6600114 12.142,57.766 L12.142,57.766 Z M13.242,55.195 L8.772,50.725 L19.862,39.634 L24.333,44.105 L13.242,55.195 Z M35.242,46.217 L26.283,43.231 L20.735,37.68 L17.749,28.721 C17.0328419,26.5941296 17.5873328,24.2451047 19.179,22.663 L34.064,7.778 C36.3770287,5.46894967 40.1229713,5.46894967 42.436,7.778 L56.188,21.53 C58.4959496,23.843484 58.4959496,27.588516 56.188,29.902 L41.3,44.787 C39.7174019,46.3755714 37.3710852,46.9296974 35.245,46.217 L35.242,46.217 Z"
      />
    </Solid>
  );
}

/**
 * A pickleball, seen face on: a disc with seven holes through it.
 *
 * Drawn here rather than taken from a file, to match the ball in
 * `INBOX/Setup-Round-Robin.png` at the size it is actually used. The holes are
 * subpaths of the same path, so `fillRule="evenodd"` is what makes them holes
 * instead of filling the disc solid — which means, like the heart below, it only
 * reads correctly against a plain background.
 *
 * The paddle above is the app's other pickleball mark. This one is for a place
 * that is about the game itself rather than about playing a shot.
 */
export function BallIcon({ className }: { className?: string }) {
  const hole = (x: number, y: number) =>
    `M${x - 1.45} ${y}a1.45 1.45 0 1 0 2.9 0a1.45 1.45 0 1 0-2.9 0Z`;
  return (
    <Solid className={className}>
      <path
        fillRule="evenodd"
        d={
          'M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0Z' +
          [
            [12, 5.8],
            [7.5, 8.5],
            [16.5, 8.5],
            [12, 11.7],
            [7.5, 15.4],
            [16.5, 15.4],
            [12, 18.2],
          ]
            .map(([x, y]) => hole(x, y))
            .join('')
        }
      />
    </Solid>
  );
}

/**
 * A disc with a heart knocked out of it, closing the Share panel's pitch.
 *
 * `INBOX/green-heart.svg` verbatim on its 254000 grid. The heart is a second
 * subpath, so `fillRule="evenodd"` is what makes it a hole rather than filling
 * solid — drop it and the icon becomes a plain circle. The hole shows the card
 * through it, so this only reads correctly on a plain background.
 */
export function GreenHeartIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 254000 254000">
      <path
        fillRule="evenodd"
        d="m127000 0c-70140 0-127000 56860-127000 127000s56860 127000 127000 127000 127000-56860 127000-127000-56860-127000-127000-127000zm-75526 90035c-7151 50957 43994 74242 75526 105773 31532-31531 82677-54816 75526-105773-4919-39462-58913-40135-75526-13617-16613-26518-70607-25845-75526 13617z"
      />
    </Solid>
  );
}

/**
 * Three people, the front one full height. `INBOX/My Groups.svg` verbatim on its
 * 512 grid — the same artwork as the Groups step, redrawn heavier so it holds up
 * at the size the My Account panel lists it.
 */
export function GroupsIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 512 512">
      <path d="m318.72 293.065c-12.87-7.03-27.63-11.02-43.32-11.02h-37.29c-16.13 0-31.27 4.22-44.38 11.61-27.57 15.52-46.19 45.07-46.19 78.96v27.94h218.43v-27.94c0-34.33-19.1-64.19-47.25-79.55z" />
      <path d="m421.7 257.225h-31c-18.1 0-34.97 5.35-49.12 14.57 6.8 4.46 13.19 9.67 19.08 15.56 22.77 22.77 35.31 53.05 35.31 85.26v13.14h116.03v-38.23c0-49.79-40.51-90.3-90.3-90.3z" />
      <path d="m121.3 257.225h-31c-49.79 0-90.3 40.51-90.3 90.3v38.23h117.54v-13.14c0-32.21 12.55-62.49 35.32-85.26 5.67-5.67 11.8-10.71 18.32-15.06-14.3-9.52-31.45-15.07-49.88-15.07z" />
      <path d="m406.153 121.416c-.159 0-.324.001-.484.003-33.558.277-60.622 29.282-60.33 64.655.291 35.205 27.565 63.652 60.906 63.652.16 0 .324-.001.484-.003 16.455-.136 31.81-7.068 43.238-19.521 11.162-12.164 17.232-28.192 17.093-45.134-.291-35.205-27.565-63.652-60.907-63.652z" />
      <path d="m105.754 121.416c-.159 0-.324.001-.484.003-33.558.277-60.622 29.282-60.33 64.655.29 35.205 27.565 63.652 60.906 63.652.16 0 .324-.001.484-.003 16.454-.136 31.81-7.068 43.238-19.521 11.163-12.164 17.233-28.192 17.093-45.134-.291-35.205-27.565-63.652-60.907-63.652z" />
      <path d="m256.76 111.445c-38.69 0-70.16 33.25-70.16 74.13 0 29.54 16.44 55.1 40.17 67 9.1 4.57 19.27 7.12 29.99 7.12s20.89-2.55 29.99-7.12c23.73-11.9 40.17-37.46 40.17-67 0-40.88-31.47-74.13-70.16-74.13z" />
    </Solid>
  );
}

/**
 * A desktop and a phone with arrows circling between them. `INBOX/sync.svg`
 * verbatim, drawn on 24 unlike its neighbours here, which is why it carries no
 * viewBox override.
 */
export function SyncDevicesIcon({ className }: { className?: string }) {
  return (
    <Solid className={className}>
      <path d="m5.5 11.5h2.5v1h-1a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-1v-1h2.5a1.5 1.5 0 0 0 1.5-1.5v-4.5a1.5 1.5 0 0 0 -1.5-1.5h-6a1.5 1.5 0 0 0 -1.5 1.5v4.5a1.5 1.5 0 0 0 1.5 1.5zm6-1h-6a.5.5 0 0 1 -.5-.5v-.5h7v.5a.5.5 0 0 1 -.5.5zm-6-5.5h6a.5.5 0 0 1 .5.5v3h-7v-3a.5.5 0 0 1 .5-.5z" />
      <path d="m19.5 10.5h-4a1.5 1.5 0 0 0 -1.5 1.5v7.5a1.5 1.5 0 0 0 1.5 1.5h4a1.5 1.5 0 0 0 1.5-1.5v-7.5a1.5 1.5 0 0 0 -1.5-1.5zm-4.5 3h5v4.5h-5zm.5-2h4a.5.5 0 0 1 .5.5v.5h-5v-.5a.5.5 0 0 1 .5-.5zm4 8.5h-4a.5.5 0 0 1 -.5-.5v-.5h5v.5a.5.5 0 0 1 -.5.5z" />
      <path d="m16.5 4.5h-2a.5.5 0 0 0 0 1h2a.5.5 0 0 1 .5.5v1.793l-.146-.147a.5.5 0 0 0 -.708.708l1 1a.5.5 0 0 0 .708 0l1-1a.5.5 0 0 0 -.708-.708l-.146.147v-1.793a1.5 1.5 0 0 0 -1.5-1.5z" />
      <path d="m9.5 20.5h3a.5.5 0 0 0 0-1h-3a.5.5 0 0 1 -.5-.5v-2.793l.146.147a.5.5 0 0 0 .708-.708l-1-1a.5.5 0 0 0 -.708 0l-1 1a.5.5 0 0 0 .708.708l.146-.147v2.793a1.5 1.5 0 0 0 1.5 1.5z" />
    </Solid>
  );
}

/**
 * A shield with a tick. `INBOX/security.svg` verbatim on its 214.27 grid — an
 * outline drawn as filled paths rather than strokes, so it scales without a
 * stroke width to keep in step.
 */
export function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 214.27 214.27">
      <path d="M196.926,55.171c-0.11-5.785-0.215-11.25-0.215-16.537c0-4.142-3.357-7.5-7.5-7.5c-32.075,0-56.496-9.218-76.852-29.01c-2.912-2.832-7.546-2.831-10.457,0c-20.354,19.792-44.771,29.01-76.844,29.01c-4.142,0-7.5,3.358-7.5,7.5c0,5.288-0.104,10.755-0.215,16.541c-1.028,53.836-2.436,127.567,87.331,158.682c0.796,0.276,1.626,0.414,2.456,0.414c0.83,0,1.661-0.138,2.456-0.414C199.36,182.741,197.954,109.008,196.926,55.171z M107.131,198.812c-76.987-27.967-75.823-89.232-74.79-143.351c0.062-3.248,0.122-6.396,0.164-9.482c30.04-1.268,54.062-10.371,74.626-28.285c20.566,17.914,44.592,27.018,74.634,28.285c0.042,3.085,0.102,6.231,0.164,9.477C182.961,109.577,184.124,170.844,107.131,198.812z" />
      <path d="M132.958,81.082l-36.199,36.197l-15.447-15.447c-2.929-2.928-7.678-2.928-10.606,0c-2.929,2.93-2.929,7.678,0,10.607l20.75,20.75c1.464,1.464,3.384,2.196,5.303,2.196c1.919,0,3.839-0.732,5.303-2.196l41.501-41.5c2.93-2.929,2.93-7.678,0.001-10.606C140.636,78.154,135.887,78.153,132.958,81.082z" />
    </Solid>
  );
}

/**
 * A lit bulb with a tick in it, rays coming off. `INBOX/idea.svg` verbatim on
 * its 60 grid, with the black fill dropped so it takes the colour of the words
 * beside it. Marks a passing tip rather than a warning, which is why it is a
 * bulb and not an i in a circle.
 */
export function TipIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 60 60">
      <path d="m15.15 25.28c-.43 4.01.72 7.93 3.25 11.04 2.09 2.57 3.24 5.67 3.24 8.74 0 .55.45 1 1 1h.76v4.97c0 .27.11.52.29.71l2.97 2.97c.19.18.44.29.71.29h5.26c.27 0 .52-.11.71-.29l2.97-2.97c.19-.19.29-.44.29-.71v-4.97h.76c.55 0 1-.45 1-1 0-3.13 1.11-6.18 3.12-8.6 2.22-2.67 3.45-6.05 3.45-9.53 0-4.11-1.63-7.93-4.59-10.78-2.96-2.84-6.85-4.32-10.97-4.15-7.32.29-13.44 6-14.22 13.28zm19.45 25.33-2.38 2.39h-4.44l-2.39-2.39v-4.56h9.21zm4.36-33.03c2.57 2.46 3.98 5.78 3.98 9.33 0 3.01-1.06 5.94-2.98 8.25-2.1 2.52-3.34 5.64-3.55 8.89h-.81-11.2-.8c-.22-3.19-1.5-6.36-3.65-9-2.19-2.69-3.18-6.08-2.81-9.56.68-6.29 5.97-11.24 12.32-11.5 3.56-.14 6.93 1.13 9.5 3.59z" />
      <path d="m31 9.1v-3.1c0-.55-.45-1-1-1s-1 .45-1 1v3.1c0 .55.45 1 1 1s1-.44 1-1z" />
      <path d="m21.09 12.49c.17 0 .34-.04.5-.13.48-.28.64-.89.37-1.37l-1.55-2.69c-.28-.48-.89-.64-1.37-.37-.48.28-.64.89-.37 1.37l1.55 2.69c.19.32.53.5.87.5z" />
      <path d="m14.07 18.88c.16.09.33.13.5.13.35 0 .68-.18.87-.5.28-.48.11-1.09-.37-1.37l-2.69-1.55c-.48-.28-1.09-.11-1.37.37s-.11 1.09.37 1.37z" />
      <path d="m8.08 26.92c0 .55.45 1 1 1h3.1c.55 0 1-.45 1-1s-.45-1-1-1h-3.1c-.55 0-1 .45-1 1z" />
      <path d="m11.88 38.38c.17 0 .34-.04.5-.13l2.69-1.55c.48-.28.64-.89.37-1.37-.28-.48-.89-.64-1.37-.37l-2.69 1.55c-.48.28-.64.89-.37 1.37.19.32.53.5.87.5z" />
      <path d="m38.91 12.49c.35 0 .68-.18.87-.5l1.55-2.69c.28-.48.11-1.09-.37-1.37s-1.09-.11-1.37.37l-1.55 2.69c-.28.48-.11 1.09.37 1.37.16.09.33.13.5.13z" />
      <path d="m47.62 15.59-2.69 1.55c-.48.28-.64.89-.37 1.37.19.32.52.5.87.5.17 0 .34-.04.5-.13l2.69-1.55c.48-.28.64-.89.37-1.37-.28-.48-.89-.64-1.37-.37z" />
      <path d="m51.92 26.92c0-.55-.45-1-1-1h-3.1c-.55 0-1 .45-1 1s.45 1 1 1h3.1c.55 0 1-.45 1-1z" />
      <path d="m45.93 34.96c-.48-.28-1.09-.11-1.37.37s-.11 1.09.37 1.37l2.69 1.55c.16.09.33.13.5.13.35 0 .68-.18.87-.5.28-.48.11-1.09-.37-1.37z" />
      <path d="m27.95 30.59c.2.2.45.29.71.29s.51-.1.71-.29l5.93-5.93c.39-.39.39-1.02 0-1.41s-1.02-.39-1.41 0l-5.22 5.22-2.53-2.53c-.39-.39-1.02-.39-1.41 0s-.39 1.02 0 1.41z" />
    </Solid>
  );
}

/** A chevron pointing down. Marks a control that opens something. */
export function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <Solid className={className}>
      <path d="M12 15.5l-6-6L7.4 8l4.6 4.6L16.6 8 18 9.5z" />
    </Solid>
  );
}

/** A tick on its own. Marks the one already chosen in a list. */
export function CheckIcon({ className }: { className?: string }) {
  return (
    <Solid className={className}>
      <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
    </Solid>
  );
}

/**
 * A padlock, shackle up. `INBOX/lock.svg` verbatim on its 512 grid. Sits beside
 * "No password needed", where the point is reassurance rather than decoration.
 */
export function LockIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 512 512">
      <path d="M255.999,0c-79.044,0-143.352,64.308-143.352,143.353v70.193c0,4.78,3.879,8.656,8.659,8.656h48.057c4.78,0,8.656-3.876,8.656-8.656v-70.193c0-42.998,34.981-77.98,77.979-77.98s77.979,34.982,77.979,77.98v70.193c0,4.78,3.88,8.656,8.661,8.656h48.057c4.78,0,8.656-3.876,8.656-8.656v-70.193C399.352,64.308,335.044,0,255.999,0z M382.04,204.89h-30.748v-61.537c0-52.544-42.748-95.292-95.291-95.292s-95.291,42.748-95.291,95.292v61.537h-30.748v-61.537c0-69.499,56.54-126.04,126.038-126.04c69.499,0,126.04,56.541,126.04,126.04V204.89z" />
      <path d="M410.63,204.89H101.371c-20.505,0-37.188,16.683-37.188,37.188v232.734c0,20.505,16.683,37.188,37.188,37.188H410.63c20.505,0,37.187-16.683,37.187-37.189V242.078C447.817,221.573,431.135,204.89,410.63,204.89z M430.505,474.811c0,10.96-8.916,19.876-19.875,19.876H101.371c-10.96,0-19.876-8.916-19.876-19.876V242.078c0-10.96,8.916-19.876,19.876-19.876H410.63c10.959,0,19.875,8.916,19.875,19.876V474.811z" />
      <path d="M285.11,369.781c10.113-8.521,15.998-20.978,15.998-34.365c0-24.873-20.236-45.109-45.109-45.109c-24.874,0-45.11,20.236-45.11,45.109c0,13.387,5.885,25.844,16,34.367l-9.731,46.362c-0.535,2.554,0.108,5.211,1.752,7.236c1.645,2.023,4.113,3.2,6.72,3.2h60.738c2.608,0,5.076-1.176,6.719-3.2c1.643-2.026,2.286-4.683,1.751-7.234L285.11,369.781z M270.851,358.82c-3.04,1.936-4.565,5.553-3.824,9.081l8.68,41.366h-39.415l8.682-41.363c0.74-3.529-0.782-7.146-3.824-9.081c-8.108-5.16-12.948-13.911-12.948-23.406c0-15.327,12.469-27.796,27.797-27.796c15.327,0,27.796,12.469,27.796,27.796C283.797,344.914,278.957,353.663,270.851,358.82z" />
    </Solid>
  );
}

/* -------------------------------------------------------------- The Actions
 * sheet. Nine actions want nine glyphs, and most of them arrived as artwork in
 * INBOX — transcribed here on their own grids, with the source files' hard-coded
 * fills dropped so they take the colour of the card they sit on.
 */

/** A cross. Closes the Actions sheet. */
export function CloseIcon({
  className,
  strokeWidth,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <Stroked className={className} strokeWidth={strokeWidth}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Stroked>
  );
}

/** A chevron pointing back, for the step out of an action and into the grid. */
export function ChevronLeftIcon({
  className,
  strokeWidth,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <Stroked className={className} strokeWidth={strokeWidth}>
      <path d="M15 5l-7 7 7 7" />
    </Stroked>
  );
}

/** A tick in a ring. Held up for a moment when an action has done its work. */
export function SuccessIcon({ className }: { className?: string }) {
  return (
    <Stroked className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </Stroked>
  );
}

/**
 * Two people, one above the other, with a path leading down from one and back up
 * from the other. `INBOX/people.svg`, on its own 32 grid. Sub a Player, where
 * somebody steps off and somebody steps on.
 */
export function SwapPeopleIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 32 32">
      <path d="m23.4963875 25.1598358c-7.9098263 0-7.500001 5.8401642-7.500001 5.8401642h15.000001s.4098263-5.8401642-7.5-5.8401642z" />
      <circle cx="23.496" cy="19.485" r="3.485" />
      <path d="m8.5036135 10.1598358c-7.9098264 0-7.5000004 5.8401642-7.5000004 5.8401642h14.999999c.0000004 0 .4098267-5.8401642-7.4999986-5.8401642z" />
      <circle cx="8.504" cy="4.485" r="3.485" />
      <path d="m13.2949219 28.0654297h-3.2871094c-1.3808594 0-2.5043945-1.1235352-2.5043945-2.5043945v-6.0766602c0-.5522461.4477539-1 1-1s1 .4477539 1 1v6.0766602c0 .2783203.2260742.5043945.5043945.5043945h3.2871094c.5522461 0 1 .4477539 1 1s-.4477539 1-1 1z" />
      <path d="m23.8066406 13.515625c-.5522461 0-1-.4477539-1-1v-6.0766602c0-.2783203-.2260742-.5043945-.5043945-.5043945h-3.2871094c-.5522461 0-1-.4477539-1-1s.4477539-1 1-1h3.2871094c1.3808594 0 2.5043945 1.1235352 2.5043945 2.5043945v6.0766602c0 .5522461-.4477539 1-1 1z" />
      <path d="m23.8066406 13.515625c-.2651367 0-.5195313-.1054688-.7070313-.2929688l-2.6206055-2.6206055c-.390625-.390625-.390625-1.0234375 0-1.4140625s1.0234375-.390625 1.4140625 0l1.9135742 1.9135742 1.9130859-1.9135742c.390625-.390625 1.0234375-.390625 1.4140625 0 .390625.3901367.390625 1.0234375 0 1.4140625l-2.6201172 2.6206055c-.1874998.1875001-.4418944.2929688-.7070311.2929688z" />
      <path d="m11.1240234 23.1049805c-.2558594 0-.5117188-.0976563-.7070313-.2929688l-1.9135741-1.9135742-1.913086 1.9135742c-.390625.390625-1.0234375.390625-1.4140625 0-.390625-.3901367-.390625-1.0234375 0-1.4140625l2.6201172-2.6206055c.375-.375 1.0390625-.375 1.4140625 0l2.6206055 2.6206055c.390625.390625.390625 1.0234375 0 1.4140625-.1953125.1953125-.4511719.2929688-.7070313.2929688z" />
    </Solid>
  );
}

/**
 * Head and shoulders. Your account, wherever one is offered: the settings item
 * that opens My Account, and the button in Share Live Session that says an
 * account is what sharing needs. One definition, so the two cannot drift.
 */
export function PersonIcon({ className }: { className?: string }) {
  return (
    <Stroked className={className}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Stroked>
  );
}

/** A person with a star at their shoulder. `INBOX/guest.svg`. Add a Guest. */
export function GuestIcon({ className }: { className?: string }) {
  return (
    <Solid className={className}>
      <path d="m18 13.25c.2668 0 .5134.1417.6478.3721l1.2412 2.1277 2.2944.5787c.2567.0647.4603.2601.5356.5139s.0112.5286-.1686.7228l-1.5324 1.6552.586 2.6156c.0613.2736-.0351.5586-.25.7387-.2149.1802-.5123.2254-.771.1173l-2.583-1.0792-2.583 1.0792c-.2587.1081-.5561.0629-.771-.1173-.2149-.1801-.3113-.4651-.25-.7387l.586-2.6156-1.5324-1.6552c-.1798-.1942-.2439-.469-.1686-.7228s.2789-.4492.5356-.5139l2.2944-.5787 1.2412-2.1277c.1344-.2304.381-.3721.6478-.3721z" />
      <path d="m5.25 6c0-2.62335 2.12665-4.75 4.75-4.75 2.6234 0 4.75 2.12665 4.75 4.75s-2.1266 4.75-4.75 4.75c-2.62335 0-4.75-2.12665-4.75-4.75z" />
      <path d="m1.25 20c0-4.3711 4.01471-7.75 8.75-7.75 2.0319 0 3.931.6221 5.4373 1.6778l-.3044.5217-1.6831.4245c-.7702.1943-1.3809.7802-1.6068 1.5417-.226.7615-.0337 1.5857.5059 2.1686l.9972 1.077-.2439 1.0887h-11.8522z" />
    </Solid>
  );
}

/** A pencil. `INBOX/pencil.svg`. The edit button on a place, and its menu. */
export function PencilIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 32 32">
      <path d="m5.0148926 21.2886963c-.000061.0001221-.0001831.0002441-.0002441.0003662l-2.9423828 7.3388672c-.1494141.3710938-.0625.7958984.2207031 1.0791016.1914062.1914062.4472656.2929687.7070312.2929687.125 0 .2519531-.0234375.3720703-.0722656l7.3388672-2.9423828c.0001221-.000061.0002441-.0001831.0003662-.0002441.1217041-.0488281.2359619-.1218262.3345947-.220459l18.3564454-18.3554688c.7949219-.796875.7949219-2.0927734-.0009766-2.890625l-2.9199219-2.9199219c-.796875-.796875-2.0927734-.796875-2.8916016 0l-18.3544921 18.3554688c-.0986328.0986328-.1716309.2128906-.220459.3345947zm1.2919311 2.1509399 2.2537231 2.2537231-3.7617188 1.5078125zm12.5445557-13.2318115 2.9619141 2.9619141-11.4744263 11.4738159-2.980957-2.980957zm2.6000366-2.5913696 2.9576416 2.9576416-1.1816406 1.1816406-2.9595947-2.9595947zm3.6159668-3.6037598 2.9199219 2.9833984-2.1641235 2.1640015-2.9553223-2.9553223z" />
    </Solid>
  );
}

/** Crossing arrows. `INBOX/shuffle.svg`. Reshuffle. */
export function ShuffleIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 32 32">
      <path d="m3 10.5h2a7.63 7.63 0 0 1 5.57 2.43l1.3 1.4a1.5 1.5 0 0 0 2.2-2.05l-1.3-1.39a10.61 10.61 0 0 0 -7.77-3.39h-2a1.5 1.5 0 0 0 0 3z" />
      <path d="m26.82 4.7a1.5 1.5 0 1 0 -2.12 2.12l.71.71a10.61 10.61 0 0 0 -7.21 3.36l-7.6 8.18a7.63 7.63 0 0 1 -5.6 2.43h-2a1.5 1.5 0 0 0 0 3h2a10.61 10.61 0 0 0 7.77-3.39l7.6-8.18a7.65 7.65 0 0 1 5-2.4l-.65.65a1.49 1.49 0 0 0 0 2.12 1.46 1.46 0 0 0 1.06.44 1.47 1.47 0 0 0 1.06-.44l3.24-3.24a1.49 1.49 0 0 0 0-2.12z" />
      <path d="m26.82 18.7a1.5 1.5 0 1 0 -2.12 2.12l.65.65a7.65 7.65 0 0 1 -5-2.4l-1.3-1.4a1.5 1.5 0 0 0 -2.2 2l1.3 1.39a10.61 10.61 0 0 0 7.21 3.36l-.71.71a1.49 1.49 0 0 0 0 2.12 1.46 1.46 0 0 0 1.06.44 1.47 1.47 0 0 0 1.06-.44l3.24-3.24a1.49 1.49 0 0 0 0-2.12z" />
    </Solid>
  );
}

/** A play triangle inside a rewind ring. `INBOX/replay.svg`. Start New Session. */
export function ReplayIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 512 512">
      <path d="m351.354 240.925a27.562 27.562 0 0 1 0 44.011l-103.021 81.54a37.647 37.647 0 0 1 -23.384 8 39.332 39.332 0 0 1 -17.119-3.923c-11.474-5.553-18.324-15.931-18.324-27.753v-159.736c0-11.826 6.85-22.2 18.324-27.751 13.331-6.45 29.229-4.851 40.5 4.071zm137.657 83.609a22.388 22.388 0 0 0 -8.68-1.74 23.1 23.1 0 0 0 -8.817 1.758 22.679 22.679 0 0 0 -12.44 12.289 210.864 210.864 0 0 1 -194.085 129.3c-55.837 0-108.528-21.939-148.366-61.776s-61.776-92.527-61.776-148.365 21.939-108.529 61.776-148.366 92.528-61.776 148.367-61.776a211.951 211.951 0 0 1 121.032 38.352l6.378 4.49 32.727-32.726-8.706-6.392a257.678 257.678 0 0 0 -151.432-49.582c-141.158 0-256 114.841-256 256s114.841 256 256 256a255.279 255.279 0 0 0 236.324-157.544 23.2 23.2 0 0 0 -12.302-29.922zm-102.319-187.313a22.792 22.792 0 0 0 21.308 14.308h59.2a22.953 22.953 0 0 0 22.93-22.929v-59.325a22.187 22.187 0 0 0 -14.083-21.082 24.55 24.55 0 0 0 -9.171-1.821 22.085 22.085 0 0 0 -15.889 6.69l-59.325 59.324a22.163 22.163 0 0 0 -4.97 24.835z" />
    </Solid>
  );
}

/** A row with a plus above it. `INBOX/row.svg`. Add a Round. */
export function AddRowIcon({ className }: { className?: string }) {
  return (
    <Solid className={className}>
      <path
        clipRule="evenodd"
        fillRule="evenodd"
        d="m7 4c.55228 0 1 .44772 1 1v2h2c.5523 0 1 .44772 1 1s-.4477 1-1 1h-2v2c0 .5523-.44772 1-1 1s-1-.4477-1-1v-2h-2c-.55228 0-1-.44772-1-1s.44772-1 1-1h2v-2c0-.55228.44772-1 1-1zm5 7c0-.5523.4477-1 1-1h6c1.6569 0 3 1.3431 3 3v2c0 1.6569-1.3431 3-3 3h-14c-1.65685 0-3-1.3431-3-3v-1c0-.5523.44772-1 1-1s1 .4477 1 1v1c0 .5523.44772 1 1 1h14c.5523 0 1-.4477 1-1v-2c0-.5523-.4477-1-1-1h-6c-.5523 0-1-.4477-1-1z"
      />
    </Solid>
  );
}

/**
 * A pickleball court seen from above, kitchen lines and net. `INBOX/court.svg`,
 * whose net line arrived in its own teal; here it takes the text colour like
 * everything else, so the badged versions read as one shape.
 */
export function CourtIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 512 512">
      <path d="m431.618 0h-351.236c-6.075 0-11 4.925-11 11v490c0 6.075 4.925 11 11 11h351.236c6.075 0 11-4.925 11-11v-490c0-6.075-4.925-11-11-11zm-11 161.894h-153.618v-139.894h153.618zm-329.236 166.212v-144.212h329.236v144.213h-329.236zm153.618-306.106v139.894h-153.618v-139.894zm-153.618 328.106h153.618v139.894h-153.618zm175.618 139.894v-139.894h153.618v139.894z" />
      <path d="m460.911 245h-409.822c-6.075 0-11 4.925-11 11s4.925 11 11 11h409.822c6.075 0 11-4.925 11-11s-4.925-11-11-11z" />
    </Solid>
  );
}

/* ------------------------------------------------------------ My Account's
 * four rows. Each says what it does before the words do, so a row is picked out
 * by shape on a phone rather than read twice. Artwork from INBOX, transcribed
 * on its own grid with the source fills dropped.
 */

/** A sealed envelope. `INBOX/mail.svg`. Change My Email Address. */
export function MailIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 512 512">
      <path d="M467,76H45C20.137,76,0,96.262,0,121v270c0,24.885,20.285,45,45,45h422c24.655,0,45-20.03,45-45V121 C512,96.306,491.943,76,467,76z M460.698,106c-9.194,9.145-167.415,166.533-172.878,171.967c-8.5,8.5-19.8,13.18-31.82,13.18 s-23.32-4.681-31.848-13.208C220.478,274.284,64.003,118.634,51.302,106H460.698z M30,384.894V127.125L159.638,256.08L30,384.894z M51.321,406l129.587-128.763l22.059,21.943c14.166,14.166,33,21.967,53.033,21.967c20.033,0,38.867-7.801,53.005-21.939 l22.087-21.971L460.679,406H51.321z M482,384.894L352.362,256.08L482,127.125V384.894z" />
    </Solid>
  );
}

/** An arrow into a tray. `INBOX/download.svg`, on its off-by-one 25 grid. */
export function DownloadIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 25 24">
      <g clipRule="evenodd" fillRule="evenodd">
        <path d="m4.63672 16c.55228 0 1 .4477 1 1v2c0 .2652.10534.5195.29291.7071h.00001c.18752.1875.44185.2929.70708.2929h11.99998c.2652 0 .5195-.1053.7071-.2929s.2929-.4419.2929-.7071v-2c0-.5523.4477-1 1-1s1 .4477 1 1v2c0 .7956-.316 1.5587-.8787 2.1213-.5626.5626-1.3257.8787-2.1213.8787h-11.99998c-.79563 0-1.55872-.316-2.12134-.8787-.56258-.5626-.87866-1.3257-.87866-2.1213v-2c0-.5523.44771-1 1-1z" />
        <path d="m6.92961 10.2929c.39053-.39053 1.02369-.39053 1.41422 0l4.29287 4.2929 4.2929-4.2929c.3905-.39053 1.0237-.39053 1.4142 0 .3906.3905.3906 1.0237 0 1.4142l-5 5c-.3905.3905-1.0237.3905-1.4142 0l-4.99999-5c-.39052-.3905-.39052-1.0237 0-1.4142z" />
        <path d="m12.6367 3c.5523 0 1 .44772 1 1v12c0 .5523-.4477 1-1 1s-1-.4477-1-1v-12c0-.55228.4477-1 1-1z" />
      </g>
    </Solid>
  );
}

/** An open door with an arrow leaving through it. `INBOX/logout.svg`. Sign Out. */
export function SignOutIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 512 512">
      <path
        clipRule="evenodd"
        fillRule="evenodd"
        d="m252.326 430.455v25.516c0 20.462-10.198 38.127-27.919 48.357-8.526 4.922-18.042 7.668-27.908 7.673-9.875.005-19.388-2.746-27.92-7.673l-113.456-65.504c-17.723-10.232-27.919-27.892-27.919-48.357v-334.629c0-30.791 25.048-55.838 55.838-55.838h249.871c30.792 0 55.842 25.045 55.842 55.838v70.539c0 10.119-8.216 18.335-18.335 18.335-10.122 0-18.331-8.215-18.331-18.335v-70.539c0-10.573-8.603-19.176-19.176-19.176h-218.952l110.446 63.777c17.715 10.23 27.919 27.89 27.919 48.347v245.003h80.587c10.572 0 19.176-8.598 19.176-19.172v-61.836c0-10.126 8.204-18.335 18.331-18.335 10.123 0 18.335 8.211 18.335 18.335v61.836c0 30.793-25.05 55.838-55.842 55.838zm169.883-196.897-20.191 20.191c-7.159 7.159-7.157 18.765 0 25.925 3.446 3.448 8.09 5.364 12.963 5.364 4.878 0 9.517-1.911 12.968-5.364l51.479-51.488c7.157-7.158 7.158-18.758 0-25.916l-51.479-51.48c-7.16-7.16-18.767-7.157-25.93-.001-7.157 7.152-7.155 18.763 0 25.917l20.19 20.186h-135.26c-10.129 0-18.331 8.208-18.331 18.336s8.203 18.331 18.331 18.331h135.26z"
      />
    </Solid>
  );
}

/** A waste bin, lid off. `INBOX/delete.svg`. Delete Account, and nothing else. */
export function TrashIcon({ className }: { className?: string }) {
  return (
    <Solid className={className}>
      <path d="M19,7a1,1,0,0,0-1,1V19.191A1.92,1.92,0,0,1,15.99,21H8.01A1.92,1.92,0,0,1,6,19.191V8A1,1,0,0,0,4,8V19.191A3.918,3.918,0,0,0,8.01,23h7.98A3.918,3.918,0,0,0,20,19.191V8A1,1,0,0,0,19,7Z" />
      <path d="M20,4H16V2a1,1,0,0,0-1-1H9A1,1,0,0,0,8,2V4H4A1,1,0,0,0,4,6H20a1,1,0,0,0,0-2ZM10,4V3h4V4Z" />
      <path d="M11,17V10a1,1,0,0,0-2,0v7a1,1,0,0,0,2,0Z" />
      <path d="M15,17V10a1,1,0,0,0-2,0v7a1,1,0,0,0,2,0Z" />
    </Solid>
  );
}

/* --------------------------------------------------------- The Reshuffle
 * panel. It lists what a rebuild leaves alone and what it takes away, and each
 * line is picked out by its shape first. The padlock and the chain link it uses
 * are LockIcon and LinkIcon above, already transcribed from the same two files.
 */

/** Somebody sat down, waiting a round out. `INBOX/sit.svg`, on its 100 grid. */
export function SitIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 100 100">
      <path d="m70.9267502 97.4798126h-.0000076c-2.103363-.2077637-3.7045135-1.9779205-3.6877518-4.0914536.0526428-6.6373367-.4410324-20.5162964-.6351776-24.4001312 0-.4790726-.3594513-.9584351-.9584427-1.0780563-2.5157089-.3594513-5.1512604-.3594513-12.2192535-.4793625-7.7868156-.1196213-15.4538651.9584351-16.2924614-5.1511955-.5989876-4.7918854-2.6355515-24.3187408-2.6355515-29.3503113-.1197701-3.7136841 1.1979713-6.8285275 8.1462669-6.8285275 4.1929016 0 8.0263519.5989857 9.7035446 2.755394 2.0365639 2.1564083 3.593914 5.7503223 5.2711029 9.4640064 1.0781326 2.5157127 2.1563377 5.0315704 3.1147003 6.2295418.9583626.9582901 6.4690781 3.5939178 11.6203384 5.5104942 2.0365677.7189026 2.9949341 2.9949303 2.2761078 5.0315704-.5989838 1.6771927-2.1563339 2.6356277-3.7136841 2.6356277-.359375 0-.8385925-.119915-1.3177414-.2396812-4.6721191-1.6771927-12.8183136-5.0315704-15.2142601-8.266037-.2396088-.1197662-.359375-.3594513-.4792175-.5989876.1198425 2.5158615.3593788 5.1513405.5989876 7.5472832 13.8965149.3594513 19.6467667 1.6770439 21.8031082 6.2293968 1.3603821 2.825386.1248856 21.1541977-.9087524 31.4265976-.2258682 2.2447587-2.2266922 3.8756029-4.4718551 3.6538316z" />
      <ellipse cx="43.724" cy="13.162" rx="10.662" ry="10.662" />
      <path d="m59.1774406 69.108078h-24.9178123l-4.1929016-39.0538826c-.2395935-1.9167538-1.9167557-3.3543167-3.8335114-3.1147213s-3.3543205 1.91675-3.114727 3.8335075l4.5522957 42.1685944c.2395954 1.7969589 1.6771603 3.1147232 3.4741154 3.1147232l-2.1563454 17.3705959c-.2395954 1.916748 1.0781727 3.713707 3.1147251 3.9533081h.479187c1.7969589 0 3.2345276-1.3177643 3.4741173-3.1147232l2.1563492-18.2091827h11.9797173l2.3959465 18.3289795c.2395934 1.7969589 1.7969589 3.1147232 3.474121 3.1147232h.4791908c1.9167519-.2395935 3.3543205-2.0365524 3.1147232-3.9533081l-2.2761497-17.4903946h1.7969589c1.916748 0 3.4741173-1.5573654 3.4741173-3.4741135 0-1.9167556-1.5573692-3.4741058-3.4741173-3.4741058z" />
    </Solid>
  );
}

/** A triangle round an exclamation mark. `INBOX/warning.svg`, on its 512 grid. */
export function WarningIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 512 512">
      <path d="m432 495.968h-352c-44.112 0-80-35.888-80-80 0-13.689 3.522-27.203 10.188-39.088l175.957-319.924c.031-.056.062-.111.093-.167 30.561-54.333 108.95-54.353 139.525 0 .031.055.062.111.093.167l175.958 319.923c6.664 11.885 10.186 25.399 10.186 39.089 0 44.112-35.888 80-80 80zm-210.856-419.644-175.95 319.909c-.031.056-.062.112-.093.167-3.337 5.932-5.101 12.699-5.101 19.568 0 22.056 17.944 40 40 40h352c22.056 0 40-17.944 40-40 0-6.87-1.764-13.636-5.101-19.568-.031-.055-.062-.111-.093-.167l-175.947-319.904c-15.31-27.088-54.387-27.119-69.715-.005z" />
      <path d="m256 315.968c-11.046 0-20-8.954-20-20v-120c0-11.046 8.954-20 20-20s20 8.954 20 20v120c0 11.046-8.954 20-20 20z" />
      <circle cx="256" cy="375.968" r="20" />
    </Solid>
  );
}

/* ------------------------------------------------------- The settings panels
 * Every panel behind the settings drawer now opens with its own glyph, the same
 * way an action's panel does, so the thing you tapped is the thing you land on.
 * The star, the court and the chain link they use are StarIcon, CourtIcon and
 * LinkIcon above; only these three are new.
 */

/**
 * An envelope leaving at speed, lines trailing it. `INBOX/email.svg` on its 100
 * grid. Heads Suggest a Feature and Report a Bug, which both send one.
 *
 * Not MailIcon, which is a sealed envelope sitting still and marks the row that
 * changes your address. This one is mail going somewhere; keep the two apart.
 */
export function SendMailIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 100 100">
      <path d="m87 24h-62c-4.4 0-8 3.6-8 8v3c0 1.1.9 2 2 2s2-.9 2-2v-3c0-.4.1-.8.2-1.2l22.4 19.2-22.4 19.2c-.1-.4-.2-.8-.2-1.2v-3c0-1.1-.9-2-2-2s-2 .9-2 2v3c0 4.4 3.6 8 8 8h62c4.4 0 8-3.6 8-8v-36c0-4.4-3.6-8-8-8zm-62.8 4.1c.2-.1.5-.1.8-.1h62c.3 0 .6 0 .8.1l-30.5 26.1c-.8.6-1.8.6-2.6 0zm62.8 43.9h-62c-.3 0-.6 0-.8-.1l22.5-19.3 5.4 4.7c1.1 1 2.5 1.5 3.9 1.5s2.8-.5 3.9-1.5l5.4-4.7 22.5 19.3c-.2.1-.5.1-.8.1zm4-4c0 .4-.1.8-.2 1.2l-22.4-19.2 22.4-19.2c.1.4.2.8.2 1.2zm-80-23c0-1.1.9-2 2-2h12c1.1 0 2 .9 2 2s-.9 2-2 2h-12c-1.1 0-2-.9-2-2zm14 12h-18c-1.1 0-2-.9-2-2s.9-2 2-2h18c1.1 0 2 .9 2 2s-.9 2-2 2z" />
    </Solid>
  );
}

/**
 * A beetle seen from above, legs out and antennae up. `INBOX/bug.svg` verbatim
 * on its 511.936 grid. Heads Report a Bug.
 */
export function BugIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 511.936 511.936">
      <path d="m476.857 309.305c15.208 0 27.581-12.373 27.581-27.581s-12.373-27.581-27.581-27.581h-63.938c.001-10.161 0-21.11 0-31.971 38.968-15.888 67.133-49.579 75.809-91.112 3.562-17.117-9.525-33.166-26.982-33.166-13.056 0-24.393 9.183-26.96 21.836-3.942 19.469-16.071 36.438-32.965 46.558-11.919-18.164-32.305-30.281-55.506-30.706.03-11.002-2.017-21.866-5.891-32.043 23.45-17.215 39.643-42.138 45.86-70.823 3.636-16.855-9.125-32.716-26.288-32.716h-1.345c-12.742 0-23.574 8.814-26.343 21.435-3.469 15.813-12.961 29.743-26.305 38.891-30.155-20.076-69.922-20.074-100.072 0-13.344-9.148-22.835-23.077-26.305-38.889-2.768-12.623-13.6-21.437-26.342-21.437h-1.345c-17.175 0-29.921 15.869-26.287 32.724 6.215 28.677 22.408 53.6 45.858 70.815-3.874 10.178-5.921 21.041-5.891 32.043-23.201.426-43.587 12.543-55.506 30.706-16.894-10.12-29.022-27.089-32.965-46.561-2.566-12.65-13.904-21.833-26.96-21.833-17.454 0-30.545 16.044-26.981 33.171 8.675 41.529 36.84 75.221 75.809 91.108v31.97h-63.937c-15.208 0-27.581 12.373-27.581 27.581s12.373 27.581 27.581 27.581h64.167c.655 15.033 2.761 29.958 6.296 44.561-41.931 14.469-73.173 49.713-82.331 93.559-3.591 17.086 9.499 33.189 26.979 33.189 13.054 0 24.393-9.186 26.96-21.844 5.071-25.029 23.48-45.349 47.641-53.189 20.519 39.844 52.48 73.753 93.402 96.59 23.292 13.016 52.244 13.023 75.548.002 41.073-22.923 73.021-56.996 93.409-96.591 24.159 7.841 42.566 28.16 47.637 53.189 2.567 12.656 13.906 21.842 26.96 21.842 17.452 0 30.574-16.079 26.98-33.18-9.161-43.853-40.401-79.098-82.33-93.567 3.536-14.601 5.648-29.535 6.297-44.562h64.163zm0-40.162c6.938 0 12.581 5.643 12.581 12.581s-5.643 12.581-12.581 12.581h-63.948c.004-5.851.007-14.683.008-25.162zm-27.37-146.434c1.153-5.688 6.309-9.815 12.259-9.815 7.953 0 13.918 7.318 12.297 15.104-7.217 34.552-29.736 62.957-61.125 77.806-.118-1.456.849-12.394-4.287-26.114 20.947-12.207 36.008-33.038 40.856-56.981zm-102.526-98.06c1.246-5.682 6.053-9.649 11.69-9.649h1.345c7.626 0 13.241 7.066 11.627 14.546-5.232 24.139-18.548 45.232-37.824 60.198-4.244-7.217-9.498-13.874-15.648-19.726 14.537-11.25 24.848-27.312 28.81-45.369zm-206.648 4.905c-1.621-7.52 4.03-14.554 11.626-14.554h1.345c5.638 0 10.444 3.968 11.69 9.65 3.962 18.056 14.273 34.118 28.81 45.368-6.151 5.853-11.404 12.509-15.649 19.726-19.275-14.965-32.591-36.058-37.822-60.19zm-102.419 98.449c-1.622-7.793 4.342-15.109 12.296-15.109 5.95 0 11.105 4.128 12.259 9.812 4.849 23.946 19.909 44.777 40.856 56.984-2.766 7.388-4.287 15.379-4.287 23.721v2.394c-31.389-14.85-53.908-43.254-61.124-77.802zm-15.396 153.721c0-6.938 5.643-12.581 12.581-12.581h63.938v25.162h-63.938c-6.937 0-12.581-5.644-12.581-12.581zm39.95 174.065c-1.154 5.692-6.311 9.824-12.259 9.824-7.989 0-13.925-7.369-12.297-15.113 8.008-38.342 35.163-69.221 71.669-82.158 2.499 8.045 5.416 15.914 8.75 23.588-28.353 9.922-49.846 34.157-55.863 63.859zm223.979 33.288c-18.788 10.497-42.131 10.495-60.921-.002-67.749-37.81-111.488-110.062-111.488-189.905v-95.76c0-29.148 23.713-52.86 52.86-52.86h101.38c4.143 0 7.5-3.357 7.5-7.5s-3.357-7.5-7.5-7.5h-87.639c-.075-23.305 11.046-45.898 30.014-60.197 27.368-20.526 64.449-19.775 90.638-.025 19.097 14.408 30.12 37.012 30.046 60.222h-28.059c-4.142 0-7.5 3.357-7.5 7.5s3.358 7.5 7.5 7.5h41.8c29.148 0 52.86 23.713 52.86 52.86 0 3.091.009 95.844-.02 98.306-.89 79.117-44.825 150.164-111.471 187.361zm187.618-38.568c1.624 7.724-4.306 15.105-12.299 15.105-5.948 0-11.104-4.132-12.259-9.822-6.017-29.703-27.51-53.939-55.864-63.86 3.333-7.673 6.251-15.542 8.75-23.59 36.507 12.935 63.661 43.816 71.672 82.167z" />
      <path d="m305.144 209.131c-21.849-37.857-76.473-37.908-98.351-.001l-35.25 61.061c-2.071 3.588-.842 8.175 2.745 10.245 3.587 2.071 8.174.842 10.245-2.745l35.251-61.061c16.076-27.858 56.269-27.896 72.368.001l54.052 93.622c16.083 27.835-3.984 62.668-36.177 62.668h-108.119c-32.143 0-52.284-34.791-36.178-62.666l1.301-2.25c2.073-3.586.847-8.174-2.739-10.247-3.586-2.072-8.174-.847-10.247 2.739l-1.302 2.252c-21.86 37.836 5.417 85.172 49.165 85.172h108.119c43.689 0 71.054-47.286 49.166-85.17z" />
      <path d="m255.968 293.62c12.439 0 22.561-10.121 22.561-22.56v-30.121c0-12.44-10.121-22.561-22.561-22.561s-22.561 10.121-22.561 22.561v30.121c0 12.439 10.121 22.56 22.561 22.56zm-7.561-52.681c0-4.169 3.392-7.561 7.561-7.561s7.561 3.392 7.561 7.561v30.121c0 4.169-3.392 7.56-7.561 7.56s-7.561-3.392-7.561-7.56z" />
      <path d="m255.968 353.862c12.439 0 22.561-10.121 22.561-22.561 0-12.439-10.121-22.561-22.561-22.561s-22.561 10.121-22.561 22.561 10.121 22.561 22.561 22.561zm0-30.121c4.169 0 7.561 3.392 7.561 7.561s-3.392 7.561-7.561 7.561-7.561-3.392-7.561-7.561 3.392-7.561 7.561-7.561z" />
    </Solid>
  );
}

/**
 * Two arrows, one going out and one coming back. `INBOX/two-arrows.svg` on its
 * 32 grid. Heads Import / Export Groups, which is those two things and no more.
 */
export function TwoArrowsIcon({ className }: { className?: string }) {
  return (
    <Solid className={className} viewBox="0 0 32 32">
      <path d="m29.707 9.293-6-6c-.286-.286-.715-.37-1.09-.217-.374.155-.617.52-.617.924v3h-15c-1.657 0-3 1.343-3 3 0 1.657 1.343 3 3 3h15v3c0 .404.243.769.617.924.376.155.805.068 1.09-.217l6-6c.391-.39.391-1.024 0-1.414z" />
      <path d="m25 19h-15v-3c0-.404-.243-.769-.617-.924s-.803-.07-1.09.217l-6 6c-.39.39-.39 1.024 0 1.414l6 6c.285.285.714.372 1.09.217.374-.155.617-.52.617-.924v-3h15c1.657 0 3-1.343 3-3 0-1.657-1.343-3-3-3z" />
    </Solid>
  );
}
