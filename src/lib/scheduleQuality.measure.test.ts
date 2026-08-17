/**
 * Measurement harness, not a test suite. Skipped unless MEASURE=1, because it
 * generates hundreds of schedules and prints distributions instead of asserting
 * them. It exists so every calibrated bound in the real suites can be measured
 * before it is asserted, and re-measured after the algorithm changes.
 *
 * Run:  MEASURE=1 MEASURE_OUT=/tmp/measure.txt \
 *         npx vitest run src/lib/scheduleQuality.measure.test.ts
 *
 * BASELINE (2026-08-14, before the fairness overhaul), 25 schedules per config:
 *   repeat partnerships while a fresh partner was available, normal rounds:
 *     12p/3c/12r: 580 of 1800 teams   13p/3c/13r: 548 of 1950   14p/3c/14r: 487 of 2100
 *     back-to-back repeats: 58 / 64 / 46 per config (100% with fresh available)
 *   round-1 sitter (13p/3c, 3000 runs): 1.94x expected at roster index 0,
 *     chi-square 335 (df 12; uniform is under ~33 at p=.001)
 *   sit-out cycle 2 matched cycle 1: 9.2% (13p/3c), 3.6% (14p/3c) — chance level
 *   rating gaps, normal rounds: over-0.5 rate 0% to 2% per config, max 0.75
 *     (16p/4c hit 1.0 once); two-couples config: 13.5% over 0.5, max 1.0
 *   3:1 gender courts: 426 over 300 rounds where 0 were forced (12p/3c/12r);
 *     464 vs 150 forced (13p); 532 vs 162 (14p) — nothing steers shape today
 *   sit-out spread max 1, short-game spread 0 (no short-court config measured),
 *   special miss spread max 2 (mixed q2), worst pair partnered 3x (5x gendered q2)
 *
 * AFTER (2026-08-14, fairness overhaul landed), same sweep:
 *   back-to-back repeat partnerships: 0 in every normal config (3 at 11p with
 *     the 2v1, from 37); no pair partnered more than 2x in normal play
 *   repeats sit at the structural floor: level ratings 155 vs 150 forced by
 *     the maths, 16p/4c 0 or 1, never-partnered pairs avg 2.2 of 66 at
 *     12p/3c/12r (was 17.2)
 *   round-1 sitter: chi-square 7.5 (was 335), max 1.11x expected (was 1.94x)
 *   sit-out cycle 2 matched cycle 1: 100% at 13p/3c and 14p/3c (was 9%, 4%)
 *   rating gaps, normal rounds: 7-13% of courts past the 0.5 target (variety
 *     now outranks the cap by decision), p95 0.75-1.0, worst court 2.0
 *   3:1 gender courts: 268 of 300 rounds at 12p (was 426); meeting everyone
 *     outranks court shape, so roughly one court a round still lands 3:1
 *   sit-out spread max 1, short-game spread max 1, special miss spread max 2
 */
import { appendFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { generateSchedule } from './pairing';
import { courtMatchesType, roundTypeOf } from './roundTypes';
import type {
  Player, Round, RoundPlan, RoundType, Schedule, Partnership,
} from '../types';

const PER_CONFIG = 25;

function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    rating: 3.0 + (i % 5) * 0.25,
    gender: i % 2 === 0 ? 'M' : 'F',
  }));
}

function makeLevelPlayers(n: number): Player[] {
  return makePlayers(n).map((p) => ({ ...p, rating: 3.5 }));
}

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Rounds n, 2n, 3n and so on played as `type`, the rest ordinary.
 *
 * The configs below used to be written as frequencies and turned into a plan by
 * the app. The app takes the plan itself now, so the harness spells it out —
 * and these spell out exactly what the old frequencies produced, because the
 * numbers in `MEASURE.md` are only comparable if the schedules are.
 */
function everyNth(type: RoundType, n: number, rounds: number): RoundPlan {
  return Array.from({ length: rounds }, (_, i) => ((i + 1) % n === 0 ? type : null));
}

interface RepeatStats {
  teams: number;
  repeats: number;
  repeatWhileFresh: number;
  consecutive: number;
  consecutiveWhileFresh: number;
  maxPairCount: number;
  neverPartneredPairs: number;
  possiblePairs: number;
}

/** Walks the rounds in order, keeping partner counts as they stood BEFORE each
 *  round, so "a fresh partner was available" is judged on what the solver knew.
 *  Fixed couples partner every round by design, so their pairs are excluded. */
