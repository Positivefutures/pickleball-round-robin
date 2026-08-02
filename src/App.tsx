import { useState, useCallback, useEffect } from 'react';
import type { Schedule, LockedPair, Partnership } from './types';
import { usePlayers } from './hooks/usePlayers';
import { useRosters } from './hooks/useRosters';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useScrollLock } from './hooks/useScrollLock';
import { KEYS } from './lib/migrations';
import { generateSchedule, regenerateRemaining } from './lib/pairing';
import { addToRemainingSitOuts } from './lib/sitout';
import { prunePartnerships, arePartners } from './lib/partnerships';
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
    importGroups,
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
  // True once the host has hand-modified the generated schedule — a swap or a
  // player removal. Persisted alongside the schedule so a refresh mid-session
  // doesn't make an edited schedule look untouched.
  const [scheduleEdited, setScheduleEdited] = useLocalStorage<boolean>('pb-schedule-edited', false);
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
    setScheduleEdited(false);
    // "Start New Session" keeps the crowd (and their couples); a group switch
    // clears both since it's a different set of people.
    if (!keepSelection) {
      setSelectedIds([]);
      setPartnerships([]);
    }
    setScheduleRosterId(null);
  }, [setSchedule, setCompletedRounds, setRemovedIds, setScheduleEdited, setSelectedIds,
      setPartnerships, setScheduleRosterId]);

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

  // Setup's Generate: a brand new schedule, starting the session over.
  const handleGenerate = useCallback(() => {
    const attending = rosterPlayers.filter((p) => selectedIds.includes(p.id));
    if (attending.length < 4) return;
    const activePartnerships = prunePartnerships(
      partnerships, new Set(attending.map((p) => p.id))
    );
    setSchedule(
      generateSchedule(
        attending, numCourts, numRounds, genderedEnabled, genderedFrequency,
        activePartnerships
      )
    );
    // A fresh schedule starts over: nothing played, nobody gone, nothing hand-edited
    setCompletedRounds([]);
    setRemovedIds([]);
    setScheduleEdited(false);
    setScheduleRosterId(activeRosterId);
    setStep('schedule');
  }, [rosterPlayers, selectedIds, partnerships, numCourts, numRounds, genderedEnabled,
      genderedFrequency, activeRosterId, setSchedule, setCompletedRounds, setRemovedIds,
      setScheduleEdited, setScheduleRosterId]);

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
    setScheduleEdited(true);
  }, [schedule, attendingPlayers, partnerships, completedRounds, numCourts, genderedEnabled,
      genderedFrequency, setSchedule, setRemovedIds, setScheduleEdited]);

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
    setSchedule(
      regenerateRemaining(
        attendingPlayers, numCourts, schedule.rounds, completedRounds,
        genderedEnabled, genderedFrequency, activePartnerships, locks, brokenPairs
      )
    );
    // The remaining rounds are machine-built again, so swaps are gone — but a
    // removal is still work that going back to Setup would throw away.
    setScheduleEdited(removedIds.length > 0);
  }, [schedule, attendingPlayers, partnerships, completedRounds, numCourts, genderedEnabled,
      genderedFrequency, removedIds, setSchedule, setScheduleEdited]);

  // Brings a latecomer into a session already under way. They land in the
  // sit-outs of every unplayed round, leaving those rounds' courts alone; the
  // host swaps them in, or reshuffles to have them mixed through properly.
  const handleAddPlayer = useCallback((playerId: string) => {
    if (!schedule) return;
    const player = rosterPlayers.find((p) => p.id === playerId);
    if (!player) return;

    setSchedule({
      rounds: addToRemainingSitOuts(schedule.rounds, completedRounds, player),
    });
    // Selection is what a later reshuffle draws from, and clearing the removal
    // is what lets someone who left earlier rejoin.
    setSelectedIds((prev) => (prev.includes(playerId) ? prev : [...prev, playerId]));
    setRemovedIds((prev) => prev.filter((id) => id !== playerId));
    setScheduleEdited(true);
  }, [schedule, rosterPlayers, completedRounds, setSchedule, setSelectedIds, setRemovedIds,
      setScheduleEdited]);

  // Players in the group who aren't in this session yet — including anyone
  // removed from it earlier, since a player who left may well come back.
  const addablePlayers = rosterPlayers.filter(
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
        details.push(`${added} player${added === 1 ? '' : 's'} added.`);
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

      if (schedule) {
        details.push('Your session is still running — switch groups from My Groups when ready.');
      } else {
        setActiveRosterId(created[0].roster.id);
        setSelectedIds([]);
        setPartnerships([]);
        setStep('roster');
      }

      const title = multi
        ? `${created.length} groups imported.`
        : `"${created[0].name}" created.`;
      return { ok: true, title, details };
    },
    [rosters, defaultRating, addRoster, importGroups, schedule, setActiveRosterId,
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
            // Re-adding the last removed player empties this and so re-enables
            // the Completed checkboxes, even though those rounds were rebuilt
            // around the removal. Narrow enough to live with.
            canUncomplete={removedIds.length === 0}
            onRegenerate={handleReshuffle}
            onBack={() => setStep('setup')}
            scheduleEdited={scheduleEdited}
            onUpdateSchedule={handleUpdateSchedule}
            onCompletedRoundsChange={setCompletedRounds}
            onRemovePlayer={handleRemovePlayer}
            onStartNewSession={handleStartNewSession}
            addablePlayers={addablePlayers}
            onAddPlayer={handleAddPlayer}
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
