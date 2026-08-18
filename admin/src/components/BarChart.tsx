/**
 * A distribution, as horizontal bars.
 *
 * Horizontal rather than vertical because the categories are bands with names
 * ("9-12", "33+"), and a horizontal bar gives a label room to be read without
 * being rotated. Rotated axis labels are in the anti-pattern list for good
 * reason.
 *
 * One series, so no legend: the heading names it. Every bar is directly
 * labelled with its count, which is both the honest way to show a small
 * distribution and the relief the palette check asks for.
 */

export interface Bar {
  label: string;
  value: number;
}

export function BarChart({
  bars,
  empty = 'No readings yet.',
  unit,
}: {
  bars: Bar[];
  empty?: string;
  /** Named once above the bars, never repeated on each row. */
  unit?: string;
}) {
  if (!bars.length || bars.every((b) => b.value === 0)) {
    return <p className="py-8 text-center text-sm text-[var(--color-ink-faint)]">{empty}</p>;
  }

  const max = Math.max(...bars.map((b) => b.value));

  return (
    <>
      {/* The unit said once. Repeating "accounts" beside all eight bars is the
          same word eight times, and at this column width it wrapped. */}
      {unit && (
        <p className="mt-0 mb-1 text-xs text-[var(--color-ink-faint)]">Number of {unit}</p>
      )}
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {bars.map((b) => (
          <li key={b.label} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-right text-sm text-[var(--color-ink-quiet)] tnum">
              {b.label}
            </span>
            <span className="relative h-6 flex-1 overflow-hidden rounded-sm bg-[var(--color-grid)]">
              <span
                className="absolute inset-y-0 left-0 rounded-r-[4px] bg-[var(--color-series-1)]"
                // A count of 1 against a max of 40 would otherwise be a bar you
                // cannot see, which reads as zero. 2% is the floor that keeps a
                // real value visible without misrepresenting its size.
                style={{ width: `${Math.max((b.value / max) * 100, b.value ? 2 : 0)}%` }}
              />
            </span>
            <span className="w-10 shrink-0 text-sm text-[var(--color-ink)] tnum">
              {b.value.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
