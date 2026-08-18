/**
 * A preview of the dashboard with invented data, for looking at.
 *
 * Not shipped: vite build only takes index.html, and this entry is reached
 * through preview.html, which lives outside that. It exists because the charts
 * cannot be checked by reading the code, and because the real page needs a live
 * Supabase project and a signed-in owner before it will draw anything at all.
 *
 * The numbers below are shaped like the real ones will be: a handful of
 * accounts, a long flat stretch, and quotas nowhere near their ceilings. That
 * is the case the page has to be legible in, and a page designed against
 * flattering demo data would fail on the first day it was used.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { Preview } from './Preview';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>
);
