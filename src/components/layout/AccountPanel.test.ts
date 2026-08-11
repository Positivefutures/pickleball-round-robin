/**
 * @vitest-environment happy-dom
 *
 * Which screen My Account shows, what it says about whether the data is safe,
 * and two ordering bugs that would be easy to reintroduce.
 *
 * Both come from the same shape. This panel routes rather than draws, and every
 * branch reads a store that the action just changed underneath it. Deleting an
 * account signs the person out, so unless the finished screen is chosen before
 * anything looks at the auth store, a successful deletion sends somebody
 * straight back to Sign In as though the button had done nothing. Answering the
 * merge question is the same trap one door along: the status may still say a
 * question is pending, and re-asking would offer to merge a second time over
 * data that has already moved.
 *
 * The merge screen itself is tested in MergeChoicePanel.test.ts. What is here
 * is only which screen wins.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AuthState } from '../../lib/auth';
import type { SyncReport, SyncStatus } from '../../lib/sync';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ------------------------------------------------------------ the stand-ins --

let authState: AuthState = { status: 'unknown' };
const authListeners = new Set<() => void>();

function setAuth(next: AuthState) {
  authState = next;
  for (const listener of authListeners) listener();
}

let syncState: SyncStatus = { state: 'saved' };
const syncListeners = new Set<() => void>();

function setSync(next: SyncStatus) {
  syncState = next;
  for (const listener of syncListeners) listener();
}

/** What the merge hands back, so the panel can be watched changing what it says. */
let mergeReport: SyncReport = { title: 'Combined.', details: ['2 groups and 14 players.'] };

/** Deleting really does sign the person out, so the stand-in does that too. */
let deleteResult: { ok: true; value: undefined } | { ok: false; message: string } = {
  ok: true,
  value: undefined
};

vi.mock('../../lib/auth', () => ({
  initAuth: () => Promise.resolve(),
  signOut: () => Promise.resolve({ ok: true }),
  changeEmail: () => Promise.resolve({ ok: true }),
  sendSignInEmail: () => Promise.resolve({ ok: true }),
  verifyCode: () => Promise.resolve({ ok: true }),
  authStore: {
    get: () => authState,
    subscribe(listener: () => void) {
      authListeners.add(listener);
      return () => authListeners.delete(listener);
    }
  }
}));

vi.mock('../../lib/sync', () => ({
  combineWithAccount: () => Promise.resolve(mergeReport),
  adoptAccountCopy: () => Promise.resolve(mergeReport),
  syncStatusStore: {
    get: () => syncState,
    subscribe(listener: () => void) {
      syncListeners.add(listener);
      return () => syncListeners.delete(listener);
    }
  }
}));

vi.mock('../../lib/account', () => ({
  deleteMyAccount: () => {
    if (deleteResult.ok) setAuth({ status: 'signed-out' });
    return Promise.resolve(deleteResult);
  },
  buildMyDataFile: () =>
    Promise.resolve({ ok: true, value: { name: 'my-data.json', json: '{}' } })
}));

const { AccountPanel } = await import('./AccountPanel');

// --------------------------------------------------------------------------

let root: Root;
let container: HTMLElement;

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(AccountPanel, { onClose: () => {} }));
  });
}

function text(): string {
  return (container.textContent ?? '').trim();
}

function button(re: RegExp): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].filter((b) =>
    re.test((b.textContent ?? '').trim())
  );
  if (found.length === 0) {
    throw new Error(
      `no button matching ${re}; saw: ${[...container.querySelectorAll('button')]
        .map((b) => JSON.stringify((b.textContent ?? '').trim()))
        .join(', ')}`
    );
  }
  return found[0] as HTMLButtonElement;
}

function type(value: string) {
  const input = container.querySelector('#acct-delete-confirm') as HTMLInputElement;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      input,
      value
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  window.localStorage.clear();
  deleteResult = { ok: true, value: undefined };
  mergeReport = { title: 'Combined.', details: ['2 groups and 14 players.'] };
  syncState = { state: 'saved' };
  setAuth({ status: 'signed-in', email: 'host@example.com', userId: 'user-me' });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  authListeners.clear();
  syncListeners.clear();
});

// --------------------------------------------------------------------------

