/**
 * Regenerates every screenshot on the Instructions page.
 *
 * Run it after any visible UI change, and the pictures in the manual stop
 * drifting from the app they describe:
 *
 *   npm i --no-save playwright-core sharp
 *   node scripts/instructions-shots.mjs
 *
 * Neither package is a dependency of the app - the --no-save install keeps the
 * runtime list at six. The script starts its own dev server on a spare port,
 * boots a browser already on this machine, seeds a fictional demo group into
 * localStorage before the app wakes, and walks the real UI to each state. The
 * shots land in public/instructions/ as WebP, 780px wide (390 CSS px at 2x),
 * which is the width the panel displays them at on a phone.
 *
 * The demo people are invented. No real player, group, or account appears.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'instructions');
const PORT = 5199;
const BASE = `http://localhost:${PORT}/`;

const { chromium } = await import('playwright-core');
const sharp = (await import('sharp')).default;

// ------------------------------------------------------------ the demo group

const G1 = 'demo-riverside';
const G2 = 'demo-tuesday';

const ROSTERS = [
  { id: G1, name: 'Riverside Picklers' },
  { id: G2, name: 'Tuesday Night' },
];

// Invented names, mixed genders, ratings between 3.0 and 4.5 - a plausible
// Tuesday. The last two belong to both groups so My Groups has something to
// show.
const PEOPLE = [
  ['Dana Whitfield', 3.75, 'F'],
  ['Marcus Lee', 4.0, 'M'],
  ['Priya Nair', 3.5, 'F'],
  ['Tom Okafor', 4.25, 'M'],
  ['Rosa Delgado', 3.25, 'F'],
  ['Sam Pruitt', 3.5, 'M'],
  ['Grace Chen', 4.0, 'F'],
  ['Walt Harmon', 3.0, 'M'],
  ['Ivy Kowalski', 3.75, 'F'],
  ['Ray Bishop', 4.5, 'M'],
  ['Nadia Osei', 4.25, 'F'],
  ['Cliff Munro', 3.25, 'M'],
  ['June Park', 3.5, 'F'],
  ['Errol Waters', 3.75, 'M'],
];

const PLAYERS = PEOPLE.map(([name, rating, gender], i) => ({
  id: `demo-${i}`,
  name,
  rating,
  gender,
  rosterIds: i < 12 ? [G1] : [G1, G2],
}));

// 12 attending on 3 courts: full courts, and two people visibly sitting out.
const ATTENDING = PLAYERS.slice(0, 12).map((p) => p.id);

/** Ten characters of the Crockford-ish share alphabet in shareKey.ts. */
const DEMO_SHARE_KEY = 'PBRR2DEM05';

/**
 * A session that exists only inside this headless browser.
 *
 * The QR renders for a signed-in host, so the share shot needs one. Rather than
 * sign anything in for real, the stored session supabase-js reads at boot is
 * written by hand - the client never verifies the token, only the expiry - and
 * every request the app would send with it is answered by the route() stubs in
 * shootShareQr. Nothing reaches the real project.
 */
function fakeSupabaseSession() {
  const env = readFileSync(join(ROOT, '.env.local'), 'utf8');
  const url = env.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1].trim();
  if (!url) throw new Error('VITE_SUPABASE_URL not found in .env.local');
  const ref = new URL(url).hostname.split('.')[0];
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 4 * 3600;
  const user = {
    id: '00000000-0000-4000-8000-000000000000',
    email: 'host@example.com',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  return {
    key: `sb-${ref}-auth-token`,
    session: {
      access_token: `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: user.id, exp, role: 'authenticated' })}.demo`,
      refresh_token: 'demo',
      token_type: 'bearer',
      expires_in: 4 * 3600,
      expires_at: exp,
      user,
    },
  };
}

function seed(extra = {}) {
  return {
    'pb-rosters': ROSTERS,
    'pb-active-roster': G1,
    'pb-roster': PLAYERS,
    'pb-num-courts': 3,
    'pb-num-rounds': 6,
    'pb-default-rating': 3.5,
    'pb-selected-ids': ATTENDING,
    'pb-partnerships': [],
    'pb-step': 'roster',
    'pb-setup-seen': true,
    'pb-scoring-enabled': false,
    // The banners are true in real life and noise in a manual.
    'pb-install-dismissed': true,
    'pb-signin-dismissed': true,
    'pb-swap-hint-dismissed': true,
    ...extra,
  };
}

// --------------------------------------------------------------- the harness

