import { useCallback, useEffect, useState } from 'react';

/** Not in lib.dom — Chrome-only, and still non-standard. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    /** Parked by the inline script in index.html. See the comment there. */
    __installPrompt?: BeforeInstallPromptEvent | null;
  }
}

function parked(): BeforeInstallPromptEvent | null {
  if (typeof window === 'undefined') return null;
  return window.__installPrompt ?? null;
}

/**
 * Holds Chrome's install event so the app can open the native dialog from its
 * own button. The event may never fire — iOS has no equivalent, and Chrome's
 * criteria vary — so callers must always have a fallback. See lib/install.ts.
 *
 * The event itself is caught in index.html rather than here, because on a
 * repeat visit it can arrive before this file has been parsed. This hook only
 * adopts what that script parked, so there is one owner of the event and no
 * race over who registered first.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(parked);

  useEffect(() => {
    // Covers the ordinary case: the prompt arrives while the app is already up.
    function onReady() {
      setDeferred(parked());
    }
    function onInstalled() {
      setDeferred(null);
    }

    // The prompt can also land between the initial useState above and this
    // effect running, which would leave the button hidden with an event sitting
    // in hand. Cheap to re-read, so re-read.
    onReady();

    window.addEventListener('installpromptready', onReady);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('installpromptready', onReady);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // The event is single-use: once shown, Chrome will not accept it again.
  const promptInstall = useCallback(async () => {
    if (!deferred) return;
    window.__installPrompt = null;
    setDeferred(null);
    await deferred.prompt();
    await deferred.userChoice;
  }, [deferred]);

  return { canPrompt: deferred !== null, promptInstall };
}
