import { STEPS as steps, type Step } from '../../lib/steps';
import { StepPlayersIcon, StepScheduleIcon, StepSetupIcon } from '../icons';

interface Props {
  current: Step;
  /** Steps the host can jump to from here. Never includes `current`. */
  available: Step[];
  /**
   * Steps that are not doors but are still worth a press.
   *
   * There is one: Schedule, whenever the host is standing somewhere else. It is
   * never a door — Generate is the only way onto it — so it is drawn shut, and
   * it is pressable anyway, because somebody reaching for it is asking a real
   * question, where is my schedule, and deserves an answer rather than a tab
   * that does nothing at all. The answer is the Setup tab with the box bouncing
   * over the button that builds.
   *
   * Deliberately not marked disabled, by either `disabled` or `aria-disabled`.
   * Both say "this control does nothing", and this one does something useful:
   * it takes the host to Setup and points at the button that rebuilds. Marking
   * it would be a lie told only to the people relying on the markup, and it is
   * what a screen reader, and Playwright, would both act on. The difference is
   * carried in the look, which is the flat one a step not yet reached has.
   */
  answering?: Step[];
  onNavigate: (step: Step) => void;
}

// Kept here rather than in `steps.ts`, which is plain data and holds no JSX.
const STEP_ICONS: Record<Step, ({ className }: { className?: string }) => React.ReactElement> = {
  roster: StepPlayersIcon,
  setup: StepSetupIcon,
  schedule: StepScheduleIcon,
};

// Sampled from the design rather than rounded to the nearest Tailwind shade,
// which would shift every one of them a little.
const TRACK = '#f4f5f7';
/**
 * The step you are on, in one colour.
 *
 * It used to be three greens: a pale border, a mid label and a brighter bar and
 * icon. That was a small palette of its own for a control with three buttons in
 * it. The primary orange now does all four jobs, which is what makes the live
 * tab the same colour as everything else in the app that moves you somewhere.
 */
const ACTIVE = 'var(--color-brand-orange)';
const IDLE_TEXT = '#61697c';
const IDLE_ICON = '#6f768d';
const DIVIDER = '#dee1e7';
// A step already been through: the live step's card with the colour drained out
// of it, and a background that lifts off the track without reaching its white.
const READY_BORDER = '#d3d7de';
const READY_BG = '#fbfbfc';

export function StepIndicator({ current, available, answering = [], onNavigate }: Props) {
  // Both the live step and a step you can go back to are raised cards. A
  // hairline belongs between two flat neighbours and nowhere else.
  const carded = (key: Step) => key === current || available.includes(key);

  return (
    // `@container` makes every size below a fraction of this bar's own width
    // rather than of the root font size. That is what survives Safari's page
    // zoom, which does not scale rem — it narrows the CSS viewport, so a tab
    // measured in rem keeps its size while the room it has to sit in shrinks.
    <nav
      className="@container flex items-stretch p-0.5 rounded-2xl border border-panel-edge no-print"
      style={{ backgroundColor: TRACK }}
    >
      {steps.map((step, i) => {
        const isActive = step.key === current;
        const isReady = available.includes(step.key);
        // Looks like neither of the above, and still takes a press.
        const isAnswering = answering.includes(step.key);
        const Icon = STEP_ICONS[step.key];
        // Hidden either side of a raised card so it never runs into one.
        const divider = i > 0 && !carded(step.key) && !carded(steps[i - 1].key);

        return (
          <div key={step.key} className="flex-1 flex items-stretch min-w-0">
            <span
              aria-hidden="true"
              className="self-center w-px h-5 shrink-0"
              style={{ backgroundColor: divider ? DIVIDER : 'transparent' }}
            />
            <button
              type="button"
              // Only a step already been through is a door. The live step is
              // where you are, and Schedule is never one: it is earned with the
              // button at the foot of the Setup page, every time.
              disabled={!isReady && !isAnswering}
              onClick={() => onNavigate(step.key)}
              aria-current={isActive ? 'step' : undefined}
              // The tour dims the page around whatever it is pointing at, and
              // punches this one back out. Where you are is not a thing to be
              // greyed out while somebody explains where you are.
              data-tutorial={isActive ? 'active-tab' : undefined}
              // `relative` anchors the mark below.
              //
              // These three labels are how the app is navigated, so a tab must
              // never be on two lines. "3. Schedule" wants 92px at the size
              // below, and on a 375px phone — an SE, a mini — it had 88.7, so
              // it broke in half and took the other two tabs down with it.
              //
              // Three rules, in the order they take effect. `whitespace-nowrap`
              // is the guarantee. The size is a share of the bar rather than a
              // fixed one, so it gives ground before anything has to, holding
              // 1.0125rem wherever that fits — which is everywhere the icon is
              // drawn, so no phone loses the size it reads at today. And
              // `overflow-hidden` is the backstop for a width no clamp can
              // answer: the label is cut rather than allowed to push the page
              // wider than the phone, which is what the old wrap was avoiding.
              //
              // Two steps larger once the bar has room for it. The clamp above
              // tops out at 1.0125rem, a size chosen so a 320px phone can hold
              // three tabs — and it was still that size on a 1024px page, where
              // each tab has 336px for a word that wants 92. `@min-[40rem]` is
              // the bar's own width, not the viewport's, which is the same unit
              // everything else here is measured in. A phone never reaches it.
              className={`relative flex-1 flex items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-xl py-3 text-[clamp(0.75rem,5.4cqi,1.0125rem)] @min-[40rem]:text-[1.28rem] font-bold transition-colors ${
                isActive ? 'bg-white shadow-sm' : ''
              }`}
              style={
                isActive
                  ? { border: `1px solid ${ACTIVE}`, color: ACTIVE }
                  : isReady
                    ? {
                        border: `1px solid ${READY_BORDER}`,
                        backgroundColor: READY_BG,
                        color: IDLE_TEXT,
                      }
                    : { color: IDLE_TEXT }
              }
            >
              {/* On the live step the icon is the label's colour exactly; on the
                  others it still runs a shade lighter. It came off the design at
                  23px against much smaller type; at 20 it is the same weight
                  beside the bigger label.

                  Gone under 23rem of bar, which is a phone about 384px wide.
                  Icon and gap are 24px of a tab that only has 99 at 320px, and
                  they are the one thing here that can go: the word is what the
                  tab is for, and it is better read at full size without a glyph
                  than shrunk to make room for one. */}
              <span
                style={{ color: isActive ? ACTIVE : IDLE_ICON }}
                className="flex @max-[23rem]:hidden"
              >
                <Icon className="w-5 h-5" />
              </span>
              {step.label}
              {isActive && (
                // The short bar under the live step, flush with the bottom of
                // the card and centred on it.
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full"
                  style={{ backgroundColor: ACTIVE }}
                />
              )}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
