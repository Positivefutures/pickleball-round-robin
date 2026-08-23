import type { ReactNode } from 'react';
import { MAX_RATING as MAX, MIN_RATING as MIN, step } from '../../lib/rating';
import { useStoredValue } from '../../hooks/useStoredValue';
import * as stores from '../../lib/stores';
import { PanelHeading } from '../PanelGlyph';
import { SlidersIcon } from '../icons';
import { panelCard } from '../panelStyles';
import { Toggle } from '../Toggle';
import { primary } from './accountStyles';

/** A quiet label over a group of rows, so the panel reads as two lists. */
function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-5 mb-2 px-1 text-xs font-bold uppercase tracking-wider text-[#6B7684]">
      {children}
    </h3>
  );
}

/**
 * The shape every row here is drawn in: a title, a quieter line under it saying
 * what it actually does, and the control on the right.
 *
 * The note is what makes this panel readable. "Show Match Balance" means
 * nothing on its own; "the Diff pill on each court" is the thing the host has
 * been looking at all afternoon.
 */
function Row({
  title,
  note,
  control,
}: {
  title: string;
  note: string;
  control: ReactNode;
}) {
  return (
    // Wrapping, and the words are given 11rem before the control may sit beside
    // them. A switch is narrow enough to share the line at every width this
    // panel is drawn at; the rating's minus, number and plus are 144px, which on
    // a phone left the note in a four-line column an inch wide. There it drops
    // to its own line and keeps to the right, which is still where the eye goes.
    <div className="flex flex-wrap items-center gap-x-3 gap-y-3 rounded-lg border border-panel-edge bg-[#F8FAFB] px-4 py-3">
      <div className="min-w-[11rem] flex-1">
        <span className="block font-bold text-[#1F293D]">{title}</span>
        <span className="mt-0.5 block text-sm leading-snug text-[#6B7684]">{note}</span>
      </div>
      <div className="ml-auto shrink-0">{control}</div>
    </div>
  );
}

/** The minus and the plus on the rating row. Both are the grey cancel button. */
const stepButton =
  'flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[#999] ' +
  'bg-gray-100 text-lg font-bold text-gray-700 transition-colors hover:bg-gray-200 ' +
  'disabled:opacity-40';

interface Props {
  largeText: boolean;
  onToggleLargeText: (on: boolean) => void;
  onClose: () => void;
}

/**
 * Settings: the short list of things about the app that are set to taste.
 *
 * Named for what it holds rather than what it is called on screen, because
 * `SettingsPanel` is already taken by the side menu that opens this. That menu
 * is a list of places to go; this is the one place that changes how the app
 * looks. Toggle Font Size and Default Player Rating used to sit in the menu
 * among the doors, which is why a host looking for them opened Instructions.
 *
 * Everything here is the device's, not the person's. See the block at the foot
 * of stores.ts for why none of it is synced.
 *
 * The rows read their own stores rather than taking five pairs of props. This
 * panel is the only writer for four of the five, and threading them through App
 * would have added ten lines there to save none here. Large text is the
 * exception: App has to hold it anyway, because it is the class on the shell.
 */

export function PreferencesPanel({ largeText, onToggleLargeText, onClose }: Props) {
  const [defaultRating, setDefaultRating] = useStoredValue(stores.defaultRating);
  const [showRatings, setShowRatings] = useStoredValue(stores.showRatings);
  const [showBalance, setShowBalance] = useStoredValue(stores.showBalance);
  const [showGenderMarks, setShowGenderMarks] = useStoredValue(stores.showGenderMarks);

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className={`mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain ${panelCard} bg-white p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The same three sliders that mark Settings in the menu, so the panel
            is recognisably the thing that was pressed. */}
        <PanelHeading icon={SlidersIcon} title="Settings" />

        <div className="mt-5 space-y-2.5">
          <Row
            title="Large Font Size"
            note="Bigger text across the whole app, for reading at arm's length."
            control={
              <Toggle checked={largeText} onChange={onToggleLargeText} label="Large Font Size" />
            }
          />
          <Row
            title="Default Player Rating"
            note="What a new player starts with on the Add Player form."
            control={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDefaultRating(step(defaultRating, -0.1))}
                  disabled={defaultRating <= MIN}
                  aria-label="Lower the default rating"
                  className={stepButton}
                >
                  &minus;
                </button>
                <span className="min-w-10 text-center text-xl font-semibold text-gray-800">
                  {defaultRating.toFixed(1)}
                </span>
                <button
                  type="button"
                  onClick={() => setDefaultRating(step(defaultRating, 0.1))}
                  disabled={defaultRating >= MAX}
                  aria-label="Raise the default rating"
                  className={stepButton}
                >
                  +
                </button>
              </div>
            }
          />
        </div>

        <GroupLabel>On the schedule</GroupLabel>

        <div className="space-y-2.5">
          <Row
            title="Show Player Ratings"
            note="The number beside each name on the schedule."
            control={
              <Toggle
                checked={showRatings}
                onChange={setShowRatings}
                label="Show Player Ratings"
              />
            }
          />
          <Row
            title="Show Match Balance"
            note="The Diff pill on each court, telling you how evenly matched the two teams are."
            control={
              <Toggle
                checked={showBalance}
                onChange={setShowBalance}
                label="Show Match Balance"
              />
            }
          />
          <Row
            title="Show Gender Icons"
            note="The small marks beside names in Gendered and Mixed rounds."
            control={
              <Toggle
                checked={showGenderMarks}
                onChange={setShowGenderMarks}
                label="Show Gender Icons"
              />
            }
          />
        </div>

        <button type="button" onClick={onClose} className={`mt-6 ${primary}`}>
          Done
        </button>
      </div>
    </div>
  );
}
