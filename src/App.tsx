import { useState, useCallback, useEffect } from 'react';
import type { Schedule, LockedPair, Partnership } from './types';
import { usePlayers } from './hooks/usePlayers';
import { useRosters } from './hooks/useRosters';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useScrollLock } from './hooks/useScrollLock';
import { KEYS } from './lib/migrations';
import { generateSchedule, reshuffleSchedule, regenerateRemaining } from './lib/pairing';
import { prunePartnerships, arePartners } from './lib/partnerships';
import { toCsv, parseGroupCsv, uniqueGroupName, fileNameStem, toFileName } from './lib/groupFile';
import { downloadTextFile } from './utils/download';
import { Header } from './components/layout/Header';
import { SettingsPanel } from './components/layout/SettingsPanel';
import { InstructionsPanel } from './components/layout/InstructionsPanel';
import { DefaultRatingPanel } from './components/layout/DefaultRatingPanel';
import { ImportExportPanel } from './components/layout/ImportExportPanel';
import type { ImportResult } from './components/layout/ImportExportPanel';
import { StepIndicator } from './components/layout/StepIndicator';
import { stepLabel, type Step } from './lib/steps';
import { FeedbackPanel } from './components/layout/FeedbackPanel';
import { DonatePanel } from './components/layout/DonatePanel';
import { SharePanel } from './components/layout/SharePanel';
import { InstallPanel } from './components/layout/InstallPanel';
import { InstallBanner } from './components/layout/InstallBanner';
import { shareApp } from './lib/share';
import { isStandalone, installRoute } from './lib/install';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import type { FeedbackKind } from './lib/feedback';
import { APP_VERSION } from './lib/appInfo';
import { RosterPage } from './components/roster/RosterPage';
import { SetupPage } from './components/setup/SetupPage';
import { SchedulePage } from './components/schedule/SchedulePage';
import { PrintSchedule } from './components/print/PrintSchedule';

// Shown in the banner on the Players step, and as the settings drawer's heading.
const APP_TITLE = 'Pickleball Round Robin Generator';

