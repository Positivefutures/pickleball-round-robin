import { Example, Finding, Labelled, Row, Section, SubHeading } from '../kit';

import { panelCard } from '../../components/panelStyles';
import { PanelBadge, PanelGlyph, PanelHeading } from '../../components/PanelGlyph';
import { CornerDots } from '../../components/CornerDots';
import * as account from '../../components/layout/accountStyles';
import { Problem } from '../../components/layout/AccountShell';
import { InstallBanner } from '../../components/layout/InstallBanner';
import { SignInBanner } from '../../components/layout/SignInBanner';
import { UpdateBanner } from '../../components/layout/UpdateBanner';
import { PrintNotice } from '../../components/layout/PrintNotice';
import { Header } from '../../components/layout/Header';
import { AppWordmark } from '../../components/layout/AppWordmark';
import { LivePill } from '../../components/LivePill';
import { APP_FULL_NAME } from '../../lib/appInfo';
import { SwapHint } from '../../components/schedule/SwapHint';
import { CourtMissNote } from '../../components/schedule/CourtMissNote';
import { SpotsFilled } from '../../components/setup/SpotsFilled';
import { GroupSolidIcon, WarningIcon, InfoIcon, ShieldCheckIcon } from '../../components/icons';
import { ROUND_FILL, ROUND_EDGE } from '../../components/schedule/roundLook';

const noop = () => {};

/** The page card, which has no component — see F5. Nine copies of this string. */
const PAGE_CARD = 'bg-white rounded-lg shadow border border-panel-edge px-3 pt-[1.125rem] pb-6';

