import { STEPS as steps, type Step } from '../../lib/steps';
import { StepPlayersIcon, StepScheduleIcon, StepSetupIcon } from '../icons';

interface Props {
  current: Step;
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

export function StepIndicator({ current }: Props) {
  return (
    <nav
      className="flex items-stretch p-0.5 rounded-2xl border border-[#ddd] no-print"
      style={{ backgroundColor: TRACK }}
    >
      {steps.map((step, i) => {
        const isActive = step.key === current;
        const Icon = STEP_ICONS[step.key];
        // A hairline between neighbours, hidden either side of the raised card
        // so it never runs into it.
        const divider = i > 0 && !isActive && steps[i - 1].key !== current;

        return (
          <div key={step.key} className="flex-1 flex items-stretch min-w-0">
            <span
              aria-hidden="true"
              className="self-center w-px h-5 shrink-0"
              style={{ backgroundColor: divider ? DIVIDER : 'transparent' }}
            />
            <div
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
            </div>
          </div>
        );
      })}
    </nav>
  );
}
