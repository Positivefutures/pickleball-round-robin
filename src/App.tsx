import {
  useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore,
} from 'react';
import type { Gender, Player, Schedule, LockedPair, RoundType, SpecialTypeSetting } from './types';
import { usePlayers } from './hooks/usePlayers';
import { useRosters } from './hooks/useRosters';
import { useStoredValue } from './hooks/useStoredValue';
import { useScrollLock } from './hooks/useScrollLock';
import * as stores from './lib/stores';
import { extendSchedule, generateSchedule, regenerateRemaining } from './lib/pairing';
import { addToRemainingRounds, replacePlayerInRounds } from './lib/sitout';
import { addCourtToRemaining, removeCourtFromRemaining } from './lib/courts';
import { carryCourtNumbers } from './lib/courtNumbers';
import { generateId } from './utils/helpers';
import { prunePartnerships, arePartners } from './lib/partnerships';
import { moveType, normalizeSpecialTypes } from './lib/roundTypes';
import { PLAIN_ROBIN, openedSettings } from './lib/robins';
import {
  toCsv, toGroupsCsv, parseGroupsCsv, uniqueGroupName, fileNameStem, toFileName,
  toAllGroupsFileName,
} from './lib/groupFile';
import { downloadTextFile } from './utils/download';
import { Header } from './components/layout/Header';
import { SettingsPanel } from './components/layout/SettingsPanel';
import { InstructionsPanel } from './components/layout/InstructionsPanel';
import { DefaultRatingPanel } from './components/layout/DefaultRatingPanel';
import { ImportExportPanel, ALL_GROUPS } from './components/layout/ImportExportPanel';
import type { ImportResult } from './components/layout/ImportExportPanel';
import { StepIndicator } from './components/layout/StepIndicator';
import { type Step } from './lib/steps';
import {
  currentStep, switchToGroup, resume as resumeGroup,
  forget as forgetGroupSession, clearSession as clearStoredSession,
} from './lib/groupSessions';
import { FeedbackPanel } from './components/layout/FeedbackPanel';
import { DonatePanel } from './components/layout/DonatePanel';
import { SharePanel } from './components/layout/SharePanel';
import { AccountPanel } from './components/layout/AccountPanel';
import { isSupabaseConfigured, hasAuthCallback, hasStoredSession, linkNotice } from './lib/supabase';
import { authStore } from './lib/auth';
import { startSync } from './lib/sync';
import { startLive } from './lib/liveSession';
import { InstallPanel } from './components/layout/InstallPanel';
import { TourSheet } from './components/tour/TourSheet';
import { TutorialOverlay } from './components/tour/TutorialOverlay';
import {
  OPENER_DELAY_MS, TOUR_COURTS_START, TOUR_COURTS_TARGET, TOUR_ROUNDS_START,
  TOUR_ROUNDS_TARGET, armOpener, backCard, completeTour, dismissComplete, getTourView,
  nextCard, resumeTour, startTour, subscribeTour, tourStartSelection,
} from './lib/tour';
import { InstallBanner } from './components/layout/InstallBanner';
import { SignInBanner } from './components/layout/SignInBanner';
import { UpdateBanner } from './components/layout/UpdateBanner';
import { updateStore, applyUpdate } from './lib/appUpdate';
import { PrintNotice, type PrintProblem } from './components/layout/PrintNotice';
import { printRoute, canSharePdf, sharePdf } from './lib/printing';
import { scheduleToPdf, PDF_FILE_NAME, PDF_TITLE } from './lib/schedulePdf';
import { isStandalone, isIos, installRoute } from './lib/install';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import type { FeedbackKind } from './lib/feedback';
import { APP_VERSION, FEEDBACK_EMAIL, ACCOUNTS_ENABLED, PRIVACY_URL, TERMS_URL } from './lib/appInfo';
import { RosterPage } from './components/roster/RosterPage';
import { GroupPicker } from './components/roster/GroupPicker';
import { SetupPage } from './components/setup/SetupPage';
import { SchedulePage } from './components/schedule/SchedulePage';
import type { ActionsEntry } from './components/schedule/ActionsSheet';
import { DiscardScheduleDialog } from './components/schedule/DiscardScheduleDialog';
import { PrintSchedule } from './components/print/PrintSchedule';

// Shown in the banner on the Players step, and as the settings drawer's heading.
const APP_TITLE = 'Pickleball Round Robin Generator';

