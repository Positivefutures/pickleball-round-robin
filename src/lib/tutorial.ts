import type { Schedule, Player } from '../types';
import type { Step } from './steps';
import * as stores from './stores';
import { minPlayersForCourts } from './assign';
import { clearSession, switchToGroup, forget } from './groupSessions';
import { buildExamplePlayers } from './exampleGroup';
import { generateId } from '../utils/helpers';

/**
 * The guided tour, as a state machine outside React.
 *
 * Every advance decision is made from the stores: the user performs the real
 * action — adds the player, generates the schedule — and the step notices the
 * state change. Nothing advances on a click alone, so the tour cannot drift
 * out of sync with what actually happened.
 *
 * What the engine cannot see in the stores (the Actions sheet's internal view,
 * pairing mode, an open dialog) it reads from the DOM instead: components mark
 * their tutorial targets with data-tutorial attributes, and a stage is chosen
 * by which targets currently exist. That also makes the whole thing drivable
 * headlessly — happy-dom has no layout, but it has a DOM.
 *
 * TutorialOverlay.tsx draws what this file decides: the darkened screen, the
 * hole over the current target, the arrow and the card.
 */

/** Named so a kept "Example Group" and a rerun's group can never collide. */
export const TUTORIAL_GROUP_NAME = 'Tutorial Group';

export interface TutorialView {
  stepNumber: number;
  stepCount: number;
  title: string;
  body: string;
  /** data-tutorial value of the spotlit element, or null for a centered card. */
  anchor: string | null;
  /** data-tutorial value the arrow points at, or null for no arrow. */
  arrow: string | null;
  /** Label for a Next/Finish button on steps that advance by button. */
  advanceLabel: string | null;
  /** Why the button refused, when it did. */
  error: string | null;
}

interface Snap {
  players: Player[];
  activeRosterId: string;
  selectedIds: string[];
  partnershipCount: number;
  schedule: Schedule | null;
  completedCount: number;
  removedCount: number;
  step: Step;
  numCourts: number;
}

interface Baseline {
  count?: number;
  scheduleRef?: Schedule | null;
}

interface TutorialStage {
  anchor: string | null;
  /** Where the arrow points when not at the anchor itself. */
  arrowAnchor?: string;
  /** Set false on stages where an arrow would only repeat the hole. */
  arrow?: boolean;
  title: string;
  body: string | ((s: Snap) => string);
  advanceLabel?: string;
  /** Gates a stage on state, on top of its anchor existing. */
  when?: (s: Snap, has: (anchor: string) => boolean) => boolean;
}

interface TutorialStep {
  id: string;
  stages: TutorialStage[];
  /** Captures what "done" is measured against, at the moment the step opens. */
  enter?: (s: Snap) => Baseline;
  done: (s: Snap, base: Baseline) => boolean;
  /** A button-step's veto: a message blocks, null lets Next through. */
  canAdvance?: (s: Snap) => string | null;
}

function snap(): Snap {
  return {
    players: stores.players.get(),
    activeRosterId: stores.activeRosterId.get(),
    selectedIds: stores.selectedIds.get(),
    partnershipCount: stores.partnerships.get().length,
    schedule: stores.schedule.get(),
    completedCount: stores.completedRounds.get().length,
    removedCount: stores.removedIds.get().length,
    step: stores.step.get(),
    numCourts: stores.numCourts.get(),
  };
}

/** How many players the group in front holds. */
function groupCount(s: Snap): number {
  return s.players.filter((p) => p.rosterIds.includes(s.activeRosterId)).length;
}

function hasAnchor(name: string): boolean {
  return document.querySelector(`[data-tutorial="${name}"]`) !== null;
}

