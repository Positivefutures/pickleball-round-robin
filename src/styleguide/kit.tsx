import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The style guide's own chrome, and the only markup in this folder that is
 * written rather than imported.
 *
 * Nothing here may draw an app control. A Section is a heading, an Example is a
 * labelled box with a code snippet under it, a Swatch is a coloured square —
 * none of them is a thing the app also has. The moment this file grows a button
 * that looks like the app's button, the guide has started lying, because that
 * copy will not change when the real one does.
 *
 * Deliberately styled in slate and zinc: the chrome must not be mistaken for
 * the app, whose palette is orange and teal.
 */

/* ---------------------------------------------------------------- structure */

export function Section({
  id,
  title,
  blurb,
  children,
}: {
  id: string;
  title: string;
  blurb?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="sg-section scroll-mt-4 border-t border-slate-200 pt-10 first:border-t-0">
      <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</h2>
      {blurb && <p className="mt-1.5 max-w-2xl text-[0.9375rem] leading-relaxed text-slate-600">{blurb}</p>}
      <div className="mt-6 flex flex-col gap-8">{children}</div>
    </section>
  );
}

export function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{children}</h3>
  );
}

/**
 * One labelled specimen: what it is called, how to invoke it, the live thing,
 * and the line to copy.
 *
 * `source` is what the reader would type. It is a hand-written string and there
 * is no way around that — but it sits beside a live render of the real
 * component, so a snippet that has gone stale shows up as a mismatch on screen
 * rather than hiding in a document nobody rebuilt.
 */
export function Example({
  name,
  note,
  source,
  dark = false,
  children,
}: {
  name: string;
  note?: ReactNode;
  source: string;
  /** For components drawn in white, which need something behind them. */
  dark?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <code className="text-[0.8125rem] font-bold text-slate-900">{name}</code>
        {note && <span className="text-[0.8125rem] leading-snug text-slate-500">{note}</span>}
      </div>
      <div
        className={`overflow-x-auto px-4 py-5 ${dark ? 'bg-slate-700' : ''}`}
        // The app's own type sizes must resolve here exactly as they do in the
        // app, so nothing in this box may set a font-size of its own.
      >
        {children}
      </div>
      <CodeBlock source={source} />
    </div>
  );
}

/** Several specimens that belong in a row, wrapping on a phone. */
export function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-start gap-4">{children}</div>;
}

/** A specimen with its own small caption under it — variant names, mostly. */
export function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      <div>{children}</div>
      <code className="text-[0.75rem] leading-tight text-slate-500">{label}</code>
    </div>
  );
}

/* ------------------------------------------------------------------- code */

