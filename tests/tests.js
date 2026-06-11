// tests.js — run with `node tests/tests.js` or open tests/tests.html.

import { test, assert, assertEq, assertClose, report } from './runner.js';
import {
  classifyStage, parseTimestamp, parseRows, parseFragment, parseAnyInput, canonicalFragment,
} from '../js/parse.js';
import {
  unionIntervals, subtractIntervals, buildSessions, assembleNights, minuteOfDay,
} from '../js/sessions.js';
import {
  sleepDebtMin, debtZone, debtSeries, energyPotential, suggestNeed, consistencyScore,
} from '../js/metrics.js';
import {
  energyAt, todayWake, predictedBed, buildZones, curvePoints,
} from '../js/schedule.js';
import { clampNeed, resolveNeed, DEFAULT_NEED_MIN } from '../js/settings.js';
import { demoRows, makeDemoFragment } from '../js/demo.js';

const D = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);
const NOW = D(2026, 6, 11, 7, 30); // fixed "this morning" for determinism
const MIN = 60000;

// A minimal night for metrics tests.
const night = (totalMin, hasData = true) => ({ totalMin, hasData });
const exactNights = (needMin, n = 14) => Array.from({ length: n }, () => night(needMin));
const SUM_W = Array.from({ length: 14 }, (_, i) => Math.exp(-i / 7)).reduce((a, b) => a + b);

// ---------------------------------------------------------------- parse

test('classifyStage tolerates real-world value strings', () => {
  assertEq(classifyStage('In Bed'), 'B');
  assertEq(classifyStage('in bed'), 'B');
  assertEq(classifyStage('InBed'), 'B');
  assertEq(classifyStage('CORE'), 'C');
  assertEq(classifyStage('Asleep (Deep)'), 'D');
  assertEq(classifyStage('AsleepREM'), 'R');
  assertEq(classifyStage('Awake'), 'W');
  assertEq(classifyStage('Asleep'), 'A');
  assertEq(classifyStage('asleepUnspecified'), 'A');
  assertEq(classifyStage('Mystery Stage'), 'A', 'unknown defaults to asleep');
});

test('parseTimestamp handles compact local format and rejects junk', () => {
  const t = parseTimestamp('202606102258');
  assertEq(t.getFullYear(), 2026);
  assertEq(t.getMonth(), 5);
  assertEq(t.getDate(), 10);
  assertEq(t.getHours(), 22);
  assertEq(t.getMinutes(), 58);
  assertEq(parseTimestamp('202613102258'), null, 'month 13');
  assertEq(parseTimestamp('garbage'), null);
});

test('parseTimestamp falls back to natural date strings', () => {
  const t = parseTimestamp('Jun 10, 2026 at 10:30 PM');
  assert(t instanceof Date && !Number.isNaN(t.getTime()));
  assertEq(t.getHours(), 22);
});

test('parseRows: separators, malformed rows, window and duration limits', () => {
  const rows = [
    '202606102258,202606110645,Asleep',
    '202606101030|202606101110|Asleep', // pipe separators, daytime nap
    'totally,broken', // too few fields
    '202606110645,202606102258,Asleep', // end before start
    '202604010000,202604010800,Asleep', // outside 16-day window
    '202606100000,202606110800,Asleep', // > 24h
  ].join(';');
  const { samples, skipped } = parseRows(rows, NOW);
  assertEq(samples.length, 2);
  assertEq(skipped, 4);
  assert(samples[0].start < samples[1].start, 'sorted by start');
});

test('parseFragment: full fragment, demo keyword, empty hash', () => {
  const frag = `v=1&need=510&d=${encodeURIComponent('202606102258,202606110645,Asleep')}`;
  const p = parseFragment(frag, NOW);
  assertEq(p.needRaw, '510');
  assertEq(p.samples.length, 1);
  assertEq(p.samples[0].stage, 'A');
  assertEq(parseFragment('demo', NOW).demo, 'default');
  assertEq(parseFragment('demo=iphone', NOW).demo, 'iphone');
  assertEq(parseFragment('', NOW).samples.length, 0);
  assertEq(parseFragment('#demo', NOW).demo, 'default', 'leading # tolerated');
});

