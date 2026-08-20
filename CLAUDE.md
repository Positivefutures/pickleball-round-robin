# CLAUDE.md

## UI naming — read this before touching anything visual

Two files are the source of truth for what the app's UI is called:

- **`/style-guide`** — a living page showing every component, variant and token.
  Dev only: `npm run dev`, then open `/style-guide`. It **imports the real
  components**, so it is never out of date.

  It is also kept up permanently on the network at
  **http://mac-mini-2.local:5180/style-guide**, by a launch agent that runs
  `npm run style-guide` and is checked in at
  [scripts/com.jeffbaker.pbrr-style-guide.plist](scripts/com.jeffbaker.pbrr-style-guide.plist)
  — install, removal and restart commands are in the comment at the top of it.
  Because it is the dev server rather than a build, that address is current the
  moment a component changes. `10.0.0.230` is the same thing without Bonjour, for
  a client whose resolver will not do `.local`.
- **`docs/ui-audit.md`** — the written inventory: usage counts, file paths, the
  full palette and type scale, and 13 numbered findings (F1–F13).

When Jeff names a thing — "the secondary button, small", "a teal tile", "the
amber note" — look it up there rather than guessing or inventing a new one.

### The vocabulary as it stands today

Be careful: **most of these are class strings, not components.** There is only
one shared button component, and it is not the ordinary button.

| Say this | It means | Where it lives |
|---|---|---|
| a **tile** (teal / quiet / red) | `<TileButton tone="teal" …>` | `components/TileButton.tsx` |
| the **primary** button | `account.primary` — teal, full width, `text-lg` | `layout/accountStyles.ts` |
| the **secondary** button | `account.secondary` — grey, bordered | same file |
| the **danger** button | `account.danger` — `#B42318` | same file |
| the **grey cancel** button | the inline `bg-gray-200 border-[#999]` string | 22 sites, **not exported** |
| a **row** | `account.row` + `rowTitle` / `rowNote` / `rowIcon` | `layout/accountStyles.ts` |
| the **panel edge** | `panelCard` — every dialog's chrome | `components/panelStyles.ts` |
| a **panel heading** | `<PanelHeading icon title />` | `components/PanelGlyph.tsx` |
| a **badge** | `<PanelBadge icon />` — the ring astride a page card’s top-left corner | `components/PanelGlyph.tsx`, on Players ×4 and Setup ×1 |
| a **name plate** | the bordered box astride the players list's top edge | `roster/RosterPage.tsx`, one site |
| the **corner dots** | `<CornerDots />`, `<CornerDots smaller />` | `components/CornerDots.tsx` |
| the **page card** | `bg-white rounded-lg shadow border border-panel-edge px-3 pt-[1.125rem] pb-6` | 9 sites, **not extracted**. A badged card is the same shape at `pt-7` — `badgedCard` in `roster/RosterPage.tsx` |
| a **banner** | `InstallBanner` / `SignInBanner` / `UpdateBanner` / `PrintNotice` / `SwapHint` | `layout/`, `schedule/` |
| a **notice** | `account.note` + a tone, or `Problem` for the red one | `layout/accountStyles.ts`, `AccountShell.tsx` |
| a **round-type pill** | `pillMeta(type)` → `badgeClass` + `badgeEdgeClass` | `lib/roundTypes.ts` |

**Sizes are not named yet.** There is no `size="sm"`. The teal button alone
appears at five different paddings (`py-2`, `py-2.5`, `py-3`, `py-3.5`,
`px-6 py-2.5`). If Jeff asks for a size, ask which one he means, or propose
naming them — that is finding **F2**.

### Rules

- **Never add a sixth copy of a button.** If a shape already exists in the table
  above, import the string. If it is one of the un-exported ones, that is the
  moment to extract it, not to paste it again.
- **New colour? Add a token** to `@theme static` in `src/index.css` rather than
  writing a hex. There are already 102 hex literals; see **F11**.
- **`focus:ring-green-500` is a bug, not a style.** Green is not in the palette.
  See **F7** — the app's focus handling is its weakest accessibility point.
- **Adding a component? Add it to `/style-guide`** by importing it. Never copy
  its markup onto that page — a copy stops tracking the original, which defeats
  the entire point of the page.

The style guide is excluded from the production build: it lives at
`style-guide.html` in the repo root, and `vite build` only takes `index.html`.
Do not move it into `public/` — that folder ships, and `precache.test.ts` fails
on any file in it that is not named in a service-worker list.

## `admin/` is a different app, with different rules

The admin dashboard in [admin/](admin/) is a second Vercel project built from
this repo with Root Directory set to `admin`. It has its own `package.json`,
its own build, its own tests and its own palette. **Nothing in the table above
applies to it**, and it must never import from `src/`.

Two things to know before touching it:

- **Its charts deliberately do not use the brand.** Teal against orange is a
  pairing chosen for a button, not one checked for deuteranopia. The series
  colours are the validated data-viz palette and there is a note in
  `admin/src/index.css` recording the validator command and its result. Add a
  colour there and re-run it.
- **Never ship SQL you have not run.** `admin/scripts/scratch-db.sh` builds a
  throwaway Postgres, applies this repo's nine migrations and then the admin
  ones, and `ADMIN_TEST_PG=... npm test` runs the real daily job against it.
  Four bugs in the first draft were invisible to review and all four died here.

The reasoning for the whole thing, including what the free plans genuinely
cannot tell us, is in [PLANS/admin-dashboard.md](PLANS/admin-dashboard.md).
