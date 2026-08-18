import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Gender, Player, Round, RoundType, Schedule } from '../../types';
import { effectiveCourtCount } from '../../lib/pairing';
import { courtsAreFull } from '../../lib/sitout';
import { ROUND_TYPES, pillMeta } from '../../lib/roundTypes';
import { TypeGlyphs } from '../setup/typeGlyphs';
import { isScored } from '../../lib/standings';
import { useScrollLock } from '../../hooks/useScrollLock';
import { PlayerForm } from '../roster/PlayerForm';
import {
  AddPlayerSolidIcon,
  AddRowIcon,
  ChevronLeftIcon,
  CloseIcon,
  GuestIcon,
  InfoIcon,
  LinkIcon,
  EditPageIcon,
  LockIcon,
  RemovePlayerSolidIcon,
  ShareIcon,
  ShuffleIcon,
  SitIcon,
  SuccessIcon,
  SwapPeopleIcon,
  WarningIcon,
} from '../icons';
import { AddCourtIcon, RemoveCourtIcon } from './actionIcons';
import { TileButton, TILE_ROW } from '../TileButton';
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
   * `replacingId` is Sub Player reaching the same form. The new player takes
   * that person's place rather than being added on top, which is the difference
   * between subbing somebody on and putting a fifth on the court.
   */
  onCreatePlayer: (
    name: string, rating: number, gender: Gender, replacingId?: string
  ) => string;
  /** Somebody new for today only, never saved to the group. */
  onAddGuest: (name: string, rating: number, gender: Gender) => void;
  onSubstitute: (outgoingId: string, incomingId: string) => void;
  /**
   * Somebody going home. They leave the remaining rounds and those rounds are
   * rebuilt around it, which is why it locks the Done checkboxes and a
   * substitution does not.
   */
  onRemovePlayer: (playerId: string) => void;
  onAddCourt: () => void;
  onRemoveCourt: (courtNumber: number) => void;
  /** One round on the end, played as the type the host picked. */
  onAddRound: (type: RoundType | null) => void;
}

type View =
  | 'menu'
  | 'add-player'
  | 'new-player'
  | 'add-sub'
  | 'remove-player'
  | 'add-guest'
  | 'reshuffle'
  | 'new-session'
  | 'add-round'
  | 'add-court'
  | 'remove-court'
  | 'share-live'
  | 'done';

/**
 * Where the sheet opens. The sit-out row's own button opens Add Player,
 * coming back from My Account opens the card that sent you there, and Sub
 * Someone In on a player's own panel opens the second half of subbing with
 * that player already chosen.
 */
export type ActionsEntry = Extract<
  View,
  'menu' | 'add-player' | 'share-live' | 'add-sub'
>;

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
  { view: 'add-player', label: 'Add Player', Icon: AddPlayerSolidIcon, color: TEAL },
  // Subbing has no card. It is one player's business rather than the session's,
  // so it is reached by tapping that player on the schedule; the view is still
  // here and the sheet still opens straight onto it. What stands in its place
  // is the other half of somebody leaving: they go and nobody replaces them.
  { view: 'remove-player', label: 'Remove Player', Icon: RemovePlayerSolidIcon, color: RED },
  { view: 'add-guest', label: 'Add Guest', Icon: GuestIcon, color: TEAL },
  // No Edit Player Rating card. Tapping somebody on the schedule and pressing
  // the pencil edits their name, rating and gender in one panel, which is both
  // fewer taps and the place a host is already looking when they notice.
  { view: 'new-session', label: 'New Round Robin', Icon: EditPageIcon, color: ORANGE },
  { view: 'reshuffle', label: 'Reshuffle', Icon: ShuffleIcon, color: TEAL, filled: true },
  // "Share Session" on the card and "Share Live Session" on the panel it opens.
  // Three words is what fits a third of a phone without wrapping to three lines;
  // the panel has the room to say the whole thing.
  { view: 'share-live', label: 'Share Session', Icon: ShareIcon, color: ORANGE },
  { view: 'add-round', label: 'Add Round', Icon: AddRowIcon, color: TEAL },
  { view: 'add-court', label: 'Add Court', Icon: AddCourtIcon, color: TEAL },
  { view: 'remove-court', label: 'Remove Court', Icon: RemoveCourtIcon, color: RED },
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
// Reached from Add Player rather than from the grid, so it has no card of its
// own, but it is the same job and wants the same glyph.
PANEL_GLYPHS.set('new-player', {
  view: 'add-player',
  label: 'New Player',
  Icon: AddPlayerSolidIcon,
  color: TEAL,
});
// Subbing lost its card when Remove Player took the place, but not its panel:
// it is opened from a player on the schedule instead.
PANEL_GLYPHS.set('add-sub', {
  view: 'add-sub',
  label: 'Sub Player',
  Icon: SwapPeopleIcon,
  color: TEAL,
});

