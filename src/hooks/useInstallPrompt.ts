import { useCallback, useEffect, useState } from 'react';

/** Not in lib.dom — Chrome-only, and still non-standard. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Holds Chrome's install event so the app can open the native dialog from its
 * own button. The event may never fire — iOS has no equivalent, and Chrome's
 * criteria vary — so callers must always have a fallback. See lib/install.ts.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      // Suppress Chrome's own banner so it doesn't compete with ours
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setDeferred(null);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // The event is single-use: once shown, Chrome will not accept it again.
  const promptInstall = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }, [deferred]);

  return { canPrompt: deferred !== null, promptInstall };
}
