// greeting.js — the personality layer. Picks a salutation and a short
// quip based on time of day and how the user has been sleeping, with a
// gently sarcastic streak for late nights, all-nighters, and lie-ins.
// Pure module: no DOM. Picks are stable for a given day (hash of the
// date + bucket) so the header doesn't rewrite itself on every render.

import { minuteOfDay, dateKey } from './sessions.js';

const MS_PER_MIN = 60000;

const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const pick = (arr, seed) => arr[hashStr(seed) % arr.length];

const fmtClock = (d) =>
  new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const fmtDur = (min) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

// ---------------------------------------------------------------- quips

const QUIPS = {
  timerSleep: [
    'This app works best with your eyes closed.',
    'Checking the sleep app instead of sleeping — noted.',
    'The timer is running. The sleeping part is on you.',
  ],
  timerNap: [
    'That nap is not going to take itself.',
    'Nap timer says go. Your phone says goodbye.',
  ],
  allNighter: [
    'No sleep on the books last night. Bold strategy.',
    'All-nighter, or did the tracking sleep on the job?',
    'Your pillow has filed a missing-persons report.',
  ],
  longSleep: (min) => [
    `${fmtDur(min)}. The mattress won that round.`,
    `${fmtDur(min)} — less of a sleep, more of a hibernation.`,
    'Your sleep debt just watched you lap it. Twice.',
  ],
  lateNight: (bedAt) => [
    `Bed at ${bedAt} — the sequel nobody asked for.`,
    `${bedAt} bedtime. You and midnight clearly had plans.`,
    `Asleep at ${bedAt}. The melatonin window sends its regards.`,
  ],
  shortSleep: (min) => [
    `${fmtDur(min)} of sleep. Your future self has questions.`,
    `${fmtDur(min)}? That's a nap with ambitions.`,
    `Running on ${fmtDur(min)} — handle with care today.`,
  ],
  pastBedtime: (ago) => [
    `Your recommended bedtime was ${ago} ago. Just saying.`,
    `${ago} past bedtime. Tomorrow-you is taking notes.`,
    'The melatonin window waved goodbye a while back.',
  ],
  nearBedtime: (at) => [
    `Wind-down time — bedtime lands at ${at}.`,
    `${at} is the bedtime to beat. Screens down soon; yes, this one too.`,
    'The melatonin window is warming up. Don’t leave it hanging.',
  ],
  justWokeGood: [
    'Debt in the good zone — whatever you’re doing, keep doing it.',
    'Fresh sleep, low debt. Today is yours.',
    'Woke up on the right side of the ledger.',
  ],
  justWoke: (min) => [
    `Fresh off ${fmtDur(min)} — the grogginess burns off within the hour.`,
    `${fmtDur(min)} banked. Coffee is optional, sunlight isn’t.`,
  ],
  napWindow: [
    'Prime nap real estate for the next little while.',
    'The afternoon dip is open — a short nap pays real dividends.',
  ],
  napped: [
    'Nap logged. Officially operating at bonus energy.',
    'A nap a day keeps the debt away. Well, some of it.',
  ],
  goodZone: [
    'Sleep debt: handled. Carry on.',
    'The good zone suits you.',
  ],
  highDebt: [
    'That debt number would like a word — tonight, ideally.',
    'Your sleep debt is compounding. The bank recommends an early night.',
  ],
  morning: ['Ready when you are.', 'One check-in, then coffee.'],
  afternoon: ['Cruising altitude. Mind the dip.', 'Halfway there — pace yourself.'],
  evening: ['The wind-down approaches.', 'Evenings are for descents, not sprints.'],
};

// ------------------------------------------------------------- greeting

// Inputs: name (string|null), now (Date), nights (14-night array),
// plan ({bedtime}), schedule ({wake, zones}), timerKind ('sleep'|'nap'|null),
// debtMin, needMin.
export function pickGreeting({
  name = null,
  now = new Date(),
  nights = [],
  plan = null,
  schedule = null,
  timerKind = null,
  debtMin = 0,
  needMin = 480,
} = {}) {
  const hour = now.getHours() + now.getMinutes() / 60;
  const seedBase = dateKey(now);
  const withSeed = (bucket, arr) => pick(arr, seedBase + bucket);

  const salutation =
    hour < 4 ? (name ? `Still up, ${name}?` : 'Still up?')
      : hour < 12 ? (name ? `Morning, ${name}` : 'Good morning')
        : hour < 17 ? (name ? `Afternoon, ${name}` : 'Good afternoon')
          : (name ? `Evening, ${name}` : 'Good evening');

  const lastNight = nights[0] ?? null;
  const main = lastNight?.mainSession ?? null;
  const wakeAgoMin = main ? (now.getTime() - main.end) / MS_PER_MIN : null;
  const bedMin = plan ? (plan.bedtime.getTime() - now.getTime()) / MS_PER_MIN : null;

  let quip;
  if (timerKind === 'sleep') {
    quip = withSeed('ts', QUIPS.timerSleep);
  } else if (timerKind === 'nap') {
    quip = withSeed('tn', QUIPS.timerNap);
  } else if (lastNight && !lastNight.hasData && hour >= 8 && hour < 18 && nights[1]?.hasData) {
    quip = withSeed('an', QUIPS.allNighter);
  } else if (lastNight?.hasData && lastNight.totalMin >= Math.max(needMin + 90, 600)) {
    quip = withSeed('ls', QUIPS.longSleep(lastNight.totalMin));
  } else if (main && (() => { const m = minuteOfDay(new Date(main.start)); return m >= 90 && m < 300; })()
      && hour < 17) {
    quip = withSeed('ln', QUIPS.lateNight(fmtClock(new Date(main.start))));
  } else if (lastNight?.hasData && lastNight.totalMin < 300 && hour < 17) {
    quip = withSeed('ss', QUIPS.shortSleep(lastNight.totalMin));
  } else if (bedMin != null && bedMin < -30 && (hour >= 21.5 || hour < 4)) {
    quip = withSeed('pb', QUIPS.pastBedtime(fmtDur(-bedMin)));
  } else if (bedMin != null && bedMin >= -30 && bedMin <= 90 && hour >= 19) {
    quip = withSeed('nb', QUIPS.nearBedtime(fmtClock(plan.bedtime)));
  } else if (wakeAgoMin != null && wakeAgoMin >= 0 && wakeAgoMin < 75) {
    quip = debtMin <= 300
      ? withSeed('jg', QUIPS.justWokeGood)
      : withSeed('jw', QUIPS.justWoke(lastNight.totalMin));
  } else if (schedule && (() => {
    const dip = schedule.zones?.find((z) => z.id === 'dip');
    return dip && now >= dip.start && now <= dip.end;
  })()) {
    quip = withSeed('nw', QUIPS.napWindow);
  } else if ((lastNight?.naps?.length ?? 0) > 0 && hour >= 12 && hour < 21) {
    quip = withSeed('np', QUIPS.napped);
  } else if (debtMin > 600) {
    quip = withSeed('hd', QUIPS.highDebt);
  } else if (debtMin <= 120 && nights.some((n) => n.hasData)) {
    quip = withSeed('gz', QUIPS.goodZone);
  } else {
    quip = hour < 12
      ? withSeed('dm', QUIPS.morning)
      : hour < 17 ? withSeed('da', QUIPS.afternoon) : withSeed('de', QUIPS.evening);
  }

  return { salutation, quip };
}
