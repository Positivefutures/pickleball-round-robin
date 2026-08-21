import { useState } from 'react';
import { Example, Finding, FocusProbe, Labelled, Row, Section, StateBox, SubHeading } from '../kit';

// Every control below is the real one, imported. Nothing here re-draws a button.
import { TileButton, TILE_ROW, TILE_ALONE } from '../../components/TileButton';
import { Toggle } from '../../components/Toggle';
import { RatingStepper } from '../../components/RatingStepper';
import { CodeEntry } from '../../components/CodeEntry';
import { Keypad } from '../../components/schedule/Keypad';
import { FIELD_LABEL } from '../../components/formLook';
import { STEPPER_KEY, STEPPER_VALUE } from '../../components/stepperLook';
import * as account from '../../components/layout/accountStyles';
import { ShareIcon, TrashIcon, CopyIcon, PencilIcon, MailIcon, SignOutIcon } from '../../components/icons';
import { PlayTriangleIcon, StopSquareIcon } from '../../components/schedule/timerIcons';

const noop = () => {};

export function Controls() {
  return (
    <>
      <Section
        id="buttons"
        title="Buttons"
        blurb={
          <>
            There is one shared button <em>component</em> — <code>TileButton</code> — and it is the
            square glyph tile. The ordinary button is a class string, and there are three competing
            sets of them. All four are shown here because all four are in the app.
            <br />
            <code>TileButton</code> has five tones and two sizes. The three pale tones are the
            ordinary ones; the two solid ones and the large size belong to the round timer, which is
            read at arm's length from the side of a court, and nothing else should reach for them.
          </>
        }
      >
        <SubHeading>TileButton — the one real component</SubHeading>
        <Example
          name="<TileButton tone=… Icon=… label=… onClick=… />"
          note="tone: 'quiet' | 'teal' | 'red' — the pale family, and the default size"
          source={`import { TileButton, TILE_ROW } from '../TileButton';

<div className={TILE_ROW}>
  <TileButton tone="teal" Icon={ShareIcon} label="Share Link" onClick={share} />
  <TileButton tone="quiet" Icon={CopyIcon} label="Copy" onClick={copy} />
  <TileButton tone="red" Icon={TrashIcon} label="Stop Sharing" onClick={stop} />
</div>`}
        >
          <div className={TILE_ROW} style={{ maxWidth: '24rem' }}>
            <TileButton tone="teal" Icon={ShareIcon} label="Share Link" onClick={noop} />
            <TileButton tone="quiet" Icon={CopyIcon} label="Copy" onClick={noop} />
            <TileButton tone="red" Icon={TrashIcon} label="Stop Sharing" onClick={noop} />
          </div>
        </Example>

        <Example
          name="TileButton — the two solid tones"
          note="tone: 'solid-green' | 'solid-red'. The round timer's, and nothing else's"
          source={`<TileButton tone="solid-green" size="lg" Icon={PlayTriangleIcon} label="Start Timer" onClick={start} />
<TileButton tone="solid-red" size="lg" Icon={StopSquareIcon} label="Stop" onClick={stop} />`}
        >
          <div className={TILE_ROW} style={{ maxWidth: '16rem' }}>
            <TileButton tone="solid-green" size="lg" Icon={PlayTriangleIcon} label="Start Timer" onClick={noop} />
            <TileButton tone="solid-red" size="lg" Icon={StopSquareIcon} label="Stop" onClick={noop} />
          </div>
        </Example>

        <Example
          name="TileButton — size"
          note="size: 'md' (the default) | 'lg'. The first named size in the app — see F2"
          source={`<TileButton tone="teal" Icon={ShareIcon} label="Share Link" onClick={share} />
<TileButton tone="teal" size="lg" Icon={ShareIcon} label="Share Link" onClick={share} />`}
        >
          <div className="flex flex-col gap-3">
            <div className={TILE_ROW} style={{ maxWidth: '16rem' }}>
              <TileButton tone="teal" Icon={ShareIcon} label="Share Link" onClick={noop} />
              <TileButton tone="quiet" Icon={CopyIcon} label="Copy" onClick={noop} />
            </div>
            <div className={TILE_ROW} style={{ maxWidth: '16rem' }}>
              <TileButton tone="teal" size="lg" Icon={ShareIcon} label="Share Link" onClick={noop} />
              <TileButton tone="quiet" size="lg" Icon={CopyIcon} label="Copy" onClick={noop} />
            </div>
          </div>
        </Example>

        <Example
          name="TILE_ALONE"
          note="one tile, held to a tile's width rather than stretched across the panel"
          source={`import { TileButton, TILE_ALONE } from '../TileButton';

<div className={TILE_ALONE}>
  <TileButton tone="teal" Icon={ShareIcon} label="Try Again" onClick={begin} />
</div>`}
        >
          <div className={TILE_ALONE}>
            <TileButton tone="teal" Icon={ShareIcon} label="Try Again" onClick={noop} />
          </div>
        </Example>

        <Example
          name="TileButton — disabled"
          note="disabled:opacity-40, and the hover is held off"
          source={`<TileButton tone="teal" Icon={ShareIcon} label="Share Link" onClick={share} disabled />`}
        >
          <div className={TILE_ROW} style={{ maxWidth: '16rem' }}>
            <TileButton tone="teal" Icon={ShareIcon} label="Share Link" onClick={noop} disabled />
            <TileButton tone="quiet" Icon={CopyIcon} label="Copy" onClick={noop} disabled />
          </div>
        </Example>

        <SubHeading>accountStyles — the class strings, and the most accessible set</SubHeading>
        <Example
          name="account.primary / account.secondary / account.danger"
          note="44px+ targets, text-lg, rounded-lg. Import the string, put it on a <button>"
          source={`import { primary, secondary, danger } from './accountStyles';

<button type="button" className={primary} onClick={send}>Send Code</button>
<button type="button" className={\`mt-3 \${secondary}\`} onClick={close}>Close</button>
<button type="button" className={danger} onClick={remove}>Delete My Account</button>`}
        >
          <div className="flex max-w-sm flex-col gap-3">
            <button type="button" className={account.primary}>Send Code</button>
            <button type="button" className={account.secondary}>Close</button>
            <button type="button" className={account.danger}>Delete My Account</button>
          </div>
        </Example>

        <Example
          name="account.primary — disabled"
          note="disabled:bg-[#9DC3C7] and disabled:bg-[#DDB3AF], not an opacity"
          source={`<button type="button" className={primary} disabled>Send Code</button>`}
        >
          <div className="flex max-w-sm flex-col gap-3">
            <button type="button" className={account.primary} disabled>Send Code</button>
            <button type="button" className={account.secondary} disabled>Close</button>
            <button type="button" className={account.danger} disabled>Delete My Account</button>
          </div>
        </Example>

        <SubHeading>account.row — a title with a quieter line under it</SubHeading>
        <Example
          name="account.row / rowTitle / rowNote / rowIcon"
          note="what stops three actions being three identical grey slabs"
          source={`import { row, rowTitle, rowNote, rowIcon } from './accountStyles';

<button type="button" className={row} onClick={change}>
  <MailIcon className={rowIcon} />
  <span>
    <span className={rowTitle}>Change Email</span>
    <span className={rowNote}>Move this account to another address</span>
  </span>
</button>`}
        >
          <div className="flex max-w-sm flex-col gap-3">
            <button type="button" className={account.row}>
              <MailIcon className={account.rowIcon} />
              <span>
                <span className={account.rowTitle}>Change Email</span>
                <span className={account.rowNote}>Move this account to another address</span>
              </span>
            </button>
            <button type="button" className={account.row}>
              <SignOutIcon className={account.rowIcon} />
              <span>
                <span className={account.rowTitle}>Sign Out</span>
                <span className={account.rowNote}>Your groups stay on this device</span>
              </span>
            </button>
            <button type="button" className={account.rowDanger}>
              <TrashIcon className={account.rowIconDanger} />
              <span>
                <span className={account.rowDangerTitle}>Delete Account</span>
                <span className={account.rowNote}>Ends your account for good. Nothing here is lost</span>
              </span>
            </button>
          </div>
        </Example>

        <Finding id="F6">
          <code>ActionsSheet.ROW</code> is byte-identical to <code>account.row</code> apart from its
          two <code>disabled:</code> classes — but it is a private const in that file, so it cannot
          be imported and cannot be shown here.
        </Finding>

        <SubHeading>The inline shapes — no component, no export</SubHeading>
        <p className="max-w-2xl text-[0.875rem] leading-relaxed text-slate-600">
          These are the three most-used buttons in the app and none of them can be imported, so the
          markup below is the one place on this page that is a copy. It is here because leaving out
          the app's commonest button would make the guide a worse map than the code. Every one is
          reproduced verbatim from the sites listed.
        </p>

        <Example
          name="Grey / cancel — 22 sites, 18 files"
          note="not exported anywhere. Written out at each site, in two class orders"
          source={`{/* verbatim from RosterPage.tsx:356, CourtNumberDialog.tsx:98 and 20 others */}
<button
  type="button"
  className="px-4 py-2.5 border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-bold"
>
  Cancel
</button>`}
        >
          <Row>
            <button type="button" className="px-4 py-2.5 border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-bold">
              Cancel
            </button>
            <button type="button" disabled className="px-4 py-2.5 border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed">
              Cancel
            </button>
          </Row>
        </Example>

        <Example
          name="Teal / confirm — 19 sites, 15 files"
          note="five different paddings claim to be this button: py-2, py-2.5, py-3, py-3.5, px-6 py-2.5"
          source={`{/* verbatim from ScoreDialog.tsx:193 and 18 others */}
<button
  type="button"
  className="px-4 py-2.5 bg-brand-teal text-white rounded-md hover:bg-brand-teal-dark transition-colors font-bold"
>
  Save
</button>`}
        >
          <Row>
            <Labelled label="px-4 py-2.5 — 13 sites">
              <button type="button" className="px-4 py-2.5 bg-brand-teal text-white rounded-md hover:bg-brand-teal-dark transition-colors font-bold">Save</button>
            </Labelled>
            <Labelled label="px-4 py-2 — PlayerForm, LiveSessionPage">
              <button type="button" className="px-4 py-2 bg-brand-teal text-white rounded-md hover:bg-brand-teal-dark transition-colors font-bold">Save</button>
            </Labelled>
            <Labelled label="px-6 py-2.5 — RosterPage, SetupPage">
              <button type="button" className="px-6 py-2.5 bg-brand-teal text-white rounded-md hover:bg-brand-teal-dark transition-colors font-bold">Save</button>
            </Labelled>
            <Labelled label="disabled">
              <button type="button" disabled className="px-4 py-2.5 bg-brand-teal text-white rounded-md hover:bg-brand-teal-dark transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed">Save</button>
            </Labelled>
          </Row>
        </Example>

        <Example
          name="Orange / lead — 8 sites, 6 files"
          note="the button that moves you somewhere else. text-sm, py-1.5"
          source={`{/* verbatim from SetupPage.tsx:164, RosterPage.tsx:278, App.tsx:1870 */}
<button
  type="button"
  className="flex items-center gap-2 px-4 py-1.5 bg-brand-orange text-white rounded-md hover:bg-brand-orange-dark transition-colors text-sm font-bold"
>
  Generate Schedule
</button>`}
        >
          <Row>
            <button type="button" className="flex items-center gap-2 px-4 py-1.5 bg-brand-orange text-white rounded-md hover:bg-brand-orange-dark transition-colors text-sm font-bold">
              Generate Schedule
            </button>
            <button type="button" disabled className="flex items-center gap-2 px-4 py-1.5 bg-brand-orange text-white rounded-md hover:bg-brand-orange-dark transition-colors text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">
              Generate Schedule
            </button>
          </Row>
        </Example>

        <Example
          name="Red / destructive — 4 sites, 3 files"
          note="bg-red-600. account.danger is #B42318 — a different red for the same job"
          source={`{/* verbatim from RosterPage.tsx:362, ManageRostersModal.tsx:30 */}
<button
  type="button"
  className="px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-bold"
>
  Delete
</button>`}
        >
          <Row>
            <button type="button" className="px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-bold">Delete</button>
            <button type="button" className={`${account.danger} !w-auto`}>Delete (account.danger)</button>
          </Row>
        </Example>

        <Finding id="F2">
          The two reds above are the same action in two colours. <code>ManageRostersModal</code>'s
          own comment says its private set exists so that &ldquo;a red Delete that is a different
          red from the last red Delete&rdquo; cannot happen.
        </Finding>
        <Finding id="F1">
          The grey button is 22 copies of one string, in two class orders, sometimes with{' '}
          <code>disabled:</code> and sometimes without. <code>#999</code> exists in this codebase
          for nothing else.
        </Finding>
      </Section>

      <Section
        id="states"
        title="Interactive states"
        blurb={
          <>
            Default, hover, focus, active, disabled, loading and error — as the app actually has
            them. Two of the seven do not exist in this codebase, and saying so is more useful than
            inventing them.
          </>
        }
      >
        <StatesDemo />
      </Section>

      <Section
        id="forms"
        title="Form fields and labels"
        blurb="Two label styles and three field styles, two of which are importable."
      >
        <Example
          name="FIELD_LABEL"
          note="the app-wide label: block text-sm font-bold text-gray-700"
          source={`import { FIELD_LABEL } from '../formLook';

<label htmlFor="name" className={\`\${FIELD_LABEL} mb-1\`}>Name</label>`}
        >
          <label className={`${FIELD_LABEL} mb-1`}>Name</label>
        </Example>

        <Example
          name="account.label + account.field"
          note="the account panels' own, in their own ink. Real teal focus ring — press Focus it"
          source={`import { label, field } from './accountStyles';

<label htmlFor="email" className={label}>Email</label>
<input id="email" type="email" className={field} placeholder="you@example.com" />`}
        >
          <div className="max-w-sm">
            <label className={account.label}>Email</label>
            <FocusProbe>
              <input type="email" className={account.field} placeholder="you@example.com" />
            </FocusProbe>
          </div>
        </Example>

        <Example
          name="Field — error state"
          note="the one validation pattern in the app, written out at 2 sites and named at neither"
          source={`{/* verbatim from PlayerForm.tsx:215 and FeedbackPanel.tsx:130 */}
<input
  className={\`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent \${
    nameMissing
      ? 'border-red-500 bg-red-50 ring-2 ring-red-300 focus:ring-red-500'
      : 'border-gray-300 focus:ring-green-500'
  }\`}
/>`}
        >
          <div className="flex max-w-sm flex-col gap-3">
            <input
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent border-gray-300 focus:ring-green-500"
              placeholder="Valid — focus ring is green"
            />
            <input
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent border-red-500 bg-red-50 ring-2 ring-red-300 focus:ring-red-500"
              placeholder="Error"
            />
          </div>
        </Example>

        <Finding id="F7">
          <code>focus:ring-green-500</code> sits on 8 form controls across 6 files. Green is not in
          the palette — it is a survivor of the pre-brand scheme. Meanwhile only 3 of the app's 166
          buttons carry any <code>focus-visible:</code> style at all.
        </Finding>

        <Example
          name="<Toggle checked onChange label />"
          note="role=switch, so a screen reader says on/off rather than ticked"
          source={`import { Toggle } from '../Toggle';

<Toggle checked={keepScore} onChange={setKeepScore} label="Keep score" />`}
        >
          <ToggleDemo />
        </Example>

        <Example
          name="<RatingStepper value onChange />"
          note="painted from stepperLook, sized for a crowded row"
          source={`import { RatingStepper } from '../RatingStepper';

<RatingStepper value={rating} onChange={setRating} />`}
        >
          <RatingDemo />
        </Example>

        <Example
          name="STEPPER_KEY + STEPPER_VALUE"
          note="the shared stepper paint. Sizes stay with the caller"
          source={`import { STEPPER_KEY, STEPPER_VALUE } from '../stepperLook';

<button type="button" className={\`min-w-9 min-h-10 text-lg \${STEPPER_KEY}\`}>&minus;</button>
<span className={\`-mx-1.5 min-w-11 \${STEPPER_VALUE}\`}>4</span>
<button type="button" className={\`min-w-9 min-h-10 text-lg \${STEPPER_KEY}\`}>+</button>`}
        >
          <div className="flex items-stretch">
            <button type="button" className={`min-w-9 min-h-10 text-lg shrink-0 relative z-10 ${STEPPER_KEY}`}>&minus;</button>
            <span className={`-mx-1.5 min-w-11 ${STEPPER_VALUE}`}>4</span>
            <button type="button" className={`min-w-9 min-h-10 text-lg shrink-0 relative z-10 ${STEPPER_KEY}`}>+</button>
          </div>
        </Example>

        <Example
          name="<CodeEntry value onChange label />"
          note="four boxes, one per digit. Filled boxes take the teal edge"
          source={`import { CodeEntry } from '../CodeEntry';

<CodeEntry value={code} onChange={setCode} label="Sign-in code" />`}
        >
          <CodeDemo />
        </Example>

        <Example
          name="<Keypad label onDigit onBackspace backspaceDisabled extraKey />"
          note="wholeRow is optional — the score pad puts 10, 11, 12 there"
          source={`import { Keypad } from './Keypad';

<Keypad
  label="Score"
  onDigit={type}
  onBackspace={rub}
  backspaceDisabled={value === ''}
  extraKey={{ face: 'Clear', onPress: clear }}
/>`}
        >
          <Keypad label="Demo pad" onDigit={noop} onBackspace={noop} backspaceDisabled={false} extraKey={{ face: 'Clear', onPress: noop }} />
        </Example>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ demos */

function ToggleDemo() {
  const [on, setOn] = useState(true);
  return (
    <Row>
      <Labelled label="checked">
        <Toggle checked={on} onChange={setOn} label="Keep score" />
      </Labelled>
      <Labelled label="unchecked (fixed)">
        <Toggle checked={false} onChange={noop} label="Off" />
      </Labelled>
      <Labelled label="checked (fixed)">
        <Toggle checked onChange={noop} label="On" />
      </Labelled>
    </Row>
  );
}

function RatingDemo() {
  const [rating, setRating] = useState(3.5);
  return <RatingStepper value={rating} onChange={setRating} />;
}

function CodeDemo() {
  const [code, setCode] = useState('12');
  return <CodeEntry value={code} onChange={setCode} label="Sign-in code" />;
}

function StatesDemo() {
  return (
    <>
      <div className="grid gap-6 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
        <StateBox label="default" hint="as it sits">
          <button type="button" className={account.primary}>Send Code</button>
        </StateBox>

        <StateBox label="hover" hint="real — hover this one">
          <button type="button" className={account.primary}>Send Code</button>
        </StateBox>

        <StateBox label="active" hint="real — press and hold">
          <button type="button" className={account.primary}>Send Code</button>
        </StateBox>

        <StateBox label="focus" hint="real — press Focus it">
          <FocusProbe>
            <button type="button" className={account.primary}>Send Code</button>
          </FocusProbe>
        </StateBox>

        <StateBox label="disabled" hint="disabled:bg-[#9DC3C7]">
          <button type="button" className={account.primary} disabled>Send Code</button>
        </StateBox>

        <StateBox label="loading" hint="no spinner exists">
          <button type="button" className={account.primary} disabled>Sending…</button>
        </StateBox>
      </div>

      <p className="max-w-2xl text-[0.875rem] leading-relaxed text-slate-600">
        <strong>Hover and active are real here, not simulated.</strong> Forcing a CSS pseudo-class
        from outside the element would mean hand-copying the classes it applies, which is the
        copying this page exists to avoid. So the cells above are live controls: hover one on a
        laptop. On a phone there is no hover state to show.
      </p>

      <Finding id="F13">
        <strong>Loading has no shared answer and there is no spinner anywhere in the app</strong> —
        slow actions swap their label and set <code>disabled</code>, as above. That is defensible
        for a phone at the side of a court, but it is currently an accident rather than a decision.
        Disabled is dimmed four different ways: <code>opacity-40</code>, <code>opacity-50</code>,{' '}
        <code>opacity-60</code>, and two custom background colours.
      </Finding>

      <Finding id="F7">
        <strong>Error, on a button, does not exist.</strong> Failures are reported by the{' '}
        <code>Problem</code> box or an amber note beside the control, both under Surfaces below —
        never on the button itself.
      </Finding>

      <div>
        <SubHeading>Disabled, all four ways</SubHeading>
        <Row>
          <Labelled label="disabled:opacity-40">
            <button type="button" disabled className="px-4 py-2.5 bg-brand-teal text-white rounded-md font-bold disabled:opacity-40">Save</button>
          </Labelled>
          <Labelled label="disabled:opacity-50">
            <button type="button" disabled className="px-4 py-2.5 bg-brand-teal text-white rounded-md font-bold disabled:opacity-50">Save</button>
          </Labelled>
          <Labelled label="disabled:opacity-60">
            <button type="button" disabled className="px-4 py-2.5 bg-brand-teal text-white rounded-md font-bold disabled:opacity-60">Save</button>
          </Labelled>
          <Labelled label="disabled:bg-[#9DC3C7]">
            <button type="button" disabled className={`${account.primary} !w-auto`}>Save</button>
          </Labelled>
        </Row>
      </div>

      <div>
        <SubHeading>Icon-only buttons</SubHeading>
        <Row>
          <Labelled label="PencilIcon · EditPlayerButton">
            <button type="button" className="flex shrink-0 items-center rounded-md border border-gray-400 bg-white px-2 py-1.5 text-gray-700 shadow-sm transition-colors hover:bg-gray-100">
              <PencilIcon className="w-5 h-5" />
            </button>
          </Labelled>
          <Labelled label="the banner dismiss ✕, redefined 5 times">
            <button type="button" className="shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-green-100">
              <TrashIcon className="w-5 h-5" />
            </button>
          </Labelled>
        </Row>
      </div>
    </>
  );
}
