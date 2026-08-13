import { AddPlayerSolidIcon, CourtIcon, PaddleIcon, ShuffleIcon } from '../icons';

/**
 * The one control at the top of the schedule. Everything the host might want to
 * change mid-session is behind it.
 *
 * Drawn from `INBOX/Actions.PNG`, sampled rather than guessed: the panel runs
 * #FB7605 to #EC2C02 top to bottom, the halftone fields either side are #F36C11
 * and #2E9DB6, and the four tiles sit high enough to break the top edge. Sizes
 * come from the same image, which is a 375pt screen at 2.73x, taken up a fifth
 * so the one control on the page is the size of one. Every measurement here is
 * that same 1.2, so the drawing cannot come apart.
 */
const TILES = [AddPlayerSolidIcon, ShuffleIcon, CourtIcon, PaddleIcon];

// A field of dots fading away from the button. Decoration, so it is hidden from
// anything reading the page out and never printed.
function Halftone({ side, colour }: { side: 'left' | 'right'; colour: string }) {
  const fade = side === 'left' ? 'to left' : 'to right';
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 hidden h-[89px] w-[180px] -translate-y-1/2 min-[380px]:block"
      style={{
        [side === 'left' ? 'right' : 'left']: '100%',
        backgroundImage: `radial-gradient(circle, ${colour} 1.2px, transparent 1.4px)`,
        backgroundSize: '9px 9px',
        maskImage: `linear-gradient(${fade}, rgba(0,0,0,0.55), transparent 78%)`,
        WebkitMaskImage: `linear-gradient(${fade}, rgba(0,0,0,0.55), transparent 78%)`,
      }}
    />
  );
}

export function ActionsButton({ onClick }: { onClick: () => void }) {
  return (
    // The four tiles hang 17px above the panel and <main> opens with only 16,
    // which left the button all but touching the step tabs. This puts the same
    // 24px above the tiles that the page's own spacing leaves below the panel.
    <div className="no-print flex justify-center pt-[25px]">
      <div className="relative">
        <Halftone side="left" colour="#F36C11" />
        <Halftone side="right" colour="#2E9DB6" />
        <button
          data-tutorial="actions-button"
          type="button"
          onClick={onClick}
          aria-haspopup="dialog"
          className="relative flex h-[72px] w-[125px] flex-col items-center justify-end rounded-2xl
                     pb-2.5 text-white shadow-[0_4px_10px_rgba(0,0,0,0.18)] ring-2 ring-white
                     transition-transform active:scale-95"
          style={{ backgroundImage: 'linear-gradient(#FB7605, #EC2C02)' }}
        >
          {/* Pulled up out of the panel, which is what gives the button its
              shape. The tiles are decoration; the word underneath is the label. */}
          <span
            aria-hidden="true"
            className="absolute -top-[17px] grid grid-cols-2 gap-[5px]"
          >
            {TILES.map((Icon, i) => (
              <span
                key={i}
                className="flex h-[25px] w-[25px] items-center justify-center rounded-[7px]
                           bg-[#F9600A] ring-[1.5px] ring-white"
              >
                <Icon className="h-[15px] w-[15px] text-white" />
              </span>
            ))}
          </span>
          <span className="text-[18px] font-extrabold leading-none tracking-tight">
            Actions
          </span>
        </button>
      </div>
    </div>
  );
}
