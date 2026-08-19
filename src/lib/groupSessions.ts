import type { Player, Partnership, RoundPlan, Schedule } from '../types';
import type { Step } from './steps';
import * as stores from './stores';
import { normalizeRoundPlan } from './roundPlan';
import { attachShare, detachShare, discardShare, stopAllSharing } from './liveSession';
import { clearRoundTimerForNewSchedule } from './roundTimer';

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
 * because the map key already says which group the schedule belongs to.
 */
export interface GroupSession {
  step: Step;
  setupSeen: boolean;
  selectedIds: string[];
  partnerships: Partnership[];
  /**
   * Couples a substitute took over mid-session. Optional because groups parked
   * by builds before stand-ins existed have none, and none is an empty list.
   */
  subPartnerships?: Partnership[];
  schedule: Schedule | null;
  completedRounds: number[];
  removedIds: string[];
  guests: Player[];
  scheduleEdited: boolean;
  /**
   * What that schedule was built from. Optional because groups parked by builds
   * before the Schedule tab became a door have no such record, and a session
   * with none is treated as one that cannot promise the door — see
   * scheduleIsStale.
   */
  scheduleBasis?: string | null;
  sessionId: string | null;
  numCourts: number;
  numRounds: number;
  /**
   * What each round of this group's session is played as. Optional because a
   * group parked by a build before the planner existed has none, and read back
   * through normalizeRoundPlan so a missing one is an ordinary afternoon rather
   * than sixteen undefineds.
   */
  roundPlan?: RoundPlan;
  scoringEnabled: boolean;
  /**
   * The key this group's session is published under, or null while it is not
   * being shared.
   *
   * Here rather than absent, which is the whole of this change. A share used to
   * end the moment the host looked at another group, because one live slot
   * publishing under one key could only ever describe the group in front. It
   * survives now because park() hands the key back instead of taking the row
   * down with it — see detachShare — which is what lets a host set three of
   * tomorrow's groups up tonight and send all three links out.
   *
   * Optional for the same reason the three fields above are: a group parked by
   * an older build has none. Here the absence is not merely tolerable, it is
   * true — those builds stopped sharing on the way out, so there is genuinely
   * nothing to pick back up.
   */
  shareKey?: string | null;
  /**
   * Whether watchers may type scores, and the four digits that let them.
   *
   * Parked with the group because they are published, and because a code said
   * out loud to Tuesday night's court must not unlock Wednesday's. Left global
   * they would follow the host from one live share to the next, which was
   * harmless while only one could exist.
   *
   * `standingsShared` deliberately stays where it is. stores.ts calls it a
   * preference that outlives a session, and it is about what this host likes to
   * show rather than about one afternoon.
   */
  scoreEditingAllowed?: boolean;
  scoreEditCode?: string | null;
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
    subPartnerships: stores.subPartnerships.get(),
    schedule: stores.schedule.get(),
    completedRounds: stores.completedRounds.get(),
    removedIds: stores.removedIds.get(),
    guests: stores.guests.get(),
    scheduleEdited: stores.scheduleEdited.get(),
    scheduleBasis: stores.scheduleBasis.get(),
    sessionId: stores.sessionId.get(),
    numCourts: stores.numCourts.get(),
    numRounds: stores.numRounds.get(),
    roundPlan: stores.roundPlan.get(),
    scoringEnabled: stores.scoringEnabled.get(),
    shareKey: stores.shareKey.get(),
    scoreEditingAllowed: stores.scoreEditingAllowed.get(),
    scoreEditCode: stores.scoreEditCode.get()
  };
}

