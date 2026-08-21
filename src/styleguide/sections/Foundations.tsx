import { Example, Finding, HexSwatch, Labelled, Row, Section, SubHeading, Swatch, TypeSpecimen } from '../kit';

/**
 * Colour, type, spacing, radius and shadow.
 *
 * Every value on this page is read off the live document rather than written
 * here: the swatches resolve `var(--color-…)` from index.css, and the type
 * specimens measure themselves after render. Change index.css and this section
 * changes with it, including under the large-text toggle.
 */
export function Foundations() {
  return (
    <>
      <Section
        id="colour"
        title="Colour"
        blurb={
          <>
            Twelve declared tokens, all of them in <code>@theme static</code> in{' '}
            <code>src/index.css</code>. <code>static</code> means every one is on the document
            whether or not a utility uses it, so <code>var(--color-…)</code> is safe from an inline
            style. Two primaries: orange leads, teal confirms. The darks are hovers and nothing else.
          </>
        }
      >
        <div>
          <SubHeading>Brand — orange leads</SubHeading>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Swatch varName="--color-brand-orange" role="The tab you are on, and the buttons that move you somewhere else" ink="light" />
            <Swatch varName="--color-brand-orange-dark" role="Hover only. Not a third brand colour" ink="light" />
            <Swatch varName="--color-brand-orange-light" role="Background for black text, bordered in its own primary" />
          </div>
        </div>

        <div>
          <SubHeading>Brand — teal confirms</SubHeading>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Swatch varName="--color-brand-teal" role="The button that does the thing, and the switch that is on" ink="light" />
            <Swatch varName="--color-brand-teal-dark" role="Hover only" ink="light" />
            <Swatch varName="--color-brand-teal-light" role="Pale fills: tiles, selected rows, rating badges, stepper value" />
          </div>
        </div>

        <div>
          <SubHeading>The round timer, and nowhere else</SubHeading>
          <p className="mt-1 text-[0.875rem] leading-snug text-gray-600">
            Go and stop, on the two solid <code>TileButton</code> tones. Read before the label is,
            by somebody who has looked up from a court — which is the only reason a green is in
            here at all. See <code>F7</code>: a green focus ring is still a bug.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Swatch varName="--color-start-green" role="Start Timer, and the Play it turns back into on a pause" ink="light" />
            <Swatch varName="--color-start-green-dark" role="Hover and edge only" ink="light" />
            <Swatch varName="--color-stop-red" role="Stop, the one key a ringing timer is answered with" ink="light" />
            <Swatch varName="--color-stop-red-dark" role="Hover and edge only. Same value account.danger has always used" ink="light" />
          </div>
        </div>

        <div>
          <SubHeading>Structural</SubHeading>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Swatch varName="--color-panel-edge" role="The line around a panel, and around the rows inside the Actions sheet" />
            <Swatch varName="--color-notice-yellow" role="The fill behind a notice that only tells you something" />
          </div>
        </div>

        <Example
          name="Reaching a token from an inline style"
          note="the palette is static, so this always resolves"
          source={`<span style={{ color: 'var(--color-brand-teal)' }}>Confirmed</span>`}
        >
          <span className="font-bold" style={{ color: 'var(--color-brand-teal)' }}>
            Confirmed
          </span>
        </Example>

        <div>
          <SubHeading>Untokenised — written as literals</SubHeading>
          <p className="mt-1.5 max-w-2xl text-[0.875rem] leading-relaxed text-slate-600">
            These have no token behind them. Each is written out by hand at every site, so a change
            means finding all of them. The count is how many times the literal appears in{' '}
            <code>src/</code>.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <HexSwatch hex="#222222" count="20 sites, 17 files" role="PanelHeading title ink" ink="light" />
            <HexSwatch hex="#999999" count="26 sites, 20 files" role="The grey cancel button's border. Nothing else" />
            <HexSwatch hex="#051829" count="6 files" role="Navy: header, tour, actions sheet, setup" ink="light" />
            <HexSwatch hex="#FBFAF6" count="5 sites, 3 files" role="Cream: banner, top pin, theme-color" />
            <HexSwatch hex="#636A77" count="3 files" role="QUIET_TEXT, declared privately three times" ink="light" />
            <HexSwatch hex="#1F293D" count="9 sites, 6 files" role="Account and dialog ink" ink="light" />
            <HexSwatch hex="#3D495A" count="9 sites, 4 files" role="Quiet-tile and share-panel ink" ink="light" />
            <HexSwatch hex="#FEFEFE" count="9 sites, 4 files" role="Account, Share and Donate card fill" />
            <HexSwatch hex="#F8F9FB" count="7 sites, 6 files" role="Cool near-white fill" />
            <HexSwatch hex="#A6D1D5" count="4 sites, 4 files" role="Pale-teal edge on a tinted tile" />
            <HexSwatch hex="#CCCFD9" count="4 sites, 1 file" role="Stepper edge (STEPPER_EDGE, unused)" />
            <HexSwatch hex="#7FBEC4" count="1 site" role="panelCard border — the edge on every dialog" />
          </div>
        </div>

        <Finding id="F11">
          102 distinct hex literals live in <code>src/</code>. The four with the strongest claim to
          a token are the first four above.
        </Finding>
        <Finding id="F8">
          <code>#999</code> (#999999) and <code>--color-panel-edge</code> (#a2a7ab) are a hair
          apart and are two different names doing one job, alongside{' '}
          <code>border-gray-300</code> on form fields and <code>border-gray-200</code> on
          instruction rows.
        </Finding>
      </Section>

      <Section
        id="type"
        title="Typography"
        blurb={
          <>
            No webfont — the app inherits Tailwind's <code>ui-sans-serif, system-ui</code> stack.
            Two steps are overridden in <code>:root</code>, each raised 2px so body copy is legible
            at arm's length beside a court. Every measurement below is read back off the rendered
            line, so the large-text toggle above reports real numbers.
          </>
        }
      >
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
          <TypeSpecimen className="text-xs" note="overridden from 0.75rem" />
          <TypeSpecimen className="text-sm" note="overridden from 0.875rem · body copy, 131 uses" />
          <TypeSpecimen className="text-base" />
          <TypeSpecimen className="text-lg" />
          <TypeSpecimen className="text-xl" />
          <TypeSpecimen className="text-2xl" note="not scaled by large text" />
          <TypeSpecimen className="text-3xl" note="not scaled by large text" />
          <TypeSpecimen className="text-4xl" note="not scaled by large text" />
          <TypeSpecimen className="text-5xl" note="not scaled by large text" />
        </div>

        <div>
          <SubHeading>Named absolute sizes</SubHeading>
          <p className="mt-1.5 max-w-2xl text-[0.875rem] leading-relaxed text-slate-600">
            Outside the scale on purpose: these must not move when large-text mode is on, because
            they are already large and are read at arm's length.
          </p>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-2">
            <TypeSpecimen className="text-[1.35rem]" weight="font-extrabold" sample="ROUND 3 · COURT 1 · DONE" note="ROUND_HEADING_TEXT" />
            <TypeSpecimen className="text-[1.18125rem]" weight="font-bold" sample="Ada Lovelace" note="PLAYER_NAME_TEXT" />
            <TypeSpecimen className="text-[1.0125rem]" weight="font-bold" sample="3. Schedule" note="StepIndicator label" />
            <TypeSpecimen className="text-[1.0625rem]" sample="Reshuffle the remaining rounds" note="RESHUFFLE_LINE" />
          </div>
        </div>

        <div>
          <SubHeading>Weights</SubHeading>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-2">
            <TypeSpecimen className="text-base" weight="font-normal" note="2 uses" />
            <TypeSpecimen className="text-base" weight="font-medium" note="49 uses" />
            <TypeSpecimen className="text-base" weight="font-semibold" note="16 uses" />
            <TypeSpecimen className="text-base" weight="font-bold" note="160 uses" />
            <TypeSpecimen className="text-base" weight="font-extrabold" note="33 uses" />
          </div>
        </div>

        <div>
          <SubHeading>Line height</SubHeading>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(['leading-none', 'leading-tight', 'leading-snug', 'leading-relaxed'] as const).map((c) => (
              <div key={c} className="rounded-lg border border-slate-200 bg-white p-3">
                <code className="text-[0.75rem] font-bold text-slate-900">{c}</code>
                <p className={`mt-1.5 text-sm text-slate-900 ${c}`}>
                  Whoever is on court four plays the winners of court one, and the rest sit this
                  round out.
                </p>
              </div>
            ))}
          </div>
        </div>

        <Finding id="F11">
          16 further one-off arbitrary sizes are scattered across single files. Two of them —{' '}
          <code>text-[1rem]</code> and <code>text-[1.25rem]</code> — restate a scale step exactly,
          so they scale differently under large text for no stated reason.
        </Finding>
      </Section>

      <Section
        id="spacing"
        title="Spacing, radius and shadow"
        blurb={
          <>
            <code>--spacing</code> is <code>0.25rem</code>, so <code>p-3</code> is{' '}
            <code>0.75rem</code>. 65 distinct padding values are in use; these are the ones carrying
            real weight.
          </>
        }
      >
        <div>
          <SubHeading>Spacing in use</SubHeading>
          <Row>
            {([
              ['px-4', '1rem', '79 uses · button and row horizontal'],
              ['px-3', '0.75rem', '47 uses · form field, chip'],
              ['py-2', '0.5rem', '45 uses · form field vertical'],
              ['py-2.5', '0.625rem', '43 uses · button vertical'],
              ['py-3', '0.75rem', '37 uses · row, larger button'],
              ['p-6', '1.5rem', '22 uses · panel padding'],
              ['gap-3', '0.75rem', '53 uses · row and tile gap'],
              ['gap-2', '0.5rem', '45 uses · icon to label'],
            ] as const).map(([cls, val, note]) => (
              <div key={cls} className="mt-3 flex min-w-[9rem] flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <div className="bg-brand-teal-light" style={{ padding: val }}>
                    <div className="h-6 w-6 rounded-sm bg-brand-teal" />
                  </div>
                </div>
                <code className="text-[0.75rem] font-bold text-slate-900">{cls}</code>
                <code className="text-[0.75rem] leading-tight text-slate-500">{val} · {note}</code>
              </div>
            ))}
          </Row>
        </div>

        <div>
          <SubHeading>Border radius</SubHeading>
          <Row>
            {([
              ['rounded', '4px', '31 uses · icon-only buttons'],
              ['rounded-md', '6px', '96 uses · buttons, fields, chips'],
              ['rounded-lg', '8px', '51 uses · cards, tiles, rows, banners'],
              ['rounded-xl', '12px', '14 uses · tab buttons, notes'],
              ['rounded-2xl', '16px', '5 uses · panelCard, sheet, FAB'],
              ['rounded-full', '9999px', '20 uses · pills, active-tab bar'],
            ] as const).map(([cls, val, note]) => (
              <Labelled key={cls} label={`${cls} · ${val}`}>
                <div className={`h-16 w-16 border-2 border-brand-teal bg-brand-teal-light ${cls}`} title={note} />
              </Labelled>
            ))}
          </Row>
        </div>

        <div>
          <SubHeading>Shadow</SubHeading>
          <Row>
            {([
              ['shadow', '20 uses'],
              ['shadow-sm', '11 uses · tiles, active tab'],
              ['shadow-md', '4 uses'],
              ['shadow-lg', '5 uses'],
              ['shadow-xl', '3 uses · panelCard'],
              ['shadow-2xl', '1 use · settings drawer'],
            ] as const).map(([cls, note]) => (
              <Labelled key={cls} label={`${cls} · ${note}`}>
                <div className={`h-16 w-24 rounded-lg bg-white ${cls}`} />
              </Labelled>
            ))}
          </Row>
        </div>

        <Finding id="F1">
          Four arbitrary shadows are also in use, each in one file:{' '}
          <code>shadow-[0_-10px_40px_rgba(0,0,0,0.3)]</code> and three siblings on the sheets and
          the Actions button.
        </Finding>
      </Section>
    </>
  );
}
