import type { ReactNode } from 'react';
import {
  APP_VERSION, BUILD_ID, COPYRIGHT, DONATE_URL, FEEDBACK_EMAIL, PRIVACY_URL, TERMS_URL,
} from '../../lib/appInfo';
import { PersonIcon, ShareIcon, SlidersIcon } from '../icons';
import { AppWordmark } from './AppWordmark';

interface Props {
  open: boolean;
  /**
   * The picture at the top. Nearly always the app icon, and once in a while one
   * of the robins in fancy dress — see robins.ts, which picks it. Handed in
   * rather than chosen here so it is settled before the drawer slides open and
   * cannot change under somebody who is reading it.
   */
  robin: string;
  onShare: () => void;
  onOpenAccount: () => void;
  /** Hidden when there are no Supabase env vars, so there is never a dead button. */
  showAccountItem: boolean;
  /** Spelled out on the account item, so the state is readable without opening it. */
  signedIn: boolean;
  onOpenInstall: () => void;
  /** Hidden once launched from a home-screen icon — nothing left to install. */
  showInstallItem: boolean;
  onOpenSettings: () => void;
  onOpenImportExport: () => void;
  onOpenInstructions: () => void;
  onOpenDonate: () => void;
  onOpenFeature: () => void;
  onOpenBug: () => void;
}

// Shared shape for the item icons: 24x24 line art in the current text colour.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" className="shrink-0"
    >
      {children}
    </svg>
  );
}

// ShareIcon and PersonIcon live in ../icons: the Share panel's button and the
// one in Share Live Session show the same actions, and none of them must drift.

// A phone with a plus — put this on your device.
function AddToHomeScreenIcon() {
  return (
    <Icon>
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="12" y1="8" x2="12" y2="14" />
      <line x1="9" y1="11" x2="15" y2="11" />
    </Icon>
  );
}

// Arrow out of a tray and arrow into it — export and import.
function ImportExportIcon() {
  return (
    <Icon>
      <path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />
      <polyline points="6 7 9 4 12 7" />
      <line x1="9" y1="4" x2="9" y2="14" />
      <polyline points="12 11 15 14 18 11" />
      <line x1="15" y1="14" x2="15" y2="4" />
    </Icon>
  );
}

function HelpIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </Icon>
  );
}

function GiftIcon() {
  return (
    <Icon>
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </Icon>
  );
}

function LightbulbIcon() {
  return (
    <Icon>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1.61.59 2.84 1.5 3.5.76.76 1.23 1.52 1.41 2.5" />
    </Icon>
  );
}

function BugIcon() {
  return (
    <Icon>
      <path d="m8 2 1.88 1.88" />
      <path d="M14.12 3.88 16 2" />
      <path d="M9 7.13v-1a3 3 0 1 1 6 0v1" />
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
      <path d="M12 20v-9" />
      <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
      <path d="M6 13H2" />
      <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
      <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
      <path d="M22 13h-4" />
      <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
    </Icon>
  );
}

function SettingsItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left font-bold transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/**
 * The drawer behind the main panel. Always mounted so it is already in place
 * when the panel slides off it; `inert` while covered keeps it out of the tab
 * order and away from screen readers.
 */
