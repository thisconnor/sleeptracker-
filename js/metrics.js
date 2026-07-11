// metrics.js — sleep debt, energy potential, need suggestion, consistency.
// Pure module: no DOM access.
//
// The debt model follows RISE's published methodology: a rolling 14-night
// window, exponentially weighted toward recent nights with weights e^(-i/7)
// (last night carries ~15% of the total), scaled so a uniform shortfall
// reads as its true cumulative hours. Naps repay debt (they're already in
// totalMin); oversleeping offsets it; the total is clamped at zero.

export const DEBT_GOOD_MAX_MIN = 5 * 60;
export const DEBT_MODERATE_MAX_MIN = 10 * 60;

// mode 'weighted' = RISE-style recency weighting (default);
// mode 'plain'    = literal cumulative sum of the last-14-night deficits.
export function sleepDebtMin(nights, needMin, mode = 'weighted') {
  if (mode === 'plain') {
    let total = 0;
    for (const n of nights) if (n.hasData) total += needMin - n.totalMin;
    return Math.max(0, total);
  }
  let weighted = 0;
  let sumW = 0;
  for (let i = 0; i < nights.length; i++) {
    const w = Math.exp(-i / 7);
    sumW += w;
    if (nights[i].hasData) weighted += w * (needMin - nights[i].totalMin);
  }
  if (sumW === 0) return 0;
  return Math.max(0, (nights.length * weighted) / sumW);
}

export function debtZone(debtMin) {
  if (debtMin <= DEBT_GOOD_MAX_MIN) return 'good';
  if (debtMin <= DEBT_MODERATE_MAX_MIN) return 'moderate';
  return 'high';
}

// Debt as of each day in the window (for the trend line). Index matches
// nights[]: series[i] = debt computed the morning of nights[i].date, using
// a full 14-night window ending that day (nights beyond the data are
// treated as missing).
export function debtSeries(nights, needMin, mode = 'weighted', windowSize = 14) {
  return nights.map((_, i) => {
    const window = [];
    for (let j = 0; j < windowSize; j++) {
      window.push(nights[i + j] ?? { hasData: false, totalMin: 0 });
    }
    return sleepDebtMin(window, needMin, mode);
  });
}

// 0-100, piecewise-linear in debt hours: (0h,100) (5h,70) (10h,40) (20h,10).
export function energyPotential(debtMin) {
  const pts = [[0, 100], [300, 70], [600, 40], [1200, 10]];
  if (debtMin <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (debtMin <= x1) return Math.round(y0 + ((debtMin - x0) / (x1 - x0)) * (y1 - y0));
  }
  return pts[pts.length - 1][1];
}

// Suggested sleep need: 75th percentile of nights with data ("your longest
// typical nights"), rounded to 5 min. Needs at least 7 nights to say
// anything.
export function suggestNeed(nights) {
  const totals = nights
    .filter((n) => n.hasData)
    .map((n) => n.totalMin)
    .sort((a, b) => a - b);
  if (totals.length < 7) return null;
  const idx = 0.75 * (totals.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const p75 = totals[lo] + (totals[hi] - totals[lo]) * (idx - lo);
  return Math.min(690, Math.max(300, Math.round(p75 / 5) * 5));
}

// Consistency of sleep timing: circular std-dev of main-session midpoints
// (circular so midpoints straddling midnight average correctly).
// stddev 0 min -> 100, 60 min -> 50, >=120 min -> 0.
export function consistencyScore(nights) {
  const mids = nights
    .filter((n) => n.mainSession)
    .map((n) => n.mainSession.midMin);
  if (mids.length < 3) return null;
  let x = 0;
  let y = 0;
  for (const m of mids) {
    const a = (m / 1440) * 2 * Math.PI;
    x += Math.cos(a);
    y += Math.sin(a);
  }
  const r = Math.hypot(x, y) / mids.length;
  const stddevMin =
    r >= 1 ? 0 : (Math.sqrt(-2 * Math.log(Math.max(r, 1e-12))) / (2 * Math.PI)) * 1440;
  const score = Math.round(Math.max(0, Math.min(100, 100 - stddevMin / 1.2)));
  return { score, stddevMin };
}