export function Surfaces() {
  return (
    <>
      <Section
        id="panels"
        title="Panels and dialogs"
        blurb={
          <>
            <code>panelCard</code> is the chrome on every dialog in the app — 21 importers, one
            string. Padding, width, background and scrolling stay with each panel, because a confirm
            dialog and the instructions-sized ones do not share those.
          </>
        }
      >
        <Example
          name="panelCard"
          note="rounded-2xl border-2 border-[#7FBEC4] shadow-xl — chrome only"
          source={`import { panelCard } from '../panelStyles';

<div className={\`\${panelCard} bg-white p-6\`}>
  …
</div>`}
        >
          <div className={`${panelCard} max-w-sm bg-white p-6`}>
            <p className="text-sm text-gray-700">A panel, with its own padding and background.</p>
          </div>
        </Example>

        <Example
          name="<PanelHeading icon title />"
          note="how every panel in the app opens. 12 importers"
          source={`import { PanelHeading } from '../PanelGlyph';

<PanelHeading icon={GroupSolidIcon} title="Manage Groups" />`}
        >
          <div className={`${panelCard} max-w-sm bg-white p-6`}>
            <PanelHeading icon={GroupSolidIcon} title="Manage Groups" />
          </div>
        </Example>

        <Example
          name="<PanelHeading /> — a confirming dialog puts its question here"
          note="not as body copy under the glyph. That reads as the first half of the warning"
          source={`<PanelHeading icon={WarningIcon} title={\`Delete “\${name}”?\`} />`}
        >
          <div className={`${panelCard} max-w-sm bg-white p-6`}>
            <PanelHeading icon={WarningIcon} title="Delete &ldquo;Tuesday Nighters&rdquo;?" />
          </div>
        </Example>

        <Example
          name="<PanelGlyph icon />"
          note="the glyph alone, for a panel that heads itself some other way. 4 direct uses"
          source={`import { PanelGlyph } from '../PanelGlyph';

<PanelGlyph icon={ShieldCheckIcon} />`}
        >
          <PanelGlyph icon={ShieldCheckIcon} />
        </Example>

        <Example
          name="<PanelBadge icon />"
          note="the same mark hung on a page card's top-left corner. Players ×4, Setup ×1"
          source={`import { PanelBadge } from '../PanelGlyph';

{/* The wrapper is what the badge is positioned against, and it must not clip:
    half the ring hangs outside the card. */}
<div className="relative">
  <div className={badgedCard}>…</div>
  <PanelBadge icon={GroupSolidIcon} />
</div>`}
        >
          {/* The card needs air above it here too, or the ring is cropped by
              the example's own top edge. */}
          <div className="relative mt-7 max-w-sm">
            <div className={`${PAGE_CARD} !pt-7`}>
              <h3 className="text-[1.35rem] font-extrabold text-[#222]">My Groups</h3>
            </div>
            <PanelBadge icon={GroupSolidIcon} />
          </div>
        </Example>

        <Example
          name="<CornerDots /> and <CornerDots smaller />"
          note="the dot grid a page card carries top-right. Setup at full size, Players a tenth down"
          source={`import { CornerDots } from '../CornerDots';

{/* The card clips it, so it needs relative overflow-hidden, and its own
    content needs a relative wrapper to sit above the artwork. */}
<div className="relative overflow-hidden ...">
  <CornerDots smaller />
  <div className="relative">…</div>
</div>`}
        >
          <div className="flex flex-wrap gap-4">
            {[false, true].map((smaller) => (
              <div
                key={String(smaller)}
                className={`${PAGE_CARD} relative overflow-hidden w-[15rem]`}
              >
                <CornerDots smaller={smaller} />
                <div className="relative">
                  <h3 className="text-[1.35rem] font-extrabold text-[#222]">
                    {smaller ? 'Add Players' : 'Setup'}
                  </h3>
                </div>
              </div>
            ))}
          </div>
        </Example>

        <Example
          name="account.card + account.backdrop"
          note="the account family's own shell, built on panelCard"
          source={`import { card, backdrop, heading, status, blurb } from './accountStyles';

<div className={backdrop} onClick={onClose}>
  <div className={card} onClick={(e) => e.stopPropagation()}>
    <h2 className={heading}>My Account</h2>
    <p className={status}>Signed in</p>
    <p className={blurb}>Your groups sync to every device you sign in on.</p>
  </div>
</div>`}
        >
          <div className={`${account.card} !mx-0`}>
            <h2 className={account.heading}>My Account</h2>
            <p className={account.status}>Signed in</p>
            <p className={account.blurb}>Your groups sync to every device you sign in on.</p>
          </div>
        </Example>
      </Section>

      <Section
        id="cards"
        title="Cards"
        blurb="The page card is the app's commonest surface and has no component behind it."
      >
        <Example
          name="The page card — 9 copies, no name"
          note="SetupPage ×2, StandingsPanel, PartnerSummary, the empty state; the 4 badged cards open the top to pt-7"
          source={`{/* verbatim from SetupPage.tsx and 4 others */}
<div className="bg-white rounded-lg shadow border border-panel-edge px-3 pt-[1.125rem] pb-6">
  …
</div>

{/* A badged card opens the top to clear its ring — RosterPage's badgedCard */}
<div className="… px-3 pt-7 pb-6">…</div>`}
        >
          <div className={`${PAGE_CARD} max-w-sm`}>
            <h3 className="text-lg font-bold text-gray-800">Players</h3>
            <p className="mt-1 text-sm text-gray-600">Twelve selected, three courts.</p>
          </div>
        </Example>

        <Finding id="F5">
          Only two of the nine carry the <code>roster-panel</code> class, which is the hook{' '}
          <code>index.css</code> uses to tighten padding in large-text mode. The other seven do not
          get that adjustment. Turn on the large-text toggle above and the difference is visible.
        </Finding>

        <Example
          name="Empty state"
          note="the only one in the app. text-xl font-medium text-gray-400"
          source={`{/* verbatim from RosterPage.tsx:441 */}
<div className="roster-panel bg-white rounded-lg shadow border border-panel-edge px-3 py-12 text-center">
  <p className="text-xl font-medium text-gray-400">Add your first player!</p>
  <p className="mt-2 text-sm text-gray-400">You'll need at least 4 to build a schedule.</p>
</div>`}
        >
          <div className="roster-panel max-w-sm bg-white rounded-lg shadow border border-panel-edge px-3 py-12 text-center">
            <p className="text-xl font-medium text-gray-400">Add your first player!</p>
            <p className="mt-2 text-sm text-gray-400">You&rsquo;ll need at least 4 to build a schedule.</p>
          </div>
        </Example>
      </Section>

      <Section
        id="banners"
        title="Banners"
        blurb={
          <>
            The banner across the top of every step comes first, because it is the only one of
            these that is the page rather than a message on it. Then five components, one shape:{' '}
            <code>flex items-center gap-3 rounded-lg border border-&lt;c&gt;-200 bg-&lt;c&gt;-50 px-4 py-3</code>.
            Four colours now: the install offer was repainted to match the new-version bar on
            2026-08-21, and the two share <code>bannerStyles.ts</code>. Still five files, and the
            dismiss ✕ still written out five times. All five are the real components below.
          </>
        }
      >
        <SubHeading>The page banner</SubHeading>

        <Example
          name="<AppWordmark size sport? subtitleColor? />"
          note="the sport, the app's name, and what it is · #051829 caps 14px over brand-orange 26px over #051829 18px, the lower two always 14/26 and 18/26 of the name · sport off where the mark sits on navy, or where MADE WITH has the line above already"
          source={`import { AppWordmark } from './AppWordmark';

<AppWordmark size="1.625rem" />`}
        >
          <Row>
            <Labelled label="1.625rem — the banner's top size">
              <AppWordmark size="1.625rem" />
            </Labelled>
            <Labelled label="sport={false} — the watchers' page">
              <AppWordmark size="1.625rem" sport={false} />
            </Labelled>
            <Labelled label="1.375rem — the settings drawer, on navy">
              <div className="rounded-lg bg-[#0B2545] p-4">
                <AppWordmark size="1.375rem" subtitleColor="#FFFFFF" sport={false} />
              </div>
            </Labelled>
          </Row>
        </Example>

        <Example
          name="<Header title wordmark sport badge onToggleSettings onPrint eyebrow corner titleHref onTitleClick />"
          note="two pieces of artwork against the edges with live text between them · height clamp(110px, 26.25vw, 165px) · the wordmark clamps from 20px to 26px so its second line stays on one line down to 360px · sizes off the window, so resize rather than using the frame above"
          source={`import { Header } from './Header';

// The Players step, and any step with no group to name.
<Header title={APP_FULL_NAME} wordmark onToggleSettings={toggle} />

// Every step after it: the group's name, the groups mark, and a way to another.
<Header title={roster.name} badge="groups" onTitleClick={pickGroup} onPrint={print} />

// The live view, which has no drawer and says what made the page.
<Header title={APP_FULL_NAME} wordmark sport={false} eyebrow="MADE WITH" titleHref={APP_URL} corner={<LivePill />} />`}
        >
          {/* Drawn at `100vw` inside a box that scrolls, which is the only way
              to show this one honestly. The banner sizes itself off the window
              rather than off its own box — the height, the artwork and the
              wordmark are all `vw` — so in a column narrower than the window it
              lays out type for a screen it has not got and wraps where the app
              does not. Given the window's own width it is the app's banner
              exactly, and the column scrolls sideways to show the rest of it.

              Which also means the frame buttons above do nothing to this
              specimen. Resize the window to see the clamps move. */}
          <div className="flex w-screen flex-col gap-4">
            <Labelled label="wordmark — the Players step" full>
              <Header title={APP_FULL_NAME} wordmark onToggleSettings={noop} />
            </Labelled>
            <Labelled label="a group's name, with the groups mark and the print button" full>
              <Header title="Tuesday Night Social" badge="groups" onTitleClick={noop} onPrint={noop} onToggleSettings={noop} />
            </Labelled>
            <Labelled label="the live view — eyebrow, LIVE pill, and the whole banner a link" full>
              <Header
                title={APP_FULL_NAME}
                wordmark
                sport={false}
                eyebrow="MADE WITH"
                titleHref="https://app.roundrobinator.com/"
                corner={<LivePill />}
              />
            </Labelled>
          </div>
        </Example>

        <SubHeading>Messages on the page</SubHeading>

        <Example
          name="<InstallBanner onOpen onDismiss />"
          note="orange-200 / orange-50 · app logo · #FA5D02 action, below the words"
          source={`import { InstallBanner } from './InstallBanner';

<InstallBanner onOpen={() => setShowInstall(true)} onDismiss={dismiss} />`}
        >
          <div className="max-w-lg"><InstallBanner onOpen={noop} onDismiss={noop} /></div>
        </Example>

        <Example
          name="<SignInBanner onOpen onDismiss />"
          note="brand-teal / brand-teal-light · ShieldCheckIcon · the only one on brand colours, and the other with its action below the words"
          source={`import { SignInBanner } from './SignInBanner';

<SignInBanner onOpen={() => openAccount()} onDismiss={dismiss} />`}
        >
          <div className="max-w-lg"><SignInBanner onOpen={noop} onDismiss={noop} /></div>
        </Example>

        <Example
          name="<UpdateBanner onReload onDismiss />"
          note="orange-200 / orange-50, and a button in #FA5D02 — a third orange, now shared with InstallBanner"
          source={`import { UpdateBanner } from './UpdateBanner';

<UpdateBanner onReload={applyUpdate} onDismiss={dismiss} />`}
        >
          <div className="max-w-lg"><UpdateBanner onReload={noop} onDismiss={noop} /></div>
        </Example>

        <Example
          name="<PrintNotice reason onDismiss />"
          note="reason: 'blocked' | 'failed' · amber-200 / amber-50 · no icon"
          source={`import { PrintNotice } from './PrintNotice';

<PrintNotice reason="blocked" onDismiss={dismiss} />`}
        >
          <div className="flex max-w-lg flex-col gap-3">
            <PrintNotice reason="blocked" onDismiss={noop} />
            <PrintNotice reason="failed" onDismiss={noop} />
          </div>
        </Example>

        <Example
          name="<SwapHint onDismiss />"
          note="green-200 / green-50 · TipIcon at 42px · text-base, not text-sm"
          source={`import { SwapHint } from './SwapHint';

<SwapHint onDismiss={dismiss} />`}
        >
          <div className="max-w-lg"><SwapHint onDismiss={noop} /></div>
        </Example>

        <Finding id="F3">
          One <code>&lt;Banner tone icon action onDismiss /&gt;</code> would absorb all five and
          collect the third orange into the token — <code>bannerStyles.ts</code> is half a step
          towards it, naming that orange for the two bars that share it. It would also settle
          where the action goes: two put it beside the words, two below. Note that only{' '}
          <code>SwapHint</code> sets its body at <code>text-base</code>; the other four use{' '}
          <code>text-sm</code>.
        </Finding>
      </Section>

      <Section
        id="notices"
        title="Notices and alerts"
        blurb="Inline, non-dismissible. Four families, and the amber one is written out eight times."
      >
        <Example
          name="Orange warning — 3 sites"
          note="border-2 border-brand-orange bg-brand-orange-light + WarningIcon. This one takes something away"
          source={`{/* verbatim from ActionsSheet.tsx:915 and App.tsx:1859 */}
<div className="flex items-start gap-3 rounded-lg border-2 border-brand-orange bg-brand-orange-light p-4">
  <span className="shrink-0 text-brand-orange"><WarningIcon className="h-9 w-9" /></span>
  <p className="text-sm">Removing a player clears the scores for every round they were in.</p>
</div>`}
        >
          <div className="flex max-w-lg items-start gap-3 rounded-lg border-2 border-brand-orange bg-brand-orange-light p-4">
            <span className="shrink-0 text-brand-orange"><WarningIcon className="h-9 w-9" /></span>
            <p className="text-sm">Removing a player clears the scores for every round they were in.</p>
          </div>
        </Example>

        <Example
          name="Yellow info — 1 site"
          note="same shape, bg-notice-yellow + InfoIcon. This one costs nobody anything"
          source={`{/* verbatim from ActionsSheet.tsx:748 */}
<div className="flex items-start gap-3 rounded-lg border-2 border-brand-orange bg-notice-yellow p-4">
  <span className="shrink-0 text-brand-orange"><InfoIcon className="h-9 w-9" /></span>
  <p className="text-sm">The courts are full, so whoever you add starts on the bench.</p>
</div>`}
        >
          <div className="flex max-w-lg items-start gap-3 rounded-lg border-2 border-brand-orange bg-notice-yellow p-4">
            <span className="shrink-0 text-brand-orange"><InfoIcon className="h-9 w-9" /></span>
            <p className="text-sm">The courts are full, so whoever you add starts on the bench.</p>
          </div>
        </Example>

        <Example
          name="Amber note — 8 sites, four sets of measurements"
          note="the shape drifts: rounded-md px-3 py-2 (×5), rounded-xl px-3.5 py-3 (×2), border-amber-300 (×2)"
          source={`{/* the commonest of the four, from PartnerPlayNotice.tsx:51 */}
<p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
  Partner play needs an even number of pairs.
</p>`}
        >
          <div className="flex max-w-lg flex-col gap-3">
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              rounded-md px-3 py-2 border-amber-200 — 5 sites
            </p>
            <p className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 font-medium text-amber-900">
              rounded-xl px-3.5 py-3 border-amber-300 — 2 sites
            </p>
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              rounded-md px-3 py-2 border-amber-300 — GroupPicker
            </p>
          </div>
        </Example>

        <Example
          name="<Problem>…</Problem>"
          note="the red one. 4 importers, and the only importable notice"
          source={`import { Problem } from './AccountShell';

<Problem>That code has expired. Send yourself another.</Problem>`}
        >
          <div className="max-w-lg"><Problem>That code has expired. Send yourself another.</Problem></div>
        </Example>

        <Example
          name="account.good + account.note"
          note="good is the teal 'this worked'. note is a box with the colour left to the caller"
          source={`import { good, note } from './accountStyles';

<p className={\`\${note} \${good}\`}>Code sent. Check your email.</p>
<p className={\`\${note} border-amber-200 bg-amber-50 text-amber-900\`}>Not synced yet.</p>`}
        >
          <div className="flex max-w-lg flex-col">
            <p className={`${account.note} ${account.good}`}>Code sent. Check your email.</p>
            <p className={`${account.note} border-amber-200 bg-amber-50 text-amber-900`}>Not synced yet.</p>
          </div>
        </Example>

        <Finding id="F4">
          <code>account.note</code> is already half the answer — it supplies the box and the caller
          supplies the colour every time. Giving it a <code>tone</code> would collect all eight amber
          notes, <code>Problem</code> and <code>good</code>, which are the same box in three colours.
        </Finding>

        <Example
          name="<CourtMissNote headline reason />"
          note="drawn in white, so it only reads on the round's own fill"
          source={`import { CourtMissNote } from './CourtMissNote';

<CourtMissNote headline="Court 3 played a normal game" reason="Not enough men left for a gendered court." />`}
          dark
        >
          <div
            className="max-w-md rounded-lg border-2 p-3"
            style={{ backgroundColor: ROUND_FILL, borderColor: ROUND_EDGE }}
          >
            <CourtMissNote
              headline="Court 3 played a normal game"
              reason="There were not enough men left to fill a gendered court."
            />
          </div>
        </Example>

        <Example
          name="<SpotsFilled numPlayers numCourts />"
          note="how many places are taken, and who that leaves sitting"
          source={`import { SpotsFilled } from './SpotsFilled';

<SpotsFilled numPlayers={14} numCourts={3} />`}
        >
          <div className="flex flex-col gap-4">
            <SpotsFilled numPlayers={14} numCourts={3} />
            <SpotsFilled numPlayers={8} numCourts={2} />
          </div>
        </Example>
      </Section>

      <Section
        id="rows"
        title="Rows and lists"
        blurb="Three near-identical row treatments, in three files."
      >
        <div>
          <SubHeading>The three rows, side by side</SubHeading>
        </div>
        <Example
          name="account.row · ActionsSheet.ROW · InstructionsPanel row"
          note="the first is imported; the other two are private consts and are copied here"
          source={`import { row } from './accountStyles';           // exported — use this one

// ActionsSheet.ROW — identical apart from the two disabled: classes, but private
'flex w-full items-center gap-3 rounded-lg border border-panel-edge bg-white px-4 py-3 text-left transition-colors hover:bg-[#F1F3F6]'

// InstructionsPanel — a third near-copy on gray-200 / gray-50
'flex w-full items-center gap-3.5 rounded-lg border border-gray-200 px-4 py-3 text-left transition-colors hover:bg-gray-50'`}
        >
          <div className="flex max-w-sm flex-col gap-3">
            <button type="button" className={account.row}>
              <span className={account.rowTitle}>account.row — border-panel-edge</span>
            </button>
            <button type="button" className="flex w-full items-center gap-3 rounded-lg border border-panel-edge bg-white px-4 py-3 text-left transition-colors hover:bg-[#F1F3F6]">
              <span className="block font-bold text-[#1F293D]">ActionsSheet.ROW — the same, private</span>
            </button>
            <button type="button" className="flex w-full items-center gap-3.5 rounded-lg border border-gray-200 px-4 py-3 text-left transition-colors hover:bg-gray-50">
              <span className="block font-bold text-gray-900">InstructionsPanel — border-gray-200</span>
            </button>
          </div>
        </Example>

        <Example
          name="ActionsSheet.NEW_ROW"
          note="the tinted row: the one entry in a list of people that is not a name"
          source={`{/* verbatim from ActionsSheet.tsx:209 — private const */}
<button className="flex w-full items-center gap-3 rounded-lg border border-[#A6D1D5] bg-brand-teal-light px-4 py-3 text-left font-bold text-brand-teal transition-colors hover:bg-[#D5F0F2]">
  New Player
</button>`}
        >
          <div className="max-w-sm">
            <button type="button" className="flex w-full items-center gap-3 rounded-lg border border-[#A6D1D5] bg-brand-teal-light px-4 py-3 text-left font-bold text-brand-teal transition-colors hover:bg-[#D5F0F2]">
              New Player
            </button>
          </div>
        </Example>

        <div>
          <SubHeading>Tables</SubHeading>
          <p className="mt-1.5 max-w-2xl text-[0.875rem] leading-relaxed text-slate-600">
            Four tables, no shared styling between them: <code>PlayerList</code> (
            <code>roster-table</code>, with its own large-text rules in <code>index.css</code>),{' '}
            <code>StandingsPanel</code> (<code>w-full text-sm</code>), <code>PartnerSummary</code> (
            <code>text-xs</code>) and <code>PrintSchedule</code> (the print sheet, with 14 inline
            style objects). Each needs live session data, so they are named here rather than drawn.
          </p>
        </div>

        <Example
          name="The rating badge"
          note="inline in PlayerList, with CSS hooks in index.css for large-text mode"
          source={`{/* verbatim from PlayerList.tsx:109 */}
<span className="rating-badge inline-block bg-brand-teal-light text-black border border-brand-teal px-2 py-0.5 rounded text-sm font-medium">
  4.0
</span>`}
        >
          <Row>
            <span className="rating-badge inline-block bg-brand-teal-light text-black border border-brand-teal px-2 py-0.5 rounded text-sm font-medium">4.0</span>
            <span className="rating-badge inline-block bg-brand-teal-light text-black border border-brand-teal px-2 py-0.5 rounded text-sm font-medium">3.5</span>
          </Row>
        </Example>
      </Section>
    </>
  );
}
