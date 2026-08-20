import * as stores from './stores';
import { DEFAULT_ALARM_TONE, resolveTone, type AlarmToneId } from './alarmSounds';
import { DEFAULT_ROUND_TIMER_STATE } from './roundTimerState';
import type { SharedRoundTimer } from './sessionSnapshot';

/**
 * What one watching phone does when the host's timer reaches zero.
 *
 * The host sets an alarm for a court, so every phone watching starts on their
 * choices — the sound, the flash and the tone all arrive on the published
 * timer. That is the right default and the wrong rule: the phone in question
 * belongs to somebody who may be standing next to the person running it, and
 * nine phones going off at once is nine times the alarm anybody wanted. Or the
 * opposite — a player on the far court, out of earshot, who wants the noise.
 *
 * So each of the three can be answered on this phone, and each is answered
 * separately. Anything this watcher has not touched keeps following the host,
 * live, for the rest of the afternoon: turning the sound down does not also
 * freeze the tone at whatever it happened to be.
 *
 * "For the rest of the session" is `session` below. A record from another
 * afternoon is ignored and written over, so scanning a new code starts from the
 * host again rather than from a decision made about a different game.
 */

export interface Alerts {
  soundOn: boolean;
  flashOn: boolean;
  alarmTone: AlarmToneId;
}

/**
 * What this watcher has said for themselves, or nothing on a new session.
 *
 * `held` is passed in rather than read here so that a component can subscribe
 * to the store and hand the value straight through. A function that read it
 * itself would be right and would not re-render: the switch somebody had just
 * pressed would stay where it was.
 */
export function ownAlerts(
  session: string,
  held = stores.watchAlerts.get()
): Omit<stores.WatchAlerts, 'session'> {
  if (!held || held.session !== session) return {};
  return held;
}

/**
 * The host's timer, with anything this watcher has decided written over it.
 *
 * `?? timer.soundOn ?? true` rather than a boolean or: `false` is a real answer
 * from either of them, and the whole point of this is that a watcher can say no
 * to something the host said yes to.
 *
 * `timer` is null on the timer screen a watcher opens before the host has
 * started anything. There is no published choice to follow yet, so the three
 * switches stand at what the host's own timer starts life as — and because
 * nothing untouched is written down, the moment a real timer arrives they go
 * back to following it. Answering them while waiting is the point: a watcher
 * who wants the alarm silenced would rather say so now than after it has gone
 * off next to them.
 */
export function alertsFor(
  timer: SharedRoundTimer | null,
  session: string,
  held = stores.watchAlerts.get()
): Alerts {
  const mine = ownAlerts(session, held);
  const host = timer ?? DEFAULT_ROUND_TIMER_STATE;
  return {
    soundOn: mine.soundOn ?? host.soundOn ?? true,
    flashOn: mine.flashOn ?? host.flashOn,
    // Resolved here rather than where it is stored, so a tone published by a
    // build this one has never seen still lands on something audible.
    alarmTone: resolveTone(mine.alarmTone ?? host.alarmTone ?? DEFAULT_ALARM_TONE)
  };
}

/**
 * Records one of the three, leaving the other two following the host.
 *
 * A record belonging to another session is replaced rather than merged. It
 * describes an afternoon that is over.
 */
export function setOwnAlert(
  session: string,
  patch: Partial<Omit<stores.WatchAlerts, 'session'>>
): void {
  stores.watchAlerts.set((prev) => ({
    ...(prev && prev.session === session ? prev : {}),
    session,
    ...patch
  }));
}
