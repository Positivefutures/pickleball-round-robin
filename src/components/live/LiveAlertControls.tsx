import { warmUpAudio, type AlarmToneId } from '../../lib/alarmSounds';
import type { Alerts } from '../../lib/watchAlerts';
import { Toggle } from '../Toggle';
import { AlarmTonePicker } from '../schedule/AlarmTonePicker';
import {
  FlashIcon,
  IphoneOutlineIcon,
  SilenceIcon,
  VolumeUpIcon
} from '../schedule/timerIcons';

/**
 * The three things a watching phone can decide for itself about the host's
 * alarm: whether it makes a noise, whether it flashes, and which noise.
 *
 * The same three rows the host sets in RoundTimerPanel, drawn for the black
 * sheet, because a watcher's timer is always counting and the counting sheet is
 * the dark one. Deliberately not disabled or hidden while the alarm is
 * sounding: the moment somebody most wants the switch marked Play Sound is the
 * moment it is going off in their hand.
 *
 * The heading says whose phone this is. Without it these read as controls over
 * the session, and a player quietly turning the host's alarm off for a court
 * full of people is the one thing this must never look like.
 */

const INK = '#FFFFFF';
const QUIET = '#9CA3AF';
/** What a switched-on alert is drawn in here. This box is only ever on the
 *  black sheet, so it is the orange the host's counting timer uses rather
 *  than the teal of their settings screen. See AlertSwitches. */
const ON = 'text-brand-orange';

export function LiveAlertControls({
  alerts,
  onChange
}: {
  alerts: Alerts;
  onChange: (patch: Partial<Alerts>) => void;
}) {
  /**
   * Switching the sound on is a tap, and a tap is the only thing iOS accepts as
   * permission to make a noise later. Spending it here is what makes the
   * difference between a switch that says Play Sound and a phone that actually
   * does, minutes afterwards, with the screen off.
   */
  function setSound(on: boolean) {
    if (on) warmUpAudio(alerts.alarmTone);
    onChange({ soundOn: on });
  }

  function setTone(alarmTone: AlarmToneId) {
    warmUpAudio(alarmTone);
    onChange({ alarmTone });
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-white/20 p-4">
      <p className="mb-1 text-sm font-bold" style={{ color: QUIET }}>
        On this phone, when time is up
      </p>

      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          {alerts.soundOn ? (
            <VolumeUpIcon className={`h-6 w-6 ${ON}`} />
          ) : (
            <SilenceIcon className="h-6 w-6 text-gray-500" />
          )}
          <span className="font-bold" style={{ color: INK }}>
            Play Sound
          </span>
        </div>
        <Toggle checked={alerts.soundOn} onChange={setSound} label="Play Sound" tone="orange" />
      </div>

      <div className="flex items-center justify-between border-t border-white/10 py-2">
        <div className="flex items-center gap-3">
          {alerts.flashOn ? (
            <FlashIcon className={`h-6 w-6 ${ON}`} />
          ) : (
            <IphoneOutlineIcon className="h-6 w-6 text-gray-500" />
          )}
          <span className="font-bold" style={{ color: INK }}>
            Flash Screen
          </span>
        </div>
        <Toggle
          checked={alerts.flashOn}
          onChange={(on) => onChange({ flashOn: on })}
          label="Flash Screen"
          tone="orange"
        />
      </div>

      <div className="border-t border-white/10">
        <AlarmTonePicker value={alerts.alarmTone} onChange={setTone} dark />
      </div>
    </div>
  );
}