function App() {
  const {
    players: allPlayers,
    addPlayer,
    updatePlayer,
    addPlayersToRosters,
    importGroups,
    deletePlayer,
    reassignRoster,
  } = usePlayers();
  const {
    rosters,
    activeRosterId,
    activeRoster,
    setActiveRosterId,
    addRoster,
    renameRoster,
    deleteRoster,
  } = useRosters();

  // Session config state. Every persisted value is declared in lib/stores.ts,
  // which is also where the comment explaining each one lives.
  const [selectedIds, setSelectedIds] = useStoredValue(stores.selectedIds);
  const [partnerships, setPartnerships] = useStoredValue(stores.partnerships);
  const [largeText, setLargeText] = useStoredValue(stores.largeText);
  const [defaultRating, setDefaultRating] = useStoredValue(stores.defaultRating);
  const [numCourts, setNumCourts] = useStoredValue(stores.numCourts);
  const [numRounds, setNumRounds] = useStoredValue(stores.numRounds);
  const [specialTypes, setSpecialTypes] = useStoredValue(stores.specialTypes);
  const [scoringEnabled, setScoringEnabled] = useStoredValue(stores.scoringEnabled);

  // Live session state — persisted so a refresh mid-session doesn't lose the
  // schedule or which rounds have already been played.
  const [schedule, setSchedule] = useStoredValue(stores.schedule);
  const [completedRounds, setCompletedRounds] = useStoredValue(stores.completedRounds);
  const [removedIds, setRemovedIds] = useStoredValue(stores.removedIds);
  const [guests, setGuests] = useStoredValue(stores.guests);
  const [scheduleEdited, setScheduleEdited] = useStoredValue(stores.scheduleEdited);
  const [scheduleRosterId, setScheduleRosterId] = useStoredValue(stores.scheduleRosterId);
  const [, setSessionId] = useStoredValue(stores.sessionId);

  // Both persisted, and both parked with the group being left, so coming back to
  // a group reopens the tab it was left on. Read through currentStep(), which
  // refuses a saved 'schedule' with no schedule under it.
  const [, setStep] = useStoredValue(stores.step);
  const step = currentStep();
  // Setup opens the first time the host reaches it and stays open, so a trip
  // back to Players is never a dead end.
  const [setupSeen, setSetupSeen] = useStoredValue(stores.setupSeen);
  // What the schedule step says it would lose by being left. Reported up from
  // SchedulePage, which owns the locks and broken couples that count towards it.
  const [scheduleHasWork, setScheduleHasWork] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<'setup' | 'roster' | null>(null);
  // Change Groups, opened from the group name in the banner.
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  // Manage Groups. It is drawn by RosterPage and opened by the Manage button on
  // that page, but the state is held up here: the panel that closes the tour
  // offers the same button, and it sits above every page.
  const [showManageGroups, setShowManageGroups] = useState(false);
  /**
   * The Actions sheet: which view is open, and a count that changes on every
   * opening so a sheet mid-flash is replaced rather than reused.
   *
   * Drawn by SchedulePage, held here, because the tour is the only thing that
   * needs all three of opening it, moving a card when it opens, and shutting it
   * again — and the tour is App's.
   */
  const [actionsSheet, setActionsSheet] =
    useState<{ view: ActionsEntry; opened: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /**
   * The picture at the head of the settings drawer, settled on the way in and
   * left alone until the next way in. The drawer is always mounted and takes
   * 300ms to slide away, so anything that changed this on close would change the
   * bird in front of somebody watching it go.
   */
  const [settingsRobin, setSettingsRobin] = useState(PLAIN_ROBIN);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showDefaultRating, setShowDefaultRating] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind | null>(null);
  const [showDonate, setShowDonate] = useState(false);
  const [showShare, setShowShare] = useState(false);
  // Opens by itself when the page load looks like a return trip from the
  // emailed link, so following it lands somewhere that says what happened
  // rather than back on the roster with no sign anything worked.
  // Gated as well as the menu item, or someone returning from a magic link
  // they were emailed earlier would land straight in a panel that is supposed
  // to be switched off.
  const [showAccount, setShowAccount] = useState(() => ACCOUNTS_ENABLED && hasAuthCallback());
  // And what to say once it is open. Held in state rather than read where it is
  // rendered, so closing the panel puts it down for good: it belongs to the
  // arrival that opened this panel, not to every later visit to Sign In.
  const [linkProblem, setLinkProblem] = useState(() =>
    ACCOUNTS_ENABLED ? linkNotice() : null
  );
  // What to do once My Account is closed again, set only when something sent
  // the host there mid-task. A ref rather than state: nothing renders from it,
  // and it must not be lost to the re-render that opening the panel causes.
  const afterAccount = useRef<(() => void) | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [installDismissed, setInstallDismissed] = useStoredValue(stores.installDismissed);
  const [signInDismissed, setSignInDismissed] = useStoredValue(stores.signInDismissed);
  const [swapHintDismissed, setSwapHintDismissed] = useStoredValue(stores.swapHintDismissed);

  const tourView = useSyncExternalStore(subscribeTour, getTourView, getTourView);
  const tour = tourView.card;

  // Not stored, unlike the install dismissal above. There is a new build behind
  // each of these rather than one standing offer, so forgetting the refusal is
  // the right behaviour: the next deploy is entitled to ask again.
  const updateReady = useSyncExternalStore(updateStore.subscribe, updateStore.get) === 'ready';
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const { canPrompt, promptInstall } = useInstallPrompt();

  /**
   * Whether somebody is signed in on this device, for the banner that offers an
   * account to somebody who is not.
   *
   * `hasStoredSession` is a localStorage read and answers straight away, while
   * the store says 'unknown' until the Supabase client has loaded — which for a
   * signed-in host it does, but not before the first paint. Without it the
   * banner would flash on every launch at the one person it is not for.
   */
  const auth = useSyncExternalStore(authStore.subscribe, authStore.get, authStore.get);
  const signedIn = auth.status === 'signed-in' || (auth.status === 'unknown' && hasStoredSession());

  // Read once: it cannot change without a reload, and re-reading per render
  // would run a matchMedia query on every keystroke.
  const [installed, setInstalled] = useState(isStandalone);

  // The one exception to reading it once. A native install lands while this tab
  // is still open and still showing "Add to Home Screen" in the menu, so take
  // the browser's word for it. A listener does not bring back the per-render
  // matchMedia call the read above avoids.
  useEffect(() => {
    function onInstalled() {
      setInstalled(true);
    }
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  // Only ever set by a tap on the printer, and cleared by the next one, so a
  // stale complaint cannot outlive the attempt that caused it.
  const [printProblem, setPrintProblem] = useState<PrintProblem | null>(null);

  // The panel must sit still while it's slid aside, so the settings button stays
  // exactly where the user left it — including after closing a settings dialog.
  // One aggregate, never a second useScrollLock elsewhere: the body is pinned
  // with position:fixed, so a lock taken while another is held reads the scroll
  // offset as zero and releases the page to the top.
  useScrollLock(
    settingsOpen || showInstructions || showDefaultRating || showImportExport ||
    !!feedbackKind || showDonate || showShare || showAccount || showInstall ||
    tourView.phase === 'opener' || tourView.phase === 'complete' ||
    (!!tour && !tour.scrolling)
  );

  // Every step starts at the top. The button that moved you here is often the
  // one at the foot of a long page — Generate Schedule below the player list,
  // Continue to Setup below the roster — and keeping that offset would drop you
  // into the middle of the next step instead of its heading.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  // Before first paint, so a tour interrupted by a relaunch is either back on
  // screen or gone, never flashing on a frame late.
  useLayoutEffect(() => {
    resumeTour(stores.tourStage.get(), currentStep());
  }, []);

  // The card and the tab travel together, which is how Next on the Players card
  // does the same thing as Continue to Setup. Driven off the card moving and
  // never off the tab: that one live button moves the tab itself, and an effect
  // watching the tab would haul it straight back.
  const tourCard = useRef(-1);
  useEffect(() => {
    if (!tour) {
      tourCard.current = -1;
      return;
    }
    if (tour.index === tourCard.current) return;
    tourCard.current = tour.index;
    if (tour.tab !== currentStep()) setStep(tour.tab);
  }, [tour, setStep]);

  /**
   * The greeting, a couple of seconds after a brand new install has opened.
   *
   * Both halves of the gate matter. The stage alone would greet every existing
   * user on their next launch; exampleMeta alone would greet them again after
   * they finished. Together they mean "seeded by this install, and never
   * greeted", which is the only device the offer is honest on — it promises a
   * sample group, and only a seeded device has one.
   *
   * Read straight off the stores rather than through state, and run once: this
   * decides whether to start a timer, and re-running it on every render would
   * start a new one each time.
   */
  useEffect(() => {
    if (stores.tourStage.get() !== 'none' || stores.exampleMeta.get() === null) return;
    const timer = setTimeout(armOpener, OPENER_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Reaching Setup once is what opens its tab, by whichever route.
  useEffect(() => {
    if (step !== 'roster') setSetupSeen(true);
  }, [step, setSetupSeen]);

  // Sync starts itself, or doesn't. It returns immediately when accounts are
  // switched off, unconfigured, or nobody is signed in on this browser, so an
  // ordinary visit still loads no Supabase code and makes no request.
  //
  // startLive() is the same bargain for a session being shared: it does nothing
  // unless this browser left one running, which is what picks a share back up
  // after a reload part way through an afternoon.
  useEffect(() => {
    startSync();
    startLive();
  }, []);

  // The panel opens first on every browser, and offers the OS share sheet from
  // a button inside it. Going straight to the sheet meant the panel only ever
  // appeared on browsers without one, which is almost nobody.
  function handleShare() {
    setShowShare(true);
  }

  /**
   * The one way in and out of the settings drawer.
   *
   * The way in also counts the visit and settles which robin is at the top of
   * it. Only the way in: closing must not count, or the joke would come round
   * twice as fast as the number in robins.ts says.
   */
  function handleToggleSettings() {
    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }
    setSettingsRobin(openedSettings());
    setSettingsOpen(true);
  }

  /**
   * Opens My Account, with somewhere to go back to when it closes.
   *
   * The settings menu hands over nothing: it opened the panel from a standing
   * start, so closing it means the schedule. Share Live Session hands over the
   * way back to its own card, because a host who left to make an account was in
   * the middle of trying to share the session in front of them.
   */
  function openAccount(onReturn?: () => void) {
    afterAccount.current = onReturn ?? null;
    setShowAccount(true);
  }

  function closeAccount() {
    setShowAccount(false);
    setLinkProblem(null);
    const back = afterAccount.current;
    afterAccount.current = null;
    back?.();
  }

  /**
   * A saved session belongs to the group it was built from, and the live slot is
   * supposed to hold the active group's. Anything else is storage written by an
   * older build, so straighten it out before a schedule full of another group's
   * players reaches the screen.
   *
   * Every route that changes groups now goes through switchToGroup, which keeps
   * the two in step, so this only ever fires once on the first launch after the
   * upgrade.
   */
  useEffect(() => {
    if (schedule && scheduleRosterId && scheduleRosterId !== activeRosterId) {
      setActiveRosterId(scheduleRosterId);
    }
    // Boot-time only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Players in the roster currently being worked on
  const rosterPlayers = allPlayers.filter((p) => p.rosterIds.includes(activeRosterId));

  /**
   * Everybody the session may draw on: the group, plus anyone brought along as a
   * guest. Only the schedule sees this. Players and Setup stay on rosterPlayers,
   * so a guest never turns up in the group's own lists.
   */
  // Memoised because several of the session callbacks below depend on it, and a
  // fresh array every render would rebuild all of them every render.
  const sessionPlayers = useMemo(
    () => [...rosterPlayers, ...guests],
    // rosterPlayers is derived from these two on the line above
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allPlayers, activeRosterId, guests]
  );

  // Clean up stale IDs when the roster's membership changes
  useEffect(() => {
    const playerIds = new Set(sessionPlayers.map((p) => p.id));
    setSelectedIds((prev) => {
      const filtered = prev.filter((id) => playerIds.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
    // sessionPlayers is derived; keying on the ids keeps this from looping
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPlayers, guests, activeRosterId, setSelectedIds]);

  // A partnership only makes sense while both members are selected. Whenever the
  // selection shrinks (deselect, roster cleanup), drop any now-invalid couple.
  useEffect(() => {
    const sel = new Set(selectedIds);
    setPartnerships((prev) => {
      const next = prunePartnerships(prev, sel);
      return next.length === prev.length ? prev : next;
    });
  }, [selectedIds, setPartnerships]);

  const togglePlayer = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, [setSelectedIds]);

  const createPartnership = useCallback((id1: string, id2: string) => {
    if (id1 === id2) return;
    setPartnerships((prev) => {
      // Neither player may already be in a partnership.
      const taken = new Set(prev.flatMap((p) => [p.player1Id, p.player2Id]));
      if (taken.has(id1) || taken.has(id2)) return prev;
      return [...prev, { player1Id: id1, player2Id: id2 }];
    });
  }, [setPartnerships]);

  const removePartnership = useCallback((id1: string, id2: string) => {
    setPartnerships((prev) => prev.filter((p) => !arePartners(id1, id2, [p])));
  }, [setPartnerships]);

  /**
   * Every couple broken at once.
   *
   * Emptying the store outright is right rather than heavy-handed: the effect
   * above prunes any partnership whose members are not both selected, so what is
   * stored is always exactly what the Partners panel is showing.
   */
  const clearPartnerships = useCallback(() => {
    setPartnerships([]);
  }, [setPartnerships]);

  const selectAll = useCallback(() => {
    setSelectedIds(rosterPlayers.map((p) => p.id));
  }, [rosterPlayers, setSelectedIds]);

  const deselectAll = useCallback(() => {
    setSelectedIds([]);
  }, [setSelectedIds]);

  // keepSelection is used by "New Round Robin": the same crowd usually plays
  // each time, so the previously chosen players stay selected for the next one.
  // The body lives in groupSessions.ts, which needs the same thing to open a
  // group nobody has set up yet.
  const clearSession = useCallback((keepSelection = false) => {
    clearStoredSession(keepSelection);
  }, []);

  /**
   * Changing groups, from either picker.
   *
   * Nothing is lost and nothing is asked. The group being left is parked whole —
   * its session, its scores, its couples, the tab it was on — and the group
   * being opened is put back exactly as it was.
   */
  const switchGroup = useCallback((id: string) => {
    switchToGroup(id);
    setShowGroupPicker(false);
  }, []);

  const handleDeleteRoster = useCallback(
    (id: string, moveTo: string | null) => {
      reassignRoster(id, moveTo);
      // The parked session goes with the group, and nothing is filed on the way
      // out: there is nowhere left to come back to.
      forgetGroupSession(id);
      const before = activeRosterId;
      deleteRoster(id);
      // Deleting the group that was open moves the active one along, and the
      // live slot is still full of the group that just went. Comparing rather
      // than assuming, because deleteRoster refuses to delete the last group.
      const after = stores.activeRosterId.get();
      if (after !== before) resumeGroup(after);
    },
    [reassignRoster, deleteRoster, activeRosterId]
  );

  /**
   * A second group holding the same people.
   *
   * Nobody is copied. Membership lives on the player as a list of group ids, so
   * duplicating adds one id to everyone who is already in the group, and both
   * lists then show the same players. Editing one of them edits the other,
   * which is the point: the same club night under two names.
   */
  const handleDuplicateRoster = useCallback(
    (id: string, name: string) => {
      const roster = addRoster(name);
      const memberIds = allPlayers.filter((p) => p.rosterIds.includes(id)).map((p) => p.id);
      if (memberIds.length > 0) addPlayersToRosters(memberIds, [roster.id]);
    },
    [addRoster, allPlayers, addPlayersToRosters]
  );

  const updateSpecialType = useCallback(
    (type: RoundType, patch: Partial<SpecialTypeSetting>) => {
      setSpecialTypes((prev) =>
        normalizeSpecialTypes({ ...prev, [type]: { ...prev[type], ...patch } })
      );
    },
    [setSpecialTypes]
  );

  // Where the host puts a type in the panel decides which of two that both fall
  // due on the same round gets it.
  const moveSpecialType = useCallback(
    (type: RoundType, direction: -1 | 1) => {
      setSpecialTypes((prev) => moveType(prev, type, direction));
    },
    [setSpecialTypes]
  );

  /**
   * Everything the tour changes about the app, in one place.
   *
   * The tour asks the host to do two things that need something to be wrong
   * first: put the courts and rounds up to three and ten, and finish a half-made
   * selection with Select All. So Continue sets both numbers below the ask and
   * unticks four people. All of it is ordinary app state afterwards — there is
   * no tour mode, and whatever they end the tour with is what they carry on
   * with.
   */
  const handleTourStart = useCallback(() => {
    setNumCourts(TOUR_COURTS_START);
    setNumRounds(TOUR_ROUNDS_START);
    setSelectedIds(tourStartSelection(rosterPlayers));
    startTour();
  }, [rosterPlayers, setNumCourts, setNumRounds, setSelectedIds]);

  /**
   * Next, plus whatever this particular card promised would happen.
   *
   * The courts card says "set the Number of Courts to 3 and Rounds to 10", and
   * the host may well have pressed a stepper the wrong way or not at all. Next
   * makes the sentence true either way, so the schedule they build a card later
   * is the one the tour has been describing.
   */
  const handleTourNext = useCallback(() => {
    if (tour?.id === 'courts-rounds') {
      setNumCourts(TOUR_COURTS_TARGET);
      setNumRounds(TOUR_ROUNDS_TARGET);
    }
    nextCard();
  }, [tour, setNumCourts, setNumRounds]);

  /**
   * Back, plus whatever this card has to put back the way it found it.
   *
   * Only the last one has anything: it is drawn over the Actions sheet, and the
   * card behind it is the card that says to press Actions. Leaving the sheet up
   * would show that instruction over the panel the button already opened.
   */
  const handleTourBack = useCallback(() => {
    if (tour?.id === 'new-round-robin') setActionsSheet(null);
    backCard();
  }, [tour]);

  /**
   * The Actions sheet opening, from the button or from a return trip through My
   * Account.
   *
   * The tour's Actions card moves on from in here rather than by listening for
   * the press, which means a press that did not open the sheet cannot advance
   * the card either.
   */
  const handleOpenActions = useCallback((view: ActionsEntry) => {
    setActionsSheet((prev) => ({ view, opened: (prev?.opened ?? 0) + 1 }));
    if (tour?.id === 'actions') nextCard();
  }, [tour]);

  // Setup's Generate: a brand new schedule, starting the session over.
  const handleGenerate = useCallback(() => {
    const attending = rosterPlayers.filter((p) => selectedIds.includes(p.id));
    if (attending.length < 4) return;
    const activePartnerships = prunePartnerships(
      partnerships, new Set(attending.map((p) => p.id))
    );
    setSchedule(
      generateSchedule(
        attending, numCourts, numRounds, specialTypes, activePartnerships
      )
    );
    // A fresh schedule starts over: nothing played, nobody gone, nothing hand-edited
    setCompletedRounds([]);
    setRemovedIds([]);
    setScheduleEdited(false);
    setScheduleRosterId(activeRosterId);
    // Nothing reads this yet. A session gets its name here so that sharing one
    // already under way has a key to hand rather than minting one halfway.
    setSessionId(generateId());
    setStep('schedule');
    // Here rather than on the button, so a press that did not build anything —
    // too few ticked for the courts — leaves the card where it was, with the
    // error underneath it saying why.
    if (tour?.id === 'select-players') nextCard();
  }, [rosterPlayers, selectedIds, partnerships, numCourts, numRounds, specialTypes,
      activeRosterId, tour, setSchedule, setCompletedRounds, setRemovedIds,
      setScheduleEdited, setScheduleRosterId, setSessionId, setStep]);

  const attendingPlayers = sessionPlayers.filter(
    (p) => selectedIds.includes(p.id) && !removedIds.includes(p.id)
  );

  /**
   * The printer button. Everywhere but an installed iOS app this is one call to
   * the browser, unchanged from the day it was written.
   *
   * There the schedule is turned into a PDF and handed to the OS share sheet,
   * which lists Print. Both of those steps run inside the tap on purpose: iOS
   * only opens the sheet during a live gesture, so building the document has to
   * finish before the call rather than be awaited around it.
   */
  const handlePrint = useCallback(() => {
    setPrintProblem(null);
    const route = printRoute({
      standalone: installed,
      ios: isIos(),
      canShareFiles: canSharePdf(),
    });

    if (route === 'dialog') {
      window.print();
      return;
    }
    if (route === 'blocked') {
      setPrintProblem('blocked');
      return;
    }
    if (!schedule) return;

    const file = new File([scheduleToPdf(schedule, attendingPlayers)], PDF_FILE_NAME, {
      type: 'application/pdf',
    });
    void sharePdf(file, PDF_TITLE).then((outcome) => {
      // Closing the sheet is an answer, so only a sheet that never opened is
      // worth saying anything about.
      if (outcome === 'failed' || outcome === 'unsupported') setPrintProblem('failed');
    });
  }, [installed, schedule, attendingPlayers]);

  // Removes a player from every round that isn't marked complete and rebuilds
  // those rounds around the smaller group. Completed rounds — any subset — are
  // kept verbatim.
  const handleRemovePlayer = useCallback((playerId: string) => {
    if (!schedule) return;
    const remaining = attendingPlayers.filter((p) => p.id !== playerId);
    if (remaining.length < 4) return;

    const activePartnerships = prunePartnerships(
      partnerships, new Set(remaining.map((p) => p.id))
    );
    // The rebuilt rounds come back numbered from 1 again, and the court a group
    // is standing on has not moved because somebody went home.
    setSchedule({
      rounds: carryCourtNumbers(
        schedule.rounds,
        regenerateRemaining(
          remaining, numCourts, schedule.rounds, completedRounds,
          specialTypes, activePartnerships
        ).rounds
      ),
    });
    setRemovedIds((prev) => [...prev, playerId]);
    setScheduleEdited(true);
  }, [schedule, attendingPlayers, partnerships, completedRounds, numCourts, specialTypes,
      setSchedule, setRemovedIds, setScheduleEdited]);

  // Reshuffle rebuilds only the rounds still to be played. Rounds already marked
  // complete stay exactly as they were played, and their pairings are replayed
  // into the history so the rebuild carries on from them rather than starting
  // over. Players removed earlier stay removed.
  const handleReshuffle = useCallback((
    locks: Record<number, LockedPair[]>,
    brokenPairs: Record<number, string[]>
  ) => {
    if (!schedule) return;
    if (attendingPlayers.length < 4) return;

    const activePartnerships = prunePartnerships(
      partnerships, new Set(attendingPlayers.map((p) => p.id))
    );
    // Reshuffling changes who plays where, not what the courts are called.
    setSchedule({
      rounds: carryCourtNumbers(
        schedule.rounds,
        regenerateRemaining(
          attendingPlayers, numCourts, schedule.rounds, completedRounds,
          specialTypes, activePartnerships, locks, brokenPairs
        ).rounds
      ),
    });
    // The remaining rounds are machine-built again, so swaps are gone — but a
    // removal is still work that going back to Setup would throw away.
    setScheduleEdited(removedIds.length > 0);
  }, [schedule, attendingPlayers, partnerships, completedRounds, numCourts, specialTypes,
      removedIds, setSchedule, setScheduleEdited]);

  // Brings a latecomer into a session already under way. They land in the
  // sit-outs of every unplayed round, leaving those rounds' courts alone; the
  // host swaps them in, or reshuffles to have them mixed through properly.
  const handleAddPlayer = useCallback((playerId: string) => {
    if (!schedule) return;
    const player = sessionPlayers.find((p) => p.id === playerId);
    if (!player) return;

    setSchedule({
      rounds: addToRemainingRounds(schedule.rounds, completedRounds, player),
    });
    // Selection is what a later reshuffle draws from, and clearing the removal
    // is what lets someone who left earlier rejoin.
    setSelectedIds((prev) => (prev.includes(playerId) ? prev : [...prev, playerId]));
    setRemovedIds((prev) => prev.filter((id) => id !== playerId));
    setScheduleEdited(true);
  }, [schedule, sessionPlayers, completedRounds, setSchedule, setSelectedIds, setRemovedIds,
      setScheduleEdited]);

  // Somebody nobody has met before. They join the group as well as the session,
  // because a player who turns up once usually turns up again.
  const handleCreatePlayer = useCallback(
    (name: string, rating: number, gender: Gender) => {
      const player = addPlayer(name, rating, gender, [activeRosterId]);
      if (!schedule) return;
      setSchedule({
        rounds: addToRemainingRounds(schedule.rounds, completedRounds, player),
      });
      setSelectedIds((prev) => [...prev, player.id]);
      setScheduleEdited(true);
    },
    [addPlayer, activeRosterId, schedule, completedRounds, setSchedule, setSelectedIds,
     setScheduleEdited]
  );

  // A guest plays today and is never saved to the group. See stores.guests for
  // why they are kept apart from the player pool rather than flagged inside it.
  const handleAddGuest = useCallback(
    (name: string, rating: number, gender: Gender) => {
      if (!schedule) return;
      const guest: Player = {
        id: generateId(), name, rating, gender, rosterIds: [], guest: true,
      };
      setGuests((prev) => [...prev, guest]);
      setSchedule({
        rounds: addToRemainingRounds(schedule.rounds, completedRounds, guest),
      });
      setSelectedIds((prev) => [...prev, guest.id]);
      setScheduleEdited(true);
    },
    [schedule, completedRounds, setGuests, setSchedule, setSelectedIds, setScheduleEdited]
  );

  /**
   * One player stands in for another for the rest of the session.
   *
   * The substitute takes the games the player going off was down for, rather
   * than the rounds being rebuilt around the change. Somebody arriving to cover
   * for a twisted ankle plays where the ankle was playing.
   *
   * The player going off leaves the selection rather than joining removedIds.
   * Both take them out of the session, but a removal locks the Completed
   * checkboxes for good, and it locks them because a removal rebuilds the
   * remaining rounds. This does not, so it has no business locking anything.
   */
  const handleSubstitute = useCallback(
    (outgoingId: string, incomingId: string) => {
      if (!schedule) return;
      const incoming = sessionPlayers.find((p) => p.id === incomingId);
      if (!incoming) return;

      setSchedule({
        rounds: replacePlayerInRounds(schedule.rounds, outgoingId, incoming, completedRounds),
      });
      setSelectedIds((prev) => [...prev.filter((id) => id !== outgoingId), incomingId]);
      setRemovedIds((prev) => prev.filter((id) => id !== incomingId));
      setScheduleEdited(true);
    },
    [schedule, sessionPlayers, completedRounds, setSchedule, setSelectedIds, setRemovedIds,
     setScheduleEdited]
  );

  /**
   * Something about a player corrected mid-session. It is saved against them, so
   * it holds for next week too.
   *
   * The schedule holds copies of the players in it, so the change is written
   * through every round including the ones already played. A person has one name
   * and one rating, and two of either on one page would only be read as a bug.
   * Nobody moves court: the balance badges are recalculated and that is all.
   *
   * A guest lives in its own list rather than the pool, which is the only reason
   * there are two branches here.
   */
  const handleEditPlayerDetails = useCallback(
    (playerId: string, patch: Partial<Pick<Player, 'name' | 'rating' | 'gender'>>) => {
      const guest = guests.find((p) => p.id === playerId);
      if (guest) setGuests((prev) => prev.map((p) => (p.id === playerId ? { ...p, ...patch } : p)));
      else updatePlayer(playerId, patch);

      if (!schedule) return;
      const player = sessionPlayers.find((p) => p.id === playerId);
      if (!player) return;
      // Straight to the store, not through handleUpdateSchedule: the change is
      // saved on the player either way, so this is not work at stake.
      setSchedule({
        rounds: replacePlayerInRounds(schedule.rounds, playerId, { ...player, ...patch }),
      });
    },
    [guests, setGuests, updatePlayer, schedule, sessionPlayers, setSchedule]
  );

  /**
   * Name, rating and gender together, from the edit button on a place.
   *
   * Changing somebody's gender on a Gendered or Mixed round does not rebuild it.
   * The round says what it was built as, and the printed sheet quietly picks up
   * the "(normal game)" note if that court no longer fits the format — which is
   * the truth, and better than moving four people because one of them was typed
   * in wrong.
   */
  const handleEditPlayer = useCallback(
    (playerId: string, name: string, rating: number, gender: Gender) =>
      handleEditPlayerDetails(playerId, { name, rating, gender }),
    [handleEditPlayerDetails]
  );

  // A court arriving or leaving mid-session. Both edit the rounds still to be
  // played and move numCourts with them, because numCourts is what the next
  // reshuffle builds from — leave it behind and the first reshuffle after a
  // court is added would quietly take it away again.
  const handleAddCourt = useCallback(() => {
    if (!schedule) return;
    const activePartnerships = prunePartnerships(
      partnerships, new Set(attendingPlayers.map((p) => p.id))
    );
    setSchedule({
      rounds: addCourtToRemaining(schedule.rounds, completedRounds, activePartnerships),
    });
    setNumCourts(numCourts + 1);
    setScheduleEdited(true);
  }, [schedule, partnerships, attendingPlayers, completedRounds, numCourts, setNumCourts,
      setSchedule, setScheduleEdited]);

  const handleRemoveCourt = useCallback((courtNumber: number) => {
    if (!schedule) return;
    setSchedule({
      rounds: removeCourtFromRemaining(schedule.rounds, completedRounds, courtNumber),
    });
    setNumCourts(Math.max(1, numCourts - 1));
    setScheduleEdited(true);
  }, [schedule, completedRounds, numCourts, setNumCourts, setSchedule, setScheduleEdited]);

  // More rounds on the end. The ones already there do not move, and the new ones
  // are built around them rather than from scratch.
  const handleAddRounds = useCallback((count: number) => {
    if (!schedule) return;
    if (attendingPlayers.length < 4) return;
    const activePartnerships = prunePartnerships(
      partnerships, new Set(attendingPlayers.map((p) => p.id))
    );
    setSchedule(
      extendSchedule(
        attendingPlayers, numCourts, schedule.rounds, count, specialTypes, activePartnerships
      )
    );
    setNumRounds(numRounds + count);
  }, [schedule, attendingPlayers, partnerships, numCourts, numRounds, specialTypes,
      setNumRounds, setSchedule]);

  // Players who aren't in this session yet — including anyone removed from it
  // earlier or subbed off, since a player who left may well come back, and a
  // guest who has been taken off is still standing there.
  const addablePlayers = sessionPlayers.filter(
    (p) => !attendingPlayers.some((a) => a.id === p.id)
  );

  // Swaps made by tapping two players. Separate from setSchedule so only host
  // edits mark the schedule dirty — generation and reshuffles reset the flag.
  const handleUpdateSchedule = useCallback((next: Schedule) => {
    setSchedule(next);
    setScheduleEdited(true);
  }, [setSchedule, setScheduleEdited]);

  const handleExportGroup = useCallback(
    (rosterId: string) => {
      // Every group in one file — a backup, or the way onto a new device.
      if (rosterId === ALL_GROUPS) {
        const groups = rosters.map((r) => ({
          name: r.name,
          players: allPlayers.filter((p) => p.rosterIds.includes(r.id)),
        }));
        downloadTextFile(toAllGroupsFileName(new Date()), toGroupsCsv(groups));
        return;
      }

      const roster = rosters.find((r) => r.id === rosterId);
      if (!roster) return;
      const members = allPlayers.filter((p) => p.rosterIds.includes(rosterId));
      downloadTextFile(toFileName(roster.name), toCsv(roster.name, members));
    },
    [rosters, allPlayers]
  );

  // Always builds a new group rather than merging into an existing one — a merge
  // that silently changed a group you were about to play would be far worse than
  // an extra group you can delete.
  const handleImportGroup = useCallback(
    async (file: File): Promise<ImportResult> => {
      let text: string;
      try {
        text = await file.text();
      } catch {
        return { ok: false, title: "Couldn't read that file.", details: [] };
      }

      const parsed = parseGroupsCsv(text, fileNameStem(file.name), defaultRating);
      const usable = parsed.filter((g) => g.rows.length > 0);
      if (usable.length === 0) {
        return {
          ok: false,
          title: 'No players found in that file.',
          details: ['Expected a CSV with Name, Rating and Gender columns.'],
        };
      }

      // Names are claimed as we go: uniqueGroupName reads the rosters in state,
      // which won't have caught up mid-loop, so two same-named groups in one
      // file would otherwise both land on "Tuesday (1)".
      const taken = rosters.map((r) => r.name);
      const renamed: { desired: string; name: string }[] = [];
      const created = usable.map((group) => {
        const desired = group.group.trim();
        const name = uniqueGroupName(desired, taken);
        taken.push(name);
        if (name !== desired) renamed.push({ desired, name });
        return { group, name, roster: addRoster(name) };
      });

      // One write for the whole file, so a player in several groups is linked
      // into each rather than re-created per group.
      const counts = importGroups(
        created.map(({ group, roster }) => ({ rosterId: roster.id, rows: group.rows }))
      );

      const skipped = usable.reduce((sum, g) => sum + g.skipped, 0);
      const details: string[] = [];
      const multi = created.length > 1;

      if (multi) {
        for (const [i, { group, name }] of created.entries()) {
          const n = group.rows.length;
          details.push(`${name} — ${n} player${n === 1 ? '' : 's'}${
            counts[i].linked > 0 ? `, ${counts[i].linked} already on this device` : ''
          }.`);
        }
        for (const { desired, name } of renamed) {
          details.push(`"${desired}" already existed, so it came in as "${name}".`);
        }
      } else {
        const { added, linked } = counts[0];
        if (renamed.length > 0) {
          details.push(
            `A group called "${renamed[0].desired}" already existed, so this one is "${renamed[0].name}".`
          );
        }
        // "Added" was the wrong word beside the line under it: everybody in the
        // file was added to the group, and this number is the ones who did not
        // exist until now. "0 players added" on an import that worked read as
        // nothing having happened.
        details.push(`${added} new player${added === 1 ? '' : 's'} created.`);
        if (linked > 0) {
          details.push(
            `${linked} player${linked === 1 ? '' : 's'} already existed and ${
              linked === 1 ? 'was' : 'were'
            } added to this group.`
          );
        }
      }

      if (skipped > 0) {
        details.push(`${skipped} row${skipped === 1 ? '' : 's'} skipped.`);
      }

      // Straight into the group that just arrived. A session already running is
      // parked under its own group on the way, so there is nothing to warn about
      // and nothing to come back for.
      switchToGroup(created[0].roster.id);

      const title = multi
        ? `${created.length} groups imported.`
        : `"${created[0].name}" created.`;
      return { ok: true, title, details };
    },
    [rosters, defaultRating, addRoster, importGroups]
  );

  const handleStartNewSession = useCallback(() => {
    clearSession(true); // keep the selected players for the next session
    setStep('roster');
    // The tour's last card ends here, on the Players tab, having just done the
    // thing it was describing. The closing panel comes up over it.
    if (tour?.id === 'new-round-robin') completeTour();
  }, [clearSession, setStep, tour]);

  // Which tabs are doors. Schedule is never one: the only way onto it is
  // Generate, which builds a new schedule rather than returning to the old one.
  const availableSteps: Step[] = [];
  if (step !== 'roster') availableSteps.push('roster');
  if (step !== 'setup' && setupSeen) availableSteps.push('setup');

  /**
   * The tabs are the only way back out of a schedule, so this is where the
   * question gets asked. Off the schedule there is nothing to lose and nothing
   * to ask: that is the move Continue to Setup already makes.
   */
  const handleStepNav = useCallback(
    (target: Step) => {
      if (step !== 'schedule') {
        setStep(target);
        return;
      }
      if (target === 'schedule') return;
      if (scheduleHasWork) {
        setPendingLeave(target);
        return;
      }
      // Nothing to lose, so no question. Players still means starting over, as
      // it does from the New Session button beside it.
      if (target === 'setup') setStep('setup');
      else handleStartNewSession();
    },
    [step, scheduleHasWork, handleStartNewSession, setStep]
  );

  // Both banners wait for a roster worth keeping. Four players is a group
  // somebody has typed in by hand, and the first point at which losing it would
  // actually cost them an evening.
  //
  // Neither is offered during the tour. The Sample Group clears the bar on its
  // own, so a brand new install would otherwise meet its first card with a
  // coloured bar above it, pushing Continue to Setup down a page that is locked
  // and cannot be scrolled to reach it.
  const worthKeeping = rosterPlayers.length >= 4 && tourView.phase === 'off';
  const offerInstall =
    !installed && !installDismissed && worthKeeping && installRoute({ canPrompt }) !== 'manual';
  const offerSignIn =
    ACCOUNTS_ENABLED && isSupabaseConfigured() && !signInDismissed && !signedIn && worthKeeping;

  return (
    <div
      className={`app-shell relative min-h-screen overflow-x-hidden bg-gray-800 ${
        largeText ? 'text-large' : ''
      }`}
    >
      <SettingsPanel
        open={settingsOpen}
        robin={settingsRobin}
        onShare={handleShare}
        onOpenAccount={() => openAccount()}
        showAccountItem={ACCOUNTS_ENABLED && isSupabaseConfigured()}
        signedIn={signedIn}
        onOpenInstall={() => setShowInstall(true)}
        showInstallItem={!installed}
        onToggleLargeText={() => setLargeText((v) => !v)}
        onOpenDefaultRating={() => setShowDefaultRating(true)}
        onOpenImportExport={() => setShowImportExport(true)}
        onOpenInstructions={() => setShowInstructions(true)}
        onOpenDonate={() => setShowDonate(true)}
        onOpenFeature={() => setFeedbackKind('feature')}
        onOpenBug={() => setFeedbackKind('bug')}
      />

      {/* The whole app rides on this panel. Opening settings slides it left far
          enough to leave a fifth of it — including the settings button — on screen. */}
      <div
        className={`app-panel relative z-10 min-h-screen bg-gray-50 transition-transform duration-300 ease-in-out ${
          settingsOpen ? '-translate-x-[80%] shadow-2xl shadow-black/50' : ''
        }`}
      >
      {/* With the drawer open the whole panel is a way back out, including the
          strip of it still on screen. It covers the panel rather than sitting
          beside it, so the sliver over the settings button closes the drawer
          too, which is what pressing the button there already did.

          Hidden from screen readers: the button underneath is still in the tab
          order and still says Close settings, so there is nothing here for them
          that they do not already have. */}
      {settingsOpen && (
        <div
          className="absolute inset-0 z-30"
          onClick={() => setSettingsOpen(false)}
          aria-hidden="true"
        />
      )}
      <Header
        // Past the roster step the group being worked on is the useful label
        title={step === 'roster' ? APP_TITLE : activeRoster?.name ?? APP_TITLE}
        // And there it is also the way to another group. The roster step has the
        // My Groups panel a little way down the page, so it needs no chevron.
        onTitleClick={step === 'roster' ? undefined : () => setShowGroupPicker(true)}
        settingsOpen={settingsOpen}
        onToggleSettings={handleToggleSettings}
        // Only the Schedule step has something worth printing
        onPrint={step === 'schedule' ? handlePrint : undefined}
      />
      {/* Lifted out of `main` and held just under the banner. The `mt-4` is the
          same 16px as `main`'s own `pt-4` below, so the tab row sits in equal
          air on both sides rather than being crowded up against the artwork. It
          has to sit outside `main` because the banners below can come and go,
          and the tabs must stay against the header rather than being pushed off
          it by a notice. */}
      <div className="relative z-20 mx-auto mt-4 max-w-5xl px-2">
        <StepIndicator
          current={step}
          available={availableSteps}
          onNavigate={handleStepNav}
        />
      </div>
      {/* Narrow side margins on purpose: every pixel across is a pixel the
          roster table and the court grid can use on a phone. */}
      <main className="max-w-5xl mx-auto px-2 pt-4 pb-6 space-y-4">
        {/* On every step, not just this one. A new build is worth a moment
            wherever somebody happens to be, and the alternative is holding it
            back until they navigate somewhere they may never go. */}
        {updateReady && !updateDismissed && (
          <UpdateBanner onReload={applyUpdate} onDismiss={() => setUpdateDismissed(true)} />
        )}

        {/* Above the schedule rather than beside the button, because the header
            has no room on a phone and this needs a whole sentence. */}
        {printProblem && (
          <PrintNotice reason={printProblem} onDismiss={() => setPrintProblem(null)} />
        )}

        {/* Held back until there's a real roster worth keeping. The route check
            matters: browsers with no install path at all (desktop Firefox) must
            never be offered one. */}
        {offerInstall && (
          <InstallBanner
            onOpen={() => setShowInstall(true)}
            onDismiss={() => setInstallDismissed(true)}
          />
        )}

        {/* One ask at a time. Both banners want the same 4-player roster, and
            two coloured bars above every step is a page that nags. Install goes
            first: it is the smaller favour and it was here already. */}
        {!offerInstall && offerSignIn && (
          <SignInBanner
            onOpen={() => openAccount()}
            onDismiss={() => setSignInDismissed(true)}
          />
        )}

        {step === 'roster' && (
          <RosterPage
            allPlayers={allPlayers}
            players={rosterPlayers}
            rosters={rosters}
            activeRosterId={activeRosterId}
            onSelectRoster={switchGroup}
            onAddRoster={addRoster}
            onRenameRoster={renameRoster}
            onDeleteRoster={handleDeleteRoster}
            onDuplicateRoster={handleDuplicateRoster}
            onAdd={addPlayer}
            onUpdate={updatePlayer}
            onAddPlayersToRosters={addPlayersToRosters}
            onDeletePlayer={deletePlayer}
            onContinue={() => {
              setStep('setup');
              // The tour's first card hands this button over rather than
              // offering a Next of its own, so the press has to move it.
              if (tour?.id === 'players') nextCard();
            }}
            manageOpen={showManageGroups}
            onManageOpenChange={setShowManageGroups}
            defaultRating={defaultRating}
          />
        )}

        {step === 'setup' && (
          <SetupPage
            players={rosterPlayers}
            selectedIds={selectedIds}
            partnerships={partnerships}
            numCourts={numCourts}
            numRounds={numRounds}
            specialTypes={specialTypes}
            scoringEnabled={scoringEnabled}
            onScoringChange={setScoringEnabled}
            onTogglePlayer={togglePlayer}
            onSelectAll={selectAll}
            onDeselectAll={deselectAll}
            onCreatePartnership={createPartnership}
            onRemovePartnership={removePartnership}
            onClearPartnerships={clearPartnerships}
            onCourtsChange={setNumCourts}
            onRoundsChange={setNumRounds}
            onSpecialTypeChange={updateSpecialType}
            onSpecialTypeMove={moveSpecialType}
            onGenerate={() => handleGenerate()}
          />
        )}

        {step === 'schedule' && schedule && (
          <SchedulePage
            schedule={schedule}
            players={attendingPlayers}
            partnerships={partnerships}
            numCourts={numCourts}
            completedRounds={completedRounds}
            // Re-adding the last removed player empties this and so re-enables
            // the Completed checkboxes, even though those rounds were rebuilt
            // around the removal. Narrow enough to live with.
            canUncomplete={removedIds.length === 0}
            onRegenerate={handleReshuffle}
            scheduleEdited={scheduleEdited}
            onUpdateSchedule={handleUpdateSchedule}
            onCompletedRoundsChange={setCompletedRounds}
            onRemovePlayer={handleRemovePlayer}
            onEditPlayer={handleEditPlayer}
            onUnsavedWorkChange={setScheduleHasWork}
            showSwapHint={!swapHintDismissed && !tour}
            hideSeatEdit={!!tour}
            actionsSheet={actionsSheet}
            onOpenActions={handleOpenActions}
            onCloseActions={() => setActionsSheet(null)}
            confirmNewSession={tour?.id !== 'new-round-robin'}
            onDismissSwapHint={() => setSwapHintDismissed(true)}
            addablePlayers={addablePlayers}
            defaultRating={defaultRating}
            scoringEnabled={scoringEnabled}
            onOpenAccount={openAccount}
            actions={{
              onStartNewSession: handleStartNewSession,
              onAddPlayer: handleAddPlayer,
              onCreatePlayer: handleCreatePlayer,
              onAddGuest: handleAddGuest,
              onSubstitute: handleSubstitute,
              onAddCourt: handleAddCourt,
              onRemoveCourt: handleRemoveCourt,
              onAddRounds: handleAddRounds,
            }}
          />
        )}
      </main>

      {/* Raised here rather than in SchedulePage because leaving is App's
          decision, not the page's. SchedulePage takes its local locks and
          broken couples with it when it unmounts. */}
      {pendingLeave === 'setup' && (
        <DiscardScheduleDialog
          heading="Back to Setup?"
          cancelLabel="Cancel"
          confirmLabel="Go to Setup"
          onConfirm={() => {
            setPendingLeave(null);
            setStep('setup');
          }}
          onCancel={() => setPendingLeave(null)}
        />
      )}

      {pendingLeave === 'roster' && (
        <DiscardScheduleDialog
          heading="Back to Players?"
          cancelLabel="Cancel"
          confirmLabel="Go to Players"
          onConfirm={() => {
            setPendingLeave(null);
            handleStartNewSession();
          }}
          onCancel={() => setPendingLeave(null)}
        />
      )}

      {/* Change Groups. The same panel the Players tab opens, under its own
          heading, because from here it is a move rather than a setting. */}
      {showGroupPicker && (
        <GroupPicker
          heading="Change Groups"
          groups={rosters}
          players={allPlayers}
          activeId={activeRosterId}
          onSelect={switchGroup}
          onClose={() => setShowGroupPicker(false)}
        />
      )}

      <footer className="text-center text-xs text-gray-400 pt-6 no-print" style={{ paddingBottom: 40 }}>
        <div>Created by Jeff Baker &ndash; {FEEDBACK_EMAIL} &middot; v{APP_VERSION}</div>
        {/* Every page of the app ends here, so these are the two links that are
            always in reach. They travel as a pair; a store listing asks for
            both. */}
        <div className="mt-1">
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-gray-600"
          >
            Privacy Policy
          </a>
          <span className="mx-2">&middot;</span>
          <a
            href={TERMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-gray-600"
          >
            Terms of Service
          </a>
        </div>
      </footer>
      </div>

      {showInstructions && (
        <InstructionsPanel onClose={() => setShowInstructions(false)} />
      )}

      {showShare && <SharePanel onClose={() => setShowShare(false)} />}

      {showAccount && <AccountPanel onClose={closeAccount} notice={linkProblem} />}

      {showInstall && (
        <InstallPanel
          canPrompt={canPrompt}
          onInstall={async () => {
            await promptInstall();
            setShowInstall(false);
          }}
          onClose={() => setShowInstall(false)}
        />
      )}

      {showDonate && <DonatePanel onClose={() => setShowDonate(false)} />}

      {feedbackKind && (
        <FeedbackPanel
          kind={feedbackKind}
          context={{
            version: APP_VERSION,
            groups: rosters.length,
            players: allPlayers.length,
            sessionActive: Boolean(schedule),
            courts: numCourts,
            rounds: numRounds,
            largeText,
            userAgent: navigator.userAgent,
            screen: `${window.innerWidth}x${window.innerHeight}`,
            language: navigator.language,
          }}
          onClose={() => setFeedbackKind(null)}
        />
      )}

      {showImportExport && (
        <ImportExportPanel
          rosters={rosters}
          players={allPlayers}
          activeRosterId={activeRosterId}
          onExport={handleExportGroup}
          onImport={handleImportGroup}
          onClose={() => setShowImportExport(false)}
        />
      )}

      {showDefaultRating && (
        <DefaultRatingPanel
          rating={defaultRating}
          onChange={setDefaultRating}
          onClose={() => setShowDefaultRating(false)}
        />
      )}

      {/* Last of the overlays, after every panel, so the tour paints above
          anything already open. Outside `.app-panel` for a harder reason: that
          element takes a transform when the drawer slides, and a transformed
          ancestor becomes the containing block for its fixed children, which
          would carry the spotlight off the screen with it. */}
      {tourView.phase === 'opener' && (
        <TourSheet title="Quick Start Tutorial" buttonLabel="Continue" onPress={handleTourStart}>
          <p>Let&rsquo;s create your first round robin!</p>
        </TourSheet>
      )}
      {tour && (
        <TutorialOverlay view={tour} onNext={handleTourNext} onBack={handleTourBack} />
      )}
      {tourView.phase === 'complete' && (
        <TourSheet title="Tutorial Complete!" buttonLabel="Done" onPress={dismissComplete}>
          <p>
            You&rsquo;re ready to create your first group, add players, and create your
            own round robins.
          </p>
          {/* The one thing the tour never showed them, offered rather than
              described: the sentence says where the button is on the page they
              are about to be standing on, and the button beside it is the same
              button, so they can take either.

              In the app's orange alert, the same box the Reshuffle warning
              wears. It is the one line on this panel with something to do in
              it, and between two paragraphs of well done it would otherwise
              read as more of the same. */}
          <div className="flex items-center justify-between gap-3 rounded-lg border-2 border-brand-orange bg-brand-orange-light p-3 text-left">
            {/* A size down from the paragraphs either side of it. The button
                takes 85px out of the width, and at the panel's own size the
                sentence ran to three lines with one word alone on the last. */}
            <p className="text-base">
              {/* Held on one line. It is the name of the panel they are being
                  sent to, and bold type broken across two lines reads as two
                  things rather than one. */}
              Click <strong>Manage</strong> under{' '}
              <strong className="whitespace-nowrap">My Groups</strong> to add groups.
            </p>
            <button
              type="button"
              onClick={() => {
                dismissComplete();
                setShowManageGroups(true);
              }}
              className="flex shrink-0 items-center justify-center min-h-10 px-4 py-1.5 bg-brand-orange text-white rounded-md hover:bg-brand-orange-dark transition-colors text-sm font-medium"
            >
              Manage
            </button>
          </div>
          {/* One paragraph, two lines. They are a single sign-off and belong in
              the same block, but each is its own thought and reads better with
              the break. */}
          <p>
            Have fun playing pickleball!
            <br />
            And thanks for being an organizer.
          </p>
        </TourSheet>
      )}

      {/* Outside the sliding panel so a print started from the drawer is never
          caught mid-slide. */}
      <PrintSchedule schedule={schedule} players={attendingPlayers} />
    </div>
  );
}

export default App;
