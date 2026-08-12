import type { Player, Partnership, Schedule, SpecialGameTypes } from '../types';
import type { Step } from './steps';
import * as stores from './stores';
import { stopSharing } from './liveSession';

/**
 * One group's afternoon, kept while the host is looking at another group's.
 *
 * The app has one live slot — the stores in stores.ts — and it always describes
 * the group that is open. That is what lets sync, sharing and the error report
 * go on reading `stores.schedule` without knowing there is more than one group
 * in the app. Switching groups empties the live slot into the map here under the
 * group being left, then fills it back up from the group being opened.
 *
 * The alternative was keying every session store by group id, which would have
 * meant rewriting the seven subscriptions in liveSession.ts and both merge paths
 * in sync.ts to ask which group they meant. This way they never have to.
 *
 * What is not here is as deliberate as what is. `scheduleRosterId` is missing
 * because the map key already says which group the schedule belongs to. The
 * share key is missing because a share does not survive the switch: see park().
 */
export interface GroupSession {
  step: Step;
  setupSeen: boolean;
  selectedIds: string[];
  partnerships: Partnership[];
  schedule: Schedule | null;
  completedRounds: number[];
  removedIds: string[];
  guests: Player[];
  scheduleEdited: boolean;
  sessionId: string | null;
  numCourts: number;
  numRounds: number;
  specialTypes: SpecialGameTypes;
  scoringEnabled: boolean;
}

/**
 * The tab to draw, which is not always the tab that was stored.
 *
 * A saved 'schedule' with no schedule under it would render an empty page with
 * no way off it, and there are two ways to arrive at one: storage edited by
 * hand, and a sync that cleared the session out from under a parked group.
 */
export function currentStep(): Step {
  const saved = stores.step.get();
  if (saved === 'schedule' && stores.schedule.get() === null) return 'roster';
  return saved;
}

/** The live slot, read out whole. */
function live(): GroupSession {
  return {
    step: currentStep(),
    setupSeen: stores.setupSeen.get(),
    selectedIds: stores.selectedIds.get(),
    partnerships: stores.partnerships.get(),
    schedule: stores.schedule.get(),
    completedRounds: stores.completedRounds.get(),
    removedIds: stores.removedIds.get(),
    guests: stores.guests.get(),
    scheduleEdited: stores.scheduleEdited.get(),
    sessionId: stores.sessionId.get(),
    numCourts: stores.numCourts.get(),
    numRounds: stores.numRounds.get(),
    specialTypes: stores.specialTypes.get(),
    scoringEnabled: stores.scoringEnabled.get()
  };
}

/**
 * Empties the session out of the live slot.
 *
 * keepSelection is Start New Session: the same crowd usually plays again, so the
 * ticked players and their couples stay for the next one. Everything else goes
 * whichever way the session ended.
 *
 * The courts, rounds and round types are left alone on purpose. They are how
 * this group is run rather than part of one afternoon, and the next session
 * should open with the same ones.
 */
export function clearSession(keepSelection = false): void {
  stores.schedule.set(null);
  stores.completedRounds.set([]);
  stores.removedIds.set([]);
  // Guests belong to the session and go with it, whichever way it ends. They
  // are in nobody's group, so there is nowhere for them to be kept.
  stores.guests.set([]);
  stores.scheduleEdited.set(false);
  if (!keepSelection) {
    stores.selectedIds.set([]);
    stores.partnerships.set([]);
  }
  stores.scheduleRosterId.set(null);
  stores.sessionId.set(null);
}

/** Fills the live slot from a saved group. */
function fill(saved: GroupSession, rosterId: string): void {
  stores.selectedIds.set(saved.selectedIds);
  stores.partnerships.set(saved.partnerships);
  stores.schedule.set(saved.schedule);
  stores.completedRounds.set(saved.completedRounds);
  stores.removedIds.set(saved.removedIds);
  stores.guests.set(saved.guests);
  stores.scheduleEdited.set(saved.scheduleEdited);
  stores.sessionId.set(saved.sessionId);
  // Derived rather than stored: the key this was filed under is the answer.
  stores.scheduleRosterId.set(saved.schedule ? rosterId : null);
  stores.numCourts.set(saved.numCourts);
  stores.numRounds.set(saved.numRounds);
  stores.specialTypes.set(saved.specialTypes);
  stores.scoringEnabled.set(saved.scoringEnabled);
  stores.setupSeen.set(saved.setupSeen);
  stores.step.set(saved.step);
}

/**
 * Files the live slot under a group.
 *
 * A live share is stopped first, before anything else moves. liveSession watches
 * the schedule store and publishes what it finds there under whatever key it is
 * holding, so leaving the share up for even one write would push the incoming
 * group's session out to the outgoing group's QR code.
 */
export function park(rosterId: string): void {
  if (stores.shareKey.get() !== null) void stopSharing();
  const saved = live();
  // Read then write, rather than the functional form. A store's set() takes the
  // previous value from its cache while nothing is subscribed, and get() is the
  // one that goes back to storage — which is what a test that seeds storage and
  // mounts again is relying on.
  stores.groupSessions.set({ ...stores.groupSessions.get(), [rosterId]: saved });
}

/**
 * Fills the live slot from a group, as it was when the host last left it.
 *
 * A group nobody has set up yet has no record, and gets an empty session with
 * the courts, rounds and round types already in the live slot. Inheriting the
 * last group's numbers beats resetting to three and eight: whoever is switching
 * has just been running a session, and this is usually the same club.
 *
 * It is also what makes this need no migration. On the first launch after the
 * change nothing is filed, so every group opens exactly as the single global
 * session did the day before.
 */
export function resume(rosterId: string): void {
  const saved = stores.groupSessions.get()[rosterId];
  if (saved) {
    fill(saved, rosterId);
    return;
  }
  clearSession();
  stores.setupSeen.set(false);
  stores.step.set('roster');
}

/**
 * The one door between groups. Everything that changes the active group goes
 * through here: the pickers, a group import, and a sync pull carrying another
 * device's choice.
 */
export function switchToGroup(id: string): void {
  const from = stores.activeRosterId.get();
  if (id === from) return;
  if (from) park(from);
  stores.activeRosterId.set(id);
  resume(id);
}

/** Drops a deleted group's saved session. Nothing is coming back for it. */
export function forget(rosterId: string): void {
  const all = stores.groupSessions.get();
  if (!(rosterId in all)) return;
  const next = { ...all };
  delete next[rosterId];
  stores.groupSessions.set(next);
}

/** Every group's saved session gone, for a device being handed to an account. */
export function forgetAll(): void {
  stores.groupSessions.set({});
}
