// parse.js — turns the URL fragment (or pasted text) into sleep samples.
// Pure module: no DOM access, runs in node and the browser.
//
// Fragment format (v1):  #v=1&need=480&d=<rows>
//   need  sleep need in minutes (optional)
//   d     ;-separated rows of  start,end,value
//         timestamps are local-time yyyyMMddHHmm (what the Shortcut emits)
//         value is the raw Health sleep value text ("In Bed", "Asleep",
//         "Core", "Deep", "REM", "Awake" — varies by iOS version)
//   #demo (or demo=iphone|watch|messy) loads a synthetic dataset

const MS_PER_DAY = 86400000;
const MS_PER_HOUR = 3600000;

// Window samples must fall in: a hair more than the 14 days the Shortcut
// fetches, with slack for clock skew.
const WINDOW_PAST_DAYS = 16;
const WINDOW_FUTURE_MS = MS_PER_HOUR;

// Map a raw Health sleep value to a one-letter stage code.
// B=in bed, A=asleep (unspecified), C=core, D=deep, R=rem, W=awake.
// Matching is by substring so "Asleep (Deep)", "asleepREM", "CORE" all work;
// order matters: stage names must win over the generic "asleep".
export function classifyStage(raw) {
  const s = String(raw ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return 'A';
  if (s.includes('inbed')) return 'B';
  if (s.includes('deep')) return 'D';
  if (s.includes('rem')) return 'R';
  if (s.includes('core')) return 'C';
  if (s.includes('wake')) return 'W';
  return 'A';
}

// Parse "202606110702" (local time) or, as a fallback, anything Date.parse
// accepts after stripping Shortcuts' " at " infix.
export function parseTimestamp(text) {
  const s = String(text ?? '').trim();
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);
  if (m) {
    const [, y, mo, d, h, mi] = m;
    if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59) return null;
    return new Date(+y, +mo - 1, +d, +h, +mi);
  }
  const t = Date.parse(s.replace(/\bat\b/i, ''));
  return Number.isNaN(t) ? null : new Date(t);
}

// Parse the d= payload. Tolerant: rows split on ";" or newlines, fields on
// "," or "|"; malformed rows are skipped and counted, never fatal.
export function parseRows(text, now = new Date()) {
  const samples = [];
  let skipped = 0;
  const lo = now.getTime() - WINDOW_PAST_DAYS * MS_PER_DAY;
  const hi = now.getTime() + WINDOW_FUTURE_MS;
  for (const row of String(text ?? '').split(/[;\n]+/)) {
    const r = row.trim();
    if (!r) continue;
    const parts = r.split(/[|,]/).map((p) => p.trim());
    if (parts.length < 3) { skipped++; continue; }
    const start = parseTimestamp(parts[0]);
    const end = parseTimestamp(parts[1]);
    if (!start || !end) { skipped++; continue; }
    const dur = end.getTime() - start.getTime();
    if (dur <= 0 || dur > 24 * MS_PER_HOUR) { skipped++; continue; }
    if (end.getTime() < lo || start.getTime() > hi) { skipped++; continue; }
    samples.push({ start, end, stage: classifyStage(parts.slice(2).join(' ')) });
  }
  samples.sort((a, b) => a.start - b.start);
  return { samples, skipped };
}

const emptyResult = () => ({ demo: null, needRaw: null, samples: [], skipped: 0 });

// Parse a fragment string (leading "#" optional).
export function parseFragment(hash, now = new Date()) {
  const h = String(hash ?? '').replace(/^#/, '').trim();
  if (!h) return emptyResult();
  if (!h.includes('=')) {
    if (/^demo$/i.test(h)) return { ...emptyResult(), demo: 'default' };
    const { samples, skipped } = parseRows(decodeURIComponent(h), now);
    return { ...emptyResult(), samples, skipped };
  }
  const params = new URLSearchParams(h);
  const result = emptyResult();
  if (params.has('demo')) result.demo = params.get('demo') || 'default';
  if (params.has('need')) result.needRaw = params.get('need');
  if (params.has('d')) {
    const { samples, skipped } = parseRows(params.get('d'), now);
    result.samples = samples;
    result.skipped = skipped;
  }
  return result;
}

// Paste-box fallback: accepts a full URL, a bare fragment, or bare rows.
export function parseAnyInput(text, now = new Date()) {
  const t = String(text ?? '').trim();
  if (!t) return emptyResult();
  const hashIdx = t.indexOf('#');
  if (hashIdx >= 0) return parseFragment(t.slice(hashIdx + 1), now);
  if (/(^|&)(d|need|demo)=/.test(t)) return parseFragment(t, now);
  const { samples, skipped } = parseRows(t, now);
  return { ...emptyResult(), samples, skipped };
}

// Rebuild a canonical fragment from pasted text so it can live in the URL.
export function canonicalFragment(text) {
  const t = String(text ?? '').trim();
  if (!t) return '';
  const hashIdx = t.indexOf('#');
  if (hashIdx >= 0) return t.slice(hashIdx + 1);
  if (/(^|&)(d|need|demo)=/.test(t)) return t;
  return `v=1&d=${encodeURIComponent(t)}`;
}