function findChrome() {
  if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
      for (const app of ['chrome-mac/Chromium.app/Contents/MacOS/Chromium',
                         'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
                         'chrome-mac/headless_shell']) {
        const path = join(cache, dir, app);
        if (existsSync(path)) return path;
      }
    }
  }
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (existsSync(chrome)) return chrome;
  throw new Error('No Chromium found. Set CHROME=/path/to/chrome.');
}

async function waitForServer(url, ms = 30000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Dev server never answered at ${url}`);
}

let browser;
let server;

async function openPage(seedData) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  // Written before any app script runs, and only on the first load, so a shot
  // that patches storage and reloads keeps its patch.
  await page.addInitScript((data) => {
    if (window.localStorage.getItem('pb-demo-seeded')) return;
    for (const [key, value] of Object.entries(data)) {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
    window.localStorage.setItem('pb-demo-seeded', '1');
  }, seedData);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return page;
}

async function save(name, buffer) {
  const file = join(OUT, `${name}.webp`);
  await sharp(buffer).resize({ width: 780, withoutEnlargement: true }).webp({ quality: 76 }).toFile(file);
  const kb = Math.round(statSync(file).size / 1024);
  console.log(`  ${name}.webp  ${kb} KB`);
  return kb;
}

/** Viewport shot clipped to the top `height` CSS pixels. */
async function topShot(page, name, height) {
  const buffer = await page.screenshot({ clip: { x: 0, y: 0, width: 390, height } });
  return save(name, buffer);
}

async function fullShot(page, name) {
  return save(name, await page.screenshot());
}

const settle = (page, ms = 350) => page.waitForTimeout(ms);

// ------------------------------------------------------------------ the shots

async function shootPlayers() {
  const page = await openPage(seed());
  await page.getByText('My Groups').first().waitFor();
  // The rows are the subject, and they live below the Add Player card.
  await page.getByText('Dana Whitfield').first().scrollIntoViewIfNeeded();
  await settle(page);
  await topShot(page, 'players', 700);
  await page.context().close();
}

async function shootPlayerEdit() {
  const page = await openPage(seed());
  await page.locator('[aria-label="Edit Dana Whitfield"]').click();
  await settle(page);
  await fullShot(page, 'player-edit');
  await page.context().close();
}

async function shootSetup() {
  const page = await openPage(seed({ 'pb-step': 'setup' }));
  await page.getByText('Spots Filled').first().waitFor();
  await settle(page);
  await topShot(page, 'setup', 760);
  await page.context().close();
}

async function shootSpecialTypes() {
  const page = await openPage(seed({ 'pb-step': 'setup' }));
  await page.getByText('Special Game Types').first().click();
  await settle(page);
  await fullShot(page, 'special-types');
  await page.context().close();
}

async function shootPartners() {
  const page = await openPage(
    seed({
      'pb-step': 'setup',
      'pb-partnerships': [{ player1Id: 'demo-0', player2Id: 'demo-1' }],
    })
  );
  await page.getByText('Set Partners').first().click();
  await settle(page);
  await fullShot(page, 'partners');
  await page.context().close();
}

async function generate(page) {
  await page.getByText('Generate Schedule').first().click();
  await page.getByText(/Round 1/i).first().waitFor();
  await settle(page, 500);
}

async function shootQuickSchedule() {
  const page = await openPage(seed({ 'pb-step': 'setup' }));
  await generate(page);
  await topShot(page, 'quick-schedule', 760);
  await page.context().close();
}

async function shootRoundCard() {
  const page = await openPage(seed({ 'pb-step': 'setup', 'pb-scoring-enabled': true }));
  await generate(page);
  const box = await page.getByText(/Round 1/i).first().boundingBox();
  const y = Math.max(0, box.y - 12);
  const height = Math.min(700, 844 - y);
  await save('round-card', await page.screenshot({ clip: { x: 0, y, width: 390, height } }));
  await page.context().close();
}

async function shootKeypad() {
  const page = await openPage(seed({ 'pb-step': 'setup', 'pb-scoring-enabled': true }));
  await generate(page);
  await page.locator('[aria-label*="score" i]').first().click();
  await settle(page);
  await fullShot(page, 'keypad');
  await page.context().close();
}

async function shootStandings() {
  const page = await openPage(seed({ 'pb-step': 'setup', 'pb-scoring-enabled': true }));
  await generate(page);
  // Scores are data. Writing them into the stored schedule and reloading is
  // the same schedule the generate click made, now with two rounds played.
  await page.evaluate(() => {
    const schedule = JSON.parse(window.localStorage.getItem('pb-schedule'));
    const scores = [
      [{ team1: 11, team2: 7 }, { team1: 9, team2: 11 }, { team1: 11, team2: 4 }],
      [{ team1: 11, team2: 8 }, { team1: 6, team2: 11 }, { team1: 12, team2: 10 }],
    ];
    schedule.rounds.slice(0, 2).forEach((round, r) => {
      round.courts.forEach((court, c) => {
        court.score = scores[r][c % scores[r].length];
      });
    });
    window.localStorage.setItem('pb-schedule', JSON.stringify(schedule));
    window.localStorage.setItem('pb-completed-rounds', JSON.stringify([1, 2]));
  });
  await page.reload({ waitUntil: 'networkidle' });
  const standings = page.getByText(/Standings/i).first();
  await standings.waitFor();
  await standings.scrollIntoViewIfNeeded();
  await settle(page);
  const box = await standings.boundingBox();
  const y = Math.max(0, box.y - 12);
  await save('standings', await page.screenshot({ clip: { x: 0, y, width: 390, height: Math.min(680, 844 - y) } }));
  await page.context().close();
}

/** The header's group-name button also has aria-haspopup, so name is the key. */
const actionsButton = (page) => page.getByRole('button', { name: 'Actions', exact: true });

async function shootActions() {
  const page = await openPage(seed({ 'pb-step': 'setup' }));
  await generate(page);
  await actionsButton(page).click();
  await settle(page);
  await fullShot(page, 'actions');
  await page.context().close();
}

async function shootShareQr() {
  const auth = fakeSupabaseSession();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  // Every word this signed-in browser would say to Supabase is answered here.
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      status: route.request().method() === 'GET' ? 200 : 201,
      contentType: 'application/json',
      body: '[]',
    })
  );
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  );
  await page.addInitScript(
    ({ data, authKey, session }) => {
      if (window.localStorage.getItem('pb-demo-seeded')) return;
      for (const [key, value] of Object.entries(data)) {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
      window.localStorage.setItem(authKey, JSON.stringify(session));
      window.localStorage.setItem('pb-demo-seeded', '1');
    },
    { data: seed({ 'pb-step': 'setup' }), authKey: auth.key, session: auth.session }
  );
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await generate(page);
  // A stored key plus a schedule is a share being picked back up: startLive()
  // republishes it at boot, the stub answers 201, and the view lands on live.
  await page.evaluate((key) => {
    window.localStorage.setItem('pb-share-key', JSON.stringify(key));
  }, DEMO_SHARE_KEY);
  await page.reload({ waitUntil: 'networkidle' });
  await actionsButton(page).click();
  // The card reads "Share Session" and the panel it opens reads "Share Live
  // Session". This waited on the panel's words to find the card, so it broke
  // silently the day the card was shortened to fit three across a phone, and
  // this shot has been the one stale picture in the manual since.
  await page.getByRole('button', { name: 'Share Session' }).first().click();
  // The QR carries its name as an aria-label, so getByText never sees it.
  await page.getByLabel(/Scan to watch/i).first().waitFor();
  await settle(page, 600);
  await fullShot(page, 'share-qr');
  await context.close();
}

async function shootAccountSignIn() {
  const page = await openPage(seed());
  await page.locator('[aria-label="Open settings"]').click();
  await page.getByText('My Account').first().click();
  await settle(page, 600);
  await fullShot(page, 'account-signin');
  await page.context().close();
}

// ------------------------------------------------------------------- run it

const SHOTS = [
  shootPlayers,
  shootPlayerEdit,
  shootSetup,
  shootSpecialTypes,
  shootPartners,
  shootQuickSchedule,
  shootRoundCard,
  shootKeypad,
  shootStandings,
  shootActions,
  shootShareQr,
  shootAccountSignIn,
];

try {
  mkdirSync(OUT, { recursive: true });

  console.log('Starting dev server...');
  server = spawn('node_modules/.bin/vite', ['--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  await waitForServer(BASE);

  browser = await chromium.launch({ executablePath: findChrome(), headless: true });

  console.log('Capturing:');
  const failures = [];
  for (const shot of SHOTS) {
    try {
      await shot();
    } catch (error) {
      failures.push(`${shot.name}: ${error.message}`);
      console.error(`  FAILED ${shot.name}: ${error.message}`);
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} of ${SHOTS.length} shots failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${SHOTS.length} shots written to public/instructions/`);
  }
} finally {
  await browser?.close();
  server?.kill();
}
