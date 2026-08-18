import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The app's real stylesheet, so every specimen resolves the same tokens, the
// same overridden type scale and the same large-text rules the app does.
import '../index.css'
import { StyleGuide } from './StyleGuide'

// No migrations, no monitoring, no service worker and no analytics. This page
// renders components; it must not touch the stored groups on the device showing
// it, and a style guide has no business reporting crashes as if it were the app.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StyleGuide />
  </StrictMode>,
)
