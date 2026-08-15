import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Gender, Player, Round, Schedule } from '../../types';
import { effectiveCourtCount } from '../../lib/pairing';
import { isScored } from '../../lib/standings';
import { useScrollLock } from '../../hooks/useScrollLock';
import { PlayerForm } from '../roster/PlayerForm';
import {
  AddPlayerSolidIcon,
  AddRowIcon,
  ChevronLeftIcon,
  CloseIcon,
  GuestIcon,
  LinkIcon,
  EditPageIcon,
  LockIcon,
  ShareIcon,
  ShuffleIcon,
  SitIcon,
  SuccessIcon,
  SwapPeopleIcon,
  WarningIcon,
} from '../icons';
import { AddCourtIcon, RemoveCourtIcon } from './actionIcons';
import { LiveShareView } from './LiveShareView';
import { ACCOUNTS_ENABLED } from '../../lib/appInfo';
import { isSupabaseConfigured } from '../../lib/supabase';

/** Everything the sheet can set in motion. Implemented in App. */
export interface ScheduleActions {
  onReshuffle: () => void;
  onStartNewSession: () => void;
  /** A group member not in this session yet. */
  onAddPlayer: (playerId: string) => void;
  /**
   * Somebody new: joins the group and this session.
   *
   * `replacingId` is Sub a Player reaching the same form. The new player takes
   * that person's place rather than being added on top, which is the difference
   * between subbing somebody on and putting a fifth on the court.
   */
  onCreatePlayer: (
    name: string, rating: number, gender: Gender, replacingId?: string
  ) => void;
  /** Somebody new for today only, never saved to the group. */
  onAddGuest: (name: string, rating: number, gender: Gender) => void;
  onSubstitute: (outgoingId: string, incomingId: string) => void;
  onAddCourt: () => void;
  onRemoveCourt: (courtNumber: number) => void;
  onAddRounds: (count: number) => void;
}

type View =
  | 'menu'
  | 'add-player'
  | 'new-player'
  | 'add-sub'
  | 'add-guest'
  | 'reshuffle'
  | 'new-session'
  | 'add-round'
  | 'add-court'
  | 'remove-court'
  | 'share-live'
  | 'done';

/**
 * Where the sheet opens. The sit-out row's own button opens Add a Player, and
 * coming back from My Account opens the card that sent you there.
 */
export type ActionsEntry = Extract<View, 'menu' | 'add-player' | 'share-live'>;

// The two primaries, taken from the palette rather than sampled, plus the red
// the one destructive card has always used. Written as var() so index.css stays
// the only place the brand hexes are spelled out.
const TEAL = 'var(--color-brand-teal)';
const ORANGE = 'var(--color-brand-orange)';
const RED = '#CB2221';
const WHITE = '#FFFFFF';

const NAVY_TEXT = '#051829';
const QUIET_TEXT = '#636A77';

interface Card {
  view: Exclude<View, 'menu' | 'done' | 'new-player'>;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
  /** The glyph's colour, or the button's fill when `filled`. */
  color: string;
  /** A solid button with a white glyph and label. Reshuffle alone. */
  filled?: boolean;
}

const CARDS: Card[] = [
  { view: 'add-player', label: 'Add a Player', Icon: AddPlayerSolidIcon, color: TEAL },
  { view: 'add-sub', label: 'Sub a Player', Icon: SwapPeopleIcon, color: TEAL },
  { view: 'add-guest', label: 'Add a Guest', Icon: GuestIcon, color: TEAL },
  // No Edit Player Rating card. Tapping somebody on the schedule and pressing
  // the pencil edits their name, rating and gender in one panel, which is both
  // fewer taps and the place a host is already looking when they notice.
  { view: 'new-session', label: 'New Round Robin', Icon: EditPageIcon, color: ORANGE },
  { view: 'reshuffle', label: 'Reshuffle', Icon: ShuffleIcon, color: TEAL, filled: true },
  // "Share Session" on the card and "Share Live Session" on the panel it opens.
  // Three words is what fits a third of a phone without wrapping to three lines;
  // the panel has the room to say the whole thing.
  { view: 'share-live', label: 'Share Session', Icon: ShareIcon, color: ORANGE },
  { view: 'add-round', label: 'Add a Round', Icon: AddRowIcon, color: TEAL },
  { view: 'add-court', label: 'Add a Court', Icon: AddCourtIcon, color: TEAL },
  { view: 'remove-court', label: 'Remove a Court', Icon: RemoveCourtIcon, color: RED },
];

