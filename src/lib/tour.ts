import type { Player } from '../types';
import { EXAMPLE_ROSTER } from './exampleGroup';
import type { Step } from './steps';
import type { Side } from './tourGeometry';
import * as stores from './stores';
import type { TourStage } from './stores';

/**
 * The first-run tour: what it says, where it points, and how far along it is.
 *
 * Eight cards in a list, and on every one of them the control being talked
 * about still works. An earlier cut spotlit things and shielded them, handed
 * the app over once in the middle, and went dormant until the host reached the
 * Schedule tab on their own. Two things were wrong with that. Reading about a
 * button teaches nobody where it is, and the dormant stretch read as the tour
 * crashing — there was nothing on screen and no way to tell that was on purpose.
 * So the deck runs straight through, and four of the eight cards move on only
 * when the host does the real thing.
 *
 * There is no DOM in here and no React. The overlay subscribes and draws; App
 * moves the tab to wherever the card lives and owns every change to app state
 * the tour makes. All the maths is in tourGeometry.ts.
 */

/** One element in a highlighted region. */
export interface AnchorSpec {
  /** Its `data-tutorial` value. */
  name: string;
  /**
   * Extra room beyond the standard padding, per side. Only the Actions button
   * needs it: its icon tiles hang above its border box, so its measurement
   * leaves their heads outside the ring.
   */
  pad?: Partial<Record<Side, number>>;
}

/** One box: the anchors inside it joined into a single rect. */
export interface Region {
  anchors: AnchorSpec[];
  /**
   * Stop the box at the foot of this anchor rather than at the foot of the
   * union. Round 1's panel carries on past Court 1, and the card is about the
   * top of it.
   */
  endAt?: string;
  /**
   * A hole in the darkness with no ring drawn round it and no padding added.
   * The live step tab wears this on every card: it should look exactly as it
   * always looks, which is neither dimmed nor pointed at.
   */
  plain?: boolean;
}

export interface BubbleSpec {
  /** The `data-tutorial` value the tail points at. Absent means centre screen. */
  at?: string;
  text: string;
  prefer?: 'above' | 'below';
  /**
   * Narrower than the standard width, when something beside the bubble has to
   * stay readable.
   */
  maxWidth?: number;
}

export type TourId =
  | 'players'
  | 'courts-rounds'
  | 'select-players'
  | 'congrats'
  | 'court-numbers'
  | 'swap'
  | 'actions'
  | 'new-round-robin';

export interface TourStep {
  id: TourId;
  /** The tab this card belongs to. Moving the card moves the app. */
  tab: Step;
  regions: Region[];
  /**
   * The `data-tutorial` names left clickable, so the host can do the real thing
   * the card is describing. Everything else on the page swallows its clicks,
   * including the rest of the box these sit inside.
   *
   * Kept beside the regions rather than on them, because the two are different
   * questions about different rects: a box is drawn round the area worth
   * looking at, and this is the control inside it worth pressing.
   */
  live?: string[];
  /** Never more than two: three pointers on a phone is a puzzle, not a lesson. */
  bubbles: BubbleSpec[];
  /**
   * No Next link. The card moves on when the host presses the real control it
   * is pointing at, and there is no other way forward.
   */
  hideNext?: boolean;
  /** No Back link. */
  noBack?: boolean;
  /** Bring this card's boxes into view first, by the smallest scroll that does. */
  scrollTo?: boolean;
}

/**
 * The live step tab, undimmed on every card.
 *
 * Prepended in build() rather than written into all eight cards. It is the one
 * piece of chrome that is true of the whole tour, and a card that forgot it
 * would look like a bug rather than like a decision.
 */
const ACTIVE_TAB: Region = { anchors: [{ name: 'active-tab' }], plain: true };