test('parseAnyInput: full URL, bare fragment, bare rows', () => {
  const rows = '202606102258,202606110645,Asleep';
  const url = `https://x.github.io/y/#v=1&d=${encodeURIComponent(rows)}`;
  assertEq(parseAnyInput(url, NOW).samples.length, 1);
  assertEq(parseAnyInput(`v=1&d=${encodeURIComponent(rows)}`, NOW).samples.length, 1);
  assertEq(parseAnyInput(rows, NOW).samples.length, 1);
  assert(canonicalFragment(rows).startsWith('v=1&d='));
  assertEq(canonicalFragment(url), `v=1&d=${encodeURIComponent(rows)}`);
});

// ------------------------------------------------------------- intervals

test('unionIntervals merges overlaps and adjacency', () => {
  const u = unionIntervals([
    { start: 0, end: 60 * MIN },
    { start: 30 * MIN, end: 90 * MIN },
    { start: 90 * MIN, end: 120 * MIN },
    { start: 300 * MIN, end: 330 * MIN },
  ]);
  assertEq(u.length, 2);
  assertEq(u[0].end - u[0].start, 120 * MIN);
});

test('subtractIntervals carves awake gaps out of a spanning asleep record', () => {
  const base = unionIntervals([{ start: 0, end: 480 * MIN }]);
  const cuts = unionIntervals([{ start: 120 * MIN, end: 150 * MIN }]);
  const out = subtractIntervals(base, cuts);
  assertEq(out.length, 2);
  const total = out.reduce((t, iv) => t + (iv.end - iv.start), 0) / MIN;
  assertEq(total, 450);
});

test('duplicate sources do not double-count sleep', () => {
  // iPhone logs one long Asleep span; Watch logs the same night again.
  const { sessions } = buildSessions([
    { start: D(2026, 6, 10, 23, 0), end: D(2026, 6, 11, 6, 30), stage: 'A' },
    { start: D(2026, 6, 10, 23, 5), end: D(2026, 6, 11, 6, 25), stage: 'A' },
  ]);
  assertEq(sessions.length, 1);
  assertClose(sessions[0].asleepMin, 450, 0.01);
});

test('in-bed fallback fires only when there is zero asleep coverage', () => {
  const onlyB = buildSessions([
    { start: D(2026, 6, 10, 23, 0), end: D(2026, 6, 11, 6, 30), stage: 'B' },
  ]);
  assertEq(onlyB.inBedFallback, true);
  assertEq(onlyB.sessions.length, 1);
  const both = buildSessions([
    { start: D(2026, 6, 10, 23, 0), end: D(2026, 6, 11, 6, 30), stage: 'B' },
    { start: D(2026, 6, 10, 23, 15), end: D(2026, 6, 11, 6, 20), stage: 'A' },
  ]);
  assertEq(both.inBedFallback, false);
});

// -------------------------------------------------------------- sessions

test('short gaps merge into one session, long gaps split', () => {
  const merged = buildSessions([
    { start: D(2026, 6, 10, 22, 0), end: D(2026, 6, 11, 2, 0), stage: 'A' },
    { start: D(2026, 6, 11, 2, 30), end: D(2026, 6, 11, 6, 30), stage: 'A' },
  ]);
  assertEq(merged.sessions.length, 1);
  assertClose(merged.sessions[0].asleepMin, 480, 0.01, 'gap minutes excluded');

  const split = buildSessions([
    { start: D(2026, 6, 10, 22, 0), end: D(2026, 6, 11, 0, 0), stage: 'A' },
    { start: D(2026, 6, 11, 3, 30), end: D(2026, 6, 11, 6, 30), stage: 'A' },
  ]);
  assertEq(split.sessions.length, 2);
});

test('stage breakdown de-dupes per stage and flags hasStages', () => {
  const { sessions } = buildSessions([
    { start: D(2026, 6, 11, 0, 0), end: D(2026, 6, 11, 1, 0), stage: 'C' },
    { start: D(2026, 6, 11, 0, 0), end: D(2026, 6, 11, 1, 0), stage: 'C' }, // duplicate
    { start: D(2026, 6, 11, 1, 0), end: D(2026, 6, 11, 1, 30), stage: 'D' },
    { start: D(2026, 6, 11, 1, 30), end: D(2026, 6, 11, 2, 0), stage: 'R' },
  ]);
  assertEq(sessions.length, 1);
  assertEq(sessions[0].hasStages, true);
  assertClose(sessions[0].stages.core, 60, 0.01);
  assertClose(sessions[0].stages.deep, 30, 0.01);
  assertClose(sessions[0].stages.rem, 30, 0.01);
});

