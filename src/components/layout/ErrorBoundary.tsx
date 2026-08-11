import { Component, type ErrorInfo, type ReactNode } from 'react';
import { describeCrash, reportCrash, type CrashReport } from '../../lib/monitoring';
import { buildBody, buildSubject, mailtoUrl, type FeedbackContext } from '../../lib/feedback';
import { APP_VERSION, FEEDBACK_EMAIL } from '../../lib/appInfo';
import * as stores from '../../lib/stores';

/**
 * The last thing standing when a render throws.
 *
 * Without one of these React unmounts the whole tree, and what is left is a
 * white page: no message, no button, no clue that anything is saved. Somebody
 * halfway through running a session for twelve people would reasonably assume
 * they had lost the lot.
 *
 * A class because there is no hook for this. getDerivedStateFromError and
 * componentDidCatch are the only way React offers to catch a render fault, and
 * they exist on classes only.
 *
 * Everything below is deliberately dull. It reads two stores, both of which are
 * built never to throw, and it renders plain markup with no state of its own
 * beyond the crash. A clever error screen is one that can fail while it is
 * telling you something has failed.
 */

interface Props {
  children: ReactNode;
}

interface State {
  crash: CrashReport | null;
}

/**
 * What the crash email carries, read from storage rather than from the app,
 * because the app is what just fell over. The same shape the Report a Bug panel
 * sends, so both arrive looking alike.
 */
function crashContext(): FeedbackContext {
  return {
    version: APP_VERSION,
    step: 'The app stopped',
    groups: stores.rosters.get().length,
    players: stores.players.get().length,
    sessionActive: Boolean(stores.schedule.get()),
    courts: stores.numCourts.get(),
    rounds: stores.numRounds.get(),
    largeText: stores.largeText.get(),
    userAgent: navigator.userAgent,
    screen: `${window.innerWidth}x${window.innerHeight}`,
    language: navigator.language,
  };
}

/**
 * Throws on purpose. Rendered in place of the app when the address carries
 * `?crashtest`, which is the only way to find out whether crash reporting works
 * without waiting for a real bug. See docs/error-monitoring.md.
 *
 * It lives here rather than in main.tsx because that file exports nothing, and
 * a component in it stops fast refresh working for the whole app.
 */
export function CrashTest(): never {
  throw new Error('Test crash, asked for by the ?crashtest link. Nothing is wrong.');
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { crash: null };

  // Pure by contract, so it only describes. The sending happens below.
  static getDerivedStateFromError(error: unknown): State {
    return { crash: describeCrash(error, 'render') };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // React logs the component stack itself in development and swallows it in
    // production, so this is the only place it is ever visible on a real build.
    console.error('Crash caught by ErrorBoundary', error, info.componentStack);
    reportCrash(error, 'render');
  }

  private handleReport = () => {
    const crash = this.state.crash;
    if (!crash) return;
    const summary = `${crash.name}: ${crash.message}`;
    const details = [
      'The app stopped on its own. I did not have to do anything to make this happen.',
      '',
      'What I was doing:',
      '',
      '',
      crash.stack || '(no stack)',
    ].join('\n');
    window.location.href = mailtoUrl(
      FEEDBACK_EMAIL,
      buildSubject('bug', summary),
      buildBody('bug', summary, details, crashContext())
    );
  };

  render() {
    const crash = this.state.crash;
    if (!crash) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-800 p-4">
        <div className="w-full max-w-md rounded-lg border-[3px] border-[#444] bg-white p-6 shadow-lg">
          <h1 className="text-center text-[1.35rem] font-extrabold text-[#222]">
            Something went wrong
          </h1>

          <p className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
            Your groups and players are saved on this device. Nothing has been lost.
          </p>

          <p className="mt-3 text-sm text-gray-600">
            The app hit a problem it could not carry on from. Reloading usually fixes
            it.
          </p>

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 rounded-md bg-brand-teal px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-teal-dark"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={this.handleReport}
              className="flex-1 rounded-md bg-brand-orange px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-orange-dark"
            >
              Tell me what happened
            </button>
          </div>

          {/* Left on screen rather than tucked behind a toggle, because the
              thing people actually do is send a photo of it. */}
          <p className="mt-4 border-t border-gray-200 pt-3 text-xs break-words text-gray-500">
            {crash.name}: {crash.message || '(no message)'}
          </p>
          <p className="text-xs text-gray-400">Version {crash.version}</p>
        </div>
      </div>
    );
  }
}