export function CodeBlock({ source }: { source: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'selected'>('idle');
  const pre = useRef<HTMLPreElement>(null);

  /**
   * `navigator.clipboard` needs a secure context, and the way this page is
   * actually read on a phone — `vite --host` over plain http on the LAN — is not
   * one. So the failure is handled rather than swallowed: the snippet is
   * selected instead, which leaves the phone one tap from Copy on its own menu.
   */
  async function copy() {
    try {
      await navigator.clipboard.writeText(source);
      setState('copied');
    } catch {
      const node = pre.current;
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setState('selected');
    }
    window.setTimeout(() => setState('idle'), 2000);
  }

  return (
    // The button sits in a bar of its own rather than floating over the code.
    // Absolutely positioned it looked fine on a laptop and was unreadable on a
    // phone: a snippet wider than the screen scrolls horizontally and slid
    // straight underneath it.
    <div className="border-t border-slate-200 bg-slate-900">
      <div className="flex justify-end px-2 pt-2">
        <button
          type="button"
          onClick={copy}
          className="rounded-md bg-white/10 px-2.5 py-1 text-[0.75rem] font-bold text-slate-200 transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
        >
          {state === 'copied' ? 'Copied' : state === 'selected' ? 'Selected' : 'Copy'}
        </button>
      </div>
      <pre
        ref={pre}
        className="overflow-x-auto px-4 pb-3 pt-1 text-[0.8125rem] leading-relaxed text-slate-100"
      >
        <code>{source}</code>
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ colour */

/**
 * Reads the value off the document rather than repeating it.
 *
 * This is what keeps the palette section honest: change a hex in index.css and
 * this page changes with it, because the number on screen was never written
 * down here.
 */
function useCssVar(name: string) {
  const [value, setValue] = useState('');
  useEffect(() => {
    setValue(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
  }, [name]);
  return value;
}

export function Swatch({
  varName,
  role,
  ink = 'dark',
}: {
  varName: string;
  role: string;
  /** What colour text sits legibly on it, for the sample word. */
  ink?: 'dark' | 'light';
}) {
  const value = useCssVar(varName);
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200">
      <div
        className={`flex h-20 items-end p-2 text-sm font-bold ${
          ink === 'light' ? 'text-white' : 'text-slate-900'
        }`}
        style={{ backgroundColor: `var(${varName})` }}
      >
        Aa
      </div>
      <div className="flex flex-1 flex-col gap-0.5 bg-white px-2.5 py-2">
        <code className="text-[0.75rem] font-bold leading-tight text-slate-900 break-all">{varName}</code>
        <code className="text-[0.75rem] uppercase leading-tight text-slate-500">{value || '—'}</code>
        <span className="mt-0.5 text-[0.75rem] leading-tight text-slate-600">{role}</span>
      </div>
    </div>
  );
}

/** A colour the app writes as a literal, with no token behind it. */
export function HexSwatch({
  hex,
  role,
  count,
  ink = 'dark',
}: {
  hex: string;
  role: string;
  count: string;
  ink?: 'dark' | 'light';
}) {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-dashed border-amber-400">
      <div
        className={`flex h-20 items-end p-2 text-sm font-bold ${
          ink === 'light' ? 'text-white' : 'text-slate-900'
        }`}
        style={{ backgroundColor: hex }}
      >
        Aa
      </div>
      <div className="flex flex-1 flex-col gap-0.5 bg-white px-2.5 py-2">
        <code className="text-[0.75rem] font-bold uppercase leading-tight text-slate-900">{hex}</code>
        <code className="text-[0.75rem] leading-tight text-amber-700">{count}</code>
        <span className="mt-0.5 text-[0.75rem] leading-tight text-slate-600">{role}</span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- typography */

/**
 * A live specimen that measures itself.
 *
 * The size, weight and line height printed beside each line are read back off
 * the rendered element, so large-text mode and any future change to the scale
 * are reported rather than described.
 */
export function TypeSpecimen({
  className,
  weight = '',
  sample = 'Court 3 · Ada Lovelace',
  note,
}: {
  className: string;
  weight?: string;
  sample?: string;
  note?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [read, setRead] = useState('');

  // Re-measured whenever the specimen's own box changes, which is what makes
  // the large-text toggle report real numbers rather than the ones this file was
  // written against.
  //
  // The observer watches the line itself, not the document. `.text-large` is put
  // on a wrapper — the same place App.tsx puts it, on the shell rather than on
  // html — so the document never resizes and an observer on it would sit there
  // reporting the small-text numbers with the large ones on screen beside them.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const s = getComputedStyle(el);
      const px = parseFloat(s.fontSize);
      const lh = parseFloat(s.lineHeight);
      setRead(
        `${px.toFixed(1)}px / ${Number.isNaN(lh) ? 'normal' : `${lh.toFixed(1)}px`} · ${s.fontWeight}`
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [className, weight]);

  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4">
      <code className="w-full shrink-0 text-[0.75rem] font-bold text-slate-900 sm:w-56">
        {className}
        {weight ? ` ${weight}` : ''}
      </code>
      <p ref={ref} className={`min-w-0 flex-1 truncate text-slate-900 ${className} ${weight}`}>
        {sample}
      </p>
      <div className="shrink-0 sm:text-right">
        <code className="text-[0.75rem] text-slate-500">{read}</code>
        {note && <div className="text-[0.75rem] leading-tight text-amber-700">{note}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- states */

/**
 * The four interactive states this app can honestly show, side by side.
 *
 * Hover and active are real CSS pseudo-classes and cannot be forced from
 * outside the element without hand-copying the classes they apply — which is
 * exactly the copying this guide exists to avoid. So they are named here and
 * demonstrated by the live control itself: hover the first cell.
 *
 * Focus is real. The button below moves focus onto the specimen, so the ring
 * you see is the one the app draws, or the absence of one is the app's absence.
 */
export function StateBox({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <code className="text-[0.75rem] font-bold text-slate-900">{label}</code>
        {hint && <span className="text-[0.75rem] text-slate-500">{hint}</span>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Moves real focus onto whatever it wraps, so the real focus style shows. */
export function FocusProbe({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      <div ref={ref} className="min-w-0">
        {children}
      </div>
      <button
        type="button"
        onClick={() => ref.current?.querySelector<HTMLElement>('button,input,a,select,textarea')?.focus()}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[0.75rem] font-bold text-slate-700 transition-colors hover:bg-slate-100"
      >
        Focus It
      </button>
    </div>
  );
}

/** A finding from docs/ui-audit.md, called out where the reader can see it. */
export function Finding({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p className="flex gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-[0.875rem] leading-snug text-amber-900">
      <code className="shrink-0 font-bold">{id}</code>
      <span className="min-w-0">{children}</span>
    </p>
  );
}
