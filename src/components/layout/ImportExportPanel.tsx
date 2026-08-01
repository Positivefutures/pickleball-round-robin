import { useRef, useState } from 'react';
import type { Player, Roster } from '../../types';

export interface ImportResult {
  ok: boolean;
  /** Headline line — the new group's name, or what went wrong. */
  title: string;
  /** Supporting lines: counts, and anything the import decided on its own. */
  details: string[];
}

interface Props {
  rosters: Roster[];
  players: Player[];
  activeRosterId: string;
  onExport: (rosterId: string) => void;
  onImport: (file: File) => Promise<ImportResult>;
  onClose: () => void;
}

export function ImportExportPanel({
  rosters,
  players,
  activeRosterId,
  onExport,
  onImport,
  onClose,
}: Props) {
  const [selectedId, setSelectedId] = useState(activeRosterId);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const countFor = (rosterId: string) =>
    players.filter((p) => p.rosterIds.includes(rosterId)).length;
  const selectedCount = countFor(selectedId);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset first, so picking the same file twice in a row still fires onChange
    e.target.value = '';
    if (!file) return;

    setBusy(true);
    try {
      setResult(await onImport(file));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="mx-4 max-h-[90vh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-lg bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-center text-lg font-semibold text-gray-800">
          Import / Export Group
        </h2>

        <section className="mt-5">
          <h3 className="mb-2 font-medium text-gray-700">Export</h3>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            aria-label="Group to export"
            className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {rosters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({countFor(r.id)})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onExport(selectedId)}
            disabled={selectedCount === 0}
            className="w-full rounded-md bg-green-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export as CSV
          </button>
          <p className="mt-2 text-xs text-gray-500">
            {selectedCount === 0
              ? 'This group has no players to export.'
              : 'Saves the group name and every player, with their rating and gender.'}
          </p>
        </section>

        <section className="mt-6 border-t border-gray-200 pt-5">
          <h3 className="mb-2 font-medium text-gray-700">Import</h3>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="w-full rounded-md bg-blue-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Reading…' : 'Choose a File…'}
          </button>
          <p className="mt-2 text-xs text-gray-500">Creates a new group.</p>

          {result && (
            <div
              className={`mt-3 rounded-md border px-3 py-2 text-sm ${
                result.ok
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              <p className="font-medium">{result.title}</p>
              {result.details.map((line) => (
                <p key={line} className="mt-0.5">
                  {line}
                </p>
              ))}
            </div>
          )}
        </section>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-md bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-300"
        >
          Done
        </button>
      </div>
    </div>
  );
}
