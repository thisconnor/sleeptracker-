// schedule.js — the daily energy schedule, anchored to today's wake time.
// Pure module: no DOM access.
//
// A credible approximation of RISE's circadian energy curve (two-process
// model flavor): sleep-inertia notch after waking, morning peak, afternoon
// dip ~7-9h after wake, evening peak, then a wind-down falloff approaching
// the predicted bedtime. Predicted bedtime = wake + 24h - sleep need.

import { minuteOfDay, dateKey } from './sessions.js';

const MS_PER_HOUR = 3600000;
const MS_PER_MIN = 60000;

export const CURVE = {
  inertia: { mu: 0, sigma: 0.75, amp: -40 },
  morning: { mu: 2.5, sigma: 1.8, amp: 35 },
  dip: { mu: 8, sigma: 1.5, amp: -25 },
  evening: { mu: 14.5, sigma: 2.2, amp: 30 },
  windDown: { drop: 45, offsetH: -0.5, steepnessH: 0.8 },
  asleepLevel: 8,
};

const gauss = (t, mu, sigma) => Math.exp(-(((t - mu) / sigma) ** 2));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// Energy (0-100) at tHours since wake, with bedtime tBedHours after wake.
// Peaks are damped when energy potential is low (sleep debt is high).
// opts.dipMu moves the afternoon dip (circadian-midpoint anchoring);
// opts.dipScale damps it (e.g. after a nap).
export function energyAt(tHours, tBedHours, energyScore = 100, opts = {}) {
  if (tHours < 0) return CURVE.asleepLevel;
  const damp = 0.5 + (0.5 * energyScore) / 100;
  const { inertia, morning, dip, evening, windDown } = CURVE;
  const dipMu = opts.dipMu ?? dip.mu;
  const dipScale = opts.dipScale ?? 1;
  const e =
    50 +
    morning.amp * damp * gauss(tHours, morning.mu, morning.sigma) +
    evening.amp * damp * gauss(tHours, evening.mu, evening.sigma) +
    dip.amp * dipScale * gauss(tHours, dipMu, dip.sigma) +
    inertia.amp * gauss(tHours, inertia.mu, inertia.sigma) -
    windDown.drop * sigmoid((tHours - (tBedHours + windDown.offsetH)) / windDown.steepnessH);
  return Math.max(0, Math.min(100, e));
}

// Today's wake time: the end of last night's main session if we have one;
// otherwise the circular mean of recent wake times; otherwise 7:00.
export function todayWake(nights, now = new Date()) {
  const main = nights[0]?.mainSession;
  if (main) return new Date(main.end);
  const wakes = nights
    .slice(0, 7)
    .filter((n) => n.mainSession)
    .map((n) => minuteOfDay(n.mainSession.end));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (wakes.length === 0) return new Date(today.getTime() + 7 * MS_PER_HOUR);
  let x = 0;
  let y = 0;
  for (const m of wakes) {
    const a = (m / 1440) * 2 * Math.PI;
    x += Math.cos(a);
    y += Math.sin(a);
  }
  const meanMin = ((Math.atan2(y, x) / (2 * Math.PI)) * 1440 + 1440) % 1440;
  return new Date(today.getTime() + meanMin * MS_PER_MIN);
}

export function predictedBed(wake, needMin) {
  return new Date(wake.getTime() + (1440 - needMin) * MS_PER_MIN);
}

// Labeled zones with clock times, sorted by start. The melatonin window
// sits inside the wind-down on purpose.
export function buildZones(wake, bed, dipMu = CURVE.dip.mu) {
  const W = wake.getTime();
  const B = bed.getTime();
  const H = MS_PER_HOUR;
  const zones = [
    { id: 'inertia', label: 'Grogginess', start: W, end: W + 1.5 * H },
    { id: 'morningPeak', label: 'Morning peak', start: W + 1.5 * H, end: W + 4.5 * H },
    { id: 'dip', label: 'Afternoon dip', start: W + (dipMu - 1.25) * H, end: W + (dipMu + 1.25) * H },
    { id: 'eveningPeak', label: 'Evening peak', start: W + 13 * H, end: Math.min(W + 16 * H, B - 1.5 * H) },
    { id: 'melatonin', label: 'Melatonin window', start: B - 2 * H, end: B - 1 * H },
    { id: 'windDown', label: 'Wind-down', start: B - 1.5 * H, end: B },
  ];
  return zones
    .filter((z) => z.end > z.start)
    .map((z) => ({ ...z, start: new Date(z.start), end: new Date(z.end) }))
    .sort((a, b) => a.start - b.start);
}

// Sample the curve across the local calendar day of `wake`,
// midnight -> midnight. Returns [{time: Date, value: 0-100}].
export function curvePoints(wake, needMin, energyScore, stepMin = 10, opts = {}) {
  const dayStart = new Date(wake.getFullYear(), wake.getMonth(), wake.getDate());
  const tBedHours = (1440 - needMin) / 60;
  const points = [];
  for (let m = 0; m <= 1440; m += stepMin) {
    const time = new Date(dayStart.getTime() + m * MS_PER_MIN);
    const tHours = (time.getTime() - wake.getTime()) / MS_PER_HOUR;
    points.push({ time, value: energyAt(tHours, tBedHours, energyScore, opts) });
  }
  return points;
}

// Circular mean of recent main-session midpoints, as minute-of-day.
function meanMidMin(nights, count = 7) {
  const mids = nights
    .slice(0, count)
    .filter((n) => n.mainSession)
    .map((n) => n.mainSession.midMin);
  if (mids.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const m of mids) {
    const a = (m / 1440) * 2 * Math.PI;
    x += Math.cos(a);
    y += Math.sin(a);
  }
  return ((Math.atan2(y, x) / (2 * Math.PI)) * 1440 + 1440) % 1440;
}

// Convenience: everything the schedule card needs. The afternoon dip is
// anchored to the circadian midpoint (mid-sleep + 12h) when we have one,
// clamped to a sane 6.5-9.5h after wake; it is damped if a nap was already
// logged today.
export function buildSchedule(nights, needMin, energyScore, now = new Date()) {
  const wake = todayWake(nights, now);
  const bed = predictedBed(wake, needMin);

  let dipMu = CURVE.dip.mu;
  const midMin = meanMidMin(nights);
  if (midMin != null) {
    const wakeMin = minuteOfDay(wake);
    const dipCenterMin = (midMin + 12 * 60) % 1440;
    const hoursAfterWake = (((dipCenterMin - wakeMin) % 1440) + 1440) % 1440 / 60;
    dipMu = Math.max(6.5, Math.min(9.5, hoursAfterWake));
  }
  const nappedToday = (nights[0]?.naps?.length ?? 0) > 0;
  const opts = { dipMu, dipScale: nappedToday ? 0.45 : 1 };

  return {
    wake,
    bed,
    dipMu,
    nappedToday,
    wakeIsReal: Boolean(nights[0]?.mainSession) && dateKey(nights[0].mainSession.end) === dateKey(now),
    zones: buildZones(wake, bed, dipMu),
    points: curvePoints(wake, needMin, energyScore, 10, opts),
  };
}
