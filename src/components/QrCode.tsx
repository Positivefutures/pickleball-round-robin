import { useEffect, useState } from 'react';
import { qrModules, qrPath, qrSize, type QrModules } from '../lib/qr';

interface Props {
  /** What a camera should end up at. */
  value: string;
  /** Drawn size in CSS pixels. */
  size?: number;
  /** What a screen reader should say instead of describing a pattern of dots. */
  label: string;
}

/**
 * A QR code, drawn rather than fetched.
 *
 * SVG rather than a canvas, because this is looked at across a table and
 * sometimes printed, and a canvas is fixed at whatever pixels it was given.
 * A single <path> rather than createSvgTag(), which returns markup and would
 * mean dangerouslySetInnerHTML for something we can draw ourselves in a line.
 *
 * The encoder arrives asynchronously, so there is a moment with nothing to
 * draw. That moment holds its own size, or the panel would jump under the
 * finger about to tap Copy Link.
 */
export function QrCode({ value, size = 240, label }: Props) {
  /**
   * The square, and the link it was made from.
   *
   * Kept together rather than as two pieces of state, so that a changed link
   * puts the placeholder back by being derived below rather than by clearing
   * this from inside the effect. Clearing it there is a synchronous setState in
   * an effect body, which is a cascading render and which eslint refuses.
   */
  const [made, setMade] = useState<{ value: string; modules: QrModules } | null>(null);

  useEffect(() => {
    let live = true;
    qrModules(value)
      .then((modules) => {
        if (live) setMade({ value, modules });
      })
      .catch(() => {
        // Nothing to say and nothing to do. The link is on screen beneath this
        // and is selectable by hand, so the share still works without it.
      });
    return () => {
      live = false;
    };
  }, [value]);

  const modules = made?.value === value ? made.modules : null;

  if (!modules) {
    return (
      <div
        className="rounded bg-gray-100"
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }

  const side = qrSize(modules);

  return (
    <svg
      viewBox={`0 0 ${side} ${side}`}
      width={size}
      height={size}
      // Without this the renderer antialiases every module edge and a code that
      // is only about thirty modules across goes soft enough to fail a scan.
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      {/* Named rather than inherited. The quiet zone only works if it is
          actually white, whatever the card behind it is doing. */}
      <rect width={side} height={side} fill="#ffffff" />
      <path d={qrPath(modules)} fill="#111111" />
    </svg>
  );
}
