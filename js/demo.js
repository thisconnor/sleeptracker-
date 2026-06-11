// demo.js — synthetic datasets, emitted as raw d= rows so demo mode
// exercises the exact same parse path as real Shortcut data.
// Pure module: no DOM access.

const MS_PER_MIN = 60000;

// Small deterministic PRNG so the demo looks the same every load.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n) => String(n).padStart(2, '0');

export function fmtStamp(d) {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

const addMin = (d, m) => new Date(d.getTime() + m * MS_PER_MIN);
const row = (start, end, value) => `${fmtStamp(start)},${fmtStamp(end)},${value}`;

// Shared night scaffolding: bed/wake times for night i (0 = last night,
// ending today), with one rough night and one oversleep night.
function nightShape(i, now, rnd) {
  const wakeDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
  const wakeMin = 6 * 60 + 30 + Math.floor(rnd() * 40); // wake 6:30-7:10
  let durMin = 7 * 60 + 10 + Math.floor(rnd() * 80); // ~7:10-8:30 asleep
  if (i === 2) durMin = 9 * 60 + 10; // oversleep night
  if (i === 6) durMin = 5 * 60 + 20; // rough night
  const wake = addMin(wakeDay, wakeMin);
  const sleepStart = addMin(wake, -durMin);
  return { wake, sleepStart, durMin };
}

// iPhone-only: an "In Bed" span per night with an "Asleep" span inside it.
// Two nights missing (forgot sleep mode), one afternoon nap.
function iphoneRows(now, rnd) {
  const rows = [];
  for (let i = 13; i >= 0; i--) {
    if (i === 4 || i === 9) continue;
    const { wake, sleepStart } = nightShape(i, now, rnd);
    const bed = addMin(sleepStart, -18);
    rows.push(row(bed, addMin(wake, 4), 'In Bed'));
    rows.push(row(sleepStart, addMin(wake, -3), 'Asleep'));
    if (i === 1) {
      const nap = addMin(new Date(wake.getFullYear(), wake.getMonth(), wake.getDate()), 14 * 60 + 10);
      rows.push(row(nap, addMin(nap, 45), 'Asleep'));
    }
  }
  return rows;
}

// Apple Watch: full stage tiling per night, PLUS a duplicate iPhone-style
// "Asleep" span covering the same night (exercises source de-duplication),
// plus real "Awake" gaps.
function watchRows(now, rnd) {
  const rows = [];
  const pattern = [
    ['Core', 50], ['Deep', 22], ['Core', 35], ['REM', 24], ['Awake', 4],
    ['Core', 45], ['Deep', 14], ['REM', 28],
  ];
  for (let i = 13; i >= 0; i--) {
    if (i === 9) continue; // one missing night
    const { wake, sleepStart } = nightShape(i, now, rnd);
    rows.push(row(addMin(sleepStart, -15), addMin(wake, 5), 'In Bed'));
    rows.push(row(sleepStart, wake, 'Asleep')); // duplicate from iPhone source
    let t = sleepStart;
    let k = Math.floor(rnd() * pattern.length);
    while (t < wake) {
      const [value, dur] = pattern[k % pattern.length];
      const end = new Date(Math.min(addMin(t, dur).getTime(), wake.getTime()));
      rows.push(row(t, end, value));
      t = end;
      k++;
    }
    if (i === 1) {
      const nap = addMin(new Date(wake.getFullYear(), wake.getMonth(), wake.getDate()), 14 * 60);
      rows.push(row(nap, addMin(nap, 40), 'Core'));
    }
  }
  return rows;
}

// Messy: overlapping duplicates, mixed separators, malformed rows, an
// out-of-window row, unknown stage names. The parser should shrug it off.
function messyRows(now, rnd) {
  const rows = [];
  for (let i = 6; i >= 0; i--) {
    const { wake, sleepStart } = nightShape(i, now, rnd);
    rows.push(row(sleepStart, addMin(wake, -5), 'Asleep'));
    rows.push(row(addMin(sleepStart, 3), wake, 'ASLEEP')); // overlapping duplicate
    rows.push(`${fmtStamp(addMin(sleepStart, 10))}|${fmtStamp(addMin(wake, -60))}|Asleep`);
  }
  rows.push('garbage row');
  rows.push('202601010000,,Asleep'); // missing end
  const old = addMin(now, -40 * 24 * 60);
  rows.push(row(old, addMin(old, 480), 'Asleep')); // out of window
  const { wake, sleepStart } = nightShape(3, now, rnd);
  rows.push(row(wake, sleepStart, 'Asleep')); // end before start
  rows.push(row(addMin(sleepStart, 60), addMin(sleepStart, 90), 'Mystery Stage'));
  return rows;
}

export function demoRows(kind = 'watch', now = new Date()) {
  const rnd = mulberry32(kind === 'iphone' ? 7 : kind === 'messy' ? 13 : 42);
  const make = kind === 'iphone' ? iphoneRows : kind === 'messy' ? messyRows : watchRows;
  return make(now, rnd).join(';');
}

export function makeDemoFragment(kind = 'watch', now = new Date()) {
  return `v=1&d=${encodeURIComponent(demoRows(kind, now))}`;
}