function App() {
  const {
    players: allPlayers,
    addPlayer,
    updatePlayer,
    addPlayersToRosters,
    importPlayers,
    removeFromRoster,
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

  // Session config state
  const [selectedIds, setSelectedIds] = useLocalStorage<string[]>('pb-selected-ids', []);
  // Fixed partnerships: couples kept on the same team every round. Persisted so
  // they survive a refresh and carry into the next session with the same crowd.
  const [partnerships, setPartnerships] = useLocalStorage<Partnership[]>(KEYS.partnerships, []);
  const [largeText, setLargeText] = useLocalStorage<boolean>('pb-large-text', false);
  const [defaultRating, setDefaultRating] = useLocalStorage('pb-default-rating', 4.0);
  const [numCourts, setNumCourts] = useLocalStorage('pb-num-courts', 3);
  const [numRounds, setNumRounds] = useLocalStorage('pb-num-rounds', 8);
  const [genderedEnabled, setGenderedEnabled] = useLocalStorage('pb-gendered-enabled', false);
  const [genderedFrequency, setGenderedFrequency] = useLocalStorage('pb-gendered-frequency', 2);

  // Live session state — persisted so a refresh mid-session doesn't lose the
  // schedule or which rounds have already been played.
  const [schedule, setSchedule] = useLocalStorage<Schedule | null>('pb-schedule', null);
  // Round numbers marked complete. An arbitrary set — the host may complete
  // rounds out of order.
  const [completedRounds, setCompletedRounds] = useLocalStorage<number[]>(KEYS.completedRounds, []);
  const [removedIds, setRemovedIds] = useLocalStorage<string[]>('pb-removed-ids', []);
  const [scheduleRosterId, setScheduleRosterId] = useLocalStorage<string | null>(
    KEYS.scheduleRoster,
    null
  );

  const [step, setStep] = useState<Step>(schedule ? 'schedule' : 'roster');
  const [pendingRosterSwitch, setPendingRosterSwitch] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showDefaultRating, setShowDefaultRating] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind | null>(null);
  const [showDonate, setShowDonate] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [installDismissed, setInstallDismissed] = useLocalStorage('pb-install-dismissed', false);
  const { canPrompt, promptInstall } = useInstallPrompt();

  // Read once: it cannot change without a reload, and re-reading per render
  // would run a matchMedia query on every keystroke.
  const [installed] = useState(isStandalone);

  // The panel must sit still while it's slid aside, so the settings button stays
  // exactly where the user left it — including after closing a settings dialog.
  useScrollLock(
    settingsOpen || showInstructions || showDefaultRating || showImportExport ||
    !!feedbackKind || showDonate || showShare || showInstall
  );

  // Straight to the OS share sheet where there is one. The copy-link panel is
  // only for browsers without it — someone who cancelled the sheet gets nothing,
  // which is what cancelling should do.
  async function handleShare() {
    const outcome = await shareApp();
    if (outcome === 'unsupported' || outcome === 'failed') setShowShare(true);
  }

  // A saved session belongs to the roster it was built from. On boot, follow it
  // rather than stranding the user in a schedule full of another roster's players.
  useEffect(() => {
    if (schedule && scheduleRosterId && scheduleRosterId !== activeRosterId) {
      setActiveRosterId(scheduleRosterId);
    }
    // Boot-time only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Players in the roster currently being worked on
  const rosterPlayers = allPlayers.filter((p) => p.rosterIds.includes(activeRosterId));

  // Clean up stale IDs when the roster's membership changes
  useEffect(() => {
    const playerIds = new Set(rosterPlayers.map((p) => p.id));
    setSelectedIds((prev) => {
      const filtered = prev.filter((id) => playerIds.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
    // rosterPlayers is derived; keying on the ids keeps this from looping
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPlayers, activeRosterId, setSelectedIds]);

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

  const selectAll = useCallback(() => {
    setSelectedIds(rosterPlayers.map((p) => p.id));
  }, [rosterPlayers, setSelectedIds]);

  const deselectAll = useCallback(() => {
    setSelectedIds([]);
  }, [setSelectedIds]);

  // keepSelection is used by "Start New Session": the same crowd usually plays
  // each time, so the previously chosen players stay selected for the next one.
  // A roster switch clears the selection instead, since it's a different group.
  const clearSession = useCallback((keepSelection = false) => {
    setSchedule(null);
    setCompletedRounds([]);
    setRemovedIds([]);
    // "Start New Session" keeps the crowd (and their couples); a group switch
    // clears both since it's a different set of people.
    if (!keepSelection) {
      setSelectedIds([]);
      setPartnerships([]);
    }
    setScheduleRosterId(null);
  }, [setSchedule, setCompletedRounds, setRemovedIds, setSelectedIds, setPartnerships, setScheduleRosterId]);

  // Switching rosters invalidates an in-progress session, so confirm first
  const handleSelectRoster = useCallback(
    (id: string) => {
      if (id === activeRosterId) return;
      if (schedule) {
        setPendingRosterSwitch(id);
        return;
      }
      setActiveRosterId(id);
      setSelectedIds([]);
      setPartnerships([]);
    },
    [activeRosterId, schedule, setActiveRosterId, setSelectedIds, setPartnerships]
  );

  const confirmRosterSwitch = useCallback(() => {
    if (!pendingRosterSwitch) return;
    clearSession();
    setActiveRosterId(pendingRosterSwitch);
    setPendingRosterSwitch(null);
    setStep('roster');
  }, [pendingRosterSwitch, clearSession, setActiveRosterId]);

  const handleDeleteRoster = useCallback(
    (id: string, moveTo: string | null) => {
      reassignRoster(id, moveTo);
      if (scheduleRosterId === id) clearSession();
      deleteRoster(id);
    },
    [reassignRoster, deleteRoster, scheduleRosterId, clearSession]
  );

  const handleGenerate = useCallback((
    locks?: Record<number, LockedPair[]>,
    brokenPairs?: Record<number, string[]>
  ) => {
    const attending = rosterPlayers.filter((p) => selectedIds.includes(p.id));
    if (attending.length < 4) return;
    const activePartnerships = prunePartnerships(
      partnerships, new Set(attending.map((p) => p.id))
    );
    // A call carrying locks or per-round breaks comes from the Schedule tab's
    // Reshuffle; the initial Generate from Setup carries neither.
    const isReshuffle =
      (locks && Object.keys(locks).length > 0) ||
      (brokenPairs && Object.keys(brokenPairs).length > 0);
    const result = isReshuffle
      ? reshuffleSchedule(
          attending, numCourts, numRounds, locks ?? {}, genderedEnabled,
          genderedFrequency, activePartnerships, brokenPairs ?? {}
        )
      : generateSchedule(
          attending, numCourts, numRounds, genderedEnabled, genderedFrequency,
          activePartnerships
        );
    setSchedule(result);
    // A fresh schedule starts over: nothing played, nobody gone
    setCompletedRounds([]);
    setRemovedIds([]);
    setScheduleRosterId(activeRosterId);
    setStep('schedule');
  }, [rosterPlayers, selectedIds, partnerships, numCourts, numRounds, genderedEnabled,
      genderedFrequency, activeRosterId, setSchedule, setCompletedRounds, setRemovedIds,
      setScheduleRosterId]);

  const attendingPlayers = rosterPlayers.filter(
    (p) => selectedIds.includes(p.id) && !removedIds.includes(p.id)
  );

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
    setSchedule(
      regenerateRemaining(
        remaining, numCourts, schedule.rounds, completedRounds,
        genderedEnabled, genderedFrequency, activePartnerships
      )
    );
    setRemovedIds((prev) => [...prev, playerId]);
  }, [schedule, attendingPlayers, partnerships, completedRounds, numCourts, genderedEnabled,
      genderedFrequency, setSchedule, setRemovedIds]);

  const handleExportGroup = useCallback(
    (rosterId: string) => {
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

      const parsed = parseGroupCsv(text, fileNameStem(file.name), defaultRating);
      if (parsed.rows.length === 0) {
        return {
          ok: false,
          title: 'No players found in that file.',
          details: ['Expected a CSV with Name, Rating and Gender columns.'],
        };
      }

      const desired = parsed.group;
      const name = uniqueGroupName(desired, rosters.map((r) => r.name));
      const roster = addRoster(name);
      const { added, linked } = importPlayers(parsed.rows, roster.id);

      const details: string[] = [];
      if (name !== desired.trim()) {
        details.push(`A group called "${desired.trim()}" already existed, so this one is "${name}".`);
      }
      details.push(`${added} player${added === 1 ? '' : 's'} added.`);
      if (linked > 0) {
        details.push(
          `${linked} player${linked === 1 ? '' : 's'} already existed and ${
            linked === 1 ? 'was' : 'were'
          } added to this group.`
        );
      }
      if (parsed.skipped > 0) {
        details.push(`${parsed.skipped} row${parsed.skipped === 1 ? '' : 's'} skipped.`);
      }

      if (schedule) {
        details.push('Your session is still running — switch groups from My Groups when ready.');
      } else {
        setActiveRosterId(roster.id);
        setSelectedIds([]);
        setPartnerships([]);
        setStep('roster');
      }

      return { ok: true, title: `"${name}" created.`, details };
    },
    [rosters, defaultRating, addRoster, importPlayers, schedule, setActiveRosterId,
     setSelectedIds, setPartnerships]
  );

  const handleStartNewSession = useCallback(() => {
    clearSession(true); // keep the selected players for the next session
    setStep('roster');
  }, [clearSession]);

  return (
    <div
      className={`relative min-h-screen overflow-x-hidden bg-gray-800 ${
        largeText ? 'text-large' : ''
      }`}
    >
      <SettingsPanel
        open={settingsOpen}
        onShare={handleShare}
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
      <Header
        // Past the roster step the group being worked on is the useful label
        title={step === 'roster' ? APP_TITLE : activeRoster?.name ?? APP_TITLE}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((v) => !v)}
        // Only the Schedule step has something worth printing
        onPrint={step === 'schedule' ? () => window.print() : undefined}
      />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Held back until there's a real roster worth keeping. The route check
            matters: browsers with no install path at all (desktop Firefox) must
            never be offered one. */}
        {!installed &&
          !installDismissed &&
          rosterPlayers.length >= 4 &&
          installRoute({ canPrompt }) !== 'manual' && (
            <InstallBanner
              onOpen={() => setShowInstall(true)}
              onDismiss={() => setInstallDismissed(true)}
            />
          )}

        <StepIndicator current={step} />

        {step === 'roster' && (
          <RosterPage
            allPlayers={allPlayers}
            players={rosterPlayers}
            rosters={rosters}
            activeRosterId={activeRosterId}
            onSelectRoster={handleSelectRoster}
            onAddRoster={addRoster}
            onRenameRoster={renameRoster}
            onDeleteRoster={handleDeleteRoster}
            onAdd={addPlayer}
            onUpdate={updatePlayer}
            onAddPlayersToRosters={addPlayersToRosters}
            onRemoveFromRoster={removeFromRoster}
            onDeletePlayer={deletePlayer}
            onContinue={() => setStep('setup')}
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
            genderedEnabled={genderedEnabled}
            genderedFrequency={genderedFrequency}
            onTogglePlayer={togglePlayer}
            onSelectAll={selectAll}
            onDeselectAll={deselectAll}
            onCreatePartnership={createPartnership}
            onRemovePartnership={removePartnership}
            onCourtsChange={setNumCourts}
            onRoundsChange={setNumRounds}
            onGenderedToggle={setGenderedEnabled}
            onGenderedFrequencyChange={setGenderedFrequency}
            onGenerate={() => handleGenerate()}
            onBack={() => setStep('roster')}
          />
        )}

        {step === 'schedule' && schedule && (
          <SchedulePage
            schedule={schedule}
            players={attendingPlayers}
            partnerships={partnerships}
            numCourts={numCourts}
            completedRounds={completedRounds}
            canUncomplete={removedIds.length === 0}
            onRegenerate={handleGenerate}
            onBack={() => setStep('setup')}
            onUpdateSchedule={setSchedule}
            onCompletedRoundsChange={setCompletedRounds}
            onRemovePlayer={handleRemovePlayer}
            onStartNewSession={handleStartNewSession}
          />
        )}
      </main>

      {pendingRosterSwitch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 mx-4 max-w-sm w-full">
            <p className="text-gray-800 text-center font-medium mb-2">Switch groups?</p>
            <p className="text-sm text-gray-600 text-center mb-4">
              You have a round robin session in progress for{' '}
              <span className="font-medium">{activeRoster?.name}</span>. Switching groups will
              clear it.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingRosterSwitch(null)}
                className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmRosterSwitch}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium"
              >
                Switch
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="text-center text-xs text-gray-400 pt-6 no-print" style={{ paddingBottom: 40 }}>
        Created by Jeff Baker &ndash; positivefutures.ai &middot; v{APP_VERSION}
      </footer>
      </div>

      {showInstructions && (
        <InstructionsPanel onClose={() => setShowInstructions(false)} />
      )}

      {showShare && <SharePanel onClose={() => setShowShare(false)} />}

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
            step: stepLabel(step),
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

      {/* Outside the sliding panel so a print started from the drawer is never
          caught mid-slide. */}
      <PrintSchedule schedule={schedule} players={attendingPlayers} />
    </div>
  );
}

export default App;