/**
 * The deck.
 *
 * Card 2 asks the host to change a number that starts on the wrong one, card 3
 * asks them to finish a selection that starts part-made, and cards 5 to 8 leave
 * the real controls alive. What they end up with at the end is a schedule they
 * built, not one they watched being built.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'players',
    tab: 'roster',
    regions: [
      { anchors: [{ name: 'group-name' }] },
      { anchors: [{ name: 'continue-setup' }] },
    ],
    // The group name still opens My Groups. There is one group on a fresh
    // install, so the only thing to do in there is close it again.
    live: ['group-name', 'continue-setup'],
    bubbles: [
      // Above, so the two bubbles sit either side of the gap between the two
      // rings instead of the first one covering the second. There is a whole
      // header's worth of room up there and nothing in it worth reading.
      // The count is read off the roster rather than typed into the sentence.
      // It is load-bearing: the next-but-one card asks them to press Select All
      // and the group is sized so that fills three courts and still sits two
      // people out, so a roster change that left this promise behind would be
      // the easiest mistake here to make.
      {
        at: 'group-name',
        text: `I’ve created a sample group for you with ${EXAMPLE_ROSTER.length} players`,
        prefer: 'above',
      },
      // Narrow on purpose. At the full width it covers the Add Players heading
      // and the rating and gender columns, which are the page this card is
      // telling them they already have.
      {
        at: 'continue-setup',
        text: 'Click here to setup your first round robin.',
        maxWidth: 232,
      },
    ],
    hideNext: true,
    noBack: true,
  },
  {
    id: 'courts-rounds',
    tab: 'setup',
    regions: [{ anchors: [{ name: 'setup-title' }, { name: 'setup-steppers' }] }],
    live: ['setup-steppers'],
    bubbles: [
      {
        at: 'setup-steppers',
        text: 'You’ve booked 3 courts so set “Number of Courts” to 3 and click “Next”',
      },
    ],
  },
  {
    id: 'select-players',
    tab: 'setup',
    regions: [{ anchors: [{ name: 'select-players' }, { name: 'generate-schedule' }] }],
    live: ['select-players', 'generate-schedule'],
    bubbles: [
      // Above, and not negotiable. Generate Schedule sits directly under this
      // panel, so a bubble placed below the anchor lands on the one button the
      // card is telling them to press.
      {
        at: 'select-players',
        text: 'Select all the players and then click Generate Schedule.',
        prefer: 'above',
      },
    ],
    hideNext: true,
    scrollTo: true,
  },
  {
    id: 'congrats',
    tab: 'schedule',
    regions: [{ anchors: [{ name: 'round-1' }, { name: 'court-1' }], endAt: 'court-1' }],
    bubbles: [
      {
        at: 'round-1',
        text: 'Congrats, you’ve just created your first round robin! Click “Next” and I’ll show you a few more things',
        prefer: 'above',
      },
    ],
    // Back would mean returning to a Setup tab that has already been left
    // behind, and to a state before the schedule they are being congratulated
    // on existed.
    noBack: true,
    scrollTo: true,
  },
  {
    id: 'court-numbers',
    tab: 'schedule',
    regions: [{ anchors: [{ name: 'round-1' }, { name: 'court-1' }], endAt: 'court-1' }],
    live: ['court-1-label'],
    bubbles: [{ at: 'court-1-label', text: 'Change court numbers here.' }],
    scrollTo: true,
  },
  {
    id: 'swap',
    tab: 'schedule',
    regions: [{ anchors: [{ name: 'court-1' }, { name: 'court-2' }] }],
    live: ['court-1', 'court-2'],
    bubbles: [
      {
        at: 'court-1',
        text: 'Select one player and then another to swap them.',
        prefer: 'above',
      },
    ],
    scrollTo: true,
  },
  {
    id: 'actions',
    tab: 'schedule',
    regions: [{ anchors: [{ name: 'actions-button', pad: { top: 24, left: 8, right: 8 } }] }],
    live: ['actions-button'],
    bubbles: [
      {
        at: 'actions-button',
        text: 'Now, create a new round robin by clicking “Actions” and then “New Round Robin”',
      },
    ],
    hideNext: true,
    scrollTo: true,
  },
  {
    id: 'new-round-robin',
    tab: 'schedule',
    regions: [{ anchors: [{ name: 'new-round-robin' }] }],
    live: ['new-round-robin'],
    bubbles: [{ at: 'new-round-robin', text: 'Now click “New Round Robin”.' }],
    hideNext: true,
  },
];

/** Where the tour asks the host to imagine they have booked. */
export const TOUR_COURTS_TARGET = 3;
/**
 * And where it starts them, so there is something to change.
 *
 * Below the target rather than above it: a host who overshoots and lands on 4
 * still has a schedule that builds, where a host asked to come down from 4 with
 * only ten players ticked would meet the minimum-players error instead.
 */
export const TOUR_COURTS_START = 2;

/**
 * Who is ticked when the tour opens: everybody but four.
 *
 * The card asks them to press Select All, so some of the group has to be
 * missing or there is nothing for that button to do. Four rather than one
 * because one reads as an accident, and spread through the list rather than
 * bunched at the end so it looks like people who could not make it.
 *
 * Sorted the way PlayerSelector sorts, which is the order they will be looking
 * at. Sorting any other way here would put the gaps somewhere else on screen.
 */