/**
 * The glyph at the top of an action's own panel.
 *
 * Read off the cards rather than listed again, so the shape you tapped is the
 * shape you land on and the two cannot drift apart. Reshuffle's card is a solid
 * teal button with a white glyph; on the panel there is nothing to fill, so it
 * takes its colour like the rest.
 */
const PANEL_GLYPHS = new Map(CARDS.map((c) => [c.view as View, c]));
// Reached from Add a Player rather than from the grid, so it has no card of its
// own, but it is the same job and wants the same glyph.
PANEL_GLYPHS.set('new-player', {
  view: 'add-player',
  label: 'New Player',
  Icon: AddPlayerSolidIcon,
  color: TEAL,
});

/**
 * Whether an account could be made at all, which is not the same as having one.
 * False only in a build with no Supabase env vars.
 */
const accountsPossible = () => ACCOUNTS_ENABLED && isSupabaseConfigured();

const HEADINGS: Record<View, { title: string; sub?: string }> = {
  menu: { title: 'Actions', sub: 'Quick changes for this session' },
  'add-player': { title: 'Add a Player', sub: 'Who is joining?' },
  'new-player': { title: 'New Player', sub: 'Joins the group and this session' },
  'add-sub': { title: 'Sub a Player' },
  'add-guest': { title: 'Add a Guest', sub: 'Plays today only, never saved to the group' },
  // No sub here. Reshuffle's counts what it is about to rebuild, so it is put
  // together at render time and set larger than the rest: on this panel the line
  // under the title is the question being asked, not a caption on it.
  reshuffle: { title: 'Reshuffle' },
  'new-session': { title: 'New Round Robin?' },
  'add-round': { title: 'Add a Round', sub: 'Planned around the games already scheduled' },
  'add-court': { title: 'Add a Court' },
  'remove-court': { title: 'Remove a Court', sub: 'Which court is going?' },
  'share-live': {
    title: 'Share Live Session',
    sub: 'Let others see the schedule, with live updates, on their phone.',
  },
  done: { title: '' },
};

const SHEET_FRACTION = 0.92;
const SLIDE_MS = 300;
const DONE_MS = 1600;
const DRAG_TO_CLOSE = 80;

const PRIMARY =
  'w-full px-4 py-2.5 bg-brand-teal text-white rounded-md hover:bg-brand-teal-dark transition-colors font-medium disabled:opacity-40 disabled:hover:bg-brand-teal';
/** The same button in the lead colour. Reshuffle's Rebuild, which is the one
 *  action on this sheet that both destroys something and is meant to be taken. */
const PRIMARY_ORANGE =
  'w-full px-4 py-2.5 bg-brand-orange text-white rounded-md hover:bg-brand-orange-dark transition-colors font-medium';
const SECONDARY =
  'w-full px-4 py-2.5 border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium';
const DESTRUCTIVE =
  'w-full px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium';
const ROW =
  'flex w-full items-center gap-3 rounded-lg border border-[#D8DEE4] bg-white px-4 py-3 text-left transition-colors hover:bg-[#F1F3F6]';
/**
 * Somebody who is not in the group yet, offered at the foot of a list of people
 * who are. In the lead colour throughout — border, glyph and label — on the pale
 * orange that goes with it, because it is the one row that is not a name and the
 * only way out of a list that does not contain who you are looking for.
 */
const NEW_ROW =
  'flex w-full items-center gap-3 rounded-lg border border-brand-orange bg-brand-orange-light px-4 py-3 text-left font-bold text-brand-orange transition-colors hover:bg-[#ffe6d6]';

/**
 * A view that asks one question and offers one answer. It says its piece at the
 * top and puts the button at the foot, because an action sheet opened to nearly
 * full height with three lines in the middle of it reads as something that has
 * failed to load.
 */
const CONFIRM = 'flex h-full flex-col gap-6';
const CONFIRM_FOOT = 'mt-auto space-y-3 pt-6';

