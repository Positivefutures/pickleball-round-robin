import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Gender, Player, Round, Schedule } from '../../types';
import { effectiveCourtCount } from '../../lib/pairing';
import { DISCARD_WARNING } from '../../lib/steps';
import { useScrollLock } from '../../hooks/useScrollLock';
import { RatingStepper } from '../RatingStepper';
import { PlayerForm } from '../roster/PlayerForm';
import {
  AddPlayerSolidIcon,
  AddRowIcon,
  ChevronLeftIcon,
  CloseIcon,
  GuestIcon,
  ReplayIcon,
  ShuffleIcon,
  SuccessIcon,
  SwapPeopleIcon,
} from '../icons';
import { AddCourtIcon, EditRatingIcon, RemoveCourtIcon, ShareSessionIcon } from './actionIcons';
import { LiveShareView } from './LiveShareView';
import { ACCOUNTS_ENABLED } from '../../lib/appInfo';
import { isSupabaseConfigured } from '../../lib/supabase';

/** Everything the sheet can set in motion. Implemented in App. */
export interface ScheduleActions {
  onReshuffle: () => void;
  onStartNewSession: () => void;
  /** A group member not in this session yet. */
  onAddPlayer: (playerId: string) => void;
  /** Somebody new: joins the group and this session. */
  onCreatePlayer: (name: string, rating: number, gender: Gender) => void;
  /** Somebody new for today only, never saved to the group. */
  onAddGuest: (name: string, rating: number, gender: Gender) => void;
  onSubstitute: (outgoingId: string, incomingId: string) => void;
  onEditRating: (playerId: string, rating: number) => void;
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
  | 'edit-rating'
  | 'reshuffle'
  | 'new-session'
  | 'add-round'
  | 'add-court'
  | 'remove-court'
  | 'share-live'
  | 'done';

/** Where the sheet opens. The sit-out row's own button opens Add a Player. */
export type ActionsEntry = Extract<View, 'menu' | 'add-player'>;

interface Tone {
  tint: string;
  glyph: string;
}

// Sampled from INBOX/Actions.PNG rather than rounded to the nearest Tailwind
// shade, and written as inline colours for the same reason the header banner is:
// the design picked them, not the palette.
const GREEN: Tone = { tint: '#E8F4E2', glyph: '#149A30' };
const TEAL: Tone = { tint: '#DFF2F4', glyph: '#0396B4' };
const NAVY: Tone = { tint: '#E9EFFB', glyph: '#1E376E' };
const RED: Tone = { tint: '#FEECEA', glyph: '#CB2221' };
const ORANGE: Tone = { tint: '#FEF3E9', glyph: '#FA631C' };

const NAVY_TEXT = '#051829';
const QUIET_TEXT = '#636A77';

interface Card {
  view: Exclude<View, 'menu' | 'done' | 'new-player'>;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
  tone: Tone;
}

const CARDS: Card[] = [
  { view: 'add-player', label: 'Add a Player', Icon: AddPlayerSolidIcon, tone: GREEN },
  { view: 'add-sub', label: 'Add a Sub', Icon: SwapPeopleIcon, tone: TEAL },
  { view: 'add-guest', label: 'Add a Guest', Icon: GuestIcon, tone: TEAL },
  { view: 'edit-rating', label: 'Edit Player Rating', Icon: EditRatingIcon, tone: TEAL },
  { view: 'reshuffle', label: 'Reshuffle', Icon: ShuffleIcon, tone: GREEN },
  { view: 'new-session', label: 'Start New Session', Icon: ReplayIcon, tone: GREEN },
  { view: 'add-round', label: 'Add a Round', Icon: AddRowIcon, tone: ORANGE },
  { view: 'add-court', label: 'Add a Court', Icon: AddCourtIcon, tone: NAVY },
  { view: 'remove-court', label: 'Remove a Court', Icon: RemoveCourtIcon, tone: RED },
  { view: 'share-live', label: 'Share Live Session', Icon: ShareSessionIcon, tone: NAVY },
];

/**
 * Whether a card is on offer at all, as against being on offer but disabled.
 *
 * Only sharing answers no, and only when the app was built without a database
 * to share into. That follows Share App and My Account in the settings menu: no
 * configuration means no item, rather than a button that cannot work.
 */
function offered(card: Card): boolean {
  if (card.view !== 'share-live') return true;
  return ACCOUNTS_ENABLED && isSupabaseConfigured();
}

const HEADINGS: Record<View, { title: string; sub?: string }> = {
  menu: { title: 'Actions', sub: 'Quick changes for this session' },
  'add-player': { title: 'Add a Player', sub: 'Who is joining?' },
  'new-player': { title: 'New Player', sub: 'Joins the group and this session' },
  'add-sub': { title: 'Add a Sub' },
  'add-guest': { title: 'Add a Guest', sub: 'Plays today only, never saved to the group' },
  'edit-rating': { title: 'Edit Player Rating' },
  reshuffle: { title: 'Reshuffle', sub: 'Deal the remaining rounds again' },
  'new-session': { title: 'Start a new session?' },
  'add-round': { title: 'Add a Round', sub: 'Planned around the games already scheduled' },
  'add-court': { title: 'Add a Court' },
  'remove-court': { title: 'Remove a Court', sub: 'Which court is going?' },
  'share-live': { title: 'Share Live Session', sub: 'Let everyone watch on their own phone' },
  done: { title: '' },
};

const SHEET_FRACTION = 0.92;
const SLIDE_MS = 300;
const DONE_MS = 1600;
const DRAG_TO_CLOSE = 80;

const PRIMARY =
  'w-full px-4 py-2.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium disabled:opacity-40 disabled:hover:bg-green-600';
const SECONDARY =
  'w-full px-4 py-2.5 border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium';
const DESTRUCTIVE =
  'w-full px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium';
const ROW =
  'flex w-full items-center gap-3 rounded-lg border border-[#D8DEE4] bg-white px-4 py-3 text-left transition-colors hover:bg-[#F1F3F6]';

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
}: Props) {
  const [view, setView] = useState<View>(entry);
  const [message, setMessage] = useState('');
  const [subOut, setSubOut] = useState<Player | null>(null);
  const [ratingFor, setRatingFor] = useState<Player | null>(null);
  const [draftRating, setDraftRating] = useState(defaultRating);
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
    if (card.view === 'add-sub') setSubOut(null);
    if (card.view === 'edit-rating') setRatingFor(null);
    if (card.view === 'add-round') setExtraRounds(1);
    setView(card.view);
  }

  function back() {
    if (view === 'new-player') setView('add-player');
    else if (view === 'add-sub' && subOut) setSubOut(null);
    else if (view === 'edit-rating' && ratingFor) setRatingFor(null);
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
    if (card.view === 'edit-rating' && players.length === 0) return 'Nobody to edit.';
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
                <div className="flex items-start gap-2">
                  {view !== 'menu' && (
                    <button
                      type="button"
                      onClick={back}
                      aria-label="Back to Actions"
                      className="-ml-2 mt-1 rounded p-1 text-[#626D7E] transition-colors hover:bg-gray-100"
                    >
                      <ChevronLeftIcon className="h-[29px] w-[29px]" strokeWidth={3} />
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2
                      className="text-[1.75rem] font-extrabold leading-tight"
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
              </header>

              {/* Flex column, so a view with little to say can push its button
                  to the foot of the sheet rather than leaving a hole under it.
                  See CONFIRM below. */}
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
                {view === 'menu' && (
                  <div className="grid grid-cols-3 gap-3">
                    {CARDS.filter(offered).map((card) => {
                      const reason = disabledReason(card);
                      return (
                        <button
                          key={card.view}
                          type="button"
                          disabled={reason !== null}
                          title={reason ?? undefined}
                          onClick={() => openAction(card)}
                          className="flex flex-col items-center gap-2 rounded-lg border border-[#E7E8EA]
                                     bg-white px-1.5 py-3 shadow-sm transition-colors
                                     hover:bg-[#F8F9FB] disabled:opacity-40 disabled:hover:bg-white"
                        >
                          <span
                            className="flex h-[55px] w-[55px] items-center justify-center rounded-xl"
                            style={
                              {
                                backgroundColor: card.tone.tint,
                                color: card.tone.glyph,
                                '--chip-tint': card.tone.tint,
                              } as React.CSSProperties
                            }
                          >
                            <card.Icon className="h-[30px] w-[30px]" />
                          </span>
                          <span
                            className="text-center text-[1rem] font-bold leading-tight"
                            style={{ color: NAVY_TEXT }}
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
                      className={`${ROW} font-medium text-green-700`}
                      onClick={() => setView('new-player')}
                    >
                      <AddPlayerSolidIcon className="h-5 w-5" />
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
                    submitLabel="Add to Group and Session"
                    onSubmit={(name, rating, gender) => {
                      actions.onCreatePlayer(name, rating, gender);
                      finish(`${name} is in.`);
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

                {view === 'edit-rating' && !ratingFor && (
                  <div className="space-y-2">
                    <p className="pb-1 text-sm" style={{ color: QUIET_TEXT }}>
                      Whose rating is changing?
                    </p>
                    {players.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={ROW}
                        onClick={() => {
                          setRatingFor(p);
                          setDraftRating(p.rating);
                        }}
                      >
                        <span className="flex-1 font-medium text-gray-800">{p.name}</span>
                        <span className="text-gray-500">{p.rating.toFixed(1)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {view === 'edit-rating' && ratingFor && (
                  <div className={CONFIRM}>
                    <p className="text-lg font-bold" style={{ color: NAVY_TEXT }}>
                      {ratingFor.name}
                    </p>
                    <div className="flex justify-center">
                      <RatingStepper value={draftRating} onChange={setDraftRating} large />
                    </div>
                    <p className="text-sm" style={{ color: QUIET_TEXT }}>
                      This is saved against the player, so it holds for next time. The schedule
                      shows the new number and nobody changes court.
                    </p>
                    <div className={CONFIRM_FOOT}>
                      <button
                        type="button"
                        className={PRIMARY}
                        onClick={() => {
                          actions.onEditRating(ratingFor.id, draftRating);
                          finish(`${ratingFor.name} is now ${draftRating.toFixed(1)}.`);
                        }}
                      >
                        Save Rating
                      </button>
                    </div>
                  </div>
                )}

                {view === 'reshuffle' && (
                  <div className={CONFIRM}>
                    <p className="text-gray-700">
                      The {roundWord(openRounds.length)} still to be played are built again from
                      scratch. Anything marked complete is kept, along with the pairs you have
                      locked.
                    </p>
                    <p className="text-sm" style={{ color: QUIET_TEXT }}>
                      Scores on the rounds being rebuilt go with them.
                    </p>
                    <div className={CONFIRM_FOOT}>
                      <button
                        type="button"
                        className={PRIMARY}
                        onClick={() => {
                          actions.onReshuffle();
                          finish(`${roundWord(openRounds.length)} reshuffled.`);
                        }}
                      >
                        Reshuffle
                      </button>
                    </div>
                  </div>
                )}

                {view === 'new-session' && (
                  <div className={CONFIRM}>
                    {/* The same sentence the step tabs say. See lib/steps. */}
                    <p className="text-gray-700">{DISCARD_WARNING}</p>
                    <p className="text-sm" style={{ color: QUIET_TEXT }}>
                      The same crowd stays selected, ready for the next one.
                    </p>
                    <div className={CONFIRM_FOOT}>
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
                      <button type="button" className={SECONDARY} onClick={() => setView('menu')}>
                        Cancel
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
                    <p className="text-gray-700">
                      {extraRounds === 1
                        ? `Round ${lastRoundNumber + 1} is added.`
                        : `Rounds ${lastRoundNumber + 1} to ${lastRoundNumber + extraRounds} are added.`}{' '}
                      They are built around the games already scheduled, and nothing above them
                      changes.
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

                {/* The one view that asks the sheet for nothing. It reads the
                    publisher's own store and calls it directly, so there is no
                    prop to thread and no action to add to ScheduleActions. */}
                {view === 'share-live' && <LiveShareView />}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
