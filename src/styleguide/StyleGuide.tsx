import { useEffect, useState } from 'react';
import { Foundations } from './sections/Foundations';
import { Controls } from './sections/Controls';
import { Surfaces } from './sections/Surfaces';
import { Bits } from './sections/Bits';
import { APP_VERSION } from '../lib/appInfo';

/**
 * The living style guide, at /style-guide in dev only.
 *
 * The rule this page is built on: it imports the real components and never
 * redraws one. Where a control is a class string rather than a component, the
 * string is imported too. There are exactly four places where markup is copied
 * — the grey, teal, orange and red inline buttons, plus the rows and notices
 * that live as private consts inside a single file — and every one of them is
 * labelled as a copy with the file and line it came from, because a button that
 * cannot be imported is itself the finding.
 *
 * Kept out of the production build by living behind its own HTML entry at the
 * repo root: `vite build` only takes `index.html`, so nothing here reaches
 * `dist/`. See `style-guide.html` and the dev-only middleware in vite.config.ts.
 */

const SECTIONS = [
  { id: 'colour', label: 'Colour' },
  { id: 'type', label: 'Typography' },
  { id: 'spacing', label: 'Spacing & shadow' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'states', label: 'Interactive states' },
  { id: 'forms', label: 'Form fields' },
  { id: 'panels', label: 'Panels & dialogs' },
  { id: 'cards', label: 'Cards' },
  { id: 'banners', label: 'Banners' },
  { id: 'notices', label: 'Notices' },
  { id: 'rows', label: 'Rows & lists' },
  { id: 'nav', label: 'Navigation' },
  { id: 'badges', label: 'Badges & pills' },
  { id: 'schedule', label: 'Schedule surfaces' },
  { id: 'icons', label: 'Icons' },
];

/** The frame the specimens are drawn in, so a phone layout can be checked. */
const WIDTHS = [
  { id: 'phone', label: 'Phone', px: 390 },
  { id: 'tablet', label: 'Tablet', px: 768 },
  { id: 'full', label: 'Full', px: 0 },
] as const;

type WidthId = (typeof WIDTHS)[number]['id'];

export function StyleGuide() {
  const [width, setWidth] = useState<WidthId>('full');
  const [largeText, setLargeText] = useState(false);
  const [active, setActive] = useState(SECTIONS[0].id);

  // Which section the reader is in, for the sidebar. Watches the scrolling pane
  // rather than the document, because index.css holds the document still.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (seen?.target.id) setActive(seen.target.id);
      },
      { root: document.querySelector('[data-sg-scroll]'), rootMargin: '0px 0px -70% 0px' }
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const frame = WIDTHS.find((w) => w.id === width)!;

  return (
    // The app's own scroll architecture: index.css holds html and body still and
    // scrolls a pane inside them. Borrowing it rather than overriding it means
    // the components render in the environment they were built for.
    <div data-sg-scroll className="app-scroll bg-slate-100">
      <div className="mx-auto flex max-w-[92rem] flex-col lg:flex-row">
        <Sidebar
          active={active}
          width={width}
          onWidth={setWidth}
          largeText={largeText}
          onLargeText={() => setLargeText((v) => !v)}
        />

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">
          <header className="mb-10">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              Pickleball Round Robin — UI
            </h1>
            <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-slate-600">
              Every specimen below is the real component, imported. Nothing is redrawn, so this page
              changes when the app does. The amber notes are findings from{' '}
              <code className="rounded bg-slate-200 px-1 py-0.5">docs/ui-audit.md</code>, kept beside
              the thing they are about.
            </p>
            <p className="mt-2 text-[0.8125rem] text-slate-500">
              Build {APP_VERSION} · dev only, never in <code>dist/</code>
            </p>
          </header>

          {/* The frame. `text-large` goes here rather than on the document,
              which is exactly where App.tsx puts it — on the shell, not on html. */}
          <div
            className={`transition-[max-width] duration-200 ${largeText ? 'text-large' : ''} ${
              frame.px ? 'rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4' : ''
            }`}
            style={frame.px ? { maxWidth: frame.px } : undefined}
          >
            {frame.px > 0 && (
              <p className="mb-4 text-[0.75rem] text-slate-500">
                Frame held to {frame.px}px. Tailwind's <code>sm:</code> and <code>lg:</code>{' '}
                breakpoints still follow the real window — the app only uses 21 of them, so little
                is hidden by that, but resize the browser to check those.
              </p>
            )}
            <div className="flex flex-col gap-14">
              <Foundations />
              <Controls />
              <Surfaces />
              <Bits />
            </div>
          </div>

          <footer className="mt-16 border-t border-slate-200 pt-6 text-[0.8125rem] leading-relaxed text-slate-500">
            Source of truth for UI naming, alongside{' '}
            <code className="rounded bg-slate-200 px-1 py-0.5">docs/ui-audit.md</code>. Say
            &ldquo;the secondary button&rdquo; or &ldquo;a teal tile&rdquo; and this page is what
            that means.
          </footer>
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  active,
  width,
  onWidth,
  largeText,
  onLargeText,
}: {
  active: string;
  width: WidthId;
  onWidth: (w: WidthId) => void;
  largeText: boolean;
  onLargeText: () => void;
}) {
  return (
    // Sticky on a laptop, a horizontal scroller pinned to the top on a phone.
    <nav className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-slate-100/95 backdrop-blur lg:h-screen lg:w-60 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:py-8">
      <div className="flex flex-col gap-3 px-4 py-3 lg:px-6 lg:py-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
            {WIDTHS.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => onWidth(w.id)}
                aria-pressed={width === w.id}
                className={`rounded-md px-2.5 py-1 text-[0.75rem] font-bold transition-colors ${
                  width === w.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onLargeText}
            aria-pressed={largeText}
            className={`rounded-lg border px-2.5 py-1.5 text-[0.75rem] font-bold transition-colors ${
              largeText
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            Large Text
          </button>
        </div>

        <ul className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:pb-0">
          {SECTIONS.map((s) => (
            <li key={s.id} className="shrink-0 lg:shrink">
              <a
                href={`#${s.id}`}
                className={`block whitespace-nowrap rounded-md px-2.5 py-1.5 text-[0.8125rem] font-bold transition-colors ${
                  active === s.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