function names(round: Round | undefined, courtNumber: number): Player[] {
  const court = round?.courts.find((c) => c.courtNumber === courtNumber);
  return court ? [...court.team1, ...court.team2] : [];
}

/** "6 rounds" / "1 round" — completion is an arbitrary set, so never a range. */
function roundWord(n: number) {
  return n === 1 ? '1 round' : `${n} rounds`;
}

/**
 * The same count for a heading or a button, where the noun is capitalised and
 * something may sit in front of it: "3 Remaining Rounds", "1 Round".
 *
 * roundWord's twin rather than a second way of counting, because Reshuffle asks
 * the question and labels the button with the same number and the two saying
 * different things is the one mistake nobody would forgive.
 */
function roundCount(n: number, adjective = '') {
  return `${n} ${adjective}${n === 1 ? 'Round' : 'Rounds'}`;
}

/**
 * What a rebuild leaves alone, said before the warning about what it does not.
 *
 * Locked pairs and linked partners are two different promises: a lock is made on
 * the schedule for this afternoon, a partnership is set up beforehand and holds
 * every session. Both survive a reshuffle, and a host who has done one of them
 * should not have to guess whether it was the one that counts.
 */
const RESHUFFLE_KEEPS: { Icon: (props: { className?: string }) => React.ReactElement; text: string }[] =
  [
    { Icon: SitIcon, text: 'Sit outs are still fairly calculated' },
    { Icon: LockIcon, text: 'Locked pairs stay together' },
    { Icon: LinkIcon, text: 'Linked partners stay together' },
  ];

/**
 * One size for every line of the Reshuffle panel's body, the promises and the
 * warning alike. Set here rather than at each of them because the two blocks
 * are read as one list and a warning a size adrift from the rows above it is
 * the only thing on the panel you would notice.
 */
const RESHUFFLE_LINE = 'text-[1.0625rem] leading-snug';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Which view to land on. The sit-out row's own button opens Add a Player. */
  entry?: ActionsEntry;
  schedule: Schedule;
  completedRounds: number[];
  /** Everybody in the session, guests included. */
  players: Player[];
  /** Group members not in the session yet. */
  addablePlayers: Player[];
  numCourts: number;
  defaultRating: number;
  actions: ScheduleActions;
  /**
   * Shuts the sheet and opens My Account. Offered by Share Live Session to a
   * host who has not signed in, since that is the one thing standing between
   * them and a QR code.
   */
  onOpenAccount?: () => void;
  /**
   * Whether New Round Robin stops to ask. It always does, except on the tour's
   * last card, where the question is already the thing being answered: the host
   * has been told to press it and there is nothing of theirs to lose.
   */
  confirmNewSession?: boolean;
}

