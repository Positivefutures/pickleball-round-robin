interface HeaderProps {
  /** Shown in the banner — the app name on the roster step, the group name after. */
  title: string;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  /** Omitted on steps with nothing worth printing, which hides the button. */
  onPrint?: () => void;
}

export function Header({ title, settingsOpen, onToggleSettings, onPrint }: HeaderProps) {
  return (
    <header className="bg-green-700 text-white py-2.5 px-6 no-print">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <div className="flex shrink-0 items-center gap-2">
          {onPrint && (
            <button
              type="button"
              onClick={onPrint}
              aria-label="Print / Save PDF"
              title="Print / Save PDF"
              className="flex h-10 w-12 items-center justify-center rounded-md border-2 border-white/80 bg-transparent text-white transition-colors hover:bg-white/10"
            >
              <svg
                width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
            </button>
          )}
          {/* Stays on screen in the sliver of panel left visible when the drawer
              is open, so the same button closes it again. */}
          <button
            type="button"
            onClick={onToggleSettings}
            aria-expanded={settingsOpen}
            aria-label={settingsOpen ? 'Close settings' : 'Open settings'}
            title="Settings"
            className={`flex h-10 w-12 items-center justify-center rounded-md border-2 border-white/80 transition-colors ${
              settingsOpen
                ? 'bg-white text-green-700'
                : 'bg-transparent text-white hover:bg-white/10'
            }`}
          >
            <svg
              width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