function repeatStats(s: Schedule, allIds: string[], partnerships: Partnership[] = []): RepeatStats {
  const coupleKeys = new Set(partnerships.map((c) => key(c.player1Id, c.player2Id)));
  const pc = new Map<string, number>();
  const lastRound = new Map<string, number>();
  const st: RepeatStats = {
    teams: 0, repeats: 0, repeatWhileFresh: 0, consecutive: 0,
    consecutiveWhileFresh: 0, maxPairCount: 0,
    neverPartneredPairs: 0, possiblePairs: (allIds.length * (allIds.length - 1)) / 2,
  };
  for (const r of s.rounds) {
    const onCourt = r.courts.flatMap((c) => [...c.team1, ...c.team2]);
    const teamsThis: [Player, Player][] = [];
    for (const c of r.courts) {
      for (const t of [c.team1, c.team2]) if (t.length === 2) teamsThis.push([t[0], t[1]]);
    }
    for (const [a, b] of teamsThis) {
      if (coupleKeys.has(key(a.id, b.id))) continue;
      st.teams++;
      const prior = pc.get(key(a.id, b.id)) ?? 0;
      if (prior > 0) {
        st.repeats++;
        const isConsecutive = lastRound.get(key(a.id, b.id)) === r.roundNumber - 1;
        if (isConsecutive) st.consecutive++;
        if (!roundTypeOf(r)) {
          const fresh = (x: Player) => onCourt.some(
            (p) => p.id !== a.id && p.id !== b.id && (pc.get(key(x.id, p.id)) ?? 0) === 0
          );
          if (fresh(a) && fresh(b)) {
            st.repeatWhileFresh++;
            if (isConsecutive) st.consecutiveWhileFresh++;
          }
        }
      }
    }
    for (const [a, b] of teamsThis) {
      const k = key(a.id, b.id);
      pc.set(k, (pc.get(k) ?? 0) + 1);
      lastRound.set(k, r.roundNumber);
    }
  }
  st.maxPairCount = pc.size ? Math.max(...pc.values()) : 0;
  for (let i = 0; i < allIds.length; i++) {
    for (let j = i + 1; j < allIds.length; j++) {
      const k = key(allIds[i], allIds[j]);
      if (coupleKeys.has(k)) continue;
      if ((pc.get(k) ?? 0) === 0) st.neverPartneredPairs++;
    }
  }
  return st;
}

function sitOutSpread(s: Schedule, ids: string[]): number {
  const counts = new Map(ids.map((id) => [id, 0]));
  for (const r of s.rounds) {
    for (const p of r.sitOuts) counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
  }
  const vals = [...counts.values()];
  return Math.max(...vals) - Math.min(...vals);
}

function shortGameSpread(s: Schedule, ids: string[]): number {
  const counts = new Map(ids.map((id) => [id, 0]));
  let any = false;
  for (const r of s.rounds) {
    for (const c of r.courts) {
      const on = [...c.team1, ...c.team2];
      if (on.length < 4) {
        any = true;
        for (const p of on) counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
      }
    }
  }
  if (!any) return 0;
  const vals = [...counts.values()];
  return Math.max(...vals) - Math.min(...vals);
}

interface GapStats { n: number; over05: number; p95: number; max: number }

function gapStats(schedules: Schedule[], pick: (r: Round) => boolean): GapStats {
  const diffs: number[] = [];
  for (const s of schedules) {
    for (const r of s.rounds) {
      if (!pick(r)) continue;
      for (const c of r.courts) {
        if (c.team1.length + c.team2.length === 4) diffs.push(c.ratingDiff);
      }
    }
  }
  diffs.sort((a, b) => a - b);
  if (diffs.length === 0) return { n: 0, over05: 0, p95: 0, max: 0 };
  return {
    n: diffs.length,
    over05: diffs.filter((d) => d > 0.5 + 1e-9).length,
    p95: diffs[Math.floor(diffs.length * 0.95)],
    max: diffs[diffs.length - 1],
  };
}

/** Per special type: spread of how many rounds of that type each player did not
 *  get to play in the format (sat out, or landed on an off-format court). */
function specialMissSpread(s: Schedule, ids: string[]): Partial<Record<RoundType, number>> {
  const out: Partial<Record<RoundType, number>> = {};
  for (const type of ['gendered', 'mixed', 'skill'] as RoundType[]) {
    const rounds = s.rounds.filter((r) => roundTypeOf(r) === type);
    if (rounds.length === 0) continue;
    const misses = new Map(ids.map((id) => [id, 0]));
    for (const r of rounds) {
      const played = new Set<string>();
      for (const c of r.courts) {
        if (courtMatchesType(c, type)) {
          for (const p of [...c.team1, ...c.team2]) played.add(p.id);
        }
      }
      for (const id of ids) if (!played.has(id)) misses.set(id, misses.get(id)! + 1);
    }
    const vals = [...misses.values()];
    out[type] = Math.max(...vals) - Math.min(...vals);
  }
  return out;
}

