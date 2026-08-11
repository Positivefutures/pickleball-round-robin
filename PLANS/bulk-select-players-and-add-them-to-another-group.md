# Bulk-select players and add them to another group

## Context

v1.7.0 shipped multiple named groups, but the only way to put an existing player into a second group is to open their edit modal one at a time and tick a checkbox. Splitting a 20-person group into a Tuesday and a Thursday roster means 20 round trips through a modal.

This adds a **Select Players** mode to the roster card: check several players, hit **Add to Group**, pick the target groups, save. Membership is additive — players stay in the current group — which matches the shared-player model where one person legitimately belongs to several groups.

Decisions confirmed with the user:
- **Add, never move.** Selected players stay in the current group. No orphaning is possible, so no delete-confirmation flow is needed.
- **Header swaps to a count + actions** while selecting; Edit/Remove stay visible but greyed out.
- **After save:** dialog closes, selection mode exits, and a brief confirmation appears.
- **Dialog lists existing groups only** — no create-a-group field.

---

## 1. Bulk membership write

Add one operation to [src/hooks/usePlayers.ts](src/hooks/usePlayers.ts), alongside the existing `setPlayerRosters` / `removeFromRoster` / `reassignRoster`:

```ts
const addPlayersToRosters = useCallback(
  (playerIds: string[], rosterIds: string[]) => {
    const targets = new Set(playerIds);
    setPlayers((prev) =>
      prev.map((p) =>
        targets.has(p.id)
          ? { ...p, rosterIds: Array.from(new Set([...p.rosterIds, ...rosterIds])) }
          : p
      )
    );
  },
  [setPlayers]
);
```

The `Set` union is what satisfies "don't add them twice" — a player already in the target group is unchanged. Doing this as **one** `setPlayers` call rather than looping `setPlayerRosters` per player keeps it a single atomic write instead of N sequential localStorage writes.

## 2. Selection state in RosterPage

[src/components/roster/RosterPage.tsx](src/components/roster/RosterPage.tsx) owns the roster card header, so selection state lives there. Stamp it with the group it belongs to, reusing the idiom already used for `editing` and `orphan` (RosterPage.tsx:48-58) so a group switch implicitly clears the selection without needing an effect:

```ts
const [selection, setSelection] = useState<{ ids: string[]; rosterId: string } | null>(null);
const selecting = selection?.rosterId === activeRosterId;
const selectedIds = selecting ? selection.ids : [];
```

Handlers: `startSelecting`, `cancelSelecting`, `toggleSelect(id)`, `toggleSelectAll()` (select all *currently listed* players, or clear if all are already selected).

**Header** (currently `{activeRoster?.name} ({players.length})` at RosterPage.tsx:~250):

- Not selecting → a **Select Players** button on the right.
- Selecting → `N selected` + **Add to Group** (disabled at zero) + **Cancel**.
- **Edge case the user didn't raise:** with only one group there is nowhere to add to. Disable Select Players when `rosters.length < 2` with `title="Create another group first"` rather than letting the user reach a dead-end dialog.

## 3. Checkbox list in PlayerList

[src/components/roster/PlayerList.tsx](src/components/roster/PlayerList.tsx) gains optional props — `selecting`, `selectedIds`, `onToggleSelect`, `onToggleSelectAll` — so it still renders normally when they're absent.

- A leading `<th>` holding the select-all checkbox, **left of the Name header**, and a leading `<td>` per row. Both only rendered while selecting, so the normal table is untouched.
- The select-all checkbox should be **indeterminate** when only some rows are selected (`ref` + `el.indeterminate = some && !all`) — without it, a partially-selected list looks identical to an empty one.
- Gender and Rating columns are unchanged.
- Edit/Remove get `disabled` plus `text-gray-300 cursor-not-allowed`, keeping them visible but inert as requested.
- Checkbox styling matches the group checkboxes already in [PlayerForm.tsx](src/components/roster/PlayerForm.tsx) (`w-4 h-4 accent-green-600`).
- **Suggested addition:** make the whole row toggle selection while in selection mode. The checkbox alone is a small tap target on a phone, and the row's other controls are disabled anyway so there's nothing to conflict with.

## 4. Add to Group dialog

New `src/components/roster/AddToGroupDialog.tsx`, following the overlay pattern shared by the three existing dialogs (`fixed inset-0 z-50 flex items-center justify-center bg-black/40` + white card) — see [ManageRostersModal.tsx](src/components/roster/ManageRostersModal.tsx) for the closest template.

- Title: `Add 3 players to…`
- Checkbox list of **all groups except the active one**.
- **Save** (disabled until at least one group is ticked) and **Cancel**.
- On save: `addPlayersToRosters(selectedIds, checkedGroupIds)`, close, exit selection mode, set the confirmation notice.

## 5. Confirmation notice

A short-lived message in RosterPage, e.g. *"3 players added to Sunday Social."* — green, above the roster card, cleared after ~4s:

```ts
useEffect(() => {
  if (!notice) return;
  const t = setTimeout(() => setNotice(null), 4000);
  return () => clearTimeout(t);
}, [notice]);
```

Name the target groups in the message rather than saying "added" generically — the whole point is that the change happened somewhere you can't currently see.

---

## Verification

Same approach as the last two features: Playwright driving the real UI, plus re-running the existing suites. All five current suites live in the session scratchpad and should be re-run unchanged.

**A. New checks** (`drive-select.mjs`), seeded with a group of ~6 players and a second and third empty group:

- Select Players is **disabled** when only one group exists; enabled once a second is created.
- Entering selection mode shows a checkbox per row plus a header checkbox; Gender and Rating still render.
- Edit and Remove are **disabled** while selecting, and clicking them does nothing.
- Header checkbox selects all; unchecking clears all; the count tracks correctly.
- Selecting a subset puts the header checkbox in the **indeterminate** state (assert the DOM property, not just the visual).
- Add to Group is disabled at zero selected, enabled at one or more.
- The dialog lists every group **except** the active one.
- Save adds exactly the selected players to exactly the ticked groups — verify against `pb-roster` in localStorage.
- **Dedupe:** a player already in the target group ends up with that group listed once, and the target group's member count rises by the number of genuinely new players, not by the number selected.
- Players remain in the original group (add, not move).
- After save: dialog closed, checkboxes gone, confirmation visible and naming the target group.
- Cancel in the dialog changes nothing; Cancel in the header exits selection mode.
- Switching groups mid-selection clears the selection (the stamping behaviour).

**B. Regression:** re-run `drive-rosters.mjs` (53), `verify-rosters.mjs` (20), `drive-app.mjs` (40), `regress.mjs` (11), `print-check.mjs` (6). The roster suite covers the normal, non-selecting table, so it proves the optional props didn't disturb the default rendering.

**C. Visual:** screenshot selection mode and the dialog to confirm the greyed actions and the header layout read correctly.

---

## Out of scope

- Bulk **remove from group** — the user considered and explicitly dropped it.
- Creating a group from inside the dialog — declined; Manage Groups already covers it.
- Selection persisting across a page refresh; it is transient UI state.
- The three existing dialogs still lack focus trapping and Escape handling. A fourth strengthens the case for extracting a shared `<Modal>`, but that stays a separate change.
