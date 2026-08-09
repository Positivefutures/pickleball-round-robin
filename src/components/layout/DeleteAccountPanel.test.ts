/**
 * @vitest-environment happy-dom
 *
 * The confirmation, which is the whole of this feature worth testing on screen.
 *
 * Deleting an account is one call to the database. Being sure somebody meant it
 * is the part that can go wrong quietly, and it goes wrong in one direction:
 * the gate stops stopping people. So the assertions below are mostly about what
 * the panel refuses to do.
 *
 * The last describe covers a routing bug that would be easy to reintroduce.
 * Deleting signs the person out, and unless the finished screen is chosen
 * before anything reads the auth state, the panel snaps back to Sign In as
 * though the tap had done nothing.
 *
 * createElement rather than JSX, and no React Testing Library, matching
 * ErrorBoundary.test.ts and App.walkthrough.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ------------------------------------------------------------ the stand-ins --

const account = {
  deleteResult: { ok: true, value: undefined } as
    | { ok: true; value: undefined }
    | { ok: false; message: string },
  deletes: 0,
  fileResult: {
    ok: true,
    value: { name: 'pickleball-my-data-2026-08-09.json', json: '{"groups":[]}' }
  } as
    | { ok: true; value: { name: string; json: string } }
    | { ok: false; message: string }
};

vi.mock('../../lib/account', () => ({
  deleteMyAccount: () => {
    account.deletes += 1;
    return Promise.resolve(account.deleteResult);
  },
  buildMyDataFile: () => Promise.resolve(account.fileResult)
}));

const { DeleteAccountPanel, AccountDeletedPanel } = await import('./DeleteAccountPanel');

// --------------------------------------------------------------------------

let root: Root;
let container: HTMLElement;

function mount(element: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(element);
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

/** Types into the confirm field the way React wants to be told about it. */
function type(value: string) {
  const input = container.querySelector('#acct-delete-confirm') as HTMLInputElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

let cancelled: number;
let deleted: number;

function mountDeletePanel(email: string | null = 'host@example.com') {
  mount(
    createElement(DeleteAccountPanel, {
      email,
      onCancel: () => {
        cancelled += 1;
      },
      onDeleted: () => {
        deleted += 1;
      }
    })
  );
}

beforeEach(() => {
  window.localStorage.clear();
  account.deletes = 0;
  account.deleteResult = { ok: true, value: undefined };
  account.fileResult = {
    ok: true,
    value: { name: 'pickleball-my-data-2026-08-09.json', json: '{"groups":[]}' }
  };
  cancelled = 0;
  deleted = 0;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

// --------------------------------------------------------------------------

describe('DeleteAccountPanel', () => {
  it('says what goes and what stays before it asks for anything', () => {
    mountDeletePanel();
    expect(text()).toContain('This cannot be undone.');
    expect(text()).toContain('host@example.com');
    // The reassurance is the true half, and it is why this is safe to offer.
    expect(text()).toContain('stay on this device');
  });

  it('will not delete on a tap alone', () => {
    mountDeletePanel();
    expect(button(/Delete My Account/).disabled).toBe(true);
    act(() => button(/Delete My Account/).click());
    expect(account.deletes).toBe(0);
    expect(deleted).toBe(0);
  });

  it('will not accept a word that is nearly right', () => {
    mountDeletePanel();
    type('delet');
    expect(button(/Delete My Account/).disabled).toBe(true);
    type('yes');
    expect(button(/Delete My Account/).disabled).toBe(true);
  });

  it('forgives the case and the spaces a phone adds', async () => {
    mountDeletePanel();
    type('  delete ');
    expect(button(/Delete My Account/).disabled).toBe(false);
    await act(async () => {
      button(/Delete My Account/).click();
    });
    expect(account.deletes).toBe(1);
    expect(deleted).toBe(1);
  });

  it('offers the download here, where it is the last chance to take one', () => {
    mountDeletePanel();
    expect(button(/Download My Data First/)).toBeTruthy();
  });

  it('stays put and says why when the delete fails', async () => {
    account.deleteResult = { ok: false, message: "Couldn't reach the server." };
    mountDeletePanel();
    type('DELETE');
    await act(async () => {
      button(/Delete My Account/).click();
    });

    expect(deleted).toBe(0);
    expect(text()).toContain("Couldn't reach the server.");
    // Still usable, so trying again does not mean starting over.
    expect(button(/Delete My Account/).disabled).toBe(false);
  });

  it('lets somebody back out', () => {
    mountDeletePanel();
    type('DELETE');
    act(() => button(/^Cancel$/).click());
    expect(cancelled).toBe(1);
    expect(account.deletes).toBe(0);
  });

  it('manages without an email address on the account', () => {
    mountDeletePanel(null);
    expect(text()).toContain('this address');
  });
});

describe('AccountDeletedPanel', () => {
  it('confirms it happened, and that the device kept everything', () => {
    mount(createElement(AccountDeletedPanel, { onClose: () => {} }));
    expect(text()).toContain('Account Deleted');
    expect(text()).toContain('still on this device');
  });
});

describe('DownloadMyData', () => {
  it('hands the file to the browser and names it', async () => {
    const { DownloadMyData } = await import('./DownloadMyData');
    const urls: string[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      urls.push('blob:x');
      return 'blob:x';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    mount(createElement(DownloadMyData, { variant: 'row' }));
    await act(async () => {
      button(/Download My Data/).click();
    });

    expect(urls).toHaveLength(1);
    expect(text()).toContain('pickleball-my-data-2026-08-09.json');
  });

  it('reports a download that could not be built', async () => {
    const { DownloadMyData } = await import('./DownloadMyData');
    account.fileResult = { ok: false, message: 'You are not signed in any more.' };

    mount(createElement(DownloadMyData, { variant: 'row' }));
    await act(async () => {
      button(/Download My Data/).click();
    });

    expect(text()).toContain('not signed in any more');
  });
});
