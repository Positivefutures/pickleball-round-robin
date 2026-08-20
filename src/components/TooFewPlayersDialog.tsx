import { AddPlayerSolidIcon } from './icons';
import { PanelHeading } from './PanelGlyph';
import { panelCard } from './panelStyles';
import { primary } from './layout/accountStyles';

/**
 * The answer to pressing Continue to Setup, or the Setup tab, too early.
 *
 * Both of those used to be dead ends. The button was hidden below four players
 * and disabled below that, so the one press that would have asked the question
 * was the one press the app refused to hear; the tab walked the host onto a
 * page where nothing could be ticked and left them to work out why.
 *
 * So neither is blocked any more. They are greyed, they are pressable, and the
 * press is answered here — one sentence, one way out. It says the number
 * because "not enough players" is not an instruction.
 *
 * The sentence is the heading rather than body copy under one. That is the
 * house rule for a dialog with one thing to say; see PanelGlyph.tsx.
 */
export function TooFewPlayersDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className={`bg-white ${panelCard} p-6 mx-4 max-w-sm w-full`}>
        <PanelHeading
          icon={AddPlayerSolidIcon}
          title="Add at least 4 players before continuing to Setup."
        />
        <button onClick={onClose} className={`${primary} mt-5`} autoFocus>
          OK
        </button>
      </div>
    </div>
  );
}
