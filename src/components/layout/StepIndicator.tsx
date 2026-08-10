import { STEPS as steps, type Step } from '../../lib/steps';
import { StepPlayersIcon, StepScheduleIcon, StepSetupIcon } from '../icons';

interface Props {
  current: Step;
  /** Steps the host can jump to from here. Never includes `current`. */
  available: Step[];
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
const ACTIVE_BORDER = '#cde6d5';
const ACTIVE_TEXT = '#178c15';
const ACTIVE_MARK = '#3aa641';
const IDLE_TEXT = '#61697c';
const IDLE_ICON = '#6f768d';
const DIVIDER = '#dee1e7';
// A step already been through: the live step's card with the colour drained out
// of it, and a background that lifts off the track without reaching its white.
const READY_BORDER = '#d3d7de';
const READY_BG = '#fbfbfc';

export function StepIndicator({ current, available, onNavigate }: Props) {
  // Both the live step and a step you can go back to are raised cards. A
  // hairline belongs between two flat neighbours and nowhere else.
  const carded = (key: Step) => key === current || available.includes(key);

  return (
    <nav
      className="flex items-stretch p-0.5 rounded-2xl border border-[#ddd] no-print"
      style={{ backgroundColor: TRACK }}
    >
      {steps.map((step, i) => {
        const isActive = step.key === current;
        const isReady = available.includes(step.key);
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
              disabled={!isReady}
              onClick={() => onNavigate(step.key)}
              aria-current={isActive ? 'step' : undefined}
              // `relative` anchors the mark below. No `whitespace-nowrap`: a tab
              // that cannot fit its label must wrap rather than push the page
              // wider than the phone and clip everything else with it.
              // `text-xs` rather than a hand-set pixel size: the design's label
              // is smaller than the app's usual, and text-xs is one of the
              // sizes large-text mode scales, so that setting still works here.
              className={`relative flex-1 flex items-center justify-center gap-1.5 py-3 px-1 rounded-xl text-xs font-semibold transition-colors ${
                isActive ? 'bg-white shadow-sm' : ''
              }`}
              style={
                isActive
                  ? { border: `1px solid ${ACTIVE_BORDER}`, color: ACTIVE_TEXT }
                  : isReady
                    ? {
                        border: `1px solid ${READY_BORDER}`,
                        backgroundColor: READY_BG,
                        color: IDLE_TEXT,
                      }
                    : { color: IDLE_TEXT }
              }
            >
              {/* The icon runs a shade lighter than its label, both states. */}
              <span style={{ color: isActive ? ACTIVE_MARK : IDLE_ICON }} className="flex">
                <Icon className="w-[23px] h-[23px]" />
              </span>
              {step.label}
              {isActive && (
                // The short bar under the live step, flush with the bottom of
                // the card and centred on it.
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full"
                  style={{ backgroundColor: ACTIVE_MARK }}
                />
              )}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
