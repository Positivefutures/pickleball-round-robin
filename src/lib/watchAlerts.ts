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
 * separately.
 *
 * They follow the host exactly once: the first published timer to arrive is
 * copied down as this phone's own, and from then on the host cannot move them.
 * That is a reversal — the rule here used to be that anything untouched went on
 * following the host live, which sounds generous and is not what it feels like
 * on the phone. A watcher who looks at Flash Screen, sees it already on, and is
 * happy with it has made a decision; the host turning theirs off an hour later
 * silently unmakes it, and the switch they were content with has moved by
 * itself. Jeff's call on 2026-08-20: what is on this phone is this phone's.
 *
 * The seeding waits for a real timer because the host's choices arrive on it.
 * Before then there is nothing to copy and the switches stand at the defaults,
 * which is also what a watcher answering them early is answering.
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
 * switches stand at what the host's own timer starts life as, and seedOwnAlerts
 * writes the host's real ones over any of the three still unanswered the moment
 * a timer does arrive. Answering them while waiting is the point: a watcher who
 * wants the alarm silenced would rather say so now than after it has gone off
 * next to them, and an answer given then is kept rather than overwritten.
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
 * Copies the host's three choices down as this phone's own, once.
 *
 * Called with the first real timer of the session. Only the switches nobody has
 * answered are filled in: a watcher who silenced the alarm while waiting for
 * the host to start has already said what they want, and the arriving timer is
 * not a reason to ask them again.
 *
 * Does nothing at all once all three are down, so the poll that brings a
 * timer every few seconds is not a write every few seconds.
 */
export function seedOwnAlerts(session: string, timer: SharedRoundTimer): void {
  const mine = ownAlerts(session);
  if (mine.soundOn !== undefined && mine.flashOn !== undefined && mine.alarmTone !== undefined) {
    return;
  }
  const host = { ...DEFAULT_ROUND_TIMER_STATE, ...timer };
  stores.watchAlerts.set((prev) => {
    const held: Partial<stores.WatchAlerts> = prev && prev.session === session ? prev : {};
    return {
      ...held,
      session,
      soundOn: held.soundOn ?? host.soundOn ?? true,
      flashOn: held.flashOn ?? host.flashOn,
      alarmTone: resolveTone(held.alarmTone ?? host.alarmTone ?? DEFAULT_ALARM_TONE)
    };
  });
}

/**
 * Records one of the three.
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
