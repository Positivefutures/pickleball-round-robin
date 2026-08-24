/**
 * @vitest-environment happy-dom
 *
 * The side menu, and the doors it is allowed to show.
 *
 * Three items in this menu come and go: Donate when there is no Ko-fi link, My
 * Account when there is no Supabase, and the two feedback items when sending
 * is broken. All three exist so the menu never offers something that cannot
 * work, and each is easy to half-do: hide the button and leave the panel
 * reachable some other way, or hide it here and leave Instructions describing
 * it. This walks the rendered menu rather than reading the source, so a door
 * left open anywhere in it is caught.
 *
 * Written against the flag rather than against `false`, so it keeps its meaning
 * on the day FEEDBACK_ENABLED goes back to true instead of quietly inverting
 * into a test of nothing.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SettingsPanel } from './SettingsPanel';
import { FEEDBACK_ENABLED, DONATE_URL } from '../../lib/appInfo';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLElement;

/** Everything optional turned on, so an absent item is the flag and nothing else. */
function mount(): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      createElement(SettingsPanel, {
        open: true,
        robin: '/logo.png',
        onShare: () => {},
        onOpenAccount: () => {},
        showAccountItem: true,
        signedIn: false,
        onOpenInstall: () => {},
        showInstallItem: true,
        onOpenSettings: () => {},
        onOpenImportExport: () => {},
        onOpenInstructions: () => {},
        onOpenDonate: () => {},
        onOpenFeature: () => {},
        onOpenBug: () => {},
      })
    )
  );
  return container;
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const labels = () =>
  [...mount().querySelectorAll('button')].map((el) => (el.textContent ?? '').trim());

describe('the feedback items follow FEEDBACK_ENABLED', () => {
  it('shows both, or neither', () => {
    const found = labels();
    const feature = found.some((l) => l.includes('Suggest a Feature'));
    const bug = found.some((l) => l.includes('Report a Bug'));

    expect(feature).toBe(FEEDBACK_ENABLED);
    expect(bug).toBe(FEEDBACK_ENABLED);
    // Never one without the other. They fail for the same reason and there is
    // no state in which reporting a bug works but suggesting a feature does not.
    expect(feature).toBe(bug);
  });

  it('leaves the rest of the menu alone', () => {
    const found = labels();
    for (const label of ['Share App', 'Settings', 'Import / Export Groups', 'Instructions']) {
      expect(found.some((l) => l.includes(label))).toBe(true);
    }
    // Hiding two items must not take the way to reach Jeff with them. The
    // address at the foot of the drawer is the fallback the whole change rests
    // on, so it is asserted here rather than assumed.
    const mailto = container.querySelector('a[href^="mailto:"]');
    expect(mailto).not.toBeNull();
  });

  it('still shows Donate, which has a link', () => {
    // Guards the reverse mistake: a conditional that swallows its neighbours.
    expect(labels().some((l) => l.includes('Donate'))).toBe(Boolean(DONATE_URL));
  });
});