describe('AccountPanel', () => {
  it('offers both of the jobs this item added', () => {
    mount();
    expect(button(/Download My Data/)).toBeTruthy();
    expect(button(/Delete Account/)).toBeTruthy();
  });

  it('gives every row a glyph big enough to stand beside both its lines', () => {
    mount();
    for (const re of [/Change My Email/, /Download My Data/, /Sign Out/, /Delete Account/]) {
      const icon = button(re).querySelector('svg');
      expect(icon, `${re} has no glyph`).toBeTruthy();
      expect(icon!.getAttribute('class'), `${re}'s glyph`).toContain('h-8 w-8');
    }
  });

  it('draws the bin in the same red as the words beside it', () => {
    mount();
    const row = button(/Delete Account/);
    const title = [...row.querySelectorAll('span')].find(
      (s) => s.textContent === 'Delete Account'
    )!;
    const red = /text-\[(#[0-9A-Fa-f]{6})\]/.exec(title.getAttribute('class') ?? '')![1];
    expect(row.querySelector('svg')!.getAttribute('class')).toContain(`text-[${red}]`);
  });

  it('asks before it deletes anything', () => {
    mount();
    act(() => button(/Delete Account/).click());
    expect(text()).toContain('This cannot be undone.');
  });

  it('goes back to the account when the question is declined', () => {
    mount();
    act(() => button(/Delete Account/).click());
    act(() => button(/^Cancel$/).click());
    expect(button(/Sign Out/)).toBeTruthy();
  });

  it('confirms the deletion rather than bouncing back to Sign In', async () => {
    mount();
    act(() => button(/Delete Account/).click());
    type('DELETE');
    await act(async () => {
      button(/Delete My Account/).click();
    });

    // The auth store now says signed-out, which is true and is not what this
    // person needs to read.
    expect(authState.status).toBe('signed-out');
    expect(text()).toContain('Account Deleted');
    expect(text()).not.toContain('Sign In');
  });

  it('leaves the account panel standing when the delete failed', async () => {
    deleteResult = { ok: false, message: 'Something went wrong.' };
    mount();
    act(() => button(/Delete Account/).click());
    type('DELETE');
    await act(async () => {
      button(/Delete My Account/).click();
    });

    expect(text()).toContain('Something went wrong.');
    expect(text()).not.toContain('Account Deleted');
  });
});

/**
 * Somebody who has just driven away from a court with an edited group wants to
 * know whether it is safe. Each of these states is a different answer to that,
 * and the wrong one is worse than none: a tick over unsent changes is a promise
 * the app cannot keep.
 */
describe('what it says about whether the data got there', () => {
  it('says so, when everything has', () => {
    syncState = { state: 'saved' };
    mount();

    expect(text()).toContain('Your groups and players have been saved to your account.');
  });

  it('counts what has not, without pluralising a single change', () => {
    syncState = { state: 'waiting', pending: 1, problem: null };
    mount();

    expect(text()).toContain('1 change still to save.');
    expect(text()).not.toContain('1 changes');
  });

  it('says how many, and why they are still waiting', () => {
    syncState = {
      state: 'waiting',
      pending: 3,
      problem: "You're offline. These will go up when you're back on."
    };
    mount();

    expect(text()).toContain('3 changes still to save.');
    expect(text()).toContain("You're offline. These will go up when you're back on.");
  });

  it('offers no count when nothing is being counted yet', () => {
    syncState = {
      state: 'unready',
      problem: "Couldn't check your account. Nothing has been sent up yet. Trying again.",
      detail: null
    };
    mount();

    // Nothing is tracked in this state, so a count would read "0 changes still
    // to save", which is true and invites exactly the wrong conclusion.
    expect(text()).toContain("Couldn't check your account.");
    expect(text()).toContain('Your groups and players are safe on this device.');
    expect(text()).not.toContain('still to save');
  });

  it('carries what the server actually said, which is unreachable on a phone', () => {
    syncState = {
      state: 'unready',
      problem: "You're offline, so nothing has been sent up yet. Trying again.",
      detail: 'TypeError: Failed to fetch'
    };
    mount();

    expect(text()).toContain('TypeError: Failed to fetch');
  });

  it('says it is working, rather than going quiet, while it finds out', () => {
    syncState = { state: 'starting' };
    mount();
    expect(text()).toContain('Checking your account...');

    act(() => setSync({ state: 'saving' }));
    expect(text()).toContain('Saving to your account...');
  });
});

describe('the merge question, seen from the account screen', () => {
  const CHOICE: SyncStatus = {
    state: 'choice',
    reason: 'server-has-data',
    account: { rosters: 2, players: 14 },
    device: { rosters: 1, players: 9 },
    matched: ['Ava']
  };

  it('takes the whole card, so there is nothing else to do instead', () => {
    syncState = CHOICE;
    mount();

    expect(text()).toContain('Pick what to keep');
    expect(text()).toContain('1 group, 9 players');
    // As a note among the account rows it sat above Sign Out and Close, and the
    // easiest thing to do with the most consequential question was walk past it.
    expect(text()).not.toContain('Sign Out');
    expect(text()).not.toContain('Delete Account');
    expect(text()).not.toContain('Close');
  });

  it('does not ask again once it has been answered', async () => {
    syncState = CHOICE;
    mount();
    await act(async () => {
      button(/Combine them/).click();
    });

    // The store still says 'choice' here, and that is the point: the answer is
    // what decides this, not a status that may not have caught up. Re-asking
    // would offer to merge a second time over data that has already moved.
    expect(text()).not.toContain('Pick what to keep');
    expect(text()).toContain('Combined.');
    expect(text()).toContain('2 groups and 14 players.');
  });

  it('puts the account screen back underneath the answer', async () => {
    syncState = CHOICE;
    mount();
    await act(async () => {
      button(/Combine them/).click();
    });

    expect(button(/Sign Out/)).toBeTruthy();
    expect(button(/Delete Account/)).toBeTruthy();
  });
});
