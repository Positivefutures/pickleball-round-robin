import { useEffect } from 'react';
import { startAlarmLoop, stopAlarmLoop, type AlarmToneId } from '../lib/alarmSounds';

/**
 * Sounding the host's alarm on a watching phone.
 *
 * The host's own alarm is driven by the watchdog in lib/roundTimer.ts, which
 * owns the timer and knows the instant it runs out. A watcher owns nothing: it
 * has a deadline published by somebody else and its own clock to measure it
 * against. So the phase is worked out where the countdown is drawn and handed
 * here, and this only decides whether a noise is being made.
 *
 * Mounted from the page rather than from the timer sheet, on purpose. A watcher
 * who has put their phone in a pocket has not asked to be excused from the end
 * of the round — that is the case the alarm is most for.
 *
 * Whether it can actually be heard is iOS's decision, not this one. An
 * AudioContext will not make a sound until it has been unlocked by a real
 * gesture, so a phone that has been tapped once since the page loaded rings and
 * one that has been sitting untouched behind a lock screen does not. Every tap
 * on the page resumes the context (see the listeners in alarmSounds), and
 * turning Play Sound on or picking a tone spends a gesture deliberately.
 */
export function useSharedAlarm(alarming: boolean, soundOn: boolean, tone: AlarmToneId): void {
  useEffect(() => {
    if (!alarming || !soundOn) return;
    startAlarmLoop(tone);
    // Silenced when the alarm ends, when the sound is switched off mid-ring,
    // when the tone is changed under it, and when the page goes. All four want
    // the same thing, and a loop left running is a phone somebody has to
    // reload to quieten.
    return () => stopAlarmLoop();
  }, [alarming, soundOn, tone]);
}
