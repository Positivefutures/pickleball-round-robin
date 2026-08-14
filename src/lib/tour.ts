import type { Step } from './steps';
import type { Side } from './tourGeometry';
import * as stores from './stores';
import type { TourStage } from './stores';

/**
 * The first-run tour: what it says, where it points, and how far along it is.
 *
 * Eight cards in a list. The old tour, which was taken back out, made the host
 * perform every step themselves and worked out which card to show by watching
 * the stores for the result — clever, and it meant a host who tapped the wrong
 * thing could get stranded on a card that would not move. This one is a slide
 * deck with two holes in it: Back and Next go one card either way, and twice the
 * host is handed the real controls and asked to do the real thing.
 *
 * There is no DOM in here and no React. The overlay subscribes and draws; App
 * moves the tab to wherever the card lives. All the maths is in tourGeometry.ts.
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

/** One orange box: the anchors inside it joined into a single rect. */
export interface Region {
  anchors: AnchorSpec[];
  /**
   * Stop the box at the foot of this anchor rather than at the foot of the
   * union. Round 1's panel carries on past Court 1, and the card is about the
   * top of it.
   */
  endAt?: string;
}

export interface BubbleSpec {
  /** The `data-tutorial` value the tail points at. Absent means centre screen. */
  at?: string;
  text: string;
  prefer?: 'above' | 'below';
}

export interface TourStep {
  id: string;
  act: 1 | 2;
  /** The tab this card belongs to. Moving the card moves the app. */
  tab: Step;
  /** A line across the top of the screen, above everything. */
  banner?: string;
  regions: Region[];
  /** Never more than two: three pointers on a phone is a puzzle, not a lesson. */
  bubbles: BubbleSpec[];
  /**
   * The one app control left clickable, by `data-tutorial` value. Everything
   * else on the page swallows its clicks, including the rest of this control's
   * own box. Tapping it does what Next does.
   */
  live?: string;
  /** Default 'Next'. */
  nextLabel?: string;
  /** Bring this card's boxes into view first, by the smallest scroll that does. */
  scrollTo?: boolean;
}

/**
 * The deck.
 *
 * Act 1 runs straight off the splash and ends by handing the app over: the host
 * picks the players and generates the schedule themselves, because that is the
 * thing they came to do and watching it happen teaches nobody anything. Act 2
 * wakes up when they land on the Schedule tab with a schedule they made, and
 * shows the three things there that cannot be guessed at.
 *
 * The copy says three courts and eight rounds because that is what a fresh
 * install opens on — see DEFAULT_COURTS. The tour sets nothing itself.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'players',
    act: 1,
    tab: 'roster',
    regions: [{ anchors: [{ name: 'group-name' }] }, { anchors: [{ name: 'continue-setup' }] }],
    bubbles: [
      // Above, so the two bubbles sit either side of the gap between the two
      // rings instead of the first one covering the second. There is a whole
      // header's worth of room up there and nothing in it worth reading.
      { at: 'group-name', text: 'Here is your sample group!', prefer: 'above' },
      { at: 'continue-setup', text: 'Click here to setup your first round robin.' },
    ],
    live: 'continue-setup',
  },
  {
    id: 'courts-rounds',
    act: 1,
    tab: 'setup',
    regions: [{ anchors: [{ name: 'setup-title' }, { name: 'setup-steppers' }] }],
    bubbles: [
      {
        at: 'setup-steppers',
        text: 'Imagine you’ve booked 3 courts and are going to do 8 rounds of play.',
      },
    ],
  },
  {
    id: 'select-players',
    act: 1,
    tab: 'setup',
    regions: [{ anchors: [{ name: 'select-players' }] }],
    bubbles: [
      { at: 'select-players', text: 'Select all the players and then click Generate Schedule.' },
    ],
    nextLabel: 'OK',
    scrollTo: true,
  },
  {
    id: 'completed',
    act: 2,
    tab: 'schedule',
    banner: 'Congratulations on making your first round robin!',
    regions: [{ anchors: [{ name: 'round-1' }, { name: 'court-1' }], endAt: 'court-1' }],
    bubbles: [{ at: 'round-1-completed', text: 'Mark rounds as COMPLETED to collapse them.' }],
    scrollTo: true,
  },
  {
    id: 'court-numbers',
    act: 2,
    tab: 'schedule',
    regions: [{ anchors: [{ name: 'round-1' }, { name: 'court-1' }], endAt: 'court-1' }],
    bubbles: [{ at: 'court-1-label', text: 'Change court numbers here.' }],
    scrollTo: true,
  },
  {
    id: 'swap',
    act: 2,
    tab: 'schedule',
    regions: [{ anchors: [{ name: 'court-1' }, { name: 'court-2' }] }],
    bubbles: [{ at: 'court-1', text: 'Select one player and then another to swap them.' }],
    scrollTo: true,
  },
  {
    id: 'actions',
    act: 2,
    tab: 'schedule',
    regions: [{ anchors: [{ name: 'actions-button', pad: { top: 24, left: 8, right: 8 } }] }],
    bubbles: [
      {
        at: 'actions-button',
        text: 'To start a new session, click Actions and then Start New Session.',
      },
    ],
    scrollTo: true,
  },
  {
    id: 'finish',
    act: 2,
    tab: 'schedule',
    regions: [],
    bubbles: [{ text: 'You’re all set! We hope you enjoy using the app.' }],
    nextLabel: 'Done',
  },
];

/** Where Act 2 starts, worked out rather than written down twice. */
export const ACT2_FIRST = TOUR_STEPS.findIndex((s) => s.act === 2);

