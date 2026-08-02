import type { Gender, Player } from '../types';

/** One player as read from a file, before it becomes a Player in the pool. */
export interface ImportRow {
  name: string;
  rating: number;
  gender: Gender;
}

export interface ParsedGroup {
  /** Group name from the file's Group column, or the fallback if it had none. */
  group: string;
  rows: ImportRow[];
  /** Rows dropped for having no name, plus repeats of a name already in the file. */
  skipped: number;
}

const MIN_RATING = 3;
const MAX_RATING = 5;
const BOM = '\uFEFF';

const HEADER = ['Group', 'Name', 'Rating', 'Gender'];

// Excel reads a bare UTF-8 CSV as the system codepage and mangles accented names;
// a BOM makes it read UTF-8. It also expects CRLF.
const LINE_END = '\r\n';

function escapeField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Every group in one file: a row per player per group, so someone who plays in
 * two groups appears once under each and their membership survives the round
 * trip. A group with no players contributes no rows and so cannot be
 * represented — see parseGroupsCsv for the reading side.
 */
export function toGroupsCsv(groups: { name: string; players: Player[] }[]): string {
  const lines = [HEADER.join(',')];
  for (const group of groups) {
    for (const p of group.players) {
      lines.push(
        [group.name, p.name, p.rating.toFixed(1), p.gender].map(escapeField).join(',')
      );
    }
  }
  return BOM + lines.join(LINE_END) + LINE_END;
}

export function toCsv(groupName: string, players: Player[]): string {
  return toGroupsCsv([{ name: groupName, players }]);
}

/**
 * Splits CSV text into rows of fields, honouring RFC-4180 quoting so a value may
 * contain commas, doubled quotes, or newlines. Accepts CRLF, LF, or CR.
 */
function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Trailing newline leaves a [''] row behind
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

function coerceRating(raw: string, fallback: number): number {
  const parsed = parseFloat(raw);
  const value = isNaN(parsed) ? fallback : parsed;
  return Math.min(MAX_RATING, Math.max(MIN_RATING, Math.round(value * 10) / 10));
}

function coerceGender(raw: string): Gender {
  return /^f/i.test(raw.trim()) ? 'F' : 'M';
}

/** Strips a folder path and the extension: "rosters/Tuesday Crowd.csv" -> "Tuesday Crowd" */
export function fileNameStem(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  return base.replace(/\.[^.]+$/, '').trim();
}

/** Filesystem-hostile characters, so the download lands with the name we asked for. */
export function toFileName(groupName: string): string {
  const safe = groupName.replace(/[/\\:*?"<>|]/g, '').trim();
  return `${safe || 'group'}.csv`;
}

/**
 * Dated, because the all-groups file is a backup — several of them in a
 * downloads folder need to be tellable apart. Local date rather than ISO, so
 * the stamp matches the day the user pressed the button in their own timezone.
 */
export function toAllGroupsFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `pickleball-groups-${stamp}.csv`;
}

/**
 * Reads an exported file back, one entry per group it contains. Deliberately
 * lenient: the header is matched case-insensitively, unknown columns are
 * ignored, and a missing Group column falls back to the file's name — so a
 * roster typed up in a spreadsheet, or the app's own legacy players.csv,
 * imports without editing.
 *
 * A file is only split into several groups when it names two or more of them.
 * With one group name or none, every row lands in a single group regardless of
 * blanks in the Group column — which keeps the lenient cases above reading
 * exactly as they always have.
 *
 * Duplicate names are judged within a group, not across the file: the same
 * player in two groups is the point of an all-groups export, while a name
 * repeated inside one group is still skipped.
 */
export function parseGroupsCsv(
  text: string,
  fallbackName: string,
  defaultRating = 4
): ParsedGroup[] {
  const rows = splitCsv(text.startsWith(BOM) ? text.slice(1) : text);
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const nameIdx = col('name');
  const ratingIdx = col('rating');
  const genderIdx = col('gender');
  const groupIdx = col('group');

  // No recognisable Name column means this isn't a group file at all.
  if (nameIdx === -1) return [];

  const at = (row: string[], idx: number) => (idx === -1 ? '' : row[idx] ?? '');
  const body = rows.slice(1);

  // One group name or none: the whole file is a single group, as before.
  const named = new Set(
    body.map((row) => at(row, groupIdx).trim()).filter((g) => g !== '')
  );
  const single = named.size <= 1;

  // Keyed by the group name as written, so the file's own order is preserved.
  const groups = new Map<string, { group: ParsedGroup; seen: Set<string> }>();
  const keyFor = (row: string[]) => (single ? '' : at(row, groupIdx).trim());

  const entryFor = (key: string) => {
    let entry = groups.get(key);
    if (!entry) {
      entry = { group: { group: key || fallbackName, rows: [], skipped: 0 }, seen: new Set() };
      groups.set(key, entry);
    }
    return entry;
  };

  // Nameless rows belong to no group in particular, so their skips land on the
  // group the row named — or on the single group when there is only one.
  for (const row of body) {
    const entry = entryFor(keyFor(row));
    const name = at(row, nameIdx).trim();
    if (!name) {
      entry.group.skipped++;
      continue;
    }
    const key = name.toLowerCase();
    if (entry.seen.has(key)) {
      entry.group.skipped++;
      continue;
    }
    entry.seen.add(key);

    entry.group.rows.push({
      name,
      rating: coerceRating(at(row, ratingIdx), defaultRating),
      gender: coerceGender(at(row, genderIdx)),
    });
  }

  // A single group takes its name from the first row that carried one, matching
  // the previous behaviour for files that only partly fill the Group column.
  if (single) {
    const entry = groups.get('');
    if (entry) entry.group.group = [...named][0] || fallbackName;
  }

  return [...groups.values()].map((e) => e.group);
}

/**
 * "Tuesday" against an existing "Tuesday" becomes "Tuesday (1)", then "Tuesday (2)".
 * Compared trimmed and case-insensitively, since two groups differing only in case
 * would be indistinguishable in the group picker.
 */
export function uniqueGroupName(desired: string, existingNames: string[]): string {
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const base = desired.trim() || 'Imported Group';
  if (!taken.has(base.toLowerCase())) return base;

  for (let i = 1; ; i++) {
    const candidate = `${base} (${i})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
