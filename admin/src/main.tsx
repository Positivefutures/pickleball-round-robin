import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { startTopPinGhost } from './lib/topPin';

// Before render, so the strip's clock starts as early as this file runs. The
// strip itself is already painted: it is static HTML in index.html and does not
// wait for any of this.
startTopPinGhost();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