/**
 * Whether an account could be made at all, which is not the same as having one.
 * False only in a build with no Supabase env vars.
 */
const accountsPossible = () => ACCOUNTS_ENABLED && isSupabaseConfigured();

const HEADINGS: Record<View, { title: string; sub?: string }> = {
  menu: { title: 'Actions', sub: 'Quick changes for this session' },
  'add-player': { title: 'Add Player', sub: 'Who is joining?' },
  'new-player': { title: 'New Player', sub: 'Joins the group and this session' },
  'add-sub': { title: 'Sub Player' },
  'remove-player': { title: 'Remove Player', sub: 'Who is going home?' },
  'add-guest': { title: 'Add Guest', sub: 'Plays today only, never saved to the group' },
  // No sub here. Reshuffle's counts what it is about to rebuild, so it is put
  // together at render time and set larger than the rest: on this panel the line
  // under the title is the question being asked, not a caption on it.
  reshuffle: { title: 'Reshuffle' },
  'new-session': { title: 'New Round Robin?' },
  'add-round': { title: 'Add Round', sub: 'Planned around the games already scheduled' },
  'add-court': { title: 'Add Court' },
  'remove-court': { title: 'Remove Court', sub: 'Which court is going?' },
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

/** Normal first, the same order the round type picker offers them in. */
const ADD_ROUND_TYPES: (RoundType | null)[] = [null, ...ROUND_TYPES];

const ROW =
  'flex w-full items-center gap-3 rounded-lg border border-panel-edge bg-white px-4 py-3 text-left transition-colors hover:bg-[#F1F3F6]';
/**
 * Somebody who is not in the group yet, offered at the top of a list of people
 * who are. Tinted throughout — border, glyph and label — because it is the one
 * row that is not a name and the only way out of a list that does not contain
 * who you are looking for.
 *
 * Teal, the same tone a TileButton wears for the thing you came to do. It is
 * still a row rather than a tile: it stands in a list of people and has to be
 * the size and shape of the boxes it stands among. Orange is the lead colour
 * and this is not the lead action on the panel — the names under it are.
 */
const NEW_ROW =
  'flex w-full items-center gap-3 rounded-lg border border-[#A6D1D5] bg-brand-teal-light px-4 py-3 text-left font-bold text-brand-teal transition-colors hover:bg-[#D5F0F2]';

/**
 * A view that asks one question and offers one answer.
 *
 * The buttons used to be pinned to the foot of the sheet, a screen below the
 * sentence they were answering. They sit under the content now, with a gap
 * rather than a hole between the two. The sheet is still opened to the same
 * height as every other one: see `tall` below.
 */
const CONFIRM = 'flex flex-col gap-6';
/**
 * On top of CONFIRM's own `gap-6`, so the tiles stand a little further off the
 * content than the content stands off itself. They are the answer to what is
 * above them, not the last line of it.
 */
const CONFIRM_FOOT = `${TILE_ROW} pt-2`;

/**
 * A list of people to look somebody up in, rather than to read.
 *
 * Add Player and Remove Player are both "find this person and tap them", and a
 * list in whatever order the roster happens to hold is one a host has to read
 * every line of. Copied first: these arrive as the arrays the session is built
 * from, and sorting one in place would reorder the schedule behind it.
 */
function byName(list: Player[]): Player[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

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
  /** Which view to land on. The sit-out row's own button opens Add Player. */
  entry?: ActionsEntry;
  /**
   * Who is coming off, when the sheet was opened on Sub Player from that
   * player's own panel. It skips the first of the two questions, which has
   * already been answered by tapping them.
   */
  subOutId?: string;
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
  subOutId,
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
  // Read once. The sheet is keyed on its opening, so a new one gets a new
  // component and there is nothing to keep in step afterwards.
  const [subOut, setSubOut] = useState<Player | null>(
    () => players.find((p) => p.id === subOutId) ?? null
  );
  /** Who Remove Player is about to send home, once they have been picked. */
  const [removing, setRemoving] = useState<Player | null>(null);
  /** The type the round about to be added will be played as. */
  const [addType, setAddType] = useState<RoundType | null>(null);

  const [shown, setShown] = useState(false);
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [contentHeight, setContentHeight] = useState<number>();
  const contentRef = useRef<HTMLDivElement>(null);
  const dragFrom = useRef<number | null>(null);

  useScrollLock(open);

  // Courts in play now against what would be left after one player goes. The
  // same two numbers RemovePlayerDialog is given on the schedule page, worked
  // out the same way, so the two routes to a removal warn about the same thing.
  const currentCourts = effectiveCourtCount(players.length, numCourts);
  const nextCourts = effectiveCourtCount(players.length - 1, numCourts);
  const sitOutsAfterRemoval = players.length - 1 - nextCourts * 4;

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
  /**
   * Whether somebody added now would go to the bench and stay there.
   *
   * Every open round, not just the next one: a player joins all of them, and a
   * sentence saying they will sit out has to be true of each. One round with a
   * seat going spare makes it false, and the host would rightly wonder which
   * round the app meant.
   */
  const noRoomOnCourt = hasOpenRound && openRounds.every(courtsAreFull);

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

  /**
   * Every action opens the sheet to the same near full screen height. The menu
   * and the done flash are as tall as what is in them.
   *
   * One height for all of them, whatever is on them: a panel that fitted itself
   * to its content was a different sheet each time it opened, and the tiles
   * under the question landed somewhere new on every one. What made the tall
   * sheet look wrong was the buttons pinned to the bottom of it, three lines
   * away from what they answered, and that is fixed where it was broken — they
   * sit under the content now. The room below them is just room.
   */
  const tall = view !== 'menu' && view !== 'done';

  // Both ends have to be a pixel count for the height to animate between them,
  // so the short views are measured.
  //
  // scrollHeight, and the wrapper carries `overflow-y-auto` when it is not
  // height-constrained. That is what keeps the measurement out of a loop with
  // the height it is feeding: a scroll container reports the height of what is
  // in it whatever height it has itself been given, so a menu that turns out to
  // be taller than the sheet allows gets clamped by maxHeight and scrolls, and
  // still measures the same on the next pass.
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
    if (card.view === 'remove-player') setRemoving(null);
    if (card.view === 'add-round') setAddType(null);
    setView(card.view);
  }

  function back() {
    // New Player is reached from two lists now, so it goes back to the one it
    // came from. subOut is the tell: it is only ever set inside Sub Player.
    if (view === 'new-player') setView(subOut ? 'add-sub' : 'add-player');
    // Back out of the second question to the first, except where the first was
    // answered by tapping somebody on the schedule: there is no list behind it
    // to go back to, so the whole sheet closes.
    else if (view === 'add-sub' && subOut) {
      if (subOutId) onClose();
      else setSubOut(null);
    } else if (view === 'remove-player' && removing) setRemoving(null);
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
    if (card.view === 'remove-player' && players.length - 1 < 4) {
      return 'That would leave fewer than 4 players.';
    }
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
        <div
          ref={contentRef}
          className={
            tall
              ? 'flex h-full min-h-0 flex-col'
              : 'flex flex-col overflow-y-auto overscroll-contain'
          }
        >
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
                                          : 'border-panel-edge bg-white hover:bg-[#F8F9FB] disabled:hover:bg-white'
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
                    {/* Before the list, because it changes what tapping a name
                        does. Somebody added to a full session lands under
                        Sitting Out at the foot of the schedule, which is the
                        one place a host is not looking when they add them. */}
                    {noRoomOnCourt && (
                      /* Yellow and an i, not orange and a warning triangle.
                         Nothing here is lost or undone: the session is simply
                         full, and the two lines say where the next player
                         lands and how to put them on a court. The orange box
                         with the triangle is kept for the panels that really
                         do take something away. */
                      <div className="flex items-start gap-3 rounded-lg border-2 border-brand-orange bg-notice-yellow p-4">
                        <span
                          className="flex shrink-0 items-center"
                          style={{ color: ORANGE }}
                          aria-hidden="true"
                        >
                          <InfoIcon className="h-9 w-9" />
                        </span>
                        <div>
                          <p className={`font-bold ${RESHUFFLE_LINE}`} style={{ color: ORANGE }}>
                            All courts are full.
                          </p>
                          <p className={`mt-1 ${RESHUFFLE_LINE}`} style={{ color: QUIET_TEXT }}>
                            New players will be added to the Sitting Out section. Swap
                            them in manually or{' '}
                            {/* The shape off the Reshuffle card, so the way out
                                of this is recognised before the word is read.
                                Kept on one line with it: an icon orphaned at the
                                end of a line reads as a bullet.

                                Inline-block on a nudged baseline rather than an
                                inline-flex box. An inline-flex takes its
                                baseline from its first item, which sat the
                                glyph's foot on the text baseline and lifted the
                                word above the line it belongs to. */}
                            <span className="whitespace-nowrap font-bold">
                              <ShuffleIcon className="mr-1 inline-block h-5 w-5 align-[-0.25em]" />
                              Reshuffle
                            </span>{' '}
                            to rebuild the remaining rounds.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Above the names, not under them. On a full group the list
                        is longer than the sheet, and the way to add somebody who
                        is not on it was below the fold with nothing to say it
                        was there. */}
                    <button
                      type="button"
                      className={NEW_ROW}
                      onClick={() => setView('new-player')}
                    >
                      <AddPlayerSolidIcon className="h-6 w-6" />
                      Someone New
                    </button>

                    {byName(addablePlayers).map((p) => (
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
                      // Reached from Sub Player, this is one move rather than
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
                    {/* The same way out this list has on Add Player, and in the
                        same place: above the names. Whoever is taking the place
                        of somebody going home is as likely to be a newcomer
                        here as there, and on a full group a row under the names
                        is a row below the fold. */}
                    <button
                      type="button"
                      className={NEW_ROW}
                      onClick={() => setView('new-player')}
                    >
                      <AddPlayerSolidIcon className="h-6 w-6" />
                      Someone New
                    </button>
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
                  </div>
                )}

                {view === 'remove-player' && !removing && (
                  <div className="space-y-2">
                    {byName(players).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={ROW}
                        onClick={() => setRemoving(p)}
                      >
                        <span className="flex-1 font-medium text-gray-800">{p.name}</span>
                        <span className="text-gray-500">{p.rating.toFixed(1)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {view === 'remove-player' && removing && (
                  <div className={CONFIRM}>
                    <div className="space-y-3">
                      <p className="text-gray-700">
                        {removing.name} comes out of the rounds still to play, and
                        those rounds are rebuilt without them. Rounds already
                        marked done are left exactly as they were played.
                      </p>

                      {/* Only when it really costs a court. On a session with
                          people to spare the removal changes nothing anybody
                          would notice, and a warning about that would be noise
                          in front of the button. */}
                      {nextCourts < currentCourts && (
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
                              This drops to {nextCourts === 1 ? '1 court' : `${nextCourts} courts`}
                            </p>
                            <p className={`mt-1 ${RESHUFFLE_LINE}`} style={{ color: QUIET_TEXT }}>
                              {sitOutsAfterRemoval === 1
                                ? '1 player sits out each round.'
                                : `${sitOutsAfterRemoval} players sit out each round.`}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className={CONFIRM_FOOT}>
                      <TileButton
                        tone="quiet"
                        Icon={CloseIcon}
                        label="Cancel"
                        onClick={() => setRemoving(null)}
                      />
                      <TileButton
                        tone="red"
                        Icon={RemovePlayerSolidIcon}
                        label="Remove"
                        onClick={() => {
                          actions.onRemovePlayer(removing.id);
                          finish(`${removing.name} is out.`);
                        }}
                      />
                    </div>
                  </div>
                )}

                {view === 'add-guest' && (
                  <PlayerForm
                    defaultRating={defaultRating}
                    nameLabel="Guest Name"
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

                    {/* Teal, not the lead orange it used to wear. Orange is what
                        this panel warns in — the box above says what a rebuild
                        costs — and the button that does it cannot be the same
                        colour as the warning against doing it. */}
                    <div className={CONFIRM_FOOT}>
                      <TileButton
                        tone="quiet"
                        Icon={CloseIcon}
                        label="Cancel"
                        onClick={() => setView('menu')}
                      />
                      <TileButton
                        tone="teal"
                        Icon={ShuffleIcon}
                        label={`Rebuild ${roundCount(openRounds.length)}`}
                        onClick={() => {
                          actions.onReshuffle();
                          finish(`${roundWord(openRounds.length)} reshuffled.`);
                        }}
                      />
                    </div>
                  </div>
                )}

                {view === 'new-session' && (
                  <div className={CONFIRM}>
                    {/* Bold: it is the cost, and the line under it is the
                        reassurance. Read in that order they are a warning and
                        its softening; read the other way round they are two
                        sentences of equal weight about players. */}
                    <p className="font-bold text-gray-700">
                      This will discard the current schedule including any scores
                      you&rsquo;ve entered.
                    </p>
                    <p className="text-sm" style={{ color: QUIET_TEXT }}>
                      The same set of players will be selected again; however, you
                      can change them.
                    </p>
                    {/* One line, Cancel on the left. The pair reads as a choice
                        rather than as a button with an afterthought under it,
                        and the way out is where a way out belongs. */}
                    <div className={CONFIRM_FOOT}>
                      <TileButton
                        tone="quiet"
                        Icon={CloseIcon}
                        label="Cancel"
                        onClick={() => setView('menu')}
                      />
                      <TileButton
                        tone="red"
                        Icon={EditPageIcon}
                        label="Yes, Start New"
                        onClick={() => {
                          onClose();
                          actions.onStartNewSession();
                        }}
                      />
                    </div>
                  </div>
                )}

                {view === 'add-round' && (
                  <div className={CONFIRM}>
                    {/* Future tense: nothing has happened yet, and the sentence
                        used to read as though it had. What it leaves out is
                        already on the sheet's own subtitle. */}
                    <p className="text-center text-gray-700">
                      Round {lastRoundNumber + 1} will be added.
                    </p>

                    {/* Four across where there is room, two and two where there
                        is not, and every one the same width either way — which
                        is a grid's job, not a flex row's. Normal and Gendered
                        pair off on the first line, Mixed and Equal Skill on the
                        second, because that is the order they are offered in
                        everywhere else.

                        The short names, not the badges: "Equal Skill Round" in
                        a quarter of a phone is two lines of type in a pill. */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {ADD_ROUND_TYPES.map((type) => {
                        const meta = pillMeta(type);
                        const chosen = type === addType;
                        return (
                          <button
                            key={type ?? 'normal'}
                            type="button"
                            aria-current={chosen ? 'true' : undefined}
                            onClick={() => setAddType(type)}
                            className={`flex min-h-14 w-full items-center justify-center gap-1.5 rounded-full border-2 px-2 text-sm font-bold transition-transform active:scale-95 ${meta.badgeClass} ${meta.badgeEdgeClass} ${chosen ? 'ring-2 ring-brand-teal ring-offset-2' : ''}`}
                          >
                            <TypeGlyphs type={type} size="badge" />
                            {meta.shortName}
                          </button>
                        );
                      })}
                    </div>

                    <div className={CONFIRM_FOOT}>
                      <TileButton
                        tone="quiet"
                        Icon={CloseIcon}
                        label="Cancel"
                        onClick={() => setView('menu')}
                      />
                      <TileButton
                        tone="teal"
                        Icon={AddRowIcon}
                        label="Add 1 Round"
                        onClick={() => {
                          actions.onAddRound(addType);
                          finish('1 round added.');
                        }}
                      />
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
                    {/* A way out, which this panel went without while every
                        other one had one. The back chevron is not it: nothing
                        says a chevron in the corner is how you decline. */}
                    <div className={CONFIRM_FOOT}>
                      <TileButton
                        tone="quiet"
                        Icon={CloseIcon}
                        label="Cancel"
                        onClick={() => setView('menu')}
                      />
                      <TileButton
                        tone="teal"
                        Icon={AddCourtIcon}
                        label="Add the Court"
                        onClick={() => {
                          actions.onAddCourt();
                          finish('Court added.');
                        }}
                      />
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
