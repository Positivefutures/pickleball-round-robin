import {
  useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore,
} from 'react';
import type { Gender, Player, Schedule, LockedPair, RoundPlan, RoundType } from './types';
import { usePlayers } from './hooks/usePlayers';
import { useRosters } from './hooks/useRosters';
import { useStoredValue } from './hooks/useStoredValue';
import { useScrollLock } from './hooks/useScrollLock';
import { appScrollTo } from './lib/appScroll';
import * as stores from './lib/stores';
import { extendSchedule, generateSchedule, regenerateRemaining } from './lib/pairing';
import { addToRemainingRounds, replacePlayerInRounds } from './lib/sitout';
import { addCourtToRemaining, removeCourtFromRemaining } from './lib/courts';
import { carryCourtNumbers } from './lib/courtNumbers';
import { generateId } from './utils/helpers';
import {
  prunePartnerships, arePartners, withSubbedPairs, transferPartnership,
} from './lib/partnerships';
import { basisKey, scheduleIsStale } from './lib/scheduleBasis';
import { normalizeRoundPlan, setPlanType, unplayedChanged } from './lib/roundPlan';
import { PLAIN_ROBIN, openedSettings, warmRobin } from './lib/robins';
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
import { type Step, stepName } from './lib/steps';
import {
  currentStep, switchToGroup, resume as resumeGroup,
  forget as forgetGroupSession, clearSession as clearStoredSession,
} from './lib/groupSessions';
import { FeedbackPanel } from './components/layout/FeedbackPanel';
import { DonatePanel } from './components/layout/DonatePanel';
import { SharePanel } from './components/layout/SharePanel';
import { AccountPanel } from './components/layout/AccountPanel';
import { isSupabaseConfigured, hasAuthCallback, hasStoredSession, linkNotice } from './lib/supabase';
import { authStore, dismissPendingSignIn, signInInterrupted } from './lib/auth';
import { startSync } from './lib/sync';
import { startLive } from './lib/liveSession';
import { startRoundTimerWatchdog, clearRoundTimerForNewSchedule } from './lib/roundTimer';
import { RoundTimerPanel } from './components/schedule/RoundTimerPanel';
import { InstallPanel } from './components/layout/InstallPanel';
import { TourSheet } from './components/tour/TourSheet';
import { TutorialOverlay } from './components/tour/TutorialOverlay';
import {
  OPENER_DELAY_MS, TOUR_COURTS_START, TOUR_COURTS_TARGET, TOUR_ROUNDS_START,
  TOUR_ROUNDS_TARGET, armOpener, backCard, completeTour, dismissComplete, getTourView,
  nextCard, resumeTour, skipTour, startTour, subscribeTour, tourStartSelection,
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
import {
  APP_VERSION, FEEDBACK_EMAIL, ACCOUNTS_ENABLED, PRIVACY_URL, TERMS_URL, COPYRIGHT,
} from './lib/appInfo';
import { RosterPage } from './components/roster/RosterPage';
import { GroupPicker } from './components/roster/GroupPicker';
import { SetupPage } from './components/setup/SetupPage';
import { SchedulePage } from './components/schedule/SchedulePage';
import type { ActionsEntry } from './components/schedule/ActionsSheet';
import { DiscardScheduleDialog } from './components/schedule/DiscardScheduleDialog';
import { StepPlayersIcon, StepSetupIcon } from './components/icons';
import { PrintSchedule } from './components/print/PrintSchedule';

// Shown in the banner on the Players step, and as the settings drawer's heading.
const APP_TITLE = 'Pickleball Round Robin Generator';

function App() {
  const {
    players: allPlayers,
    addPlayer,
    updatePlayer,
    setPlayerRosters,
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
  const [subPartnerships, setSubPartnerships] = useStoredValue(stores.subPartnerships);
  const [largeText, setLargeText] = useStoredValue(stores.largeText);
  const [defaultRating, setDefaultRating] = useStoredValue(stores.defaultRating);
  const [numCourts, setNumCourts] = useStoredValue(stores.numCourts);
  const [numRounds, setNumRounds] = useStoredValue(stores.numRounds);
  const [roundPlan, setRoundPlan] = useStoredValue(stores.roundPlan);
  const [scoringEnabled, setScoringEnabled] = useStoredValue(stores.scoringEnabled);

  // Live session state — persisted so a refresh mid-session doesn't lose the
  // schedule or which rounds have already been played.
  const [schedule, setSchedule] = useStoredValue(stores.schedule);
  const [completedRounds, setCompletedRounds] = useStoredValue(stores.completedRounds);
  const [removedIds, setRemovedIds] = useStoredValue(stores.removedIds);
  const [guests, setGuests] = useStoredValue(stores.guests);
  const [scheduleEdited, setScheduleEdited] = useStoredValue(stores.scheduleEdited);
  const [scheduleRosterId, setScheduleRosterId] = useStoredValue(stores.scheduleRosterId);
  const [scheduleBasis, setScheduleBasis] = useStoredValue(stores.scheduleBasis);
  const [, setSessionId] = useStoredValue(stores.sessionId);

  // Both persisted, and both parked with the group being left, so coming back to
  // a group reopens the tab it was left on. Read through currentStep(), which
  // refuses a saved 'schedule' with no schedule under it.
  const [, setStep] = useStoredValue(stores.step);
  const step = currentStep();
  // Setup opens the first time the host reaches it and stays open, so a trip
  // back to Players is never a dead end.
  const [setupSeen, setSetupSeen] = useStoredValue(stores.setupSeen);
  // Set by a press on a Schedule tab that could not take them there. SetupPage
  // draws the box above Generate; pressing Generate, or leaving Setup, puts it
  // down again.
  const [promptGenerate, setPromptGenerate] = useState(false);
  /**
   * The tab the host tapped on their way off a schedule they have worked on,
   * held until they answer the question. Null while nothing is being asked.
   *
   * The question is asked at the door rather than at Generate. Leaving the
   * Schedule tab is the moment the afternoon ends, because the only way back
   * onto it is to build a new one.
   */
  const [pendingLeave, setPendingLeave] = useState<Step | null>(null);
  /**
   * Whether any padlock, or any couple broken for a single round, is set.
   *
   * SchedulePage's own state, reported up rather than stored: it goes when that
   * page goes, and a padlock written to storage would outlive the padlock. It
   * only has to be true while the host is standing on the schedule, which is
   * the only place the question about leaving it can be asked.
   */
  const [liveLocks, setLiveLocks] = useState(false);
  /**
   * The Set Round Types list's draft while it is open, or null when it is shut.
   *
   * The list holds its choices back until it closes, so that the Schedule tab
   * does not blink in and out of reach on every pill tap — see handlePlanCommit.
   * Held up here rather than inside the list, because Generate is on the same
   * page and has to build from the rounds the host can see, not from the plan
   * they had before they opened it.
   */
  const [planDraft, setPlanDraft] = useState<RoundPlan | null>(null);
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
    useState<{ view: ActionsEntry; opened: number; subOutId?: string } | null>(null);
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
  //
  // And on the same footing, a code that has been emailed and not typed in yet.
  // That is a host who left for the mail app and came back to a tab iOS reloaded
  // while they were gone: the panel they were standing in is component state and
  // does not survive it, so without this they land on the schedule holding a
  // code, with nowhere to put it and no reason to think there ever was one.
  const [showAccount, setShowAccount] = useState(
    () => ACCOUNTS_ENABLED && (hasAuthCallback() || signInInterrupted())
  );
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

  /**
   * A dismissal lasts until the app is put down and picked up again.
   *
   * Nothing lets a build in on its own any more — the Reload button is the only
   * way through — so a refusal that stuck would be a host on last month's build
   * having tapped one small cross once, and no way back to the offer. Coming
   * back to the app is also when the worker goes looking for a new build, so
   * this is the same moment the banner would appear for the first time anyway.
   *
   * "Not now" rather than "no": the cross is there to get the line out of the
   * way of whatever is happening on court, not to answer for next Tuesday.
   */
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') setUpdateDismissed(false);
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
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
  // One aggregate for everything this component puts on top, so the page is not
  // let go and re-taken between two of them. Overlays elsewhere hold their own
  // lock; useScrollLock counts its holders, so overlapping ones compose.
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
    appScrollTo({ top: 0 });
  }, [step]);

  // Gets the next dressed-up robin fetched and decoded, if one is due on the
  // next open of the settings drawer. Nothing happens on the visits in between,
  // so an ordinary session makes no request for it at all.
  useEffect(() => {
    warmRobin();
  }, []);

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
    startRoundTimerWatchdog();
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
    // Closed by hand, so an unused code stops reopening this panel on every
    // launch. Typing it in is still one tap away, on the screen this leaves
    // behind: see pendingSignIn in auth.ts.
    dismissPendingSignIn();
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

  /**
   * A partnership only makes sense while both members are selected. Whenever the
   * selection shrinks (deselect, roster cleanup), drop any now-invalid couple.
   *
   * Only while there is no schedule. Mid-session the selection is who is playing
   * this afternoon, and subbing somebody off takes them out of it — which used
   * to delete the couple they were in, from storage, for good. A host covering
   * for a twisted ankle came back the following week to find the couple gone.
   * Setup is where couples are decided, so Setup is where the selection is
   * allowed to unmake one. What holds mid-session instead is stores.subPartnerships.
   */
  useEffect(() => {
    if (schedule) return;
    const sel = new Set(selectedIds);
    setPartnerships((prev) => {
      const next = prunePartnerships(prev, sel);
      return next.length === prev.length ? prev : next;
    });
  }, [schedule, selectedIds, setPartnerships]);

  /**
   * The couples in force this afternoon: Setup's, with any a stand-in has taken
   * over laid on top.
   *
   * Everything that touches a running session reads this rather than
   * `partnerships` — the padlocks on the schedule, and every rebuild of the
   * rounds still to come. Setup reads the standing list, because Setup is where
   * that list is edited and a stand-in has no business showing up in it.
   */
  const sessionPartnerships = useMemo(
    () => withSubbedPairs(partnerships, subPartnerships),
    [partnerships, subPartnerships]
  );

  const togglePlayer = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, [setSelectedIds]);

  const createPartnership = useCallback((id1: string, id2: string) => {
    if (id1 === id2) return;
    setPartnerships((prev) => {
      // Nobody is in two couples, so anything either player is already in gives
      // way. It used to refuse instead, which was silent and, since a couple can
      // now outlive one of its members being deselected, wrong: the Set Partners
      // panel lists a player whose partner is not here as free to pair, and a
      // tap on somebody the panel says is free has to do something.
      const next = prev.filter(
        (p) => ![p.player1Id, p.player2Id].some((id) => id === id1 || id === id2)
      );
      return [...next, { player1Id: id1, player2Id: id2 }];
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
  const handleOpenActions = useCallback((view: ActionsEntry, subOutId?: string) => {
    setActionsSheet((prev) => ({ view, subOutId, opened: (prev?.opened ?? 0) + 1 }));
    if (tour?.id === 'actions') nextCard();
  }, [tour]);

  // Setup's Generate: a brand new schedule, starting the session over.
  const handleGenerate = useCallback(() => {
    const attending = rosterPlayers.filter((p) => selectedIds.includes(p.id));
    if (attending.length < 4) return;
    // The box above the button has been answered by the press.
    setPromptGenerate(false);
    const activePartnerships = prunePartnerships(
      partnerships, new Set(attending.map((p) => p.id))
    );
    // Whatever the round types list is showing, whether or not Done was
    // pressed. Done is not a save button anywhere else — shutting the list
    // keeps what was set, and so does walking off the tab — and Generate is the
    // button directly under it. Written down here as well as built from, so the
    // plan and the schedule leave this press agreeing with each other.
    const plan = planDraft ?? roundPlan;
    if (planDraft) {
      setRoundPlan(planDraft);
      setPlanDraft(null);
    }
    setSchedule(
      generateSchedule(
        attending, numCourts, numRounds, plan, activePartnerships
      )
    );
    // A fresh schedule starts over: nothing played, nobody gone, nothing hand-edited
    setCompletedRounds([]);
    setRemovedIds([]);
    // Nobody is covering for anybody in a session that has not started.
    setSubPartnerships([]);
    setScheduleEdited(false);
    // Whatever round it was pinned to no longer exists in this schedule.
    clearRoundTimerForNewSchedule();
    setScheduleRosterId(activeRosterId);
    // Nothing reads this yet. A session gets its name here so that sharing one
    // already under way has a key to hand rather than minting one halfway.
    setSessionId(generateId());
    setStep('schedule');
    // Here rather than on the button, so a press that did not build anything —
    // too few ticked for the courts — leaves the card where it was, with the
    // error underneath it saying why.
    if (tour?.id === 'select-players') nextCard();
  }, [rosterPlayers, selectedIds, partnerships, numCourts, numRounds, roundPlan, planDraft,
      activeRosterId, tour, setSchedule, setCompletedRounds, setRemovedIds, setRoundPlan,
      setScheduleEdited, setScheduleRosterId, setSessionId, setStep, setSubPartnerships]);

  const attendingPlayers = sessionPlayers.filter(
    (p) => selectedIds.includes(p.id) && !removedIds.includes(p.id)
  );

  /** The session as it stands, in the shape the basis key is made from. */
  const liveBasis = {
    rosterId: activeRosterId,
    attending: attendingPlayers,
    partnerships,
    numCourts,
    numRounds,
    roundPlan,
    schedule,
  };

  /**
   * The schedule's basis, written down while the host is looking at it.
   *
   * One place rather than one per action, which is what makes it hard to get
   * wrong. Everything the Actions sheet does — a player removed, a court added,
   * more rounds on the end — changes both the schedule and its inputs together
   * and is made from this page, so it is folded in by being made at all. What
   * cannot reach this effect is a change made on Setup or Players, which is
   * exactly the set of changes the Schedule tab has to shut for.
   */
  useEffect(() => {
    if (step !== 'schedule' || !schedule) return;
    const key = basisKey(liveBasis);
    if (key !== scheduleBasis) setScheduleBasis(key);
    // liveBasis is rebuilt every render from the values listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, schedule, activeRosterId, selectedIds, removedIds, guests, allPlayers,
      partnerships, numCourts, numRounds, roundPlan, scheduleBasis, setScheduleBasis]);

  /**
   * Whether the host has done anything to this schedule.
   *
   * Scores and swaps and every Actions edit are written down in
   * `scheduleEdited`; the ticks are their own list; the padlocks are reported up
   * from SchedulePage while it is mounted. All three can be counted here
   * because the one question that reads this — may I leave? — is only ever
   * asked while the host is standing on the schedule.
   */
  const scheduleAltered =
    !!schedule && (scheduleEdited || completedRounds.length > 0 || liveLocks);

  /**
   * What Generate would build from, the open round types list included.
   *
   * handleGenerate builds from `planDraft ?? roundPlan` rather than the
   * committed plan, so the comparison has to as well: a host with the list open
   * and a round changed is looking at something the parked schedule does not
   * match, whatever the store still says.
   */
  const pressBasis = { ...liveBasis, roundPlan: planDraft ?? roundPlan };
  /**
   * Whether the parked schedule is the one this press would have built, and so
   * whether Generate hands it back rather than making another.
   *
   * The same comparison that used to decide whether the Schedule tab was a
   * door. It decides what the button does now.
   */
  const parkedIsCurrent = !!schedule && !scheduleIsStale(scheduleBasis, pressBasis);

  /**
   * Generate, pressed on the Setup page. The only way onto the Schedule tab.
   *
   * Two jobs in one button, and the host cannot tell them apart, which is the
   * point. Nothing changed since the schedule was parked: hand it straight
   * back, scores, clock and all. Anything changed, or nothing parked: build.
   *
   * No question either way. A schedule with an afternoon on it cannot be
   * reached from this page — leaving it is what asks, and a yes there is what
   * threw it away.
   */
  const handleGeneratePress = useCallback(() => {
    if (parkedIsCurrent) {
      setStep('schedule');
      // The tour's Select Players card moves on the press rather than on the
      // build. Without this, coming back from the congratulations card leaves
      // the host on the schedule with the previous card still showing.
      if (tour?.id === 'select-players') nextCard();
      return;
    }
    handleGenerate();
  }, [parkedIsCurrent, tour, setStep, handleGenerate]);

  // The box above Generate belongs to one visit to Setup. Walking away is an
  // answer too, and coming back later with no press behind it should be a clean
  // page.
  useEffect(() => {
    if (step !== 'setup') setPromptGenerate(false);
  }, [step]);

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
      sessionPartnerships, new Set(remaining.map((p) => p.id))
    );
    // The rebuilt rounds come back numbered from 1 again, and the court a group
    // is standing on has not moved because somebody went home.
    setSchedule({
      rounds: carryCourtNumbers(
        schedule.rounds,
        regenerateRemaining(
          remaining, numCourts, schedule.rounds, completedRounds,
          roundPlan, activePartnerships
        ).rounds
      ),
    });
    setRemovedIds((prev) => [...prev, playerId]);
    // Somebody going home breaks whatever they were linked in, the same as
    // unlocking it by hand would. The standing couple in Setup is untouched:
    // it has one member missing this afternoon and is whole again next week.
    setSubPartnerships((prev) =>
      prev.filter((p) => p.player1Id !== playerId && p.player2Id !== playerId)
    );
    setScheduleEdited(true);
  }, [schedule, attendingPlayers, sessionPartnerships, completedRounds, numCourts, roundPlan,
      setSchedule, setRemovedIds, setScheduleEdited, setSubPartnerships]);

  /**
   * Somebody deleted from the group while a schedule is running.
   *
   * The schedule survives it. This is the same deal the Actions sheet's Remove
   * Player already offers — rounds already marked complete are kept exactly as
   * they were played, scores and all, and only the rounds still to come are
   * rebuilt around the smaller group — reached from the Players tab, where the
   * host is far more likely to be when somebody drops out for good.
   *
   * The basis is rewritten by hand here because the effect that keeps it does
   * not run off this tab. Absorbing the change is the whole point: the host
   * asked for one person to go, not for their afternoon to be rebuilt.
   *
   * One case ends the schedule instead, and shuts the Schedule tab by leaving
   * the basis behind: too few players left to fill a court. There is no session
   * to rescue at that point.
   */
  const handleRosterDeletePlayer = useCallback((playerId: string) => {
    const playing = schedule && attendingPlayers.some((p) => p.id === playerId);
    const remaining = attendingPlayers.filter((p) => p.id !== playerId);

    if (playing && schedule && remaining.length >= 4) {
      const activePartnerships = prunePartnerships(
        sessionPartnerships, new Set(remaining.map((p) => p.id))
      );
      const rebuilt = {
        rounds: carryCourtNumbers(
          schedule.rounds,
          regenerateRemaining(
            remaining, numCourts, schedule.rounds, completedRounds,
            roundPlan, activePartnerships
          ).rounds
        ),
      };
      setSchedule(rebuilt);
      setRemovedIds((prev) => [...prev, playerId]);
      setSubPartnerships((prev) =>
        prev.filter((p) => p.player1Id !== playerId && p.player2Id !== playerId)
      );
      setScheduleEdited(true);
      setScheduleBasis(basisKey({ ...liveBasis, attending: remaining, schedule: rebuilt }));
    }

    deletePlayer(playerId);
    // liveBasis is rebuilt every render from values already in this list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, attendingPlayers, sessionPartnerships, completedRounds, numCourts, roundPlan,
      activeRosterId, numRounds, deletePlayer, setSchedule, setRemovedIds, setScheduleEdited,
      setScheduleBasis, setSubPartnerships]);

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
      sessionPartnerships, new Set(attendingPlayers.map((p) => p.id))
    );
    // Reshuffling changes who plays where, not what the courts are called.
    setSchedule({
      rounds: carryCourtNumbers(
        schedule.rounds,
        regenerateRemaining(
          attendingPlayers, numCourts, schedule.rounds, completedRounds,
          roundPlan, activePartnerships, locks, brokenPairs
        ).rounds
      ),
    });
    // The remaining rounds are machine-built again, so the swaps are gone. The
    // reshuffle is still the host's own doing, and walking back to Setup would
    // throw it away with everything else.
    setScheduleEdited(true);
  }, [schedule, attendingPlayers, sessionPartnerships, completedRounds, numCourts, roundPlan,
      setSchedule, setScheduleEdited]);

  /**
   * Done, on the Set Round Types list.
   *
   * The planner holds a draft and this is the only thing that writes it down.
   * That is not tidiness: `scheduleStale` is recomputed every render from
   * `liveBasis`, so writing the store on each pill tap would drop the Schedule
   * tab out of the tabs the host can reach and put it back on Done. They would
   * watch their tab blink while they were choosing.
   *
   * Mid-session it rebuilds, and only the rounds nobody has played. Rounds
   * marked complete are kept verbatim by regenerateRemaining, scores and all,
   * so moving the gendered round from six to five costs nothing that has
   * already happened. There is no "Replace the schedule?" question on this
   * path, because the answer would always be yes: it is the change the host
   * just made, not a rebuild they might not have meant.
   *
   * It does not go to the Schedule tab either. Returning to the schedule is the
   * host tapping the tab, which this has just made sure is still open to them.
   */
  const handlePlanCommit = useCallback((next: RoundPlan) => {
    setRoundPlan(next);
    if (!schedule) return;
    // Opened the list, had a look, pressed Done. The afternoon must not
    // reshuffle for that, and neither must a change to a round already played.
    if (!unplayedChanged(roundPlan, next, numRounds, completedRounds)) return;
    if (attendingPlayers.length < 4) return;

    const activePartnerships = prunePartnerships(
      sessionPartnerships, new Set(attendingPlayers.map((p) => p.id))
    );
    const rebuilt = {
      rounds: carryCourtNumbers(
        schedule.rounds,
        regenerateRemaining(
          attendingPlayers, numCourts, schedule.rounds, completedRounds,
          next, activePartnerships
        ).rounds
      ),
    };
    setSchedule(rebuilt);
    // `next`, not the closed-over roundPlan: setRoundPlan above has not
    // re-rendered yet, so the state in scope is still the plan the host
    // started from. Write that key and it would disagree with the very next
    // render's, and the Schedule tab would shut on a host mid-session — the
    // same trick handleRosterDeletePlayer plays with `attending: remaining`.
    setScheduleBasis(basisKey({ ...liveBasis, roundPlan: next, schedule: rebuilt }));
    // Nothing said about whether the schedule has been altered. This runs on
    // the Setup tab, and a change made there is not a change made to an
    // afternoon: a session under way cannot be reached from that page.
    // liveBasis is rebuilt every render from values already in this list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, roundPlan, numRounds, completedRounds, attendingPlayers, sessionPartnerships,
      numCourts, removedIds, activeRosterId, partnerships, setRoundPlan, setSchedule,
      setScheduleBasis]);

  /**
   * Walking off the Setup tab with the list still open keeps what was set.
   *
   * Leaving is one of the ways of closing the list, and the host has no reason
   * to think it means anything different from Done. Generate is not one of
   * these: it takes the draft itself, on the press, and leaves nothing here to
   * commit — which is what stops this rebuilding the schedule it just made.
   */
  useEffect(() => {
    if (step === 'setup' || !planDraft) return;
    setPlanDraft(null);
    handlePlanCommit(planDraft);
  }, [step, planDraft, handlePlanCommit]);

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
    (name: string, rating: number, gender: Gender, replacingId?: string): string => {
      const player = addPlayer(name, rating, gender, [activeRosterId]);
      if (!schedule) return player.id;

      // Reached from Sub Player, where somebody is already on their way out.
      // Adding the newcomer on top would put five people on a court that is
      // losing one, so they take the place instead — the same move
      // handleSubstitute makes, for a player who did not exist a moment ago.
      if (replacingId) {
        setSchedule({
          rounds: replacePlayerInRounds(schedule.rounds, replacingId, player, completedRounds),
        });
        setSelectedIds((prev) => [...prev.filter((id) => id !== replacingId), player.id]);
        // Whoever the player going off was linked to, this one is linked to now.
        setSubPartnerships((prev) =>
          transferPartnership(prev, partnerships, replacingId, player.id)
        );
        setScheduleEdited(true);
        return player.id;
      }

      setSchedule({
        rounds: addToRemainingRounds(schedule.rounds, completedRounds, player),
      });
      setSelectedIds((prev) => [...prev, player.id]);
      setScheduleEdited(true);
      return player.id;
    },
    [addPlayer, activeRosterId, schedule, completedRounds, partnerships, setSchedule,
     setSelectedIds, setScheduleEdited, setSubPartnerships]
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
   *
   * Anyone the player going off was linked to, the substitute is now linked to,
   * for the rest of the afternoon. They are standing in that person's place on
   * the court, so standing in their place beside their partner is the same
   * move — and the padlock the host is looking at stays where it is instead of
   * quietly coming undone. See stores.subPartnerships for why this is not
   * written into Setup's couples.
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
      setSubPartnerships((prev) =>
        transferPartnership(prev, partnerships, outgoingId, incomingId)
      );
      setScheduleEdited(true);
    },
    [schedule, sessionPlayers, completedRounds, partnerships, setSchedule, setSelectedIds,
     setRemovedIds, setScheduleEdited, setSubPartnerships]
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

  /**
   * The same edit, made from the Players tab.
   *
   * It has to go through the same write-through, and did not used to: the
   * Players tab wrote the correction against the player and left the copies in
   * the schedule alone, which was harmless only because no host could ever get
   * back to that schedule to see it. Now that the tab is a door, a name
   * corrected on Players and still wrong on court would be the first bug
   * anybody reported.
   *
   * Group membership is the one field that is not part of a player and so is
   * not written through — it goes straight to the pool.
   */
  const handleRosterUpdatePlayer = useCallback(
    (playerId: string, updates: Partial<Omit<Player, 'id'>>) => {
      if (updates.rosterIds) setPlayerRosters(playerId, updates.rosterIds);

      const details: Partial<Pick<Player, 'name' | 'rating' | 'gender'>> = {};
      if (updates.name !== undefined) details.name = updates.name;
      if (updates.rating !== undefined) details.rating = updates.rating;
      if (updates.gender !== undefined) details.gender = updates.gender;
      if (Object.keys(details).length > 0) handleEditPlayerDetails(playerId, details);
    },
    [setPlayerRosters, handleEditPlayerDetails]
  );

  // A court arriving or leaving mid-session. Both edit the rounds still to be
  // played and move numCourts with them, because numCourts is what the next
  // reshuffle builds from — leave it behind and the first reshuffle after a
  // court is added would quietly take it away again.
  const handleAddCourt = useCallback(() => {
    if (!schedule) return;
    const activePartnerships = prunePartnerships(
      sessionPartnerships, new Set(attendingPlayers.map((p) => p.id))
    );
    setSchedule({
      rounds: addCourtToRemaining(schedule.rounds, completedRounds, activePartnerships),
    });
    setNumCourts(numCourts + 1);
    setScheduleEdited(true);
  }, [schedule, sessionPartnerships, attendingPlayers, completedRounds, numCourts, setNumCourts,
      setSchedule, setScheduleEdited]);

  const handleRemoveCourt = useCallback((courtNumber: number) => {
    if (!schedule) return;
    setSchedule({
      rounds: removeCourtFromRemaining(schedule.rounds, completedRounds, courtNumber),
    });
    setNumCourts(Math.max(1, numCourts - 1));
    setScheduleEdited(true);
  }, [schedule, completedRounds, numCourts, setNumCourts, setSchedule, setScheduleEdited]);

  /**
   * One more round on the end, played as whatever the host picked. The rounds
   * already there do not move, and the new one is built around them rather
   * than from scratch.
   *
   * The plan is written before the schedule is extended, and the extension is
   * handed that same plan rather than the closed-over one: `extendSchedule`
   * reads the new round's type out of the slot at its own number, and
   * `setRoundPlan` has not re-rendered yet. The same rule as handlePlanCommit.
   */
  const handleAddRound = useCallback((type: RoundType | null) => {
    if (!schedule) return;
    if (attendingPlayers.length < 4) return;
    const activePartnerships = prunePartnerships(
      sessionPartnerships, new Set(attendingPlayers.map((p) => p.id))
    );
    // Off the schedule rather than off `numRounds`: the schedule is what is
    // being extended, and extendSchedule numbers the new round from it.
    const added = schedule.rounds.reduce((max, r) => Math.max(max, r.roundNumber), 0) + 1;
    // The plan is sixteen slots and this is the one path that can take a
    // session past them, so it is grown here as well as set — the new round
    // needs a row of its own in the planner rather than falling off the end.
    const plan = setPlanType(normalizeRoundPlan(roundPlan, added), added, type);

    setSchedule(
      extendSchedule(
        attendingPlayers, numCourts, schedule.rounds, 1, plan, activePartnerships
      )
    );
    setNumRounds(numRounds + 1);
    setRoundPlan(plan);
    // A round on the end is the host's own work, like every other thing the
    // Actions sheet does.
    setScheduleEdited(true);
  }, [schedule, attendingPlayers, sessionPartnerships, numCourts, numRounds, roundPlan,
      setNumRounds, setRoundPlan, setSchedule, setScheduleEdited]);

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

  /**
   * Which tabs are doors.
   *
   * Two of them, and never the schedule. Generate is the only way onto that
   * tab: a session under way is not something Setup can be used on, so walking
   * back to Setup is walking away from it, and the way forward from there is
   * the button that builds.
   */
  const availableSteps: Step[] = [];
  if (step !== 'roster') availableSteps.push('roster');
  if (step !== 'setup' && setupSeen) availableSteps.push('setup');

  /**
   * And which is drawn shut but still answers: Schedule, whenever the host is
   * standing somewhere else.
   *
   * It is flat rather than a card because it is not a door, and it takes a
   * press anyway because somebody reaching for it is asking a real question —
   * where is my schedule — and the answer is the Generate button. Before the
   * host has ever seen Setup there is no answer worth giving, and the tab is
   * dead: the way to Setup is Continue to Setup, at the foot of the Players
   * page, and this must not become a way around it.
   */
  const answeringSteps: Step[] = step !== 'schedule' && setupSeen ? ['schedule'] : [];

  /**
   * Moving between tabs.
   *
   * Three answers. The Schedule tab is never a door, so a press on it lands on
   * Setup with the box bouncing over Generate. Leaving a schedule the host has
   * worked on asks first, because that is where the afternoon ends. Everything
   * else just goes.
   */
  const handleStepNav = useCallback(
    (target: Step) => {
      if (target === 'schedule') {
        // Already on Setup: nowhere to go, and the box is the whole point of
        // the press.
        if (step !== 'setup') setStep('setup');
        setPromptGenerate(true);
        return;
      }
      if (target === step) return;
      if (step === 'schedule' && scheduleAltered) {
        setPendingLeave(target);
        return;
      }
      setStep(target);
    },
    [step, scheduleAltered, setStep]
  );

  /**
   * Yes, abandon it.
   *
   * The same clearing New Round Robin does, keeping the ticked players and
   * their partners: the crowd is usually the same and the next Generate is one
   * press away. Everything that belonged to the afternoon goes with it — the
   * schedule, the scores, the ticks, the guests, whoever was covering for whom,
   * the clock, and the basis the parked schedule was compared against.
   */
  const confirmLeave = useCallback(() => {
    if (!pendingLeave) return;
    clearSession(true);
    setStep(pendingLeave);
    setPendingLeave(null);
  }, [pendingLeave, clearSession, setStep]);

  /**
   * The padlocks go when the page holding them goes.
   *
   * Keyed on the group as well as the tab: two groups can both be parked on the
   * Schedule tab, and one group's padlocks are not the other's.
   */
  useEffect(() => {
    setLiveLocks(false);
  }, [step, activeRosterId]);

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
      className={`app-shell relative h-full overflow-x-hidden bg-gray-800 ${
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
        className={`app-panel relative z-10 h-full bg-gray-50 transition-transform duration-300 ease-in-out ${
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
      {/* The pane the whole app scrolls in, banner to footer — the document
          itself is held to the viewport and cannot move. What keeps iOS 26's
          scroll edge effect off the banner is #top-pin in index.html; the
          story is at the top of index.css. lib/appScroll.ts is how code
          scrolls this pane. The click-catcher above sits outside it on
          purpose: an absolute inset-0 child of a scrolled pane covers only
          the first screenful. */}
      <div data-app-scroll className="app-scroll">
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
          answering={answeringSteps}
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
            onUpdate={handleRosterUpdatePlayer}
            onAddPlayersToRosters={addPlayersToRosters}
            onDeletePlayer={handleRosterDeletePlayer}
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
            roundPlan={roundPlan}
            completedRounds={completedRounds}
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
            onPlanCommit={handlePlanCommit}
            planDraft={planDraft}
            onPlanDraft={setPlanDraft}
            promptGenerate={promptGenerate}
            onGenerate={handleGeneratePress}
          />
        )}

        {step === 'schedule' && schedule && (
          <SchedulePage
            schedule={schedule}
            players={attendingPlayers}
            partnerships={sessionPartnerships}
            numCourts={numCourts}
            completedRounds={completedRounds}
            // Re-adding the last removed player empties this and so re-enables
            // the Completed checkboxes, even though those rounds were rebuilt
            // around the removal. Narrow enough to live with.
            canUncomplete={removedIds.length === 0}
            onRegenerate={handleReshuffle}
            onUpdateSchedule={handleUpdateSchedule}
            onCompletedRoundsChange={setCompletedRounds}
            onRemovePlayer={handleRemovePlayer}
            onEditPlayer={handleEditPlayer}
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
            // The padlocks are this page's own, and count as work the moment
            // one is set: leaving the schedule would throw them away.
            onLocksChange={setLiveLocks}
            actions={{
              onStartNewSession: handleStartNewSession,
              onAddPlayer: handleAddPlayer,
              onCreatePlayer: handleCreatePlayer,
              onAddGuest: handleAddGuest,
              onSubstitute: handleSubstitute,
              onAddCourt: handleAddCourt,
              onRemoveCourt: handleRemoveCourt,
              onAddRound: handleAddRound,
            }}
          />
        )}
      </main>

      {/* The one door out of an afternoon, and so the one question left in the
          app about losing one. Leaving the Schedule tab is what ends a session,
          because Generate is the only way back onto it — so this is asked here
          rather than over the button that rebuilds. */}
      {pendingLeave && (
        <DiscardScheduleDialog
          heading="Abandon This Schedule?"
          body={
            <>
              Returning to <strong className="font-bold">{stepName(pendingLeave)}</strong>{' '}
              discards the session including any entered scores.
            </>
          }
          cancelLabel="Cancel"
          confirmLabel={`Return to ${stepName(pendingLeave)}`}
          // The tab it lands on, wearing that tab's own shape.
          confirmIcon={pendingLeave === 'roster' ? StepPlayersIcon : StepSetupIcon}
          onConfirm={confirmLeave}
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
        {/* Last line on the page, under the links rather than above them: it is
            the quietest thing here and nothing follows it. */}
        <div className="mt-1">{COPYRIGHT}</div>
      </footer>
      </div>
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
        <TourSheet
          title="Quick Start Tutorial"
          buttonLabel="Continue"
          onPress={handleTourStart}
          onSkip={skipTour}
        >
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
              className="flex shrink-0 items-center justify-center min-h-10 px-4 py-1.5 bg-brand-orange text-white rounded-md hover:bg-brand-orange-dark transition-colors text-sm font-bold"
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

      {/* Last of all, so an alarm that started on the Schedule tab can force
          itself back to the front over whatever tab the host has since
          switched to — see the component's own comment for why it is mounted
          here rather than owned by SchedulePage. */}
      <RoundTimerPanel />

      {/* Outside the sliding panel so a print started from the drawer is never
          caught mid-slide. */}
      <PrintSchedule schedule={schedule} players={attendingPlayers} />
    </div>
  );
}

export default App;
