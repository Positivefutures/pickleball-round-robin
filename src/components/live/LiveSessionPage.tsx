import { useCallback, useEffect, useState } from 'react';
import { fetchShared, type LiveFetch } from '../../lib/liveViewer';
import { APP_URL } from '../../lib/appInfo';
import { StandingsPanel } from '../schedule/StandingsPanel';
import { LiveCourt } from './LiveCourt';

/**
 * Somebody else's session, read-only.
 *
 * The whole page for a visitor, rather than a panel inside the app. It is
 * branched to in main.tsx and App never mounts, which is the point: a visitor
 * has their own saved session in this browser, and App reads every bit of it in
 * lazy initializers before any early return inside it could fire. Sitting
 * outside means a person who scans a code at a court cannot have their own
 * afternoon disturbed by looking at somebody else's.
 *
 * It also means no settings drawer, no tabs and no sync, so the chrome here is
 * its own rather than the app's. What it does share is every component that
 * draws a session, which is what the scoring release was careful to leave
 * free of stores.
 */

/** Long enough not to hammer, short enough that a score lands while people look. */
const POLL_MS = 20_000;

const CREAM = '#FBFAF6';
const NAVY = '#051829';

interface Props {
  shareKey: string;
}

export function LiveSessionPage({ shareKey }: Props) {
  const [result, setResult] = useState<LiveFetch | null>(null);
  const [seenAt, setSeenAt] = useState<Date | null>(null);
  const [pulling, setPulling] = useState(false);

  const pull = useCallback(async () => {
    const got = await fetchShared(shareKey);
    setResult(got);
    if (got.state === 'ok') setSeenAt(new Date());
    return got;
  }, [shareKey]);

  useEffect(() => {
    let live = true;

    async function poll() {
      // A tab in the background is a phone in a pocket. Asking every twenty
      // seconds all afternoon would be somebody else's battery.
      if (document.visibilityState !== 'visible') return;
      const got = await fetchShared(shareKey);
      if (!live) return;
      setResult(got);
      if (got.state === 'ok') setSeenAt(new Date());
    }

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    // Straight away on coming back, rather than up to twenty seconds later
    // looking at a stale court.
    const wake = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', wake);

    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [shareKey]);

  async function retry() {
    setPulling(true);
    await pull();
    setPulling(false);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{ backgroundColor: CREAM }}
      >
        <h1 className="text-lg font-extrabold leading-tight" style={{ color: NAVY }}>
          Pickleball Round Robin
        </h1>
        {result?.state === 'ok' && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#149A30] ring-1 ring-[#149A30]/30">
            <span className="h-2 w-2 rounded-full bg-[#149A30]" aria-hidden="true" />
            LIVE
          </span>
        )}
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-2 pb-10 pt-4">
        {result === null && <Notice title="Loading this session…" />}

        {result?.state === 'gone' && (
          <Notice
            title="This session link has ended."
            body="Ask whoever is running it for a new one."
            onRetry={retry}
            retrying={pulling}
          />
        )}

        {result?.state === 'outdated' && (
          <Notice
            title="This session needs a newer version of the app."
            body="Reload the page and it will update itself."
            onRetry={() => window.location.reload()}
          />
        )}

        {result?.state === 'offline' && (
          <Notice
            title="You are offline."
            body="This will fill in as soon as you are back on."
            onRetry={retry}
            retrying={pulling}
          />
        )}

        {result?.state === 'error' && (
          <Notice title={result.message} onRetry={retry} retrying={pulling} />
        )}

        {result?.state === 'ok' && (
          <Session snapshot={result.snapshot} seenAt={seenAt} />
        )}
      </main>
    </div>
  );
}

function Session({
  snapshot,
  seenAt
}: {
  snapshot: Extract<LiveFetch, { state: 'ok' }>['snapshot'];
  seenAt: Date | null;
}) {
  const done = new Set(snapshot.completedRounds);

  return (
    <>
      {/* Rounds in the order they are played, not with the finished ones lifted
          to the top the way the host's page does. Somebody watching wants to
          know which court they are on next. */}
      {snapshot.schedule.rounds.map((round) => (
        <section
          key={round.roundNumber}
          className="rounded-lg border border-[#ddd] bg-white px-[0.6rem] pb-5 pt-3 shadow"
        >
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-[1.35rem] font-extrabold uppercase text-[#222]">
              Round {round.roundNumber}
            </h2>
            {done.has(round.roundNumber) && (
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                Done
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {round.courts.map((court, index) => (
              <LiveCourt
                // Keyed by position: two courts in one round can carry the same
                // number while the host is part way through renaming them.
                key={index}
                court={court}
                showScore={snapshot.scoringEnabled}
              />
            ))}
          </div>

          {round.sitOuts.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-gray-500">Sitting out</p>
              <div className="flex flex-wrap gap-1.5">
                {round.sitOuts.map((player) => (
                  <span
                    key={player.id}
                    className="flex items-center gap-1 rounded border border-[#e2e2e2] bg-gray-50 px-2 py-1 text-sm"
                  >
                    {player.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      ))}

      {snapshot.scoringEnabled && (
        <StandingsPanel schedule={snapshot.schedule} players={snapshot.players} />
      )}

      {/* A live view that has quietly stopped updating is worse than one that
          says when it last managed to. */}
      <p className="pt-2 text-center text-xs text-gray-500">
        {seenAt
          ? `Updated ${seenAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : 'Updating'}
        {' · '}
        <a href={APP_URL} className="underline">
          Make your own round robin
        </a>
      </p>
    </>
  );
}

function Notice({
  title,
  body,
  onRetry,
  retrying = false
}: {
  title: string;
  body?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[#ddd] bg-white px-4 py-8 text-center shadow">
      <p className="text-lg font-bold text-[#222]">{title}</p>
      {body && <p className="mt-1 text-sm text-gray-600">{body}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-4 rounded-md bg-brand-teal px-4 py-2 font-medium text-white transition-colors hover:bg-brand-teal-dark disabled:opacity-40"
        >
          {retrying ? 'Trying…' : 'Try again'}
        </button>
      )}
      <p className="mt-6 text-xs text-gray-500">
        <a href={APP_URL} className="underline">
          Make your own round robin
        </a>
      </p>
    </div>
  );
}
