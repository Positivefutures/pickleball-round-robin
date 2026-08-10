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

// First, so that a fault in anything below is heard rather than lost. It only
// attaches two listeners; nothing is loaded and nothing is sent until something
// actually breaks.
startMonitoring()

// Must run before the hooks read localStorage in their lazy initializers
try {
  runMigrations()
} catch (error) {
  // Carry on deliberately. Every store falls back to a sensible default when
  // its key is missing or unreadable, so a half-reshaped storage still gives a
  // usable app, and a usable app beats the blank page that letting this throw
  // would produce. The report is what turns it into a bug somebody can fix.
  reportCrash(error, 'window')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {crashTestRequested() ? <CrashTest /> : <App />}
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
