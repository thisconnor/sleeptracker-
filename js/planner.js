// planner.js — the "what should I do about tonight" math, plus the
// optional calendar-aware pieces. Pure module: no DOM, no network
// (calendar events arrive as plain {start, end, title} objects).

import { minuteOfDay } from './sessions.js';

const MS_PER_MIN = 60000;
const MS_PER_HOUR = 3600000;

// Debt repayment pacing: aim to repay ~1/5 of the current debt tonight,
// in 15-minute steps, capped at +60 min — extending sleep beyond an hour a
// night mostly buys shallow, fragmented sleep.
export function repaymentExtraMin(debtMin) {
  if (debtMin <= 0) return 0;
  const raw = debtMin / 5;
  return Math.max(0, Math.min(60, Math.round(raw / 15) * 15));
}

// Circular mean of recent main-session wake times, as minute-of-day.
function meanWakeMin(nights, count = 7) {
  const wakes = nights
    .slice(0, count)
    .filter((n) => n.mainSession)
    .map((n) => minuteOfDay(new Date(n.mainSession.end)));
  if (wakes.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const m of wakes) {
    const a = (m / 1440) * 2 * Math.PI;
    x += Math.cos(a);
    y += Math.sin(a);
  }
  return ((Math.atan2(y, x) / (2 * Math.PI)) * 1440 + 1440) % 1440;
}

const atMinute = (dayDate, min) =>
  new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 0, Math.round(min));

// Tomorrow's wake target, in priority order:
//   1. tomorrow's first calendar event minus the prep buffer (if linked)
//   2. the explicit wake-target setting
//   3. the average of recent wakes
//   4. 7:00
// When both calendar and setting exist, the earlier one wins — better to
// wake on time for the meeting than to honor a lazier default.
export function resolveWakeTarget({
  nights = [],
  settings = {},
  now = new Date(),
  tomorrowFirstEvent = null,
} = {}) {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const candidates = [];
  if (tomorrowFirstEvent) {
    const t = new Date(tomorrowFirstEvent.getTime() - (settings.prepBufferMin ?? 60) * MS_PER_MIN);
    const m = minuteOfDay(t);
    if (m >= 4 * 60 && m <= 12 * 60) candidates.push({ wake: t, source: 'calendar' });
  }
  if (settings.wakeTargetMin != null) {
    candidates.push({ wake: atMinute(tomorrow, settings.wakeTargetMin), source: 'setting' });
  }
  if (candidates.length > 0) {
    candidates.sort((a, b) => a.wake - b.wake);
    return { wakeTarget: candidates[0].wake, source: candidates[0].source };
  }
  const mean = meanWakeMin(nights);
  if (mean != null) return { wakeTarget: atMinute(tomorrow, mean), source: 'history' };
  return { wakeTarget: atMinute(tomorrow, 7 * 60), source: 'default' };
}

// Tonight's plan: recommended bedtime (need + gentle repayment ahead of the
// wake target) and the caffeine cutoff counted back from that bedtime.
export function bedtimePlan({
  nights = [],
  settings = {},
  debtMin = 0,
  now = new Date(),
  tomorrowFirstEvent = null,
} = {}) {
  const needMin = settings.needMin ?? 480;
  const { wakeTarget, source } = resolveWakeTarget({ nights, settings, now, tomorrowFirstEvent });
  const extraMin = repaymentExtraMin(debtMin);
  const sleepMin = needMin + extraMin;
  const bedtime = new Date(wakeTarget.getTime() - sleepMin * MS_PER_MIN);
  const caffeineCutoff = new Date(bedtime.getTime() - (settings.caffeineGapMin ?? 600) * MS_PER_MIN);
  return { wakeTarget, wakeSource: source, extraMin, sleepMin, bedtime, caffeineCutoff };
}

// ---- calendar helpers ----

// Merge overlapping timed events into busy blocks.
export function busyBlocks(events) {
  const sorted = events
    .filter((e) => e.start instanceof Date && e.end instanceof Date && e.end > e.start)
    .slice()
    .sort((a, b) => a.start - b.start);
  const blocks = [];
  for (const e of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && e.start.getTime() <= last.end.getTime()) {
      if (e.end > last.end) last.end = new Date(e.end);
    } else {
      blocks.push({ start: new Date(e.start), end: new Date(e.end) });
    }
  }
  return blocks;
}

export function dayStartFromEvents(events) {
  const blocks = busyBlocks(events);
  return blocks.length ? new Date(blocks[0].start) : null;
}

// Nap opportunities: free stretches that overlap the afternoon-dip window.
// With no events at all, the dip window itself is the suggestion.
export function napSuggestions({
  events = [],
  dip,
  now = new Date(),
  maxNapMin = 90,
  minSlotMin = 30,
} = {}) {
  if (!dip) return [];
  const windowStart = Math.max(dip.start.getTime(), now.getTime());
  const windowEnd = dip.end.getTime();
  if (windowEnd - windowStart < minSlotMin * MS_PER_MIN) return [];

  const blocks = busyBlocks(events).filter(
    (b) => b.end.getTime() > windowStart && b.start.getTime() < windowEnd,
  );

  const free = [];
  let cursor = windowStart;
  for (const b of blocks) {
    if (b.start.getTime() - cursor >= minSlotMin * MS_PER_MIN) {
      free.push({ start: cursor, end: b.start.getTime() });
    }
    cursor = Math.max(cursor, b.end.getTime());
  }
  if (windowEnd - cursor >= minSlotMin * MS_PER_MIN) {
    free.push({ start: cursor, end: windowEnd });
  }

  return free
    .map((slot) => {
      const durationMin = Math.min(maxNapMin, (slot.end - slot.start) / MS_PER_MIN);
      return {
        start: new Date(slot.start),
        end: new Date(slot.start + durationMin * MS_PER_MIN),
        durationMin: Math.round(durationMin),
        constrained: blocks.length > 0,
      };
    })
    .sort((a, b) => b.durationMin - a.durationMin);
}

// Free gaps across the working day (for the day-map view).
export function freeGaps(events, from, to, minGapMin = 15) {
  const blocks = busyBlocks(events).filter((b) => b.end > from && b.start < to);
  const gaps = [];
  let cursor = from.getTime();
  for (const b of blocks) {
    if (b.start.getTime() - cursor >= minGapMin * MS_PER_MIN) {
      gaps.push({ start: new Date(cursor), end: new Date(b.start) });
    }
    cursor = Math.max(cursor, b.end.getTime());
  }
  if (to.getTime() - cursor >= minGapMin * MS_PER_MIN) {
    gaps.push({ start: new Date(cursor), end: new Date(to) });
  }
  return gaps;
}

export const PLANNER_HOURS = { MS_PER_HOUR };
