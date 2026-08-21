import { bannerOrange, bannerOrangeEdge, bannerOrangeHover } from './bannerStyles';

interface Props {
  onOpen: () => void;
  onDismiss: () => void;
}

/**
 * The icon this banner is asking somebody to make, shown at the size it will be
 * on their home screen. White tile, because that is what iOS puts behind an
 * icon with transparency, and a 22% radius, the proportion iOS rounds one by.
 * The hairline and the shadow are both needed: the tile is white on a pale
 * orange bar, and either alone leaves an edge some screens lose.
 *
 * It stays the real logo rather than becoming the solid orange square the
 * new-version banner carries. That was Jeff's call when the two were matched:
 * the rest of the bar is the same paint, and the thing being offered still has
 * to be the thing on the bar making the offer. Decorative on purpose — the
 * words say what it is, and "logo" read aloud would tell nobody anything.
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
 * Painted from the same three strings as UpdateBanner — border, fill and
 * button — with the button under the words rather than beside them, which is
 * where SignInBanner already puts one and where the eye is by the end of the
 * sentence. Jeff's call on 2026-08-21.
 *
 * One sentence, and no bold line above it. UpdateBanner carries one, but the
 * only headline this ask could have is "Add to your home screen", which is the
 * sentence again in fewer words.
 *
 * In normal flow rather than an overlay: it should sit above the page content
 * without dimming it, trapping focus, or needing the scroll lock.
 */
export function InstallBanner({ onOpen, onDismiss }: Props) {
  return (
    <div className={`no-print px-4 py-3 ${bannerOrangeEdge}`}>
      {/* Icon, words, cross. The cross stays up here rather than moving below
          with the button: it is the same "no thanks" it always was, and it is
          where it sits on the banner this one is now matched to. */}
      <div className="flex items-center gap-3">
        <AppIconTile />
        <p className="min-w-0 flex-1 text-sm text-slate-700">
          Add this app to your phone&rsquo;s home screen so you can find it again.
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className={`shrink-0 rounded p-1 text-slate-500 transition-colors ${bannerOrangeHover}`}
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

      <button
        type="button"
        onClick={onOpen}
        className={`ml-auto mt-2 block whitespace-nowrap rounded-md px-4 py-2 text-sm font-bold text-white transition-colors ${bannerOrange}`}
      >
        Show Me
      </button>
    </div>
  );
}
