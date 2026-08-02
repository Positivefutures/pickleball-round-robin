import { describe, it, expect } from 'vitest';
import {
  toCsv,
  toGroupsCsv,
  parseGroupsCsv,
  uniqueGroupName,
  fileNameStem,
  toFileName,
  toAllGroupsFileName,
} from './groupFile';
import type { Player } from '../types';

function player(name: string, rating: number, gender: 'M' | 'F'): Player {
  return { id: `id-${name}`, name, rating, gender, rosterIds: ['r1'] };
}

/** Most cases below describe a single-group file; this reads the one group. */
function parseOne(text: string, fallback: string, defaultRating?: number) {
  const groups = parseGroupsCsv(text, fallback, defaultRating);
  return groups[0] ?? { group: fallback, rows: [], skipped: 0 };
}

describe('toCsv', () => {
  it('writes a header, the group on every row, and one-decimal ratings', () => {
    const csv = toCsv('Tuesday Crowd', [
      player('Adonica M', 4, 'F'),
      player('Jeff B', 4.5, 'M'),
    ]);
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
    expect(lines[0]).toBe('Group,Name,Rating,Gender');
    expect(lines[1]).toBe('Tuesday Crowd,Adonica M,4.0,F');
    expect(lines[2]).toBe('Tuesday Crowd,Jeff B,4.5,M');
  });

  it('starts with a BOM so Excel reads it as UTF-8', () => {
    expect(toCsv('G', [player('Renée D', 4, 'F')]).startsWith('\uFEFF')).toBe(true);
  });

  it('quotes fields containing commas and doubles embedded quotes', () => {
    const csv = toCsv('My, Group', [player('Baker, Jeff "JB"', 4, 'M')]);
    expect(csv).toContain('"My, Group","Baker, Jeff ""JB""",4.0,M');
  });

  it('exports a group with no players as a header only', () => {
    const csv = toCsv('Empty', []);
    expect(csv.replace(/^\uFEFF/, '').trim()).toBe('Group,Name,Rating,Gender');
  });
});

describe('parseGroupsCsv', () => {
  it('round-trips an exported file, quoting and all', () => {
    const players = [
      player('Baker, Jeff', 4.5, 'M'),
      player('Renée "Ren" D', 3.2, 'F'),
    ];
    const parsed = parseOne(toCsv('Tuesday Crowd', players), 'ignored');
    expect(parsed.group).toBe('Tuesday Crowd');
    expect(parsed.skipped).toBe(0);
    expect(parsed.rows).toEqual([
      { name: 'Baker, Jeff', rating: 4.5, gender: 'M' },
      { name: 'Renée "Ren" D', rating: 3.2, gender: 'F' },
    ]);
  });

  it('accepts LF-only input and a header in any case', () => {
    const parsed = parseOne('group,NAME,Rating,gender\nTue,Al,4,m\n', 'x');
    expect(parsed.group).toBe('Tue');
    expect(parsed.rows).toEqual([{ name: 'Al', rating: 4, gender: 'M' }]);
  });

  it('reads the legacy players.csv shape: BOM, no Group column, extra Include column', () => {
    const legacy = '\uFEFFName,Include,Gender,Rating\r\nAdonica M,Yes,F,4\r\nAndrew M,Yes,M,4\r\n';
    const parsed = parseOne(legacy, 'players');
    expect(parsed.group).toBe('players'); // falls back to the file name
    expect(parsed.rows).toEqual([
      { name: 'Adonica M', rating: 4, gender: 'F' },
      { name: 'Andrew M', rating: 4, gender: 'M' },
    ]);
  });

  it('clamps out-of-range ratings and falls back on junk', () => {
    const csv = 'Group,Name,Rating,Gender\nG,Low,1.2,M\nG,High,9,M\nG,Junk,abc,M\nG,Blank,,M\n';
    const parsed = parseOne(csv, 'x', 4.0);
    expect(parsed.rows.map((r) => r.rating)).toEqual([3, 5, 4, 4]);
  });

  it('reads gender leniently and defaults to M', () => {
    const csv = 'Group,Name,Rating,Gender\nG,A,4,female\nG,B,4,f\nG,C,4,\nG,D,4,x\n';
    expect(parseOne(csv, 'x').rows.map((r) => r.gender)).toEqual(['F', 'F', 'M', 'M']);
  });

  it('skips nameless rows and repeats of a name already in the file', () => {
    const csv = 'Group,Name,Rating,Gender\nG,Jeff B,4,M\nG, ,4,M\nG,jeff b,5,F\nG,Sue,3.5,F\n';
    const parsed = parseOne(csv, 'x');
    expect(parsed.rows.map((r) => r.name)).toEqual(['Jeff B', 'Sue']);
    expect(parsed.skipped).toBe(2);
  });

  it('takes the group name from the first row that has one', () => {
    const csv = 'Group,Name,Rating,Gender\n,Jeff B,4,M\nTue,Sue,4,F\n';
    expect(parseOne(csv, 'fallback').group).toBe('Tue');
  });

  it('returns nothing usable for a file with no Name column', () => {
    const parsed = parseOne('just some text\nnot a csv at all\n', 'fallback');
    expect(parsed.rows).toEqual([]);
    expect(parsed.group).toBe('fallback');
  });

  it('returns nothing usable for an empty file', () => {
    expect(parseOne('', 'fallback').rows).toEqual([]);
  });
});