export function SettingsPanel({
  open,
  robin,
  onShare,
  onOpenAccount,
  showAccountItem,
  signedIn,
  onOpenInstall,
  showInstallItem,
  onOpenSettings,
  onOpenImportExport,
  onOpenInstructions,
  onOpenDonate,
  onOpenFeature,
  onOpenBug,
}: Props) {
  return (
    <div
      inert={!open}
      aria-label="Settings"
      // Not painted while it is shut. It sits behind the app panel rather than
      // over it, so anything that moves the panel even slightly shows a stripe
      // of the drawer. Hiding it waits out the 300ms slide, or it would vanish
      // in front of the panel that is still on its way back.
      // A column, so the block at the foot can be pushed to the bottom of the
      // screen and stay there. On a short screen the menu fills the drawer, the
      // auto margin goes to nothing and the whole thing scrolls as before.
      //
      // Four fifths of the screen, but never more than 380px. A fifth of a
      // phone is a sensible margin to leave the app in; a fifth of a 1440px
      // monitor is a 1150px menu of ten short words. The cap only ever bites
      // above 475px, so no phone sees a change.
      //
      // **The panel's slide in App.tsx must say the same thing.** It moves the
      // whole app left to uncover this, and the two numbers are one number: if
      // the panel travels further than the drawer is wide, the extra is bare
      // grey backdrop with nothing on it.
      className={`no-print fixed inset-y-0 right-0 z-0 flex w-4/5 max-w-[380px] flex-col overflow-y-auto overscroll-contain bg-gray-800 px-5 py-4 text-white transition-[visibility] duration-0 ${
        open ? 'visible delay-0' : 'invisible delay-300'
      }`}
    >
      <div className="border-b border-white/20 pb-3">
        {/* The 192px icon scaled down, so it stays crisp on a retina screen.
            The costumes are drawn at the same size and carry their own rounded
            corners, which land within a pixel of the rounded-lg below. */}
        <img
          src={robin}
          alt=""
          width={192}
          height={192}
          className="mb-2 h-14 w-14 rounded-lg"
        />
        {/* The same mark as the banner, at the size the drawer's heading was.
            White under the name rather than black: this panel is navy, and the
            orange line carries on it as it does on the cream. */}
        <h2>
          <AppWordmark size="1.375rem" subtitleColor="#FFFFFF" />
        </h2>
      </div>
      {/* The gap above the footer rides here rather than on the footer itself.
          The footer's own top margin is auto, and an auto margin that has been
          eaten by a full screen leaves nothing behind. */}
      <nav className="mt-3 mb-6 space-y-1">
        {/* First, and the one item that goes away for good once it is done.
            It is the thing a new host should do before anything else, and it
            was sitting below an account they may never make. */}
        {showInstallItem && (
          <SettingsItem
            icon={<AddToHomeScreenIcon />}
            label="Add to Home Screen"
            onClick={onOpenInstall}
          />
        )}
        <SettingsItem icon={<ShareIcon className="h-6 w-6" />} label="Share App" onClick={onShare} />
        {/* No Supabase configured means no item, the same rule Donate follows */}
        {showAccountItem && (
          <SettingsItem
            icon={<PersonIcon className="h-6 w-6" />}
            label={`My Account (${signedIn ? 'signed in' : 'signed out'})`}
            onClick={onOpenAccount}
          />
        )}
        {/* Font size and the default rating used to be two of the items here.
            They were the only two that changed something rather than opening
            somewhere, sitting in a list of doors, and a third and a fourth of
            their kind were coming. They are behind this one now. */}
        <SettingsItem
          icon={<SlidersIcon className="h-6 w-6" />}
          label="Settings"
          onClick={onOpenSettings}
        />
        <SettingsItem
          icon={<ImportExportIcon />}
          label="Import / Export Groups"
          onClick={onOpenImportExport}
        />
        <SettingsItem icon={<HelpIcon />} label="Instructions" onClick={onOpenInstructions} />
        {/* No Ko-fi link configured means no item, rather than a dead button */}
        {DONATE_URL && (
          <SettingsItem icon={<GiftIcon />} label="Donate" onClick={onOpenDonate} />
        )}
        <SettingsItem
          icon={<LightbulbIcon />}
          label="Suggest a Feature"
          onClick={onOpenFeature}
        />
        <SettingsItem icon={<BugIcon />} label="Report a Bug" onClick={onOpenBug} />
      </nav>

      {/* Everything from the rule down sits at the foot of the screen. The menu
          ends where it ends, and the small print is where small print goes.
          `mt-auto` takes whatever room is left over, so on a tall screen the
          gap is above this block rather than below it. */}
      <div className="mt-auto border-t border-white/20 pt-4">
        <p className="text-sm text-white/70">
          Contact the creator:{' '}
          {/* Kept whole. It used to break wherever the line ran out, which put
              "m" on a line of its own under jeff@pbroundrobin.co and read like
              two addresses. Now the whole address moves down together. */}
          <a
            href={`mailto:${FEEDBACK_EMAIL}`}
            className="whitespace-nowrap underline decoration-white/40 underline-offset-2 hover:text-white"
          >
            {FEEDBACK_EMAIL}
          </a>
        </p>

        {/* Links rather than menu items. They belong down here with the contact
            address, not up there with the things people came to do. target=_blank
            because leaving the app would drop whatever session is on screen. */}
        <p className="mt-3 text-sm text-white/70">
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-white/40 underline-offset-2 hover:text-white"
          >
            Privacy Policy
          </a>
          <span className="mx-2">&middot;</span>
          <a
            href={TERMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-white/40 underline-offset-2 hover:text-white"
          >
            Terms of Service
          </a>
        </p>

        {/* Which build this phone is actually running.
 
            It is in the page footer too, in grey, at the bottom of however many
            rounds a session has. That is not a place two phones can be held up
            side by side, which is the one thing this line has to be good for:
            the report that sent it here was "one of them looks older than the
            other" and nobody could say whether that was true. The drawer opens
            from any tab, in one tap, at any scroll position.

            Both halves are here because they answer different questions.
            APP_VERSION is the number Jeff bumps and quotes; BUILD_ID is derived
            from the commit, so it stays right even on a deploy that forgot to
            bump. Two phones agreeing on the version but not the build is a
            forgotten bump; disagreeing on both is a genuinely stale phone.

            `select-all` so a long press lifts the whole id rather than half of
            it, and tabular-nums so the versions line up when they are read off
            two screens at once. */}
        <p className="mt-3 text-sm text-white/70">
          Version{' '}
          <span className="font-bold tabular-nums text-white">{APP_VERSION}</span>
          <span className="mx-2">&middot;</span>
          build{' '}
          <span className="select-all font-mono text-white">{BUILD_ID}</span>
        </p>

        {/* Under the links, as it is at the foot of the app. Dimmer than either:
            it is a notice, not something to read. */}
        <p className="mt-3 text-xs text-white/50">{COPYRIGHT}</p>
      </div>
    </div>
  );
}
