import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The /react entry, not /next: Vercel's setup page defaults its snippet to
// Next.js, and that path does not resolve in a Vite app.
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.tsx'
import { runMigrations } from './lib/migrations'
import { startMonitoring, reportCrash, crashTestRequested } from './lib/monitoring'
import { startAppUpdates } from './lib/appUpdate'
import { ErrorBoundary, CrashTest } from './components/layout/ErrorBoundary'
import { sharedKeyFromUrl } from './lib/shareKey'
import { LiveSessionPage } from './components/live/LiveSessionPage'
import { startTopPinGhost } from './lib/topPin'
import { startRotationReset } from './lib/rotationReset'

// First, so that a fault in anything below is heard rather than lost. It only
// attaches two listeners; nothing is loaded and nothing is sent until something
// actually breaks.
startMonitoring()

// A link somebody was sent, rather than their own copy of the app. Read here
// rather than inside App because a visitor has their own saved session in this
// browser, and App reads all of it in lazy initializers before any branch inside
// it could run. Deciding out here means looking at somebody else's afternoon
// cannot disturb your own. Validated, so a link a chat app truncated falls
// through to the ordinary app instead of a viewer with nothing to view.
const sharedKey = sharedKeyFromUrl()

// Must run before the hooks read localStorage in their lazy initializers.
//
// Skipped for a shared link, and that is not an optimisation. On a device that
// has never run this app, runMigrations() writes a starting group and points the
// active group at it, so somebody who only scanned a code at a court to see the
// scores would come away with the beginnings of a round robin app they never
// asked for. The viewer reads no stored value at all, so there is nothing here
// for it to migrate.
if (!sharedKey) {
  // `?tour=1` puts the first-run greeting back, so it can be seen on a real
  // phone without clearing the app and losing the groups on it. Deliberately
  // undiscoverable, and deliberately not enough on its own: the splash also
  // wants an exampleMeta, so a device that never had a Sample Group still will
  // not show it. See stores.tourStage.
  if (new URLSearchParams(window.location.search).get('tour') === '1') {
    window.localStorage.removeItem('pb-tour-stage')
  }

  try {
    runMigrations()
  } catch (error) {
    // Carry on deliberately. Every store falls back to a sensible default when
    // its key is missing or unreadable, so a half-reshaped storage still gives a
    // usable app, and a usable app beats the blank page that letting this throw
    // would produce. The report is what turns it into a bug somebody can fix.
    reportCrash(error, 'window')
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {crashTestRequested() ? (
        <CrashTest />
      ) : sharedKey ? (
        <LiveSessionPage shareKey={sharedKey} />
      ) : (
        <App />
      )}
    </ErrorBoundary>
    {/* Renders nothing; it only counts page views once deployed to Vercel.
        Outside the boundary so a crash is still counted as a visit. */}
    <Analytics />
  </StrictMode>,
)

// After the render, and only in a real build. `dist/sw.js` is written by the
// build, so there is nothing to register in dev, and a worker caching the app
// while its source is being edited is a way to spend an hour debugging the
// wrong copy of it.
if (import.meta.env.PROD) startAppUpdates()

// The anti-blur strip steps aside once the pane has scrolled. Whichever page
// mounted above, the pane carries [data-app-scroll] and the watcher finds it.
startTopPinGhost()

// And the document is put back at the top if turning the phone pushes it off,
// which on iOS it does. Both pages are held to the viewport the same way, so
// both want this.
startRotationReset()
