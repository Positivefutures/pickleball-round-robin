/**
 * Which way the printer button goes, and what happens when it gets there.
 *
 * The routing is one small decision with one large consequence: send an
 * installed iOS app to `window.print()` and the tap does nothing at all, with
 * no error to notice and nothing on screen to explain it. That was the bug.
 * Send anybody else to a share sheet and a working print dialog has been taken
 * away from them. So both halves of the matrix are worth holding down.
 */
import { describe, it, expect, vi } from 'vitest';
import { printRoute, canSharePdf, sharePdf } from './printing';

const pdf = () => new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' });

function fakeNavigator(over: Partial<Navigator>): Navigator {
  return over as Navigator;
}

describe('choosing a route', () => {
  it('asks the browser to print, which is nearly always the answer', () => {
    expect(printRoute({ standalone: false, ios: false, canShareFiles: true })).toBe('dialog');
    expect(printRoute({ standalone: false, ios: true, canShareFiles: true })).toBe('dialog');
  });

  it('leaves an installed Android app alone, because printing works there', () => {
    // The temptation is to treat every installed app the same. Chrome has a
    // print dialog in standalone mode, and routing it through a share sheet
    // would be solving Apple's problem at Android's expense.
    expect(printRoute({ standalone: true, ios: false, canShareFiles: true })).toBe('dialog');
  });

  it('sends an installed iOS app to the share sheet', () => {
    expect(printRoute({ standalone: true, ios: true, canShareFiles: true })).toBe('share');
  });

  it('gives up honestly when neither road is open', () => {
    // An older iPhone with no file sharing. Nothing here can print, and saying
    // so beats a button that appears dead.
    expect(printRoute({ standalone: true, ios: true, canShareFiles: false })).toBe('blocked');
  });
});

describe('asking whether a PDF can be shared at all', () => {
  it('is no when the browser has no share sheet', () => {
    expect(canSharePdf(fakeNavigator({}))).toBe(false);
  });

  it('is no when the sheet exists but will not take files', () => {
    expect(
      canSharePdf(
        fakeNavigator({ share: vi.fn(), canShare: vi.fn().mockReturnValue(false) })
      )
    ).toBe(false);
  });

  it('is yes when it will', () => {
    expect(
      canSharePdf(fakeNavigator({ share: vi.fn(), canShare: vi.fn().mockReturnValue(true) }))
    ).toBe(true);
  });

  it('asks about a PDF, since that is what will be sent', () => {
    const canShare = vi.fn().mockReturnValue(true);
    canSharePdf(fakeNavigator({ share: vi.fn(), canShare }));
    const asked = canShare.mock.calls[0][0] as { files: File[] };
    expect(asked.files[0].type).toBe('application/pdf');
  });

  it('treats a browser that throws as one that cannot', () => {
    // Older WebKit rejects a shape it does not recognise rather than saying no,
    // and an exception here would take the whole tap down with it.
    const canShare = vi.fn(() => {
      throw new TypeError('nope');
    });
    expect(canSharePdf(fakeNavigator({ share: vi.fn(), canShare }))).toBe(false);
  });
});

describe('handing the document over', () => {
  it('reports a share that went', async () => {
    expect(await sharePdf(pdf(), 'Title', () => Promise.resolve())).toBe('shared');
  });

  it('treats backing out of the sheet as an answer, not a fault', async () => {
    const abort = Object.assign(new Error('closed'), { name: 'AbortError' });
    expect(await sharePdf(pdf(), 'Title', () => Promise.reject(abort))).toBe('dismissed');
  });

  it('reports a sheet that errored', async () => {
    expect(await sharePdf(pdf(), 'Title', () => Promise.reject(new Error('boom')))).toBe('failed');
  });

  it('says so rather than throwing when there is no sheet to open', async () => {
    expect(await sharePdf(pdf(), 'Title', undefined)).toBe('unsupported');
  });

  it('sends the file and the title, and nothing that would ride along in the body', async () => {
    const share = vi.fn(() => Promise.resolve());
    const file = pdf();
    await sharePdf(file, 'RoundRobinator', share);
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'RoundRobinator' });
  });

  it('opens the sheet before it awaits anything', () => {
    // The rule `shareApp` learned the hard way. iOS only opens the sheet during
    // a live user gesture, and an await beforehand spends it, after which the
    // sheet silently never appears. Calling without awaiting is the whole test:
    // if `share` has not run by the time this line is reached, the gesture is
    // already gone on a real phone.
    let called = false;
    void sharePdf(pdf(), 'Title', () => {
      called = true;
      return Promise.resolve();
    });
    expect(called).toBe(true);
  });
});
