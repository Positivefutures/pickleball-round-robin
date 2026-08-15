/**
 * One line around a panel, written down once.
 *
 * The edge of a page panel, of a row in the Actions sheet and of the nine
 * tiles on its front screen were three different greys — #ddd, #D8DEE4 and
 * #E7E8EA — spread over twenty six spellings in thirteen files. Nobody chose
 * three; they arrived one panel at a time, each close enough to the last that
 * the difference only showed when two sat side by side.
 *
 * They were also too pale to do the job. A white panel on a #F9FAFB page, edged
 * in something 1.36:1 against the panel itself, has no visible edge at all.
 *
 * So there is one now, `--color-panel-edge`, and these hold the line: the old
 * greys are gone, the new one is a real theme colour rather than another
 * literal, and it is dark enough to see. Jeff asked for it on 2026-08-15.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '..');
const css = readFileSync(join(SRC, 'index.css'), 'utf8');
/** The same stylesheet with its comments taken out — what the browser sees. */
const cssRules = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every .ts and .tsx under src, tests included. */
function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

/**
 * Every source but this one. This file has to write the old greys down in
 * order to forbid them, and a rule that catches itself catches nothing.
 */
const files = sources()
  .map((path) => ({ path: path.slice(SRC.length + 1), text: readFileSync(path, 'utf8') }))
  .filter((f) => f.path !== 'lib/panelEdge.test.ts');

describe('the panel edge', () => {
  it('is declared once, as a theme colour', () => {
    // In @theme static, so Tailwind writes both the `border-panel-edge`
    // utility and a custom property anything inline can reach for.
    expect(css).toMatch(/--color-panel-edge:\s*#a2a7ab;/i);
    expect(css.match(/--color-panel-edge/g)).toHaveLength(1);
  });

  it('is a quarter darker than the grey it replaced', () => {
    // #D8DEE4 x 0.75, channel by channel. Written out as the sum rather than
    // as a second literal, so the next person can see where it came from.
    const [r, g, b] = [0xd8, 0xde, 0xe4].map((v) => Math.round(v * 0.75));
    const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    expect(hex).toBe('#a2a7ab');
  });

  it('leaves none of the three old greys behind', () => {
    // Any of them reappearing is the drift starting again, wherever it is and
    // whatever property it is set on.
    const stale = /#(ddd|dddddd|d8dee4|e7e8ea)\b/i;
    const guilty = files.filter((f) => stale.test(f.text)).map((f) => f.path);
    expect(guilty).toEqual([]);
    // The stylesheet without its prose: the comment on --color-panel-edge
    // names all three, which is the record of why it exists.
    expect(stale.test(cssRules)).toBe(false);
  });

  it('is what the panels and the Actions sheet actually draw', () => {
    // Named files rather than a count: the point is that these specific
    // surfaces share one edge, which is what Jeff was looking at.
    const wearing = (path: string) =>
      files.find((f) => f.path === path)?.text.includes('border-panel-edge');
    for (const path of [
      'components/setup/SetupPage.tsx', // Setup Round Robin, and the two below it
      'components/roster/RosterPage.tsx', // group membership
      'components/schedule/ActionsSheet.tsx', // the nine tiles and the rows
      'components/schedule/PartnerSummary.tsx',
      'components/schedule/StandingsPanel.tsx',
    ]) {
      expect(wearing(path), `${path} should draw the shared edge`).toBe(true);
    }
  });

  it('is dark enough to separate a white panel from the page behind it', () => {
    // The whole complaint, as a number. The old greys managed 1.36:1 against
    // the panel they edged; anything that pale is not an edge.
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    expect(contrast('#a2a7ab', '#ffffff')).toBeGreaterThan(2);
    // And against the page itself, which is bg-gray-50.
    expect(contrast('#a2a7ab', '#f9fafb')).toBeGreaterThan(2);
  });
});