/**
 * Empties the session out of the live slot.
 *
 * keepSelection is New Round Robin: the same crowd usually plays again, so the
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
  // Who was covering for whom belongs to the afternoon, so it goes with it even
  // when the crowd is kept. The couples underneath it are Setup's and stay.
  stores.subPartnerships.set([]);
  stores.scheduleEdited.set(false);
  // No schedule, nothing it was built from. Left behind, it would be compared
  // against the next session's settings and answer a question about a schedule
  // that no longer exists.
  stores.scheduleBasis.set(null);
  // Whatever round it was pinned to is leaving with the rest of the session.
  clearRoundTimerForNewSchedule();
  if (!keepSelection) {
    stores.selectedIds.set([]);
    stores.partnerships.set([]);
  }
  stores.scheduleRosterId.set(null);
  stores.sessionId.set(null);
  // The share key is deliberately left where it is, and this omission is the
  // one that lets a host tidy up the morning of. A link belongs to the group
  // rather than to one afternoon: New Round Robin and a walk back to Setup both
  // land here, and neither should cost a host the QR code they have already
  // sent to fourteen people. The next Generate publishes straight over it.
  //
  // Taking a share down is Stop Sharing, a deleted group, and nothing else.
}

/** Fills the live slot from a saved group. */
function fill(saved: GroupSession, rosterId: string): void {
  stores.selectedIds.set(saved.selectedIds);
  stores.partnerships.set(saved.partnerships);
  stores.subPartnerships.set(saved.subPartnerships ?? []);
  stores.schedule.set(saved.schedule);
  stores.completedRounds.set(saved.completedRounds);
  stores.removedIds.set(saved.removedIds);
  stores.guests.set(saved.guests);
  stores.scheduleEdited.set(saved.scheduleEdited);
  stores.scheduleBasis.set(saved.scheduleBasis ?? null);
  stores.sessionId.set(saved.sessionId);
  // Derived rather than stored: the key this was filed under is the answer.
  stores.scheduleRosterId.set(saved.schedule ? rosterId : null);
  stores.numCourts.set(saved.numCourts);
  stores.numRounds.set(saved.numRounds);
  stores.roundPlan.set(normalizeRoundPlan(saved.roundPlan));
  stores.scoringEnabled.set(saved.scoringEnabled);
  stores.shareKey.set(saved.shareKey ?? null);
  stores.scoreEditingAllowed.set(saved.scoreEditingAllowed ?? false);
  stores.scoreEditCode.set(saved.scoreEditCode ?? null);
  stores.setupSeen.set(saved.setupSeen);
  stores.step.set(saved.step);
}

/**
 * Files the live slot under a group.
 *
 * The share is detached first, before anything else moves, and the ordering is
 * the most load-bearing thing in this file. liveSession watches the schedule
 * store and publishes what it finds there under whatever key it is holding, so
 * leaving it subscribed for even one write of fill() would push a half-filled
 * slot — the incoming group's afternoon — out to the outgoing group's QR code.
 *
 * What has changed is only what "detached" costs. It used to be stopSharing(),
 * which deleted the row: the link died with the switch and the warning in the
 * group picker said so. It is detachShare() now, which hands the key back and
 * leaves the published copy standing, so the group being left stays shared and
 * the key travels into the record below to be picked up on the way back in.
 */
export function park(rosterId: string): void {
  detachShare();
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
    // After fill and never before: the live slot has to be describing this
    // group before anything starts watching it. The publish that follows also
    // moves expires_at forward, so a host flicking between three groups keeps
    // all three links alive rather than watching the first one time out.
    if (saved.shareKey) attachShare(saved.shareKey);
    return;
  }
  clearSession();
  // A group nobody has opened before is not sharing anything, and the key still
  // in the live slot belongs to the group just parked. clearSession leaves it
  // alone on purpose, so this is where it has to go.
  stores.shareKey.set(null);
  stores.scoreEditingAllowed.set(false);
  stores.scoreEditCode.set(null);
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

/**
 * Drops a deleted group's saved session. Nothing is coming back for it.
 *
 * The published copy goes too, and this is one of the two places anything takes
 * a share down without being asked to. The group it described does not exist
 * any more, so neither should a public document naming everyone who was in it.
 */
export function forget(rosterId: string): void {
  const all = stores.groupSessions.get();
  if (!(rosterId in all)) return;
  const going = all[rosterId].shareKey;
  const next = { ...all };
  delete next[rosterId];
  stores.groupSessions.set(next);
  if (going) void discardShare(going);
}

/** Every group's saved session gone, for a device being handed to an account. */
export function forgetAll(): void {
  stores.groupSessions.set({});
  // Every link this device was holding, and it means it: the sessions those
  // rows describe are the ones being thrown away here.
  void stopAllSharing();
}
