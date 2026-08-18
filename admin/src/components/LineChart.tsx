/**
 * A line over time, with a crosshair.
 *
 * Inline SVG and no charting library. The whole need is a handful of daily
 * series, and a dependency for that would be larger than the app around it.
 *
 * The rules it follows, and why each is not a preference:
 *
 *   * **2px strokes, recessive grid.** The marks are the data; the axes are
 *     furniture and should read as furniture.
 *   * **A legend whenever there is more than one series, and never for one.**
 *     A single series is named by the title, and a legend box for it is a
 *     second label for the same thing.
 *   * **Selective direct labels.** The last point of each series is labelled.
 *     Labelling every point is the most common way a line chart becomes
 *     unreadable.
 *   * **Labels wear ink, not the series colour.** The swatch beside a label
 *     carries identity; the text carries the word. Text in a series colour is
 *     the same information said twice, at a third of the contrast.
 *   * **One axis, always.** Two series of different magnitude go on two charts.
 *     There is no `secondaryAxis` prop and there should never be one.
 */

import { useId, useMemo, useState } from 'react';

export interface Series {
  label: string;
  points: { day: string; value: number }[];
  /** 1, 2 or 3. Assigned by the caller in fixed order, never cycled. */
  slot: 1 | 2 | 3;
}

const SLOT = {
  1: 'var(--color-series-1)',
  2: 'var(--color-series-2)',
  3: 'var(--color-series-3)',
} as const;

const PAD = { top: 16, right: 64, bottom: 28, left: 48 };

/**
 * Gridlines on round numbers.
 *
 * Dividing the range into four equal parts is the obvious thing and it produces
 * an axis labelled 42, 85, 127, 169, which nobody can read a value off. Steps
 * are snapped to 1, 2 or 5 times a power of ten, which is the same rule a ruler
 * uses and the reason a ruler is legible.
 *
 * Four gridlines is enough to read a value off and few enough to stay quiet.
 */
function niceScale(min: number, max: number): { top: number; ticks: number[] } {
  const span = max - min || 1;
  const rough = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    magnitude * ([1, 2, 5, 10].find((m) => rough <= m * magnitude) ?? 10);

  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = Math.floor(min / step) * step; t <= top + step / 2; t += step) {
    ticks.push(Number(t.toFixed(10)));
  }
  return { top, ticks };
}

export interface LineChartProps {
  series: Series[];
  height?: number;
  /** Rendered on the axis and in the tooltip. */
  format?: (n: number) => string;
  /** Shown in place of the chart when there is nothing to draw. */
  empty?: string;
}

export function LineChart({
  series,
  height = 220,
  format = (n) => n.toLocaleString(),
  empty = 'No readings yet.',
}: LineChartProps) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const days = [...new Set(series.flatMap((s) => s.points.map((p) => p.day)))].sort();
    const values = series.flatMap((s) => s.points.map((p) => p.value));
    if (!days.length || !values.length) return null;

    const max = Math.max(...values);
    const min = Math.min(...values, 0);
    // A flat line at 5 should sit in the middle of the plot, not on the lid.
    const headroom = max === min ? max + 1 : max + (max - min) * 0.1;

    return { days, min, ...niceScale(min, headroom) };
  }, [series]);

  if (!model) {
    return (
      <p className="py-10 text-center text-sm text-[var(--color-ink-faint)]">{empty}</p>
    );
  }

  const { days, min, top, ticks } = model;
  const width = 720;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const x = (day: string) =>
    PAD.left + (days.length === 1 ? plotW / 2 : (days.indexOf(day) / (days.length - 1)) * plotW);
  const y = (value: number) => PAD.top + plotH - ((value - min) / (top - min)) * plotH;

  const hoveredDay = hover === null ? null : days[hover];

  return (
    <figure className="m-0">
      {series.length > 1 && (
        <figcaption className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5 text-sm text-[var(--color-ink-quiet)]">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: SLOT[s.slot] }}
              />
              {s.label}
            </span>
          ))}
        </figcaption>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`${series.map((s) => s.label).join(', ')} over ${days.length} days`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * width;
          const t = (px - PAD.left) / plotW;
          const i = Math.round(t * (days.length - 1));
          setHover(i >= 0 && i < days.length ? i : null);
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--color-grid)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(t) + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--color-ink-faint)"
              className="tnum"
            >
              {format(t)}
            </text>
          </g>
        ))}

        {/* First and last day only. A date under every point is noise. */}
        {[days[0], days[days.length - 1]].map((d, i) => (
          <text
            key={`${d}-${i}`}
            x={x(d)}
            y={height - 8}
            textAnchor={i === 0 ? 'start' : 'end'}
            fontSize={11}
            fill="var(--color-ink-faint)"
          >
            {d.slice(5)}
          </text>
        ))}

        {hoveredDay && (
          <line
            x1={x(hoveredDay)}
            x2={x(hoveredDay)}
            y1={PAD.top}
            y2={PAD.top + plotH}
            stroke="var(--color-ink-faint)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}

        {series.map((s) => {
          const path = s.points
            .filter((p) => days.includes(p.day))
            .sort((a, b) => a.day.localeCompare(b.day))
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day)},${y(p.value)}`)
            .join(' ');
          const last = s.points[s.points.length - 1];
          return (
            <g key={`${id}-${s.label}`}>
              <path d={path} fill="none" stroke={SLOT[s.slot]} strokeWidth={2} strokeLinejoin="round" />
              {last && (
                <>
                  {/* A 2px surface ring, so two series crossing stay legible. */}
                  <circle cx={x(last.day)} cy={y(last.value)} r={5} fill="#fff" />
                  <circle cx={x(last.day)} cy={y(last.value)} r={4} fill={SLOT[s.slot]} />
                  <text
                    x={x(last.day) + 10}
                    y={y(last.value) + 4}
                    fontSize={12}
                    fill="var(--color-ink)"
                    className="tnum"
                  >
                    {format(last.value)}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {hoveredDay &&
          series.map((s) => {
            const p = s.points.find((q) => q.day === hoveredDay);
            if (!p) return null;
            return (
              <circle
                key={`${id}-dot-${s.label}`}
                cx={x(p.day)}
                cy={y(p.value)}
                r={4}
                fill={SLOT[s.slot]}
                stroke="#fff"
                strokeWidth={2}
              />
            );
          })}
      </svg>

      {hoveredDay && (
        <p className="mt-1 text-sm text-[var(--color-ink-quiet)] tnum">
          <strong className="font-medium text-[var(--color-ink)]">{hoveredDay}</strong>
          {series.map((s) => {
            const p = s.points.find((q) => q.day === hoveredDay);
            return p ? `  ·  ${s.label} ${format(p.value)}` : '';
          })}
        </p>
      )}
    </figure>
  );
}
