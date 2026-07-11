// streaks.js — good-zone streak math. Pure module: no DOM.
//
// A streak night is one where sleep was actually recorded AND the debt
// reading that morning was in the good zone (≤5h). A night with no data
// breaks the streak — the streak rewards both sleeping well and showing up.

const GOOD_MAX_MIN = 300;

// nights and series are newest-first and index-aligned (nights[i] with
// series[i] = the debt reading on nights[i].date's morning).
export function goodZoneStreaks(nights, series) {
  const ok = (i) => nights[i]?.hasData && (series[i] ?? Infinity) <= GOOD_MAX_MIN;

  let current = 0;
  // Today's night may simply not be synced yet — a gap at index 0 doesn't
  // break yesterday's streak, it just doesn't extend it.
  let i = 0;
  if (!nights[0]?.hasData && nights[1]?.hasData) i = 1;
  while (i < nights.length && ok(i)) { current++; i++; }

  let best = 0;
  let run = 0;
  for (let j = 0; j < nights.length; j++) {
    if (ok(j)) { run++; best = Math.max(best, run); } else { run = 0; }
  }
  return { current, best };
}

export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 100];

// What deserves a celebration today, if anything.
// Returns { id, message } or null; `id` is stable so the caller can make
// sure each event only fires once per day.
export function celebrationFor({ debtMin, streaks, hasAnyData }) {
  if (!hasAnyData) return null;
  if (debtMin < 30) {
    return { id: 'zero-debt', message: 'Sleep debt: zero. The ledger is clean ✦' };
  }
  if (streaks && STREAK_MILESTONES.includes(streaks.current)) {
    const record = streaks.current >= streaks.best ? ' — a personal best' : '';
    return {
      id: `streak-${streaks.current}`,
      message: `${streaks.current} good-zone nights in a row${record} ✦`,
    };
  }
  return null;
}
