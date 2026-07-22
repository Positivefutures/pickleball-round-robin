import { describe, it, expect } from 'vitest';
import { getDisplayName, sumRatings, fisherYatesShuffle, generateId } from './helpers';

describe('getDisplayName', () => {
  it('shows the full entered name, never just the first name', () => {
    expect(getDisplayName({ id: '1', name: 'Jeff B' }, [])).toBe('Jeff B');
    expect(getDisplayName({ id: '2', name: 'Becky P' }, [])).toBe('Becky P');
    expect(getDisplayName({ id: '3', name: 'Mary Johnson' }, [])).toBe('Mary Johnson');
  });

  it('returns a single-word name unchanged', () => {
    expect(getDisplayName({ id: '4', name: 'Cher' }, [])).toBe('Cher');
  });

  it('does not abbreviate even when first names collide', () => {
    const roster = [
      { id: '1', name: 'Greg H' },
      { id: '2', name: 'Greg M' },
    ];
    expect(getDisplayName(roster[0], roster)).toBe('Greg H');
    expect(getDisplayName(roster[1], roster)).toBe('Greg M');
  });
});

describe('sumRatings', () => {
  it('adds player ratings', () => {
    expect(sumRatings([{ rating: 3.5 }, { rating: 4.0 }])).toBeCloseTo(7.5);
    expect(sumRatings([])).toBe(0);
  });
});

describe('fisherYatesShuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const input = [1, 2, 3, 4, 5];
    const out = fisherYatesShuffle(input);
    expect(out).toHaveLength(input.length);
    expect([...out].sort()).toEqual([...input].sort());
    expect(input).toEqual([1, 2, 3, 4, 5]); // original untouched
  });
});

describe('generateId', () => {
  it('produces unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});