test('efficiency comes from overlapping In Bed records', () => {
  const { sessions } = buildSessions([
    { start: D(2026, 6, 10, 21, 45), end: D(2026, 6, 11, 6, 30), stage: 'B' },
    { start: D(2026, 6, 10, 22, 0), end: D(2026, 6, 11, 6, 15), stage: 'A' },
  ]);
  assertClose(sessions[0].efficiency, 495 / 525, 0.001);
});

// ---------------------------------------------------------------- nights

test('cross-midnight sleep lands on the wake day (nights[0])', () => {
  const { nights } = assembleNights(
    [{ start: D(2026, 6, 10, 22, 58), end: D(2026, 6, 11, 6, 45), stage: 'A' }],
    NOW,
  );
  assertEq(nights[0].hasData, true);
  assertEq(nights[0].key, '2026-06-11');
  assertClose(nights[0].totalMin, 467, 0.01);
  assertEq(nights[1].hasData, false);
});

test('afternoon naps are classified and pay the same day', () => {
  const { nights } = assembleNights(
    [
      { start: D(2026, 6, 9, 23, 0), end: D(2026, 6, 10, 6, 0), stage: 'A' },
      { start: D(2026, 6, 10, 14, 10), end: D(2026, 6, 10, 14, 50), stage: 'A' },
    ],
    NOW,
  );
  const n = nights[1]; // June 10
  assertEq(n.naps.length, 1);
  assertClose(n.naps[0].asleepMin, 40, 0.01);
  assertClose(n.totalMin, 420 + 40, 0.01, 'nap adds to the day total');
  assertEq(n.mainSession.isNap, false);
});

test('a short evening sleep is not a nap (outside 9:00-21:00 midpoint)', () => {
  const { sessions } = buildSessions([
    { start: D(2026, 6, 10, 21, 30), end: D(2026, 6, 10, 23, 0), stage: 'A' },
  ]);
  assertEq(sessions[0].isNap, false);
});

test('split nights sum and the longest session is the main one', () => {
  const { nights } = assembleNights(
    [
      { start: D(2026, 6, 10, 21, 0), end: D(2026, 6, 11, 0, 30), stage: 'A' },
      { start: D(2026, 6, 11, 3, 0), end: D(2026, 6, 11, 6, 30), stage: 'A' },
    ],
    NOW,
  );
  // 2.5h gap splits into two sessions; both end on June 11 (one at 00:30).
  assertEq(nights[0].sessions.length, 2);
  assertClose(nights[0].totalMin, 210 + 210, 0.01);
});

// ------------------------------------------------------------------ debt

test('debt is zero when need is met exactly', () => {
  assertClose(sleepDebtMin(exactNights(480), 480), 0, 1e-9);
});

test('uniform one-hour shortfall reads as its true cumulative 14h', () => {
  assertClose(sleepDebtMin(exactNights(420), 480), 840, 1e-6);
});

test('a single 2h-short last night reads ~4.31h (15% recency weight)', () => {
  const nights = exactNights(480);
  nights[0] = night(360);
  assertClose(sleepDebtMin(nights, 480), (14 * 120) / SUM_W, 1e-6);
  assertClose((14 * 120) / SUM_W, 258.6, 0.2);
});

test('oversleep offsets debt and the total clamps at zero', () => {
  const nights = exactNights(480);
  nights[1] = night(360); // 2h short two nights ago
  nights[0] = night(600); // 2h oversleep last night
  assertClose(sleepDebtMin(nights, 480), 0, 1e-9, 'recent oversleep outweighs older shortfall');
  assertClose(sleepDebtMin(exactNights(600), 480), 0, 1e-9, 'all-oversleep clamps at 0');
});

test('missing nights contribute zero deficit', () => {
  const nights = exactNights(480);
  nights[5] = night(0, false);
  assertClose(sleepDebtMin(nights, 480), 0, 1e-9);
});

test('debt zones', () => {
  assertEq(debtZone(0), 'good');
  assertEq(debtZone(300), 'good');
  assertEq(debtZone(301), 'moderate');
  assertEq(debtZone(601), 'high');
});

test('debtSeries pads beyond the data with missing nights', () => {
  const nights = exactNights(420); // uniformly 1h short
  const series = debtSeries(nights, 480);
  assertEq(series.length, 14);
  assertClose(series[0], 840, 1e-6);
  assert(series[13] < series[0], 'older debt readings see fewer known nights');
});

