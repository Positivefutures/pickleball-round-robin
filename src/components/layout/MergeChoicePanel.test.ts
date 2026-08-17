/**
 * @vitest-environment happy-dom
 *
 * The only screen in the app where a wrong tap loses data that cannot be got
 * back, so what is tested here is mostly the ways it declines to act.
 *
 * The thinking underneath it is covered in syncMerge.test.ts and sync.test.ts,
 * and none of that is repeated. What has never been checked is the screen that
 * puts the question: which button is under the thumb, that replacing is asked
 * twice, and that neither answer can be given by accident.
 *
 * The two buttons swap position and emphasis depending on why the question came
 * up, which is deliberate and is one character away from being backwards. When
 * the account already holds groups, the two sides are probably the same person,
 * so combining leads. When this device's groups belong to somebody else, they
 * are probably not, so taking the account's copy leads instead. Backwards means
 * the destructive answer sits first in the commoner case.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Counts, SyncReport } from '../../lib/sync';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ------------------------------------------------------------ the stand-ins --

/** Held open, so the busy state can be looked at rather than raced past. */
function deferred<T>() {
  let settle: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

const COMBINED: SyncReport = { title: 'Combined.', details: ['2 groups and 14 players.'] };
const ADOPTED: SyncReport = { title: 'Using your account.', details: [] };

let combining = deferred<SyncReport>();
let adopting = deferred<SyncReport>();

const combineWithAccount = vi.fn(() => combining.promise);
const adoptAccountCopy = vi.fn(() => adopting.promise);

vi.mock('../../lib/sync', () => ({
  combineWithAccount: () => combineWithAccount(),
  adoptAccountCopy: () => adoptAccountCopy()
}));

const { MergeChoicePanel } = await import('./MergeChoicePanel');
const { primary, secondary } = await import('./accountStyles');

// --------------------------------------------------------------------------

/** The label carries a curly apostrophe, and the copy is not to be reworded. */
const REPLACE = 'Use the Account’s Copy';

let root: Root;
let container: HTMLElement;
let done: SyncReport[];

function mount(
  reason: 'server-has-data' | 'other-account',
  options: { account?: Counts; device?: Counts; matched?: string[] } = {}
) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(MergeChoicePanel, {
        reason,
        account: options.account ?? { rosters: 2, players: 14 },
        device: options.device ?? { rosters: 1, players: 9 },
        matched: options.matched ?? [],
        onDone: (report: SyncReport) => done.push(report)
      })
    );
  });
}

function text(): string {
  return (container.textContent ?? '').trim();
}

function buttons(): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')];
}

function button(re: RegExp): HTMLButtonElement {
  const found = buttons().filter((b) => re.test((b.textContent ?? '').trim()));
  if (found.length === 0) {
    throw new Error(
      `no button matching ${re}; saw: ${buttons()
        .map((b) => JSON.stringify((b.textContent ?? '').trim()))
        .join(', ')}`
    );
  }
  return found[0];
}

function labels(): string[] {
  return buttons().map((b) => (b.textContent ?? '').trim());
}

