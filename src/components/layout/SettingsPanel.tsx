import type { ReactNode } from 'react';
import { DONATE_URL, FEEDBACK_EMAIL, PRIVACY_URL, TERMS_URL } from '../../lib/appInfo';
import { PersonIcon, ShareIcon } from '../icons';

interface Props {
  open: boolean;
  onShare: () => void;
  onOpenAccount: () => void;
  /** Hidden when there are no Supabase env vars, so there is never a dead button. */
  showAccountItem: boolean;
  /** Spelled out on the account item, so the state is readable without opening it. */
  signedIn: boolean;
  onOpenInstall: () => void;
  /** Hidden once launched from a home-screen icon — nothing left to install. */
  showInstallItem: boolean;
  onToggleLargeText: () => void;
  onOpenDefaultRating: () => void;
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

// The same two-A glyph the old header button used, so the action stays recognisable.
function FontSizeIcon() {
  return (
    <span
      aria-hidden="true"
      className="flex w-6 shrink-0 items-end justify-center gap-0.5 leading-none"
    >
      <span className="text-[0.7rem] font-bold leading-none">A</span>
      <span className="text-[1.15rem] font-bold leading-none">A</span>
    </span>
  );
}

function StarIcon() {
  return (
    <Icon>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
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
      className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left font-medium transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
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
  onShare,
  onOpenAccount,
  showAccountItem,
  signedIn,
  onOpenInstall,
  showInstallItem,
  onToggleLargeText,
  onOpenDefaultRating,
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
      className={`no-print fixed inset-y-0 right-0 z-0 w-4/5 overflow-y-auto overscroll-contain bg-gray-800 px-5 py-4 text-white transition-[visibility] duration-0 ${
        open ? 'visible delay-0' : 'invisible delay-300'
      }`}
    >
      <div className="border-b border-white/20 pb-3">
        {/* The 192px icon scaled down, so it stays crisp on a retina screen */}
        <img
          src="/icon-192.png"
          alt=""
          width={192}
          height={192}
          className="mb-2 h-14 w-14 rounded-lg"
        />
        <h2 className="text-xl font-bold tracking-tight">
          Pickleball Round Robin Generator
        </h2>
      </div>
      <nav className="mt-3 space-y-1">
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
        <SettingsItem
          icon={<FontSizeIcon />}
          label="Toggle Font Size"
          onClick={onToggleLargeText}
        />
        <SettingsItem
          icon={<StarIcon />}
          label="Default Player Rating"
          onClick={onOpenDefaultRating}
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

      <p className="mt-6 border-t border-white/20 pt-4 text-sm text-white/70">
        Contact the creator:{' '}
        <a
          href={`mailto:${FEEDBACK_EMAIL}`}
          className="break-all underline decoration-white/40 underline-offset-2 hover:text-white"
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
    </div>
  );
}
