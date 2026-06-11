// sessions.js — assembles raw sleep samples into sessions and nights.
// Pure module: no DOM access.
//
// Pipeline:
//   1. asleep coverage = union(Asleep/Core/Deep/REM) minus union(Awake)
//      (union de-dupes overlapping records from multiple sources, e.g.
//      iPhone + Apple Watch logging the same night)
//   2. if there is no asleep coverage at all but "In Bed" records exist
//      (some iPhone-only configurations), fall back to In Bed coverage
//   3. chain intervals into sessions across gaps < 90 min
//   4. classify short daytime sessions as naps
//   5. assign each session to the local calendar date it ENDED (the day
//      you woke up); naps repay that same day's debt

const MS_PER_MIN = 60000;

export const SESSION_GAP_MIN = 90;
export const NAP_MAX_MIN = 180;
export const NAP_HOURS = { start: 9, end: 21 };

const toMs = (x) => (x instanceof Date ? x.getTime() : x);

// Merge overlapping/adjacent intervals. Returns sorted {start,end} in ms.
export function unionIntervals(intervals) {
  const sorted = intervals
    .map((iv) => ({ start: toMs(iv.start), end: toMs(iv.end) }))
    .filter((iv) => iv.end > iv.start)
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ ...iv });
  }
  return out;
}

// Subtract `cuts` from `base`; both must already be union-merged and sorted.
export function subtractIntervals(base, cuts) {
  const out = [];
  for (const b of base) {
    let s = b.start;
    for (const c of cuts) {
      if (c.end <= s || c.start >= b.end) continue;
      if (c.start > s) out.push({ start: s, end: c.start });
      s = Math.max(s, c.end);
      if (s >= b.end) break;
    }
    if (s < b.end) out.push({ start: s, end: b.end });
  }
  return out;
}

const totalMin = (intervals) =>
  intervals.reduce((t, iv) => t + (iv.end - iv.start), 0) / MS_PER_MIN;

export function minuteOfDay(date) {
  const d = new Date(date);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

export function dateKey(date) {
  const d = new Date(date);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Per-stage minutes within a session, de-duped per stage before clipping so
// duplicate sources don't double-count.
function stageBreakdown(samples, session) {
  const clippedTotal = (stage) => {
    let t = 0;
    for (const iv of unionIntervals(samples.filter((x) => x.stage === stage))) {
      const s = Math.max(iv.start, session.start);
      const e = Math.min(iv.end, session.end);
      if (e > s) t += e - s;
    }
    return t / MS_PER_MIN;
  };
  return {
    core: clippedTotal('C'),
    deep: clippedTotal('D'),
    rem: clippedTotal('R'),
    awake: clippedTotal('W'),
  };
}

export function buildSessions(samples) {
  const pick = (stages) => samples.filter((s) => stages.includes(s.stage));
  const asleep = unionIntervals(pick(['A', 'C', 'D', 'R']));
  const awake = unionIntervals(pick(['W']));
  const inBed = unionIntervals(pick(['B']));

  let coverage = subtractIntervals(asleep, awake);
  let inBedFallback = false;
  if (totalMin(coverage) === 0 && totalMin(inBed) > 0) {
    coverage = inBed;
    inBedFallback = true;
  }

  const sessions = [];
  for (const iv of coverage) {
    const last = sessions[sessions.length - 1];
    if (last && iv.start - last.end <= SESSION_GAP_MIN * MS_PER_MIN) {
      last.end = Math.max(last.end, iv.end);
      last.intervals.push(iv);
    } else {
      sessions.push({ start: iv.start, end: iv.end, intervals: [iv] });
    }
  }

  for (const s of sessions) {
    s.asleepMin = totalMin(s.intervals);
    s.stages = stageBreakdown(samples, s);
    s.hasStages = s.stages.core + s.stages.deep + s.stages.rem > 0;
    // Time in bed: full duration of In Bed records overlapping the session
    // (they usually start before sleep onset, so don't clip them).
    s.inBedMin = totalMin(inBed.filter((iv) => iv.start < s.end && iv.end > s.start));
    s.efficiency =
      !inBedFallback && s.inBedMin > 0
        ? Math.min(1, s.asleepMin / s.inBedMin)
        : null;
    const mid = new Date((s.start + s.end) / 2);
    s.midMin = minuteOfDay(mid);
    const midHour = s.midMin / 60;
    s.isNap = s.asleepMin < NAP_MAX_MIN && midHour >= NAP_HOURS.start && midHour < NAP_HOURS.end;
  }
  return { sessions, inBedFallback };
}

// nights[0] = today (i.e. last night's sleep, which ended this morning),
// nights[13] = 13 days ago. Missing nights have hasData=false and are
// treated as zero deficit by the debt math (gaps shouldn't read as debt).
export function assembleNights(samples, now = new Date(), days = 14) {
  const { sessions, inBedFallback } = buildSessions(samples);
  const byKey = new Map();
  for (const s of sessions) {
    const key = dateKey(s.end);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(s);
  }
  const nights = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const list = byKey.get(dateKey(date)) ?? [];
    const main = list
      .filter((s) => !s.isNap)
      .sort((a, b) => b.asleepMin - a.asleepMin)[0] ?? null;
    nights.push({
      date,
      key: dateKey(date),
      sessions: list,
      mainSession: main,
      naps: list.filter((s) => s.isNap),
      totalMin: list.reduce((t, s) => t + s.asleepMin, 0),
      hasData: list.length > 0,
    });
  }
  return { nights, sessions, inBedFallback };
}
