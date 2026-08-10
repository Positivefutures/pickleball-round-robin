/**
 * @vitest-environment happy-dom
 *
 * Signing in, and in particular the two ways it fails.
 *
 * The wording of both is settled and tested at the auth layer. They are not the
 * same failure and must not read as though they were. One is a per-address
 * cooldown that names the real number of seconds, and waiting it out works. The
 * other is the whole project's ceiling on sending, which the person did nothing
 * to cause, cannot wait out in a minute, and which has to end by pointing them
 * back at an app that needs no account at all.
 *
 * What is checked here is that the panel puts the message it was handed on the
 * screen, word for word, and stays where it is. Swallowing one for a house
 * style, or advancing to "Check your email" after an email that never went, is
 * exactly the dead end the wording exists to prevent.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ------------------------------------------------------------ the stand-ins --

/** Word for word what lib/auth returns for a cooldown, which names its wait. */
const COOLDOWN = 'A code was just sent. Ask for another in 41 seconds.';

/** And for the project ceiling, whose second sentence is the whole point. */
const CEILING =
  'We cannot send sign-in emails just now. Try again later, or keep using the app without an account.';

type Result = { ok: boolean; message?: string };

let sendResult: Result = { ok: true };
let verifyResult: Result = { ok: true };

const sendSignInEmail = vi.fn<(address: string) => Promise<Result>>(() =>
  Promise.resolve(sendResult)
);
const verifyCode = vi.fn<(address: string, code: string) => Promise<Result>>(() =>
  Promise.resolve(verifyResult)
);

vi.mock('../../lib/auth', () => ({
  sendSignInEmail: (address: string) => sendSignInEmail(address),
  verifyCode: (address: string, code: string) => verifyCode(address, code)
}));

const { SignInPanel } = await import('./SignInPanel');

// --------------------------------------------------------------------------

let root: Root;
let container: HTMLElement;
let closed: number;

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(SignInPanel, { onClose: () => (closed += 1) }));
  });
}

function text(): string {
  return (container.textContent ?? '').trim();
}

function button(re: RegExp): HTMLButtonElement {
  const all = [...container.querySelectorAll('button')];
  const found = all.filter((b) => re.test((b.textContent ?? '').trim()));
  if (found.length === 0) {
    throw new Error(
      `no button matching ${re}; saw: ${all
        .map((b) => JSON.stringify((b.textContent ?? '').trim()))
        .join(', ')}`
    );
  }
  return found[0];
}

function field(id: string): HTMLInputElement {
  const input = container.querySelector(`#${id}`);
  if (!input) throw new Error(`no field #${id}`);
  return input as HTMLInputElement;
}

