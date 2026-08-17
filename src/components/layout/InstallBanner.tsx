interface Props {
  onOpen: () => void;
  onDismiss: () => void;
}

/**
 * The icon this banner is asking somebody to make, shown at the size it will be
 * on their home screen. White tile, because that is what iOS puts behind an
 * icon with transparency, and a 22% radius, the proportion iOS rounds one by.
 * The hairline and the shadow are both needed: the tile is white on a pale
 * green bar, and either alone leaves an edge some screens lose.
 *
 * The same composition as the tile in InstallPanel, at the 44px the other
 * banners give their icon and with barely any inset: the logo carries its own
 * ring, so padding it like the panel does leaves it looking like a stamp on a
 * card rather than the icon itself. Decorative on purpose: the words say what
 * it is, and "logo" read aloud would tell nobody anything.
 */
function AppIconTile() {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-gray-200 bg-white p-0.5 shadow-md">
      <img src="/logo.png" alt="" width={40} height={40} className="h-10 w-10" />
    </span>
  );
}

/**
 * The offer to put the app on the home screen, once there is a roster worth
 * coming back to.
 *
 * Built on UpdateBanner: icon, the ask, then the button. Green stays with this
 * one so it never reads as the orange new-version bar, and the icon is the real
 * app icon rather than a drawing of one, so what is being offered is on the
 * banner making the offer.
 *
 * In normal flow rather than an overlay: it should sit above the page content
 * without dimming it, trapping focus, or needing the scroll lock.
 */
export function InstallBanner({ onOpen, onDismiss }: Props) {
  return (
    <div className="no-print flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
      <AppIconTile />
      {/* One sentence, and no bold line above it. UpdateBanner carries one, but
          the only headline this ask could have is "Add to your home screen",
          which is the sentence again in fewer words. */}
      <p className="min-w-0 flex-1 text-sm text-slate-700">
        Add this app to your phone&rsquo;s home screen so you can easily find it again.
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="shrink-0 whitespace-nowrap rounded-md bg-brand-teal px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-teal-dark"
      >
        Show Me
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-green-100"
      >
        <svg
          width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          aria-hidden="true"
        >
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>
    </div>
  );
}
