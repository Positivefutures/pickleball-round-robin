import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The /react entry, not /next: Vercel's setup page defaults its snippet to
// Next.js, and that path does not resolve in a Vite app.
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.tsx'
import { runMigrations } from './lib/migrations'

// Must run before the hooks read localStorage in their lazy initializers
runMigrations()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {/* Renders nothing; it only counts page views once deployed to Vercel. */}
    <Analytics />
  </StrictMode>,
)