function type(id: string, value: string) {
  const input = field(id);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Gets as far as the code screen, the way somebody who was sent one would. */
async function sent(address = 'host@example.com') {
  mount();
  type('acct-email', address);
  await act(async () => {
    button(/Email me a login code/).click();
  });
}

beforeEach(() => {
  closed = 0;
  sendResult = { ok: true };
  verifyResult = { ok: true };
  sendSignInEmail.mockClear();
  verifyCode.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

// --------------------------------------------------------------------------

describe('the two ways sending fails, which are not the same failure', () => {
  it('repeats the cooldown with the real wait in it', async () => {
    sendResult = { ok: false, message: COOLDOWN };
    mount();
    type('acct-email', 'host@example.com');
    await act(async () => {
      button(/Email me a login code/).click();
    });

    expect(text()).toContain(COOLDOWN);
    // Nothing was sent, so promising an inbox would be a lie, and the address
    // has to stay where it can be tried again.
    expect(text()).not.toContain('Check your email');
    expect(field('acct-email').value).toBe('host@example.com');
  });

  it('says plainly that it cannot send, and that the app works without an account', async () => {
    sendResult = { ok: false, message: CEILING };
    mount();
    type('acct-email', 'host@example.com');
    await act(async () => {
      button(/Email me a login code/).click();
    });

    expect(text()).toContain(CEILING);
    // The half that stops it being a dead end. Somebody who hit the project
    // ceiling did nothing wrong and has a working app in front of them.
    expect(text()).toContain('without an account');
    expect(text()).not.toContain('Check your email');
  });

  it('does not put the one on screen when the other happened', async () => {
    sendResult = { ok: false, message: CEILING };
    mount();
    type('acct-email', 'host@example.com');
    await act(async () => {
      button(/Email me a login code/).click();
    });

    // Confusing these two is the bug the wording was written to fix. A ceiling
    // read as a cooldown tells somebody to wait 41 seconds for nothing.
    expect(text()).not.toContain('Ask for another in');
    expect(text()).not.toContain('A code was just sent');
  });

  it('marks the failure up for a screen reader rather than only colouring it', async () => {
    sendResult = { ok: false, message: CEILING };
    mount();
    type('acct-email', 'host@example.com');
    await act(async () => {
      button(/Email me a login code/).click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(CEILING);
  });

  it('falls back to something rather than a blank box', async () => {
    sendResult = { ok: false };
    mount();
    type('acct-email', 'host@example.com');
    await act(async () => {
      button(/Email me a login code/).click();
    });

    expect(text()).toContain('Something went wrong.');
  });
});

describe('before it asks the server anything', () => {
  it('says what is missing instead of sending an empty address', () => {
    mount();
    act(() => button(/Email me a login code/).click());

    expect(sendSignInEmail).not.toHaveBeenCalled();
    expect(text()).toContain('Enter your email address.');
  });

  // Two layers do this, and deliberately: the field is type="email", which
  // strips surrounding space before handleSend ever sees the value, and
  // handleSend trims it again. So this pins the outcome rather than either
  // guard. Breaking one of them on its own leaves the test green, which is the
  // right answer and not a gap.
  it('is not stopped by the space a phone keyboard adds after an address', async () => {
    mount();
    type('acct-email', '  host@example.com ');
    await act(async () => {
      button(/Email me a login code/).click();
    });

    expect(sendSignInEmail).toHaveBeenCalledWith('host@example.com');
  });

  it('will not send a code that is too short to be one', async () => {
    await sent();
    type('acct-code', '123');
    await act(async () => {
      button(/^Sign in$/).click();
    });

    expect(verifyCode).not.toHaveBeenCalled();
    expect(text()).toContain('Enter the 6 digit code from the email.');
  });

  it('keeps the digits out of a pasted code and drops the rest', async () => {
    await sent();
    type('acct-code', '12 34-56');

    expect(field('acct-code').value).toBe('123456');
  });
});

describe('once the email is away', () => {
  it('names the address it went to, so a typo is visible', async () => {
    await sent('host@example.com');

    expect(text()).toContain('Check your email');
    expect(text()).toContain('host@example.com');
  });

  it('explains why the code exists at all on an installed app', async () => {
    await sent();

    expect(text()).toContain(
      'Using the app from your home screen? Type the code. The link signs you in to your browser instead.'
    );
  });

  // Not "the address it sent to rather than the field", which this cannot tell
  // apart: the email field is gone by now, so the two are the same string.
  it('checks the code against the address together', async () => {
    await sent('host@example.com');
    type('acct-code', '123456');
    await act(async () => {
      button(/^Sign in$/).click();
    });

    expect(verifyCode).toHaveBeenCalledWith('host@example.com', '123456');
  });

  it('stays on the code screen and says why when the code is refused', async () => {
    verifyResult = { ok: false, message: "That code didn't match. Check it and try again." };
    await sent();
    type('acct-code', '123456');
    await act(async () => {
      button(/^Sign in$/).click();
    });

    expect(text()).toContain("That code didn't match. Check it and try again.");
    expect(field('acct-code')).toBeTruthy();
  });

  it('can be closed from here too, since not now is a real answer', async () => {
    await sent();
    act(() => button(/^Close$/).click());

    expect(closed).toBe(1);
  });

  it('goes back to the address, cleared of the last complaint', async () => {
    verifyResult = { ok: false, message: "That code didn't match. Check it and try again." };
    await sent();
    type('acct-code', '123456');
    await act(async () => {
      button(/^Sign in$/).click();
    });
    act(() => button(/Use a different address/).click());

    expect(text()).toContain('Email address');
    expect(text()).not.toContain("That code didn't match.");
  });
});