export function tourStartSelection(players: Player[]): string[] {
  const missing = new Set([2, 5, 8, 9]);
  return [...players]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((_, i) => !missing.has(i))
    .map((p) => p.id);
}

/** No Back on a card that says so, and none on the first. */
function canBack(i: number): boolean {
  return i > 0 && !TOUR_STEPS[i].noBack;
}

export interface TourView extends TourStep {
  index: number;
  count: number;
  canBack: boolean;
  /**
   * True while this card is still being scrolled into place. App leaves the
   * page unlocked for that one frame, because a body pinned with position:fixed
   * cannot be scrolled at all.
   */
  scrolling: boolean;
}

/**
 * What is on screen. Four states rather than a card and two booleans, because
 * only ever one of them can be showing and a type that says so cannot be got
 * wrong.
 */
export type TourPhase = 'off' | 'opener' | 'card' | 'complete';

export interface TourSnapshot {
  phase: TourPhase;
  card: TourView | null;
}

// --------------------------------------------------------------- the state --

const listeners = new Set<() => void>();
let phase: TourPhase = 'off';
let index = -1;
let scrolling = false;

/**
 * The snapshot handed to useSyncExternalStore, rebuilt only when something
 * changes. It must be the same object between changes: returning a fresh one
 * per call makes React re-render forever.
 */
let view: TourSnapshot = { phase: 'off', card: null };

function build() {
  const step = phase === 'card' && index >= 0 ? TOUR_STEPS[index] : undefined;
  view = {
    phase,
    card: step
      ? {
          ...step,
          regions: [ACTIVE_TAB, ...step.regions],
          index,
          count: TOUR_STEPS.length,
          canBack: canBack(index),
          scrolling,
        }
      : null,
  };
}

function emit() {
  for (const listener of [...listeners]) listener();
}

function show(next: TourPhase, card = -1) {
  phase = next;
  index = card;
  scrolling = card >= 0 && !!TOUR_STEPS[card]?.scrollTo;
  build();
  emit();
}

export function subscribeTour(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTourView(): TourSnapshot {
  return view;
}

/** The overlay, once it has done this card's scrolling. */
export function noteScrolled() {
  if (!scrolling) return;
  scrolling = false;
  build();
  emit();
}

// ------------------------------------------------------------ the lifecycle --

/**
 * The greeting, a couple of seconds after a fresh install has opened.
 *
 * Late rather than first, which is the whole reason it is a sheet and not a
 * splash screen. A full screen shown before the app has drawn asks somebody to
 * agree to a tour of something they have never seen. Two seconds of the Players
 * tab is long enough to work out that this is an app about players.
 */
export const OPENER_DELAY_MS = 2000;

export function armOpener() {
  if (phase !== 'off') return;
  show('opener');
}

/** Continue on the opening sheet. */
export function startTour() {
  stores.tourStage.set('running');
  show('card', 0);
}

/** New Round Robin on the last card. */
export function completeTour() {
  stores.tourStage.set('done');
  // Card 6 has just taught this, at more length than the hint ever did.
  stores.swapHintDismissed.set(true);
  show('complete');
}

/** Done on the closing sheet. */
export function dismissComplete() {
  show('off');
}

export function nextCard() {
  if (phase !== 'card' || index < 0) return;
  if (index + 1 < TOUR_STEPS.length) show('card', index + 1);
}

export function backCard() {
  if (phase === 'card' && canBack(index)) show('card', index - 1);
}

export function skipTour() {
  stores.tourStage.set('done');
  show('off');
}

/**
 * Where a relaunch picks the tour up.
 *
 * The card number is deliberately not persisted — only the stage is, and the
 * card is worked back out from the stage and whichever tab the app reopened on.
 * That is why an interrupted tour comes back on the card whose anchors are
 * actually on screen rather than wherever it had counted to: resuming into a
 * card that points at nothing is worse than losing a card.
 *
 * A stage this build does not recognise is one of the old two-act values, left
 * on a device that ran the earlier tour. Treated as finished.
 */
export function resumeTour(stage: TourStage, tab: Step) {
  if (stage !== 'running') {
    show('off');
    return;
  }
  const at = TOUR_STEPS.findIndex((s) => s.tab === tab);
  show(at >= 0 ? 'card' : 'off', at);
}

export const __tourTesting = {
  reset() {
    phase = 'off';
    index = -1;
    scrolling = false;
    view = { phase: 'off', card: null };
    listeners.clear();
  },
};