describe('all-groups files', () => {
  it('round-trips several groups in file order', () => {
    const csv = toGroupsCsv([
      { name: 'Tuesday', players: [player('Ana', 4.5, 'F'), player('Ben', 4, 'M')] },
      { name: 'Sunday', players: [player('Cara', 3.5, 'F')] },
    ]);
    const groups = parseGroupsCsv(csv, 'ignored');
    expect(groups.map((g) => g.group)).toEqual(['Tuesday', 'Sunday']);
    expect(groups[0].rows.map((r) => r.name)).toEqual(['Ana', 'Ben']);
    expect(groups[1].rows).toEqual([{ name: 'Cara', rating: 3.5, gender: 'F' }]);
  });

  it('keeps a player who is in two groups in both, without calling it a repeat', () => {
    const ana = player('Ana', 4.5, 'F');
    const csv = toGroupsCsv([
      { name: 'Tuesday', players: [ana, player('Ben', 4, 'M')] },
      { name: 'Sunday', players: [ana] },
    ]);
    const groups = parseGroupsCsv(csv, 'ignored');
    expect(groups[0].rows.map((r) => r.name)).toEqual(['Ana', 'Ben']);
    expect(groups[1].rows.map((r) => r.name)).toEqual(['Ana']);
    expect(groups.every((g) => g.skipped === 0)).toBe(true);
  });

  it('still skips a name repeated inside one group', () => {
    const csv =
      'Group,Name,Rating,Gender\nTue,Ana,4,F\nTue,ana,5,F\nSun,Ana,4,F\nSun,Ben,4,M\n';
    const groups = parseGroupsCsv(csv, 'x');
    expect(groups[0].rows.map((r) => r.name)).toEqual(['Ana']);
    expect(groups[0].skipped).toBe(1);
    expect(groups[1].rows.map((r) => r.name)).toEqual(['Ana', 'Ben']);
    expect(groups[1].skipped).toBe(0);
  });

  it('treats one group name plus blank rows as a single group, not two', () => {
    const csv = 'Group,Name,Rating,Gender\n,Jeff B,4,M\nTue,Sue,4,F\n';
    const groups = parseGroupsCsv(csv, 'fallback');
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBe('Tue');
    expect(groups[0].rows.map((r) => r.name)).toEqual(['Jeff B', 'Sue']);
  });

  it('splits as soon as a second group is named', () => {
    const csv = 'Group,Name,Rating,Gender\nTue,Jeff B,4,M\nSun,Sue,4,F\n';
    expect(parseGroupsCsv(csv, 'fallback').map((g) => g.group)).toEqual(['Tue', 'Sun']);
  });

  it('names an all-groups download after the day it was made', () => {
    expect(toAllGroupsFileName(new Date(2026, 7, 1))).toBe('pickleball-groups-2026-08-01.csv');
  });
});

describe('uniqueGroupName', () => {
  it('keeps a name that is not taken', () => {
    expect(uniqueGroupName('Tuesday', ['Main Group'])).toBe('Tuesday');
  });

  it('suffixes collisions in order', () => {
    expect(uniqueGroupName('Tuesday', ['Tuesday'])).toBe('Tuesday (1)');
    expect(uniqueGroupName('Tuesday', ['Tuesday', 'Tuesday (1)'])).toBe('Tuesday (2)');
  });

  it('treats names differing only by case or padding as taken', () => {
    expect(uniqueGroupName('  tuesday ', ['TUESDAY'])).toBe('tuesday (1)');
  });

  it('falls back when the desired name is blank', () => {
    expect(uniqueGroupName('   ', [])).toBe('Imported Group');
  });
});

describe('file names', () => {
  it('strips the path and extension for the fallback group name', () => {
    expect(fileNameStem('rosters/Tuesday Crowd.csv')).toBe('Tuesday Crowd');
    expect(fileNameStem('players')).toBe('players');
  });

  it('drops characters that break a download', () => {
    expect(toFileName('Tue/Thu: "A"')).toBe('TueThu A.csv');
    expect(toFileName('///')).toBe('group.csv');
  });
});