// ------------------------------------------------------- energy potential

test('energy potential breakpoints and clamping', () => {
  assertEq(energyPotential(0), 100);
  assertEq(energyPotential(300), 70);
  assertEq(energyPotential(450), 55);
  assertEq(energyPotential(600), 40);
  assertEq(energyPotential(1200), 10);
  assertEq(energyPotential(5000), 10);
});

// -------------------------------------------------------- need suggestion

test('need suggestion is the 75th percentile, needs 7+ nights', () => {
  const totals = [360, 390, 420, 435, 450, 465, 480, 510];
  const nights = totals.map((t) => night(t));
  assertEq(suggestNeed(nights), 470); // 468.75 rounded to 5 min
  assertEq(suggestNeed(nights.slice(0, 6)), null);
  assertEq(suggestNeed(Array.from({ length: 7 }, () => night(720))), 690, 'clamped to max');
});

// ------------------------------------------------------------ consistency

test('consistency: identical midpoints score 100', () => {
  const nights = Array.from({ length: 7 }, () => ({ mainSession: { midMin: 180 } }));
  assertEq(consistencyScore(nights).score, 100);
});

test('consistency: ±2h alternation scores ~0, midnight wrap is handled', () => {
  const wild = Array.from({ length: 8 }, (_, i) => ({ mainSession: { midMin: i % 2 ? 120 : 360 } }));
  assertEq(consistencyScore(wild).score, 0);
  const wrapped = Array.from({ length: 8 }, (_, i) => ({ mainSession: { midMin: i % 2 ? 1380 : 60 } }));
  const c = consistencyScore(wrapped);
  assert(c.score > 45 && c.score < 55, `midnight wrap should read ~50, got ${c.score}`);
  assertEq(consistencyScore([{ mainSession: { midMin: 0 } }]), null, 'needs 3+ nights');
});

// --------------------------------------------------------------- schedule

test('predicted bedtime and melatonin window', () => {
  const wake = D(2026, 6, 11, 7, 0);
  const bed = predictedBed(wake, 480);
  assertEq(bed.getHours(), 23);
  const zones = buildZones(wake, bed);
  const mel = zones.find((z) => z.id === 'melatonin');
  assertEq(mel.start.getHours(), 21);
  assertEq(mel.end.getHours(), 22);
  for (let i = 1; i < zones.length; i++) assert(zones[i].start >= zones[i - 1].start, 'sorted');
  const evening = zones.find((z) => z.id === 'eveningPeak');
  assert(evening.end.getTime() <= bed.getTime() - 1.5 * 3600000, 'evening peak ends before wind-down');
});

test('energy curve shape: groggy start, high morning, low dip, bounded', () => {
  assertEq(energyAt(-2, 16, 100), 8, 'asleep before wake');
  assert(energyAt(0, 16, 100) < 25, 'sleep inertia');
  assert(energyAt(2.5, 16, 100) > 80, 'morning peak');
  assert(energyAt(8, 16, 100) < 40, 'afternoon dip');
  assert(energyAt(14.5, 16, 100) > energyAt(8, 16, 100), 'evening recovers');
  assert(energyAt(18, 16, 100) < 30, 'wind-down falls off');
  for (let t = -1; t <= 24; t += 0.25) {
    const e = energyAt(t, 16, 50);
    assert(e >= 0 && e <= 100, `bounded at t=${t}`);
  }
  assert(energyAt(2.5, 16, 0) < energyAt(2.5, 16, 100), 'high debt damps peaks');
});

test('todayWake uses last night, else circular mean of recent wakes', () => {
  const real = todayWake(
    [{ mainSession: { end: D(2026, 6, 11, 6, 45) } }],
    NOW,
  );
  assertEq(real.getHours(), 6);
  assertEq(real.getMinutes(), 45);
  const nights = [
    { mainSession: null },
    { mainSession: { end: D(2026, 6, 10, 6, 50) } },
    { mainSession: { end: D(2026, 6, 9, 7, 0) } },
    { mainSession: { end: D(2026, 6, 8, 7, 10) } },
  ];
  const mean = todayWake(nights, NOW);
  assertEq(mean.getHours(), 7);
  assertEq(mean.getDate(), 11, 'mean wake lands today');
  const fallback = todayWake([{ mainSession: null }], NOW);
  assertEq(fallback.getHours(), 7, 'default 7:00');
});