const STEPS: TutorialStep[] = [
  {
    id: 'add-player',
    enter: (s) => ({ count: groupCount(s) }),
    done: (s, base) => groupCount(s) > (base.count ?? 0),
    stages: [
      {
        anchor: 'roster-add-panel',
        arrowAnchor: 'player-name-input',
        title: 'Add a player',
        body: 'Type a name in the box. Pick a rating, choose M or F, and tap Add Player.',
      },
    ],
  },
  {
    id: 'to-setup',
    done: (s) => s.step === 'setup',
    stages: [
      {
        anchor: 'continue-setup',
        title: 'On to Setup',
        body: 'Your group is ready. Tap Continue to Setup to plan the session.',
      },
    ],
  },
  {
    id: 'courts-rounds',
    done: () => false,
    canAdvance: (s) =>
      minPlayersForCourts(s.numCourts) <= groupCount(s)
        ? null
        : 'That many courts needs more players than this group has. Lower the courts a little.',
    stages: [
      {
        anchor: 'session-config',
        arrow: false,
        title: 'Courts and rounds',
        body: 'Set how many courts you have and how many rounds you want to play. Try the steppers, or leave them as they are.',
        advanceLabel: 'Next',
      },
    ],
  },
  {
    id: 'select-players',
    done: (s) => s.selectedIds.length >= minPlayersForCourts(s.numCourts),
    stages: [
      {
        anchor: 'player-selector',
        title: 'Who is playing today?',
        body: (s) =>
          `Tap players to mark them as here. You need at least ${minPlayersForCourts(
            s.numCourts
          )} for your courts. Pick more if you like.`,
      },
    ],
  },
  {
    id: 'link-couple',
    enter: (s) => ({ count: s.partnershipCount }),
    done: (s, base) => s.partnershipCount > (base.count ?? 0),
    stages: [
      {
        anchor: 'set-partners',
        title: 'Link a couple',
        body: 'Some players always play together. Tap Set Partners.',
      },
      {
        anchor: 'partner-pairing',
        title: 'Link a couple',
        body: 'Tap one player, then tap another. They stay on the same team every round.',
      },
    ],
  },
  {
    id: 'generate',
    done: (s) => s.step === 'schedule' && s.schedule !== null,
    stages: [
      {
        anchor: 'set-partners',
        when: (_s, has) => has('partner-pairing'),
        title: 'Make the schedule',
        body: 'Tap Done Pairing first.',
      },
      {
        anchor: 'generate-schedule',
        when: (_s, has) => !has('partner-pairing'),
        title: 'Make the schedule',
        body: 'Tap Generate Schedule. Everyone gets balanced games, and sit outs are shared fairly.',
      },
    ],
  },
  {
    id: 'mark-complete',
    enter: (s) => ({ count: s.completedCount }),
    done: (s, base) => s.completedCount > (base.count ?? 0),
    stages: [
      {
        anchor: 'open-round',
        title: 'Finish a round',
        body: 'When a round has been played, tap COMPLETED on it. It rolls up to the top, out of the way.',
      },
    ],
  },
  {
    id: 'swap',
    enter: (s) => ({ scheduleRef: s.schedule }),
    done: (s, base) => s.schedule !== base.scheduleRef,
    stages: [
      {
        anchor: 'open-round',
        title: 'Swap two players',
        body: 'Plans change. Tap one player, then tap another in the same round. They trade places.',
      },
    ],
  },
  {
    id: 'actions-add',
    enter: (s) => ({ count: s.selectedIds.length }),
    done: (s, base) => s.selectedIds.length > (base.count ?? 0),
    stages: [
      { anchor: 'actions-button', title: 'Someone new arrives', body: 'Tap Actions.' },
      { anchor: 'card-add-player', title: 'Someone new arrives', body: 'Tap Add a Player.' },
      { anchor: 'someone-new', title: 'Someone new arrives', body: 'Tap Someone new.' },
      {
        anchor: 'player-form',
        arrowAnchor: 'player-name-input',
        title: 'Someone new arrives',
        body: 'Fill in their name and add them. They join the group and this session.',
      },
    ],
  },
  {
    id: 'remove-player',
    enter: (s) => ({ count: s.removedCount }),
    done: (s, base) => s.removedCount > (base.count ?? 0),
    stages: [
      { anchor: 'open-round', title: 'Someone has to leave', body: 'Tap the player who is leaving.' },
      { anchor: 'edit-player', title: 'Someone has to leave', body: 'Tap the pencil.' },
      {
        anchor: 'remove-remaining',
        title: 'Someone has to leave',
        body: 'Choose Remove from Remaining Rounds.',
      },
      {
        anchor: 'remove-confirm',
        title: 'Someone has to leave',
        body: 'Confirm it. Finished rounds stay as they were.',
      },
    ],
  },
  {
    id: 'reshuffle',
    enter: (s) => ({ scheduleRef: s.schedule }),
    done: (s, base) => s.schedule !== base.scheduleRef,
    stages: [
      {
        anchor: 'actions-button',
        title: 'Reshuffle',
        body: 'Someone joined and someone left. Tap Actions.',
      },
      { anchor: 'card-reshuffle', title: 'Reshuffle', body: 'Tap Reshuffle.' },
      {
        anchor: 'rebuild-rounds',
        title: 'Reshuffle',
        body: 'Tap Rebuild. A reshuffle weaves your new player into every remaining round. Sit outs stay fair, games stay balanced, and everyone gets a turn with everyone else.',
      },
    ],
  },
  {
    id: 'complete-card',
    done: () => false,
    stages: [
      {
        anchor: null,
        title: 'You did it',
        body: 'That is the whole loop. There is more when you want it: keeping score, special game types, and an account that keeps your groups safe. It is all in Instructions.',
        advanceLabel: 'Next',
      },
    ],
  },
  {
    id: 'guided-ending',
    done: () => false,
    stages: [
      {
        anchor: 'actions-button',
        when: (s) => s.schedule !== null,
        title: 'One last thing',
        body: 'Tap Actions.',
      },
      {
        anchor: 'card-new-session',
        when: (s) => s.schedule !== null,
        title: 'One last thing',
        body: 'Tap Start New Session. The schedule clears. Your group and your couples stay.',
      },
      {
        anchor: 'confirm-new-session',
        when: (s) => s.schedule !== null,
        title: 'One last thing',
        body: 'Tap Yes, Start New.',
      },
      {
        anchor: 'manage-groups',
        when: (s) => s.schedule === null,
        title: 'Make it yours',
        body: 'Your real groups will live here. Tap Manage.',
      },
      {
        anchor: 'new-group-name',
        when: (s) => s.schedule === null,
        title: 'Make it yours',
        body: 'When you are ready, type a name here to make your own group. That is the tour. Have a great session.',
        advanceLabel: 'Finish',
      },
    ],
  },
];

