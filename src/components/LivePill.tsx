/**
 * The green LIVE pill: this session is being published right now.
 *
 * It started as one span in the corner of the watchers' page, where it was the
 * only place in the app a share was visible at all. The host's side had nothing:
 * a QR code sent to fourteen people left no mark anywhere, so the one way to
 * find out whether a link was still alive was to open Actions and look.
 *
 * So it is a component, and it is the same shape on both sides of the share. On
 * a watcher's page it states a fact and takes no press; everywhere on the host's
 * side it is a button, and pressing it opens Share Live Session.
 */

/** The one green this wears. Not the palette's start-green, which is the timer's. */
const GREEN = '#149A30';

const SHAPE =
  'inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-bold';

interface Props {
  /**
   * Opens Share Live Session. Absent on the watchers' page, which has no such
   * panel and nothing this could usefully do.
   */
  onClick?: () => void;
  /**
   * What a screen reader hears, where "LIVE" alone would not say which session.
   * The word on the pill is always LIVE.
   */
  label?: string;
  className?: string;
}

export function LivePill({ onClick, label, className = '' }: Props) {
  const inside = (
    <>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GREEN }} aria-hidden="true" />
      LIVE
    </>
  );

  if (!onClick) {
    return (
      <span
        className={`${SHAPE} ${className}`}
        style={{ color: GREEN, boxShadow: `inset 0 0 0 1px ${GREEN}4D` }}
      >
        {inside}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? 'Live: open Share Live Session'}
      // The ring is drawn as an inset shadow rather than `ring-1`, so the two
      // halves of this component cannot drift: the span above cannot use a ring
      // utility without also carrying `ring-inset`, and one of them would have
      // been changed one day without the other.
      className={`${SHAPE} transition-colors hover:bg-[#E9F7EC] ${className}`}
      style={{ color: GREEN, boxShadow: `inset 0 0 0 1px ${GREEN}4D` }}
    >
      {inside}
    </button>
  );
}
