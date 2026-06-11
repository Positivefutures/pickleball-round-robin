interface HeaderProps {
  largeText: boolean;
  onToggleLargeText: () => void;
}

export function Header({ largeText, onToggleLargeText }: HeaderProps) {
  return (
    <header className="bg-green-700 text-white py-4 px-6 no-print">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Pickleball Round Robin
          </h1>
          <p className="text-green-200 text-sm mt-1">
            Generate balanced matchups for your group
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleLargeText}
          aria-pressed={largeText}
          aria-label={largeText ? 'Switch to normal text size' : 'Switch to large text size'}
          title={largeText ? 'Normal text size' : 'Large text size'}
          className={`mt-1 flex h-10 w-12 shrink-0 items-end justify-center gap-0.5 rounded-md border-2 border-white/80 pb-1.5 transition-colors ${
            largeText
              ? 'bg-white text-green-700'
              : 'bg-transparent text-white hover:bg-white/10'
          }`}
        >
          <span aria-hidden="true" className="text-[0.75rem] font-bold leading-none">A</span>
          <span aria-hidden="true" className="text-[1.25rem] font-bold leading-none">A</span>
        </button>
      </div>
    </header>
  );
}