// ------------------------------------------------------------- the machine --

interface Run {
  mode: 'first-run' | 'rerun';
  stepIndex: number;
  baseline: Baseline;
  /** Which stage the view last showed, so a stage change resets what follows. */
  stageKey: string;
  /** True once the name field has been typed in; puts the arrow down. */
  typingStarted: boolean;
  /** True once Next was refused, so the message shows until the cause is gone. */
  showBlocked: boolean;
}

let run: Run | null = null;
let view: TutorialView | null = null;
const listeners = new Set<() => void>();
let unsubs: (() => void)[] = [];
let observer: MutationObserver | null = null;

function emit() {
  for (const l of listeners) l();
}

export function subscribeTutorial(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Null while no tutorial is running. Stable by reference between changes. */
export function getTutorialView(): TutorialView | null {
  return view;
}

function deriveStage(step: TutorialStep, s: Snap): TutorialStage {
  let chosen = step.stages[0];
  for (const stage of step.stages) {
    if (stage.when && !stage.when(s, hasAnchor)) continue;
    if (stage.anchor === null || hasAnchor(stage.anchor)) chosen = stage;
  }
  return chosen;
}

/** Recomputes the view from the current state and DOM; tells React on change. */
function refresh() {
  if (!run) return;
  const s = snap();
  const step = STEPS[run.stepIndex];
  const stage = deriveStage(step, s);

  const stageKey = `${run.stepIndex}:${step.stages.indexOf(stage)}`;
  if (stageKey !== run.stageKey) {
    run.stageKey = stageKey;
    run.typingStarted = false;
    run.showBlocked = false;
  }

  const error = run.showBlocked ? (step.canAdvance?.(s) ?? null) : null;
  const arrowTarget =
    stage.arrow === false || stage.anchor === null ? null : (stage.arrowAnchor ?? stage.anchor);
  const next: TutorialView = {
    stepNumber: run.stepIndex + 1,
    stepCount: STEPS.length,
    title: stage.title,
    body: typeof stage.body === 'function' ? stage.body(s) : stage.body,
    anchor: stage.anchor,
    arrow: run.typingStarted && arrowTarget === 'player-name-input' ? null : arrowTarget,
    advanceLabel: stage.advanceLabel ?? null,
    error,
  };

  const same =
    view !== null &&
    view.stepNumber === next.stepNumber &&
    view.title === next.title &&
    view.body === next.body &&
    view.anchor === next.anchor &&
    view.arrow === next.arrow &&
    view.advanceLabel === next.advanceLabel &&
    view.error === next.error;
  if (!same) {
    view = next;
    emit();
  }
}

function enterStep(s: Snap) {
  if (!run) return;
  run.baseline = STEPS[run.stepIndex].enter?.(s) ?? {};
}

/** Advances past every step whose work has been done, then redraws. */
function evaluate() {
  if (!run) return;
  const s = snap();
  while (run.stepIndex < STEPS.length && STEPS[run.stepIndex].done(s, run.baseline)) {
    run.stepIndex += 1;
    if (run.stepIndex < STEPS.length) enterStep(s);
  }
  if (run.stepIndex >= STEPS.length) {
    finishTutorial();
    return;
  }
  refresh();
}

function attach() {
  const watched = [
    stores.players,
    stores.selectedIds,
    stores.partnerships,
    stores.schedule,
    stores.completedRounds,
    stores.removedIds,
    stores.step,
    stores.numCourts,
    stores.activeRosterId,
  ];
  unsubs = watched.map((store) => store.subscribe(evaluate));
  // Dialogs opening and closing move the spotlight without any store changing.
  observer = new MutationObserver(() => refresh());
  observer.observe(document.body, { childList: true, subtree: true });
}

function teardown() {
  for (const off of unsubs) off();
  unsubs = [];
  observer?.disconnect();
  observer = null;
  run = null;
}

// ------------------------------------------------------------ the lifecycle --

/**
 * Starts the tour. In the untoured example group it plays in place and leaves
 * its results behind — that group exists to be experimented on. Anywhere else
 * (a rerun, an updated install, an example group missing its players) it
 * builds a temporary group and cleans it away at the end, because the same
 * twenty-four people have to be there for the steps to work.
 */
export function startTutorial() {
  if (run) return;

  const meta = stores.exampleMeta.get();
  const have = new Set(stores.players.get().map((p) => p.id));
  const firstRun =
    meta !== null &&
    meta.rosterId === stores.activeRosterId.get() &&
    meta.playerIds.every((id) => have.has(id)) &&
    !stores.tutorialCompleted.get();

  if (firstRun) {
    stores.tutorialState.set({ mode: 'first-run' });
    // A clean walk: whatever experimenting happened in the example group, the
    // tour starts from an empty session. Sample data is all this can clear.
    clearSession();
    stores.step.set('roster');
  } else {
    beginRerun();
  }

  run = {
    mode: firstRun ? 'first-run' : 'rerun',
    stepIndex: 0,
    baseline: {},
    stageKey: '',
    typingStarted: false,
    showBlocked: false,
  };
  enterStep(snap());
  attach();
  refresh();
}

function beginRerun() {
  const prevRosterId = stores.activeRosterId.get();
  const tempRosterId = generateId();
  stores.rosters.set((prev) => [...prev, { id: tempRosterId, name: TUTORIAL_GROUP_NAME }]);
  // Built directly, never through the import path: import matches players by
  // name, and a host's real Sarah M. must not be pulled into a group that gets
  // deleted when the tour ends.
  const built = buildExamplePlayers(tempRosterId, generateId);
  stores.players.set((prev) => [...prev, ...built]);
  // Written down before the switch, so a crash between the two still leaves
  // enough to clean up by.
  stores.tutorialState.set({
    mode: 'rerun',
    rerun: { tempRosterId, tempPlayerIds: built.map((p) => p.id), prevRosterId },
  });
  switchToGroup(tempRosterId);
}

/**
 * Puts a rerun's world back: the host's group, their parked session, and not a
 * trace of the temporary one. Safe to call twice — the second finds nothing.
 */
function endRerun() {
  const state = stores.tutorialState.get();
  if (state?.mode !== 'rerun' || !state.rerun) return;
  const { tempRosterId, prevRosterId } = state.rerun;

  // Switch back first, so the live slot never describes a group being deleted.
  if (stores.activeRosterId.get() === tempRosterId) {
    const target = stores.rosters.get().some((r) => r.id === prevRosterId)
      ? prevRosterId
      : stores.rosters.get().find((r) => r.id !== tempRosterId)?.id;
    if (target) switchToGroup(target);
  }
  forget(tempRosterId);

  // Membership decides who goes, not the seeded id list: a player added during
  // the tour belongs only to the temporary group and must go with it.
  stores.players.set((prev) =>
    prev
      .filter((p) => !(p.rosterIds.length > 0 && p.rosterIds.every((id) => id === tempRosterId)))
      .map((p) =>
        p.rosterIds.includes(tempRosterId)
          ? { ...p, rosterIds: p.rosterIds.filter((id) => id !== tempRosterId) }
          : p
      )
  );
  stores.rosters.set((prev) => prev.filter((r) => r.id !== tempRosterId));
  stores.tutorialState.set(null);
}

function finishTutorial() {
  const state = stores.tutorialState.get();
  teardown();
  if (state?.mode === 'rerun') endRerun();
  else stores.tutorialState.set(null);
  stores.tutorialCompleted.set(true);
  stores.tutorialSplashAt.set(Date.now());
  view = null;
  emit();
}

/**
 * The way out that is always on screen. A first run stops onto the Players
 * tab, scrolled to the top; a rerun stops back into the group and session the
 * host was in, on whichever tab they left it — forcing Players there would
 * strand a real schedule, since its tab is never a door.
 */
export function stopTutorial() {
  if (!run) return;
  const state = stores.tutorialState.get();
  teardown();
  if (state?.mode === 'rerun') {
    endRerun();
  } else {
    stores.tutorialState.set(null);
    stores.step.set('roster');
  }
  window.scrollTo(0, 0);
  stores.tutorialSplashAt.set(Date.now());
  view = null;
  emit();
}

/** The Next/Finish button on the steps that have one. */
export function advanceTutorial() {
  if (!run) return;
  const s = snap();
  const step = STEPS[run.stepIndex];
  const stage = deriveStage(step, s);
  if (!stage.advanceLabel) return;
  if (step.canAdvance?.(s)) {
    run.showBlocked = true;
    refresh();
    return;
  }
  if (run.stepIndex === STEPS.length - 1) {
    finishTutorial();
    return;
  }
  run.stepIndex += 1;
  enterStep(s);
  refresh();
}

/** The overlay saw typing in the name field; the arrow has done its job. */
export function noteTutorialTyping() {
  if (!run || run.typingStarted) return;
  run.typingStarted = true;
  // Deferred to a task, and a microtask is not enough: this runs mid-keystroke
  // from a capture listener, and browsers drain microtasks between the
  // listeners of one event. An emit before React's own listener re-renders the
  // controlled input back to its old value, and React then reads the old value
  // out of it — eating what was typed. A task runs after the whole dispatch.
  setTimeout(refresh, 0);
}

/**
 * Called once at every launch, before first paint. A tutorial recorded as
 * underway with no engine running is one a reload or crash walked out on: a
 * rerun's temporary group is cleaned away, a first run is simply closed.
 */
export function sweepAbandonedTutorial() {
  if (run) return;
  const state = stores.tutorialState.get();
  if (!state) return;
  if (state.mode === 'rerun') endRerun();
  else stores.tutorialState.set(null);
  stores.tutorialSplashAt.set(Date.now());
}

/** Test-only: a real reload empties module state; tests have to ask. */
export const __tutorialTesting = {
  reset() {
    teardown();
    view = null;
  },
};
