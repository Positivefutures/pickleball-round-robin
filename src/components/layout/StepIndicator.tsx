import { STEPS as steps, type Step } from '../../lib/steps';
import { StepPlayersIcon, StepScheduleIcon, StepSetupIcon } from '../icons';

interface Props {
  current: Step;
  /** Steps the host can jump to from here. Never includes `current`. */
  available: Step[];
  /**
   * Steps that are not doors but are still worth a press.
   *
   * There is one: Schedule, when a schedule exists but the setup has moved on
   * from it. It is drawn shut, because pressing it will not show the schedule,
   * and it is pressable anyway, because somebody reaching for it is asking a
   * real question — where has my schedule gone — and deserves an answer rather
   * than a tab that does nothing at all.
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
    <nav
      className="flex items-stretch p-0.5 rounded-2xl border border-panel-edge no-print"
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
              // where you are, and a step not reached yet has to be earned with
              // the button at the foot of the page — which is what keeps
              // Schedule off limits until Generate has built one.
              disabled={!isReady && !isAnswering}
              onClick={() => onNavigate(step.key)}
              aria-current={isActive ? 'step' : undefined}
              // The tour dims the page around whatever it is pointing at, and
              // punches this one back out. Where you are is not a thing to be
              // greyed out while somebody explains where you are.
              data-tutorial={isActive ? 'active-tab' : undefined}
              // `relative` anchors the mark below. No `whitespace-nowrap`: a tab
              // that cannot fit its label must wrap rather than push the page
              // wider than the phone and clip everything else with it.
              // One absolute size in both text modes, and it is the size large
              // text mode used to give text-xs here. These three labels are how
              // the app is navigated, so they are worth reading at the setting
              // that made them readable whether or not it is switched on.
              className={`relative flex-1 flex items-center justify-center gap-1 py-3 px-0.5 rounded-xl text-[1.0125rem] font-bold transition-colors ${
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
                  beside the bigger label and it buys back the width
                  "3. Schedule" needs to stay on one line. */}
              <span style={{ color: isActive ? ACTIVE : IDLE_ICON }} className="flex">
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
