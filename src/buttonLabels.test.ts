import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every button in the app is labelled in Title Case. Jeff's rule, and this is
 * what keeps the next one from drifting: "Share Link", never "Share link".
 *
 * Read off the source rather than out of a rendered app, because the labels are
 * spread over sixty files and no single mount reaches all of them. It reads
 * only the buttons whose whole label is written out as literal text — a button
 * whose label is built from a name, a count or a state is not something a rule
 * about capitals can be checked against, and guessing at one would make this
 * test fire on code that is perfectly correct.
 *
 * Minor words stay lowercase in the middle of a label and take a capital at
 * either end, which is what "capitalised for every major word" means in
 * practice: "Add the Court", "Back to All Topics", "Sign In".
 *
 * Not covered here, deliberately: aria-labels and form field labels. Those are
 * descriptions read aloud rather than captions on a button — "Lower the rating",
 * "Court number keypad" — and Title Case would be wrong for them.
 */

const MINOR = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'for', 'to', 'in', 'on', 'of',
  'at', 'by', 'with', 'as', 'so', 'yet', 'from', 'into', 'per', 'vs', 'via',
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(path) && !/\.test\./.test(path) ? [path] : [];
  });
}

/**
 * The labels of every button whose text is written out in full.
 *
 * Anything with an expression in it is skipped: `{name}`, a ternary, a count.
 * So is anything holding a child element, since the label then belongs to the
 * span inside rather than to the button.
 */
function literalLabels(source: string): string[] {
  const found: string[] = [];
  let i = 0;
  while ((i = source.indexOf('<button', i)) >= 0) {
    let depth = 0;
    let end = -1;
    for (let j = i; j < source.length; j++) {
      const c = source[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) {
        end = j;
        break;
      }
    }
    if (end < 0) break;
    const close = source.indexOf('</button>', end);
    if (close < 0) break;
    const body = source.slice(end + 1, close).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').trim();
    // Literal text only: no tags, no expressions, and something to read.
    if (!/[<>{}]/.test(body) && /[A-Za-z]{2,}/.test(body)) {
      found.push(body.replace(/\s+/g, ' '));
    }
    i = end;
  }
  return found;
}

function titleCased(label: string): boolean {
  const words = label.replace(/[?.,!:;…]/g, '').split(/\s+/).filter(Boolean);
  return words.every((word, at) => {
    if (!/^[a-zA-Z]/.test(word)) return true;
    const inside = at > 0 && at < words.length - 1;
    return /^[A-Z]/.test(word) || (inside && MINOR.has(word.toLowerCase()));
  });
}

describe('every button label in the app', () => {
  const files = sourceFiles('src');

  it('reads enough of them for this to be worth running', () => {
    const all = files.flatMap((f) => literalLabels(readFileSync(f, 'utf8')));
    // Sixty-odd today. The floor is here so that a change to the reader which
    // quietly stops finding buttons cannot turn this file green by accident.
    expect(all.length).toBeGreaterThan(40);
  });

  it('capitalises every major word', () => {
    const wrong: string[] = [];
    for (const file of files) {
      for (const label of literalLabels(readFileSync(file, 'utf8'))) {
        if (!titleCased(label)) wrong.push(`${file}: ${JSON.stringify(label)}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('the rule itself', () => {
  it('takes a label that is already right', () => {
    expect(titleCased('Add the Court')).toBe(true);
    expect(titleCased('Back to All Topics')).toBe(true);
    expect(titleCased('Sign In')).toBe(true);
    expect(titleCased('Yes, Start New')).toBe(true);
  });

  it('refuses a major word left in lower case', () => {
    expect(titleCased('Share link')).toBe(false);
    expect(titleCased('Skip tutorial')).toBe(false);
  });

  it('refuses a minor word at either end, where it takes a capital', () => {
    expect(titleCased('to Setup')).toBe(false);
    expect(titleCased('Sign in')).toBe(false);
  });
});