/** 3:1 gender courts in normal rounds, against the per-round feasible minimum
 *  (odd men on full courts forces exactly one 3:1 court; even men forces none).
 *  Rounds with a short court are skipped: the parity argument only holds when
 *  every court seats four. */
function genderShapeStats(s: Schedule): { courts31: number; forced31: number; rounds: number } {
  let courts31 = 0;
  let forced31 = 0;
  let rounds = 0;
  for (const r of s.rounds) {
    if (roundTypeOf(r)) continue;
    const sizes = r.courts.map((c) => c.team1.length + c.team2.length);
    if (sizes.some((n) => n !== 4)) continue;
    rounds++;
    let men = 0;
    for (const c of r.courts) {
      const m = [...c.team1, ...c.team2].filter((p) => p.gender === 'M').length;
      men += m;
      if (m === 1 || m === 3) courts31++;
    }
    if (men % 2 === 1) forced31++;
  }
  return { courts31, forced31, rounds };
}

interface Config {
  label: string;
  players: Player[];
  courts: number;
  rounds: number;
  plan?: RoundPlan;
  partnerships?: Partnership[];
}

/**
 * Gendered every 2 with equal skill every 3, as the retired frequency machine
 * laid it out: the rarer type took a round they both fell due on and the other
 * slid to the next one. Written out because nothing works it out any more, and
 * this run has to stay the same run.
 */
const GENDERED_Q2_SKILL_Q3: RoundPlan = [
  null, 'gendered', 'skill', 'gendered', null, 'skill',
  'gendered', null, 'skill', 'gendered', null, 'skill',
];

const CONFIGS: Config[] = [
  { label: '12p/3c/12r normal', players: makePlayers(12), courts: 3, rounds: 12 },
  { label: '12p/3c/12r level ratings', players: makeLevelPlayers(12), courts: 3, rounds: 12 },
  { label: '13p/3c/13r normal (1 sitter)', players: makePlayers(13), courts: 3, rounds: 13 },
  { label: '14p/3c/14r normal (2 sitters)', players: makePlayers(14), courts: 3, rounds: 14 },
  { label: '10p/2c/10r normal', players: makePlayers(10), courts: 2, rounds: 10 },
  { label: '9p/2c/8r normal (1 sitter)', players: makePlayers(9), courts: 2, rounds: 8 },
  { label: '16p/4c/8r normal', players: makePlayers(16), courts: 4, rounds: 8 },
  // Added after the baseline run: exercises the 2v1 short court.
  { label: '11p/3c/12r short court', players: makePlayers(11), courts: 3, rounds: 12 },
  { label: '12p/3c/12r gendered q2', players: makePlayers(12), courts: 3, rounds: 12, plan: everyNth('gendered', 2, 12) },
  { label: '13p/3c/12r mixed q2', players: makePlayers(13), courts: 3, rounds: 12, plan: everyNth('mixed', 2, 12) },
  { label: '12p/3c/12r gendered q2 + skill q3', players: makePlayers(12), courts: 3, rounds: 12, plan: GENDERED_Q2_SKILL_Q3 },
  {
    label: '12p/3c/8r two couples',
    players: makePlayers(12),
    courts: 3,
    rounds: 8,
    partnerships: [
      { player1Id: 'p0', player2Id: 'p1' },
      { player1Id: 'p2', player2Id: 'p3' },
    ],
  },
];

const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(3));

/** Vitest hides console output from passing tests, so the report also goes to
 *  the file named by MEASURE_OUT when that is set. */
function report(text: string) {
  console.log(text);
  if (process.env.MEASURE_OUT) appendFileSync(process.env.MEASURE_OUT, text + '\n');
}