beforeEach(() => {
  done = [];
  combining = deferred<SyncReport>();
  adopting = deferred<SyncReport>();
  combineWithAccount.mockClear();
  adoptAccountCopy.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

// --------------------------------------------------------------------------

describe('which answer is offered first', () => {
  it('leads with combining when the account already holds groups', () => {
    mount('server-has-data');

    expect(labels()).toEqual(['Combine Them', REPLACE]);
    expect(button(/Combine Them/).className).toBe(primary);
    expect(button(/^Use the Account/).className).toBe(secondary);
  });

  it('leads with the account copy when this device belongs to somebody else', () => {
    mount('other-account');

    // Inverted, both in order and in emphasis. Combining two different people
    // is the wrong default when they are probably two different people.
    expect(labels()).toEqual([REPLACE, 'Combine Them']);
    expect(button(/^Use the Account/).className).toBe(primary);
    expect(button(/Combine Them/).className).toBe(secondary);
  });

  it('says which case it is in, rather than asking the same question twice', () => {
    mount('server-has-data');
    expect(text()).toContain('Your account already has groups saved to it.');

    act(() => root.unmount());
    container.remove();

    mount('other-account');
    expect(text()).toContain('The groups on this device were saved to a different account.');
  });
});

describe('the numbers it puts the question with', () => {
  it('counts both sides in words that read at a glance', () => {
    mount('server-has-data');

    expect(text()).toContain('On your account');
    expect(text()).toContain('2 groups, 14 players');
    expect(text()).toContain('On this device');
    expect(text()).toContain('1 group, 9 players');
  });

  it('names the duplicates it would fold, because that is what consent is for', () => {
    mount('server-has-data', { matched: ['Dave', 'Ava'] });

    expect(text()).toContain('Combining merges these duplicates into one person each: Dave, Ava.');
  });

  it('leaves the line out when there is nothing to fold', () => {
    mount('server-has-data', { matched: [] });

    expect(text()).not.toContain('Combining merges');
  });
});

describe('replacing, which is the answer that loses something', () => {
  it('does not replace on the first tap', () => {
    mount('other-account');
    act(() => button(/^Use the Account/).click());

    expect(adoptAccountCopy).not.toHaveBeenCalled();
    expect(text()).toContain('Replace what is on this device?');
    expect(text()).toContain('will be gone');
  });

  it('takes the question away and puts a plain yes in its place', () => {
    mount('other-account');
    act(() => button(/^Use the Account/).click());

    // The two original answers are gone. Nothing to tap by muscle memory.
    expect(labels()).toEqual(['Yes, Replace', 'Cancel']);
  });

  it('backs out without acting, and puts the original question back', () => {
    mount('other-account');
    act(() => button(/^Use the Account/).click());
    act(() => button(/^Cancel$/).click());

    expect(adoptAccountCopy).not.toHaveBeenCalled();
    expect(labels()).toEqual([REPLACE, 'Combine Them']);
    expect(text()).not.toContain('Replace what is on this device?');
  });

  it('replaces once it has been asked twice, and reports back', async () => {
    mount('other-account');
    act(() => button(/^Use the Account/).click());
    await act(async () => {
      button(/Yes, Replace/).click();
      adopting.settle(ADOPTED);
    });

    expect(adoptAccountCopy).toHaveBeenCalledTimes(1);
    expect(done).toEqual([ADOPTED]);
  });
});

describe('combining', () => {
  it('runs on one tap, since it is the answer that keeps everything', async () => {
    mount('server-has-data');
    await act(async () => {
      button(/Combine Them/).click();
      combining.settle(COMBINED);
    });

    expect(combineWithAccount).toHaveBeenCalledTimes(1);
    expect(done).toEqual([COMBINED]);
  });

  it('says it is working, so nobody assumes the tap missed', () => {
    mount('server-has-data');
    act(() => button(/Combine Them/).click());

    expect(text()).toContain('Combining...');
  });
});

describe('a second tap while the first is still running', () => {
  it('is refused, on the answer that keeps everything', () => {
    mount('server-has-data');
    act(() => button(/Combine Them/).click());

    // Both, not just the one that was tapped. Answering the question twice two
    // different ways is the worse version of this.
    for (const b of buttons()) expect(b.disabled).toBe(true);

    act(() => button(/Combining/).click());
    expect(combineWithAccount).toHaveBeenCalledTimes(1);
  });

  it('is refused, on the answer that loses something', () => {
    mount('other-account');
    act(() => button(/^Use the Account/).click());
    act(() => button(/Yes, Replace/).click());

    for (const b of buttons()) expect(b.disabled).toBe(true);

    act(() => button(/Replacing/).click());
    expect(adoptAccountCopy).toHaveBeenCalledTimes(1);
  });
});

describe('walking away from it', () => {
  it('offers no way to, which is the whole point of the screen', () => {
    mount('server-has-data');

    // No Close, and the backdrop takes no handler, so tapping outside the card
    // does nothing. This is the one question the app will not answer for you,
    // and the old panel let people walk straight past it.
    expect(labels()).toEqual(['Combine Them', REPLACE]);
    expect(text()).not.toContain('Close');
  });
});