export function ActionsSheet({
  open,
  onClose,
  entry = 'menu',
  schedule,
  completedRounds,
  players,
  addablePlayers,
  numCourts,
  defaultRating,
  actions,
  onOpenAccount,
  confirmNewSession = true,
}: Props) {
  const [view, setView] = useState<View>(entry);
  const [message, setMessage] = useState('');
  const [subOut, setSubOut] = useState<Player | null>(null);
  const [extraRounds, setExtraRounds] = useState(1);

  const [shown, setShown] = useState(false);
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [contentHeight, setContentHeight] = useState<number>();
  const contentRef = useRef<HTMLDivElement>(null);
  const dragFrom = useRef<number | null>(null);

  useScrollLock(open);

  const completedSet = new Set(completedRounds);
  const openRounds = schedule.rounds.filter((r) => !completedSet.has(r.roundNumber));
  const firstOpen = openRounds[0];
  const hasOpenRound = openRounds.length > 0;
  const lastRoundNumber = schedule.rounds.reduce((max, r) => Math.max(max, r.roundNumber), 0);
  /**
   * Whether a rebuild would actually cost a score.
   *
   * Only the open rounds are rebuilt, so only a score in one of those is at
   * risk. With none there is nothing to warn about, and an orange box saying so
   * anyway teaches people to read past the colour on the day it matters.
   *
   * `isScored` rather than a plain `score !== undefined`, so the same rule
   * decides this as decides the standings: an empty court carrying a score
   * describes no game, and losing it costs nobody anything.
   */
  const rebuildLosesScores = openRounds.some((round) => round.courts.some(isScored));

  // What the extra court would mean. effectiveCourtCount caps a request the
  // roster cannot fill, so this is also the warning that a reshuffle would drop
  // the new court again.
  const bench = firstOpen ? firstOpen.sitOuts.length : 0;
  const seating = Math.min(4, bench < 2 ? 0 : bench);
  const courtSticks =
    effectiveCourtCount(players.length, numCourts + 1) > effectiveCourtCount(players.length, numCourts);

  // Every timer this sheet starts, so none of them can fire into a sheet that
  // has already gone. Reopening replaces this one, and a stray onClose from the
  // old sheet would shut the new one the moment it appeared.
  const timers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const requestClose = useCallback(() => {
    setClosing(true);
    later(onClose, SLIDE_MS);
  }, [later, onClose]);

  // Slide in on the frame after mount, so the browser has a "from" to animate.
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') requestClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  // The menu and the done flash are as tall as what is in them; an action opens
  // the sheet up to near full screen.
  //
  // Both ends have to be a pixel count for the height to animate between them,
  // so the short views are measured. The wrapper is only height-constrained on
  // the tall views, which is what keeps the measurement out of a loop with the
  // height it is feeding.
  const tall = view !== 'menu' && view !== 'done';
  useLayoutEffect(() => {
    if (tall) return;
    const el = contentRef.current;
    if (el) setContentHeight(el.scrollHeight);
  }, [tall, view, message]);

  const height = tall ? Math.round(window.innerHeight * SHEET_FRACTION) : contentHeight;

  function finish(text: string) {
    setMessage(text);
    setView('done');
    later(requestClose, DONE_MS);
  }

  function openAction(card: Card) {
    if (card.view === 'new-session' && !confirmNewSession) {
      onClose();
      actions.onStartNewSession();
      return;
    }
    if (card.view === 'add-sub') setSubOut(null);
    if (card.view === 'add-round') setExtraRounds(1);
    setView(card.view);
  }

  function back() {
    // New Player is reached from two lists now, so it goes back to the one it
    // came from. subOut is the tell: it is only ever set inside Sub a Player.
    if (view === 'new-player') setView(subOut ? 'add-sub' : 'add-player');
    else if (view === 'add-sub' && subOut) setSubOut(null);
    else setView('menu');
  }

  function disabledReason(card: Card): string | null {
    if (card.view === 'new-session') return null;
    if (card.view === 'add-round') return null;
    // A finished session is still worth sharing: the standings are the thing
    // people ask for once the last round is played.
    if (card.view === 'share-live') return null;
    if (!hasOpenRound) return 'Every round is done. Add a round first.';
    if (card.view === 'reshuffle' && openRounds.length === 0) return 'Nothing left to shuffle.';
    if (card.view === 'add-sub' && addablePlayers.length === 0) {
      return 'Everyone in this group is already playing.';
    }
    if (card.view === 'add-sub' && players.length === 0) return 'Nobody to swap out.';
    if (card.view === 'remove-court' && (firstOpen?.courts.length ?? 0) <= 1) {
      return 'There is only one court.';
    }
    return null;
  }

  /**
   * Dragging the header down closes the sheet.
   *
   * Bound to the header alone, so it never argues with a list being scrolled in
   * the body. Two things it must not do: start on the back and close buttons
   * that live up here, and capture the pointer before there is a drag to
   * capture. Capturing on the way down redirects the click to the header, and
   * the button underneath the finger never hears about it.
   */
  const dragHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      dragFrom.current = e.clientY;
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (dragFrom.current === null) return;
      const dy = Math.max(0, e.clientY - dragFrom.current);
      if (!dragging && dy < 4) return;
      if (!dragging) {
        setDragging(true);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
      setDragY(dy);
    },
    onPointerUp: () => {
      if (dragFrom.current === null) return;
      dragFrom.current = null;
      setDragging(false);
      if (dragY > DRAG_TO_CLOSE) requestClose();
      setDragY(0);
    },
  };

  const heading = HEADINGS[view];
  const glyph = PANEL_GLYPHS.get(view);
  // Reshuffle asks its question in the header rather than repeating the title
  // in the body, so the count is worked out here and the line is set at reading
  // size instead of caption size.
  const asksInHeader = view === 'reshuffle';
  const sub = asksInHeader
    ? `Rebuild ${roundCount(openRounds.length, 'Remaining ')}?`
    : heading.sub;
  const offset = closing || !shown ? '100%' : `${dragY}px`;

  return (
    <div className="no-print fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close Actions"
        onClick={requestClose}
        className="absolute inset-0 w-full cursor-default bg-black/40 transition-opacity duration-300"
        style={{ opacity: closing || !shown ? 0 : 1 }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={view === 'menu' ? 'Actions' : heading.title}
        className="sheet-panel absolute inset-x-0 bottom-0 flex flex-col overflow-hidden
                   rounded-t-2xl bg-white shadow-[0_-6px_24px_rgba(0,0,0,0.18)]"
        style={{
          height: height ? `${height}px` : undefined,
          maxHeight: `${SHEET_FRACTION * 100}vh`,
          transform: `translateY(${offset})`,
          transition: dragging ? 'none' : `transform ${SLIDE_MS}ms ease-out, height 260ms ease-out`,
        }}
      >
        <div ref={contentRef} className={tall ? 'flex h-full min-h-0 flex-col' : 'flex flex-col'}>
          {view === 'done' ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <SuccessIcon className="h-10 w-10 text-green-600" />
              <p className="text-lg font-bold" style={{ color: NAVY_TEXT }}>
                {message}
              </p>
            </div>
          ) : (
            <>
              <header
                {...dragHandlers}
                className="shrink-0 touch-none select-none px-6 pb-2 pt-3"
              >
                <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[#C4C8CF]" />
                {view === 'menu' ? (
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h2
                        className="text-[1.35rem] font-extrabold leading-tight"
                        style={{ color: NAVY_TEXT }}
                      >
                        {heading.title}
                      </h2>
                      {heading.sub && (
                        <p className="mt-0.5 text-sm" style={{ color: QUIET_TEXT }}>
                          {heading.sub}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={requestClose}
                      aria-label="Close Actions"
                      className="-mr-2 mt-1 rounded p-1 text-[#626D7E] transition-colors hover:bg-gray-100"
                    >
                      <CloseIcon className="h-[29px] w-[29px]" strokeWidth={3} />
                    </button>
                  </div>
                ) : (
                  /* One action, introduced by the shape you tapped to get here:
                     the glyph, then the title, then the line under it, all on
                     the sheet's centre line. Back and Close are taken out of
                     the flow so the stack is centred on the sheet rather than
                     on whatever room is left between them, which would put a
                     title half a button to the right of everything below it. */
                  <div className="relative">
                    <button
                      type="button"
                      onClick={back}
                      aria-label="Back to Actions"
                      className="absolute -ml-2 left-0 top-0 rounded p-1 text-[#626D7E] transition-colors hover:bg-gray-100"
                    >
                      <ChevronLeftIcon className="h-[29px] w-[29px]" strokeWidth={3} />
                    </button>
                    <button
                      type="button"
                      onClick={requestClose}
                      aria-label="Close Actions"
                      className="absolute -mr-2 right-0 top-0 rounded p-1 text-[#626D7E] transition-colors hover:bg-gray-100"
                    >
                      <CloseIcon className="h-[29px] w-[29px]" strokeWidth={3} />
                    </button>
                    <div className="flex flex-col items-center px-10 text-center">
                      {glyph && (
                        <span
                          className="flex items-center justify-center"
                          style={
                            {
                              color: glyph.color,
                              // The court glyphs ring and mark their badge in
                              // this, and the sheet is white. Left unset the
                              // minus disappears into its own disc.
                              '--chip-tint': WHITE,
                            } as React.CSSProperties
                          }
                        >
                          <glyph.Icon className="h-14 w-14" />
                        </span>
                      )}
                      <h2
                        className="mt-2 text-[1.35rem] font-extrabold leading-tight"
                        style={{ color: NAVY_TEXT }}
                      >
                        {heading.title}
                      </h2>
                      {sub && (
                        <p
                          className={asksInHeader ? 'mt-2 text-lg font-semibold' : 'mt-1 text-sm'}
                          style={{ color: asksInHeader ? NAVY_TEXT : QUIET_TEXT }}
                        >
                          {sub}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </header>

              {/* Flex column, so a view with little to say can push its button
                  to the foot of the sheet rather than leaving a hole under it.
                  See CONFIRM below. */}
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
                {view === 'menu' && (
                  <div className="grid grid-cols-3 gap-3">
                    {CARDS.map((card) => {
                      const reason = disabledReason(card);
                      return (
                        <button
                          key={card.view}
                          type="button"
                          disabled={reason !== null}
                          title={reason ?? undefined}
                          onClick={() => openAction(card)}
                          // The tour's last card boxes this one and dims the rest.
                          data-tutorial={
                            card.view === 'new-session' ? 'new-round-robin' : undefined
                          }
                          className={`flex flex-col items-center gap-2 rounded-lg border px-1.5 py-3
                                      shadow-sm transition-colors disabled:opacity-40 ${
                                        card.filled
                                          ? 'border-transparent hover:brightness-90'
                                          : 'border-[#E7E8EA] bg-white hover:bg-[#F8F9FB] disabled:hover:bg-white'
                                      }`}
                          style={card.filled ? { backgroundColor: card.color } : undefined}
                        >
                          <span
                            className="flex items-center justify-center"
                            style={
                              {
                                color: card.filled ? WHITE : card.color,
                                // The ring around the badge on the court glyphs,
                                // which has to match whatever is behind it.
                                '--chip-tint': card.filled ? card.color : WHITE,
                              } as React.CSSProperties
                            }
                          >
                            <card.Icon className="h-9 w-9" />
                          </span>
                          <span
                            className="text-center text-[1rem] font-bold leading-tight"
                            style={{ color: card.filled ? WHITE : NAVY_TEXT }}
                          >
                            {card.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {view === 'add-player' && (
                  <div className="space-y-2">
                    {addablePlayers.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={ROW}
                        onClick={() => {
                          actions.onAddPlayer(p.id);
                          finish(`${p.name} is in.`);
                        }}
                      >
                        <span className="flex-1 font-medium text-gray-800">{p.name}</span>
                        <span className="text-gray-500">{p.rating.toFixed(1)}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className={NEW_ROW}
                      onClick={() => setView('new-player')}
                    >
                      <AddPlayerSolidIcon className="h-6 w-6" />
                      Someone new
                    </button>
                    {addablePlayers.length === 0 && (
                      <p className="pt-2 text-sm" style={{ color: QUIET_TEXT }}>
                        Everyone in this group is already playing. Add someone new above.
                      </p>
                    )}
                  </div>
                )}

                {view === 'new-player' && (
                  <PlayerForm
                    defaultRating={defaultRating}
                    submitLabel={
                      subOut ? `Add and Sub In for ${subOut.name}` : 'Add to Group and Session'
                    }
                    onSubmit={(name, rating, gender) => {
                      // Reached from Sub a Player, this is one move rather than
                      // two: the new player takes the outgoing one's place
                      // instead of being added on top of a full court.
                      actions.onCreatePlayer(name, rating, gender, subOut?.id);
                      finish(
                        subOut ? `${name} is on for ${subOut.name}.` : `${name} is in.`
                      );
                    }}
                  />
                )}

                {view === 'add-sub' && !subOut && (
                  <div className="space-y-2">
                    <p className="pb-1 text-sm" style={{ color: QUIET_TEXT }}>
                      Who is coming off?
                    </p>
                    {players.map((p) => (
                      <button key={p.id} type="button" className={ROW} onClick={() => setSubOut(p)}>
                        <span className="flex-1 font-medium text-gray-800">{p.name}</span>
                        <span className="text-gray-500">{p.rating.toFixed(1)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {view === 'add-sub' && subOut && (
                  <div className="space-y-2">
                    <p className="pb-1 text-sm" style={{ color: QUIET_TEXT }}>
                      Who is going on for {subOut.name}?
                    </p>
                    {addablePlayers.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={ROW}
                        onClick={() => {
                          actions.onSubstitute(subOut.id, p.id);
                          finish(`${p.name} is on for ${subOut.name}.`);
                        }}
                      >
                        <span className="flex-1 font-medium text-gray-800">{p.name}</span>
                        <span className="text-gray-500">{p.rating.toFixed(1)}</span>
                      </button>
                    ))}
                    {/* The same way out this list has on Add a Player. Whoever
                        is taking the place of somebody going home is as likely
                        to be a newcomer here as there, and without this the
                        answer was to back out and start again. */}
                    <button
                      type="button"
                      className={NEW_ROW}
                      onClick={() => setView('new-player')}
                    >
                      <AddPlayerSolidIcon className="h-6 w-6" />
                      Someone new
                    </button>
                  </div>
                )}

                {view === 'add-guest' && (
                  <PlayerForm
                    defaultRating={defaultRating}
                    submitLabel="Add Guest"
                    onSubmit={(name, rating, gender) => {
                      actions.onAddGuest(name, rating, gender);
                      finish(`${name} is in as a guest.`);
                    }}
                  />
                )}

                {view === 'reshuffle' && (
                  <div className={CONFIRM}>
                    {/* What survives, each line led by its own shape. Teal
                        because this is the half of the panel that reassures,
                        and the palette keeps orange for the half that warns. */}
                    <ul className="space-y-4">
                      {RESHUFFLE_KEEPS.map(({ Icon, text }) => (
                        <li key={text} className="flex items-center gap-4">
                          <span className="flex shrink-0 items-center" style={{ color: TEAL }}>
                            <Icon className="h-8 w-8" />
                          </span>
                          <span className={RESHUFFLE_LINE} style={{ color: NAVY_TEXT }}>
                            {text}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* The one thing a rebuild takes away. It is the only part
                        of this panel that cannot be undone, so it is the only
                        part wearing the warning colour, and it only appears when
                        there is really a score in an open round to lose. */}
                    {rebuildLosesScores && (
                      <div className="flex items-start gap-3 rounded-lg border-2 border-brand-orange bg-brand-orange-light p-4">
                        <span
                          className="flex shrink-0 items-center"
                          style={{ color: ORANGE }}
                          aria-hidden="true"
                        >
                          <WarningIcon className="h-9 w-9" />
                        </span>
                        <div>
                          <p className={`font-bold ${RESHUFFLE_LINE}`} style={{ color: ORANGE }}>
                            Scores in incomplete rounds will be deleted
                          </p>
                          <p className={`mt-1 ${RESHUFFLE_LINE}`} style={{ color: QUIET_TEXT }}>
                            Scores in completed rounds are safe.
                          </p>
                        </div>
                      </div>
                    )}

                    <div className={CONFIRM_FOOT}>
                      <div className="grid grid-cols-2 gap-3">
                        <button type="button" className={SECONDARY} onClick={() => setView('menu')}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          className={PRIMARY_ORANGE}
                          onClick={() => {
                            actions.onReshuffle();
                            finish(`${roundWord(openRounds.length)} reshuffled.`);
                          }}
                        >
                          Rebuild {roundCount(openRounds.length)}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {view === 'new-session' && (
                  <div className={CONFIRM}>
                    <p className="text-gray-700">
                      This will discard the current schedule including any scores
                      you&rsquo;ve entered.
                    </p>
                    <p className="text-sm" style={{ color: QUIET_TEXT }}>
                      The same set of players are selected again; however, you can
                      change them.
                    </p>
                    {/* One line, Cancel on the left. The pair reads as a choice
                        rather than as a button with an afterthought under it,
                        and the way out is where a way out belongs. */}
                    <div className={`${CONFIRM_FOOT} flex gap-3 space-y-0`}>
                      <button
                        type="button"
                        className={SECONDARY}
                        onClick={() => setView('menu')}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={DESTRUCTIVE}
                        onClick={() => {
                          onClose();
                          actions.onStartNewSession();
                        }}
                      >
                        Yes, Start New
                      </button>
                    </div>
                  </div>
                )}

                {view === 'add-round' && (
                  <div className={CONFIRM}>
                    <div className="flex items-center justify-center gap-4">
                      <button
                        type="button"
                        aria-label="Fewer rounds"
                        onClick={() => setExtraRounds((n) => Math.max(1, n - 1))}
                        className="min-h-14 min-w-14 rounded-md border border-[#999] bg-gray-200 text-2xl font-bold text-gray-700 transition-colors hover:bg-gray-300"
                      >
                        &minus;
                      </button>
                      <span
                        className="min-w-16 text-center text-3xl font-bold"
                        style={{ color: NAVY_TEXT }}
                      >
                        {extraRounds}
                      </span>
                      <button
                        type="button"
                        aria-label="More rounds"
                        onClick={() => setExtraRounds((n) => Math.min(8, n + 1))}
                        className="min-h-14 min-w-14 rounded-md border border-[#999] bg-gray-200 text-2xl font-bold text-gray-700 transition-colors hover:bg-gray-300"
                      >
                        +
                      </button>
                    </div>
                    {/* Future tense: nothing has happened yet, and the sentence
                        used to read as though it had. What it leaves out is
                        already on the sheet's own subtitle. */}
                    <p className="text-center text-gray-700">
                      {extraRounds === 1
                        ? `Round ${lastRoundNumber + 1} will be added.`
                        : `Rounds ${lastRoundNumber + 1} to ${lastRoundNumber + extraRounds} will be added.`}
                    </p>
                    <div className={CONFIRM_FOOT}>
                      <button
                        type="button"
                        className={PRIMARY}
                        onClick={() => {
                          actions.onAddRounds(extraRounds);
                          finish(
                            extraRounds === 1 ? '1 round added.' : `${extraRounds} rounds added.`
                          );
                        }}
                      >
                        {extraRounds === 1 ? 'Add 1 Round' : `Add ${extraRounds} Rounds`}
                      </button>
                    </div>
                  </div>
                )}

                {view === 'add-court' && (
                  <div className={CONFIRM}>
                    <p className="text-gray-700">
                      A court will be added to the {roundWord(openRounds.length)} still to be
                      played.{' '}
                      {seating > 0
                        ? `The ${seating === 1 ? '1 player' : `${seating} players`} sitting out will be placed on it.`
                        : 'Nobody is waiting, so it starts empty and you can tap players into it.'}
                    </p>
                    {!courtSticks && (
                      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        There are only {players.length} players, which fills{' '}
                        {effectiveCourtCount(players.length, numCourts)} courts. The new one stays
                        empty, and a reshuffle would drop it again.
                      </p>
                    )}
                    <div className={CONFIRM_FOOT}>
                      <button
                        type="button"
                        className={PRIMARY}
                        onClick={() => {
                          actions.onAddCourt();
                          finish('Court added.');
                        }}
                      >
                        Add the Court
                      </button>
                    </div>
                  </div>
                )}

                {view === 'remove-court' && (
                  <div className="space-y-2">
                    {(firstOpen?.courts ?? []).map((court) => {
                      const on = names(firstOpen, court.courtNumber);
                      return (
                        <button
                          key={court.courtNumber}
                          type="button"
                          className={`${ROW} flex-col items-start gap-1`}
                          onClick={() => {
                            actions.onRemoveCourt(court.courtNumber);
                            finish(`Court ${court.courtNumber} removed.`);
                          }}
                        >
                          <span className="font-bold text-gray-800">
                            COURT {court.courtNumber}
                          </span>
                          <span className="text-sm" style={{ color: QUIET_TEXT }}>
                            {on.length > 0
                              ? `${on.map((p) => p.name).join(', ')} sit out instead`
                              : 'Nobody is on it'}
                          </span>
                        </button>
                      );
                    })}
                    <p className="pt-2 text-sm" style={{ color: QUIET_TEXT }}>
                      The court will be removed from the {roundWord(openRounds.length)} still to be
                      played. Rounds already played are kept.
                    </p>
                  </div>
                )}

                {/* The one view that asks the sheet for almost nothing. It reads
                    the publisher's own store and calls it directly, so there is
                    no action to add to ScheduleActions. The one thing it cannot
                    do for itself is open My Account, which lives above the
                    schedule entirely. */}
                {view === 'share-live' && (
                  <LiveShareView
                    onCreateAccount={
                      onOpenAccount && accountsPossible()
                        ? () => {
                            requestClose();
                            onOpenAccount();
                          }
                        : undefined
                    }
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