describe.runIf(process.env.MEASURE === '1')('schedule quality measurement', () => {
  it('per-config quality sweep', () => {
    for (const cfg of CONFIGS) {
      const ids = cfg.players.map((p) => p.id);
      const schedules: Schedule[] = [];
      for (let i = 0; i < PER_CONFIG; i++) {
        schedules.push(generateSchedule(
          cfg.players, cfg.courts, cfg.rounds,
          cfg.plan ?? [], cfg.partnerships ?? []
        ));
      }

      const reps = schedules.map((s) => repeatStats(s, ids, cfg.partnerships ?? []));
      const sum = (f: (r: RepeatStats) => number) => reps.reduce((a, r) => a + f(r), 0);
      const spreads = schedules.map((s) => sitOutSpread(s, ids));
      const shortSpreads = schedules.map((s) => shortGameSpread(s, ids));
      const normalGaps = gapStats(schedules, (r) => !roundTypeOf(r));
      const specialGaps = gapStats(schedules, (r) => !!roundTypeOf(r));
      const gender = schedules.map((s) => genderShapeStats(s));
      const g31 = gender.reduce((a, g) => a + g.courts31, 0);
      const g31forced = gender.reduce((a, g) => a + g.forced31, 0);

      const lines = [
        `== ${cfg.label} (${PER_CONFIG} schedules) ==`,
        `  repeat partnerships: ${sum((r) => r.repeats)} across ${sum((r) => r.teams)} teams`
          + ` | while fresh available (normal rounds): ${sum((r) => r.repeatWhileFresh)}`
          + ` | back-to-back: ${sum((r) => r.consecutive)}`
          + ` (while fresh: ${sum((r) => r.consecutiveWhileFresh)})`,
        `  worst pair partnered ${Math.max(...reps.map((r) => r.maxPairCount))}x`
          + ` | never-partnered pairs avg ${fmt(sum((r) => r.neverPartneredPairs) / PER_CONFIG)}`
          + ` of ${reps[0].possiblePairs}`,
        `  sit-out spread max ${Math.max(...spreads)}`
          + ` | short-game spread max ${Math.max(...shortSpreads)}`,
        `  rating gaps normal: n=${normalGaps.n} over0.5=${normalGaps.over05}`
          + ` (${fmt((100 * normalGaps.over05) / Math.max(1, normalGaps.n))}%)`
          + ` p95=${fmt(normalGaps.p95)} max=${fmt(normalGaps.max)}`,
      ];
      if (specialGaps.n > 0) {
        lines.push(
          `  rating gaps special: n=${specialGaps.n} over0.5=${specialGaps.over05}`
            + ` p95=${fmt(specialGaps.p95)} max=${fmt(specialGaps.max)}`
        );
        const missSpreads: Record<string, number> = {};
        for (const s of schedules) {
          for (const [t, v] of Object.entries(specialMissSpread(s, ids))) {
            missSpreads[t] = Math.max(missSpreads[t] ?? 0, v);
          }
        }
        lines.push(`  special miss spread max: ${JSON.stringify(missSpreads)}`);
      }
      if (gender.some((g) => g.rounds > 0)) {
        lines.push(
          `  3:1 gender courts (normal full rounds): ${g31}`
            + ` vs forced minimum ${g31forced} over ${gender.reduce((a, g) => a + g.rounds, 0)} rounds`
        );
      }
      report(lines.join('\n'));
    }
  }, 300000);

  it('round-1 sitter distribution (13p/3c)', () => {
    const players = makePlayers(13);
    const RUNS = 3000;
    const counts = new Map(players.map((p) => [p.id, 0]));
    for (let i = 0; i < RUNS; i++) {
      const s = generateSchedule(players, 3, 1);
      for (const p of s.rounds[0].sitOuts) counts.set(p.id, counts.get(p.id)! + 1);
    }
    const expected = RUNS / players.length;
    let chi = 0;
    for (const c of counts.values()) chi += ((c - expected) ** 2) / expected;
    const byIndex = players.map((p) => counts.get(p.id)!);
    report([
      `== round-1 sitter distribution: ${RUNS} runs, expected ${fmt(expected)} each ==`,
      `  by roster index: ${byIndex.join(' ')}`,
      `  max/expected: ${fmt(Math.max(...byIndex) / expected)}x at index ${byIndex.indexOf(Math.max(...byIndex))}`,
      `  chi-square (df 12): ${fmt(chi)}  (uniform ~<32.9 at p=.001)`,
    ].join('\n'));
  }, 300000);

  it('sit-out cycle repetition fidelity', () => {
    const RUNS = 20;
    for (const [n, courts, cycleLen] of [[13, 3, 13], [14, 3, 7]] as const) {
      const players = makePlayers(n);
      let matched = 0;
      let compared = 0;
      for (let i = 0; i < RUNS; i++) {
        const s = generateSchedule(players, courts, cycleLen * 2);
        const seq = s.rounds.map((r) => r.sitOuts.map((p) => p.id).sort().join('+'));
        for (let k = 0; k < cycleLen; k++) {
          compared++;
          if (seq[k] === seq[k + cycleLen]) matched++;
        }
      }
      report(
        `== cycle fidelity ${n}p/${courts}c: cycle 2 matched cycle 1 on `
          + `${matched}/${compared} rounds (${fmt((100 * matched) / compared)}%) over ${RUNS} runs ==`
      );
    }
  }, 300000);
});