/**
 * The seat the swap card draws as already tapped, so the words have something
 * to describe. Court 1, first team, first place: the scheduler fills the short
 * court last, so the first court of the first round always has four people on
 * it whatever the roster.
 */
export const TOUR_PREVIEW_SLOT = {
  kind: 'court',
  roundIdx: 0,
  courtIdx: 0,
  team: 'team1',
  playerIdx: 0,
} as const;

/**
 * No Back on the first card of an act.
 *
 * Act 1's first card has the splash behind it, which is not somewhere to go
 * back to. Act 2's has a schedule the host made in between, and there is no
 * walking back to a state before it existed. Everywhere else Back is honest, so
 * the button is absent rather than disabled — a greyed one invites a tap that
 * does nothing and reads as broken.
 */
function canBack(i: number): boolean {
  return i > 0 && TOUR_STEPS[i - 1].act === TOUR_STEPS[i].act;
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

// --------------------------------------------------------------- the state --

const listeners = new Set<() => void>();
let index = -1;
let scrolling = false;

/**
 * The snapshot handed to useSyncExternalStore, rebuilt only when something
 * changes. It must be the same object between changes: returning a fresh one
 * per call makes React re-render forever.
 */
let view: TourView | null = null;

function build() {
  const step = index < 0 ? undefined : TOUR_STEPS[index];
  view = step
    ? { ...step, index, count: TOUR_STEPS.length, canBack: canBack(index), scrolling }
    : null;
}

function emit() {
  for (const listener of [...listeners]) listener();
}

function go(next: number) {
  index = next;
  scrolling = next >= 0 && !!TOUR_STEPS[next]?.scrollTo;
  build();
  emit();
}

export function subscribeTour(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTourView(): TourView | null {
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

/** Continue on the splash. */
export function startAct1() {
  stores.tourStage.set('act1');
  go(0);
}

/** Landing on the Schedule tab with a schedule the host made. */
export function startAct2() {
  stores.tourStage.set('act2');
  go(ACT2_FIRST);
}

function finish() {
  stores.tourStage.set('done');
  // Card 2.3 has just taught this, at more length than the hint ever did.
  stores.swapHintDismissed.set(true);
  go(-1);
}

export function nextCard() {
  if (index < 0) return;
  const step = TOUR_STEPS[index];
  const following = TOUR_STEPS[index + 1];

  // The end of Act 1: the tour goes quiet and the host takes over. It wakes
  // again when they reach a schedule of their own.
  if (following && following.act !== step.act) {
    stores.tourStage.set('await-schedule');
    go(-1);
    return;
  }
  if (!following) {
    finish();
    return;
  }
  go(index + 1);
}

export function backCard() {
  if (canBack(index)) go(index - 1);
}

export function skipTour() {
  stores.tourStage.set('done');
  go(-1);
}

/**
 * Where a relaunch picks the tour up.
 *
 * The card number is deliberately not persisted — only the stage is, and the
 * card is worked back out from the stage and whichever tab the app reopened on.
 * That is why an interrupted Act 1 comes back on the card whose anchors are
 * actually on screen rather than wherever it had counted to: resuming into a
 * card that points at nothing is worse than losing a card.
 *
 * Act 2 always restarts at its first card, which is four short ones.
 */
export function resumeTour(stage: TourStage, tab: Step) {
  if (stage === 'act1') {
    go(tab === 'roster' ? 0 : tab === 'setup' ? 1 : -1);
    return;
  }
  if (stage === 'act2' && tab === 'schedule') {
    go(ACT2_FIRST);
    return;
  }
  go(-1);
}

export const __tourTesting = {
  reset() {
    index = -1;
    scrolling = false;
    view = null;
    listeners.clear();
  },
};
