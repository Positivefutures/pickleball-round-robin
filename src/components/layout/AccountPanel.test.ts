/**
 * @vitest-environment happy-dom
 *
 * Which screen My Account shows, and one ordering bug that would be easy to
 * reintroduce.
 *
 * Deleting an account signs the person out, and the panel decides what to draw
 * by reading the auth store. So unless the finished screen is chosen before
 * anything looks at that store, a successful deletion sends somebody straight
 * back to Sign In, as though the button had done nothing. That is the test
 * below, and it is the reason `screen === 'deleted'` is checked first.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AuthState } from '../../lib/auth';
import type { SyncStatus } from '../../lib/sync';

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

const syncState: SyncStatus = { state: 'saved' };

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
  combineWithAccount: () => Promise.resolve({ title: '', details: [] }),
  adoptAccountCopy: () => Promise.resolve({ title: '', details: [] }),
  syncStatusStore: {
    get: () => syncState,
    subscribe: () => () => {}
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
  setAuth({ status: 'signed-in', email: 'host@example.com', userId: 'user-me' });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  authListeners.clear();
});

// --------------------------------------------------------------------------

describe('AccountPanel', () => {
  it('offers both of the jobs this item added', () => {
    mount();
    expect(button(/Download My Data/)).toBeTruthy();
    expect(button(/Delete Account/)).toBeTruthy();
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
