import { useState } from 'react';
import { APP_URL } from '../../lib/appInfo';
import { canShare, shareApp } from '../../lib/share';
import { CopyIcon, GreenHeartIcon, PaddleIcon, ShareIcon, StarIcon } from '../icons';
import { panelCard } from '../panelStyles';

interface Props {
  onClose: () => void;
}

/**
 * Opened by Share App, on every browser. Where the OS has a share sheet the
 * panel offers it as the first button; where it does not, that button is absent
 * and copying the link is the whole job.
 */
export function SharePanel({ onClose }: Props) {
  const [copied, setCopied] = useState(false);
  // Read once at mount: navigator.share cannot come and go mid-session.
  const [hasSheet] = useState(canShare);

  async function handleShare() {
    // shareApp() calls share() before its first await, which is what keeps the
    // iOS user gesture alive. Do not await anything ahead of this line.
    const outcome = await shareApp();
    // Dismissing the sheet leaves the panel up, so a mis-tap costs nothing.
    if (outcome === 'shared') onClose();
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(APP_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the link is on screen and selectable by hand
      setCopied(false);
    }
  }

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className={`mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain ${panelCard} bg-[#FEFEFE] p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ships opaque — PNG colour type 2, no alpha — with #FEFEFE baked in,
            which is why the card is #FEFEFE rather than white. Tint this
            background any further and the hero shows as a rectangle. */}
        <img
          src="/share-top.png"
          alt=""
          width={462}
          height={165}
          className="mx-auto w-[156px]"
        />

        {/* Sized against the mockup's ratios: heading 43.5% of the card width,
            which lands at text-3xl on max-w-md. Chasing every ratio at once is a
            dead end — the mockup was set in a narrower face than the app ships,
            so the widths it implies for the card disagree by 180px. */}
        <h2 className="mt-1 text-center text-3xl font-extrabold tracking-tight text-[#0D141D]">
          Share the App
        </h2>

        <p className="mt-2 text-center text-lg leading-snug text-[#495668]">
          Help more pickleball players run better round robins.{' '}
          <span className="font-medium text-[#029130]">
            Thanks for spreading the word!
            <GreenHeartIcon className="ml-1 inline-block h-4 w-4 align-[-0.15em]" />
          </span>
        </p>

        {/* select-all: one tap or click selects the whole address */}
        <p className="mt-4 select-all break-all rounded-md border border-panel-edge bg-[#F8F9FB] px-3 py-2.5 font-medium text-[#3D495A]">
          {APP_URL}
        </p>

        {hasSheet && (
          <button
            type="button"
            onClick={handleShare}
            className="mt-3 flex w-full items-center gap-3 rounded-lg bg-[#018D31] px-4 py-3 text-left text-white transition-colors hover:bg-[#017129]"
          >
            <ShareIcon className="h-6 w-6" />
            <span>
              <span className="block font-bold">Share&hellip;</span>
              {/* Not "anywhere else": the Copy button's line already says
                  anywhere, and the longer wording orphaned a word at 360px. */}
              <span className="block text-sm text-white/85">Messages, email, and more</span>
            </span>
          </button>
        )}

        {/* Green only when it is the one action on offer. Alongside Share… it
            steps back to secondary, so the panel never shows two primaries.
            Set the text colour once per branch: listing `text-white` in the base
            and overriding it here would leave both classes in play, and which
            one wins is down to their order in the stylesheet. */}
        <button
          type="button"
          onClick={handleCopy}
          className={`mt-3 flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors ${
            hasSheet
              ? 'border border-panel-edge bg-white text-[#3D495A] hover:bg-[#F1F3F6]'
              : 'bg-[#018D31] text-white hover:bg-[#017129]'
          }`}
        >
          <CopyIcon className="h-6 w-6" />
          <span>
            <span className="block font-bold">Copy Link</span>
            {/* Swapping the second line rather than the title keeps the button
                from changing width as the confirmation comes and goes. */}
            <span className={`block text-sm ${hasSheet ? 'text-[#6B7684]' : 'text-white/85'}`}>
              {copied ? 'Copied' : "Then share it anywhere you'd like"}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-lg border border-panel-edge bg-[#F8F9FB] px-4 py-2.5 font-bold text-[#3D495A] transition-colors hover:bg-[#EDF0F4]"
        >
          Close
        </button>

        <p className="mt-4 flex items-center justify-center gap-2 text-center text-[13px] leading-snug text-[#717A87]">
          <StarIcon className="h-4 w-4 shrink-0 text-[#009424]" />
          Thanks for being part of the pickleball community!
          <PaddleIcon className="h-4 w-4 shrink-0 text-[#009424]" />
        </p>
      </div>
    </div>
  );
}