test('curvePoints spans the local day and stays in range', () => {
  const pts = curvePoints(D(2026, 6, 11, 6, 45), 480, 80);
  assertEq(pts.length, 145);
  assertEq(pts[0].time.getHours(), 0);
  assertEq(pts[0].value, 8, 'asleep at midnight');
  for (const p of pts) assert(p.value >= 0 && p.value <= 100);
});

// --------------------------------------------------------------- settings

test('need precedence: URL > stored > default, with write-through', () => {
  const mem = () => {
    const m = new Map();
    return { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v), map: m };
  };
  const s1 = mem();
  assertEq(resolveNeed('510', s1).needMin, 510);
  assertEq(s1.map.get('sleepNeedMin'), '510', 'URL writes through');
  const s2 = mem();
  s2.set('sleepNeedMin', '495');
  assertEq(resolveNeed(null, s2).needMin, 495);
  assertEq(resolveNeed(null, mem()).needMin, DEFAULT_NEED_MIN);
  assertEq(resolveNeed('abc', mem()).needMin, DEFAULT_NEED_MIN, 'junk URL value ignored');
});

test('clampNeed clamps numbers and rejects junk', () => {
  assertEq(clampNeed('200'), 300);
  assertEq(clampNeed('900'), 690);
  assertEq(clampNeed('480'), 480);
  assertEq(clampNeed(''), null);
  assertEq(clampNeed(null), null);
  assertEq(clampNeed('abc'), null);
});

test('a throwing store does not break URL resolution (private mode)', () => {
  const broken = { get() { throw new Error('nope'); }, set() { throw new Error('nope'); } };
  assertEq(resolveNeed('510', broken).needMin, 510);
  assertEq(resolveNeed(null, broken).needMin, DEFAULT_NEED_MIN);
});

// ----------------------------------------------- demo data end-to-end

test('iphone demo: parses clean, has missing nights and a nap, no stages', () => {
  const p = parseFragment(makeDemoFragment('iphone', NOW), NOW);
  assert(p.samples.length > 0);
  assertEq(p.skipped, 0);
  const { nights, inBedFallback } = assembleNights(p.samples, NOW);
  assertEq(inBedFallback, false);
  assertEq(nights[0].hasData, true);
  assertEq(nights[4].hasData, false);
  assertEq(nights[9].hasData, false);
  assertEq(nights[1].naps.length, 1);
  assert(nights.every((n) => !n.mainSession || !n.mainSession.hasStages), 'no stage data from iPhone');
  assert(nights[2].totalMin > 540, 'oversleep night present');
});

test('watch demo: stages light up and duplicate sources stay sane', () => {
  const p = parseFragment(makeDemoFragment('watch', NOW), NOW);
  assertEq(p.skipped, 0);
  const { nights } = assembleNights(p.samples, NOW);
  const main = nights[0].mainSession;
  assertEq(main.hasStages, true);
  assert(main.asleepMin < 660, 'duplicate Asleep span must not double-count');
  const stageSum = main.stages.core + main.stages.deep + main.stages.rem;
  assert(stageSum <= main.asleepMin + 1, 'stage minutes fit inside asleep minutes');
  assert(main.stages.awake > 0, 'awake gaps recorded');
});

test('messy demo: malformed rows are skipped, the rest still assemble', () => {
  const p = parseFragment(makeDemoFragment('messy', NOW), NOW);
  assert(p.skipped >= 3, `expected >=3 skipped, got ${p.skipped}`);
  const { nights } = assembleNights(p.samples, NOW);
  const withData = nights.filter((n) => n.hasData).length;
  assert(withData >= 6, `expected >=6 nights with data, got ${withData}`);
  for (const n of nights) {
    assert(n.totalMin < 660, `overlapping duplicates double-counted: ${n.totalMin}`);
  }
});

test('demo rows are deterministic', () => {
  assertEq(demoRows('watch', NOW), demoRows('watch', NOW));
});

// ------------------------------------------------------------------ done

const results = report();
if (typeof document !== 'undefined') {
  const list = document.querySelector('#results') ?? document.body;
  for (const r of results) {
    const div = document.createElement('div');
    div.className = r.ok ? 'pass' : 'fail';
    div.textContent = (r.ok ? '✓ ' : '✗ ') + r.name + (r.ok ? '' : ` — ${r.err.message}`);
    list.appendChild(div);
  }
}
