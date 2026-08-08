import type { ReactNode } from 'react';
import { backdrop, card, heading, status } from './accountStyles';

/**
 * The card every My Account screen sits in: backdrop, hero, title, and an
 * optional green status line.
 *
 * `onClose` is optional on purpose. The merge decision passes nothing, so that
 * screen has no way out except answering it — tapping the backdrop or hitting
 * Close is exactly how the old panel let people walk past the one question the
 * app will not answer for them.
 */
export function AccountShell({
  title = 'My Account',
  statusLine,
  onClose,
  children
}: {
  title?: string;
  statusLine?: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  return (
    <div className={backdrop} onClick={onClose}>
      <div className={card} onClick={(e) => e.stopPropagation()}>
        {/* Ships opaque with #FEFEFE baked in, same as share-top.png, which is
            why the card is #FEFEFE rather than white. 462px wide shown at 156,
            the ratio SharePanel already uses for artwork of this size. */}
        <img
          src="/account-top.png"
          alt=""
          width={462}
          height={161}
          className="mx-auto w-[156px]"
        />

        <h2 className={heading}>{title}</h2>
        {statusLine && <p className={status}>{statusLine}</p>}

        {children}
      </div>
    </div>
  );
}

/** A failure worth reading, in the one red this panel family uses. */
export function Problem({ children }: { children: string }) {
  return (
    <p
      role="alert"
      className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[#7F1D1D]"
    >
      {children}
    </p>
  );
}
