// charts.js — hand-rolled SVG chart builders.
//
// Color system (validated for CVD + contrast on the dark card surface):
//   MARK_A #6F82EC (indigo)  — sleep marks, energy fill
//   MARK_B #D96F30 (amber)   — debt marks, nap accents
// The brighter brand pastels (--accent/--glow) are reserved for strokes,
// glows and text accents; large filled marks use the validated pair.
// Identity is never color-alone: naps get a 2px surface gap + legend,
// missing nights are hollow-dashed, and every mark carries a tooltip.

export const MARK_A = '#6F82EC';
export const MARK_B = '#D96F30';
const ACCENT = '#8B9DFF';
const GLOW = '#FFB385';
const INK_FAINT = 'rgba(255,255,255,0.4)';
const GRID = 'rgba(255,255,255,0.09)';

export const CHART_W = 430;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function fmtDur(min) {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

export function fmtClock(date) {
  return new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const fmtDay = (date) => date.toLocaleDateString([], { month: 'short', day: 'numeric' });
const minuteOfDayLocal = (d) => d.getHours() * 60 + d.getMinutes();

// A bar anchored to the baseline with only its data end rounded.
function topRoundedBar(x, yTop, w, yBottom, r = 4, fill = MARK_A, extra = '') {
  const h = Math.max(1.5, yBottom - yTop);
  const rr = Math.min(r, w / 2, h);
  return `<path d="M ${x} ${yBottom}
    L ${x} ${(yTop + rr).toFixed(1)} Q ${x} ${yTop.toFixed(1)} ${(x + rr).toFixed(1)} ${yTop.toFixed(1)}
    L ${(x + w - rr).toFixed(1)} ${yTop.toFixed(1)} Q ${(x + w).toFixed(1)} ${yTop.toFixed(1)} ${(x + w).toFixed(1)} ${(yTop + rr).toFixed(1)}
    L ${(x + w).toFixed(1)} ${yBottom} Z" fill="${fill}" ${extra}/>`;
}

const hit = (x, y, w, h, tip) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="transparent" data-tip="${esc(tip)}"/>`;

// ------------------------------------------------------------- tooltips

// One shared tooltip element per container; charts opt in via data-tip.
export function attachChartTooltips(root) {
  let tipEl = root.querySelector(':scope > .chart-tip');
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'chart-tip';
    tipEl.hidden = true;
    root.appendChild(tipEl);
  }
  const move = (e) => {
    const target = e.target.closest('[data-tip]');
    if (!target) { tipEl.hidden = true; return; }
    tipEl.textContent = target.dataset.tip;
    tipEl.hidden = false;
    const r = root.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - r.left, 60), r.width - 60);
    tipEl.style.left = `${x}px`;
    tipEl.style.top = `${e.clientY - r.top - 14}px`;
  };
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerdown', move);
  root.addEventListener('pointerleave', () => { tipEl.hidden = true; });
}

// ------------------------------------------------------------- gauge

export function gaugeSVG(debtH, maxH = 15) {
  const pct = Math.min(debtH / maxH, 1) * 100;
  return `
    <svg viewBox="0 0 200 112" role="img" aria-label="Sleep debt ${debtH.toFixed(1)} hours">
      <defs>
        <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="${ACCENT}"/><stop offset="1" stop-color="${GLOW}"/>
        </linearGradient>
      </defs>
      <path class="gauge-track" d="M 20 102 A 80 80 0 0 1 180 102" pathLength="100"/>
      ${pct > 0.5 ? `<path class="gauge-value" stroke="url(#gaugeGrad)"
        d="M 20 102 A 80 80 0 0 1 180 102" pathLength="100"
        stroke-dasharray="0 100" data-sweep="${pct.toFixed(1)}"/>` : ''}
    </svg>`;
}

// -------------------------------------------------------- energy curve

export function energyCurveSVG({ points, zones, now, napSlot = null }) {
  const H = 158;
  const top = 14;
  const bottom = 126;
  const xm = (min) => 10 + (min / 1440) * 410;
  const x = (date) => xm(minuteOfDayLocal(date));
  const y = (v) => bottom - (v / 100) * (bottom - top);

  const dayStart = points[0].time;
  const sameDay = (d) => d.toDateString() === dayStart.toDateString();
  const clampX = (d) => Math.max(10, Math.min(420, sameDay(d) ? x(d) : d < dayStart ? 10 : 420));

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xm(i * 10).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(' ');
  const area = `${line} L 420 ${bottom} L 10 ${bottom} Z`;

  const bands = zones.map((z) => {
    const x0 = clampX(z.start);
    const x1 = clampX(z.end);
    if (x1 - x0 < 1) return '';
    const mel = z.id === 'melatonin';
    return `<rect x="${x0.toFixed(1)}" y="${top}" width="${(x1 - x0).toFixed(1)}" height="${bottom - top}"
      fill="${mel ? GLOW : '#FFFFFF'}" opacity="${mel ? 0.13 : 0.05}" rx="3"
      data-tip="${esc(`${z.label} · ${fmtClock(z.start)}–${fmtClock(z.end)}`)}"/>`;
  }).join('');

  let napMark = '';
  if (napSlot && sameDay(napSlot.start)) {
    const nx0 = x(napSlot.start);
    const nx1 = x(napSlot.end);
    napMark = `<rect x="${nx0.toFixed(1)}" y="${(bottom - 7).toFixed(1)}" width="${Math.max(6, nx1 - nx0).toFixed(1)}" height="7"
      rx="3.5" fill="${MARK_B}" data-tip="${esc(`Nap window · ${fmtClock(napSlot.start)}–${fmtClock(napSlot.end)}`)}"/>`;
  }

  let nowMark = '';
  if (sameDay(now)) {
    const nx = x(now);
    const idx = Math.min(points.length - 1, Math.round(minuteOfDayLocal(now) / 10));
    const ny = y(points[idx].value);
    nowMark = `
      <line x1="${nx.toFixed(1)}" y1="${top}" x2="${nx.toFixed(1)}" y2="${bottom}" stroke="${GLOW}" stroke-width="1.3" opacity="0.85"/>
      <circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="4.5" fill="${GLOW}"/>
      <circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="8" fill="${GLOW}" opacity="0.25" class="now-pulse"/>`;
  }

  // Invisible per-sample hit bands -> crosshair-style readout.
  const hits = points.map((p, i) => {
    if (i % 3 !== 0) return '';
    return hit(xm(i * 10) - 6.2, top, 12.4, bottom - top, `${fmtClock(p.time)} · energy ${Math.round(p.value)}`);
  }).join('');

  const labels = ['12 AM', '6 AM', '12 PM', '6 PM', '12 AM'];
  const ticks = [0, 360, 720, 1080, 1440].map((m, i) =>
    `<text x="${xm(m).toFixed(1)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}"
      font-size="9.5" fill="${INK_FAINT}">${labels[i]}</text>`).join('');

  return `
    <svg viewBox="0 0 ${CHART_W} ${H}" role="img" aria-label="Today's energy curve">
      <defs>
        <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${MARK_A}" stop-opacity="0.42"/>
          <stop offset="1" stop-color="${MARK_A}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${bands}
      <path d="${area}" fill="url(#curveFill)"/>
      <path class="curve-line" d="${line}" fill="none" stroke="${ACCENT}" stroke-width="2.2" stroke-linejoin="round"/>
      ${napMark}
      ${nowMark}
      ${ticks}
      ${hits}
    </svg>`;
}

// -------------------------------------------- duration bars (any range)

// Trailing 7-night average (missing nights skipped, needs >=3 real nights).
function movingAvg(chrono, window = 7) {
  return chrono.map((_, i) => {
    const slice = chrono.slice(Math.max(0, i - window + 1), i + 1).filter((n) => n.hasData);
    if (slice.length < 3) return null;
    return slice.reduce((t, n) => t + n.totalMin, 0) / slice.length;
  });
}

export function durationBarsSVG(nights, needMin, { height = 172, labelEvery = 1, detail = false } = {}) {
  const H = height;
  const top = 16;
  const bottom = H - 32;
  const x0 = 34;
  const x1 = 416;
  const n = nights.length;
  const slot = (x1 - x0) / n;
  const barW = Math.max(3, Math.min(18, slot - Math.max(2, slot * 0.32)));
  const chrono = [...nights].reverse();
  const maxMin = Math.max(needMin * 1.25, ...chrono.map((d) => d.totalMin), 1);
  const y = (min) => bottom - (min / maxMin) * (bottom - top);
  const cx = (i) => x0 + slot * i + slot / 2;

  let bars = '';
  let labels = '';
  for (let i = 0; i < n; i++) {
    const night = chrono[i];
    const bx = cx(i) - barW / 2;
    const tipDate = fmtDay(night.date);
    if (!night.hasData) {
      // The dashed "missing" outline only reads at wide slots; at dense
      // ranges an absent bar says the same thing without the noise.
      if (slot >= 12) {
        bars += `<rect x="${bx.toFixed(1)}" y="${y(needMin).toFixed(1)}" width="${barW.toFixed(1)}"
          height="${(bottom - y(needMin)).toFixed(1)}" rx="4" fill="none"
          stroke="rgba(255,255,255,0.22)" stroke-width="1" stroke-dasharray="4 3"/>`;
      }
      bars += hit(cx(i) - slot / 2, top, slot, bottom - top, `${tipDate} · no data`);
    } else {
      const napMin = night.naps.reduce((t, s) => t + s.asleepMin, 0);
      const mainMin = night.totalMin - napMin;
      if (mainMin > 0) bars += topRoundedBar(bx, y(mainMin), barW, bottom, 4, MARK_A);
      if (napMin > 0) {
        const napTop = y(night.totalMin);
        const napBottom = y(mainMin) - 2; // 2px surface gap between segments
        if (napBottom - napTop > 1) {
          bars += topRoundedBar(bx, napTop, barW, napBottom, 3, MARK_B, 'opacity="0.9"');
        }
      }
      const tip = `${tipDate} · ${fmtDur(night.totalMin)}${napMin > 0 ? ` (nap ${fmtDur(napMin)})` : ''}`;
      bars += hit(cx(i) - slot / 2, top, slot, bottom - top, tip);
    }
    if (i % labelEvery === 0 && slot * labelEvery > 13) {
      const wd = n <= 16
        ? night.date.toLocaleDateString([], { weekday: 'narrow' })
        : fmtDay(night.date);
      labels += `<text x="${cx(i).toFixed(1)}" y="${H - 16}" text-anchor="middle" font-size="9"
        fill="rgba(255,255,255,${i === n - 1 ? 0.85 : 0.38})">${wd}</text>`;
    }
  }

  let overlay = '';
  if (detail) {
    const avg = movingAvg(chrono);
    const pts = avg
      .map((v, i) => (v == null ? null : `${cx(i).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean);
    if (pts.length > 1) {
      const lastVal = [...avg].reverse().find((v) => v != null);
      overlay = `
        <polyline points="${pts.join(' ')}" fill="none" stroke="rgba(255,255,255,0.75)"
          stroke-width="1.6" stroke-linejoin="round"/>
        <text x="${x1}" y="${(y(lastVal) - 6).toFixed(1)}" text-anchor="end" font-size="9"
          fill="rgba(255,255,255,0.75)">7-night avg ${fmtDur(lastVal)}</text>`;
    }
    const withData = chrono.map((n, i) => ({ n, i })).filter(({ n }) => n.hasData);
    if (withData.length >= 4) {
      const best = withData.reduce((a, b) => (b.n.totalMin > a.n.totalMin ? b : a));
      const worst = withData.reduce((a, b) => (b.n.totalMin < a.n.totalMin ? b : a));
      for (const { n: night, i } of [best, worst]) {
        overlay += `<text x="${cx(i).toFixed(1)}" y="${(y(night.totalMin) - 5).toFixed(1)}" text-anchor="middle"
          font-size="8.5" fill="${INK_FAINT}">${fmtDur(night.totalMin)}</text>`;
      }
    }
  }

  return `
    <svg viewBox="0 0 ${CHART_W} ${H}" role="img" aria-label="Nightly sleep vs need">
      <line x1="${x0}" y1="${y(needMin).toFixed(1)}" x2="${x1}" y2="${y(needMin).toFixed(1)}"
        stroke="rgba(255,255,255,0.35)" stroke-width="1" stroke-dasharray="5 4"/>
      <text x="${x0 - 5}" y="${(y(needMin) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="${INK_FAINT}">need</text>
      ${bars}
      ${overlay}
      ${labels}
    </svg>`;
}

// ------------------------------------------------------ debt trend line

export function debtTrendSVG(series, nights, { height = 150, detail = false } = {}) {
  const H = height;
  const top = 14;
  const bottom = H - 30;
  const x0 = 34;
  const x1 = 416;
  const n = series.length;
  const chronoSeries = [...series].reverse();
  const chronoNights = [...nights].reverse();
  const maxV = Math.max(...series, 300) * 1.15;
  const y = (min) => bottom - (min / maxV) * (bottom - top);
  const cx = (i) => x0 + ((x1 - x0) / Math.max(1, n - 1)) * i;

  const line = chronoSeries.map((v, i) => `${i === 0 ? 'M' : 'L'} ${cx(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L ${x1} ${bottom} L ${x0} ${bottom} Z`;
  const goodY = y(300);

  const hits = chronoSeries.map((v, i) =>
    hit(cx(i) - (x1 - x0) / n / 2, top, (x1 - x0) / n, bottom - top,
      `${fmtDay(chronoNights[i].date)} · debt ${(v / 60).toFixed(1)}h`)).join('');

  return `
    <svg viewBox="0 0 ${CHART_W} ${H}" role="img" aria-label="Sleep debt trend">
      <defs>
        <linearGradient id="debtFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${MARK_B}" stop-opacity="0.35"/>
          <stop offset="1" stop-color="${MARK_B}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${detail ? `<rect x="${x0}" y="${goodY.toFixed(1)}" width="${x1 - x0}" height="${(bottom - goodY).toFixed(1)}"
        fill="rgba(139,157,255,0.07)"/>
      <text x="${x1 - 4}" y="${(bottom - 5).toFixed(1)}" text-anchor="end" font-size="8.5"
        fill="rgba(139,157,255,0.6)">good zone</text>` : ''}
      <line x1="${x0}" y1="${goodY.toFixed(1)}" x2="${x1}" y2="${goodY.toFixed(1)}"
        stroke="rgba(255,255,255,0.3)" stroke-width="1" stroke-dasharray="5 4"/>
      <text x="${x0 - 5}" y="${(goodY + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="${INK_FAINT}">5h</text>
      <path d="${area}" fill="url(#debtFill)"/>
      <path class="curve-line" d="${line}" fill="none" stroke="${MARK_B}" stroke-width="2" stroke-linejoin="round"/>
      ${detail ? peakMarker(chronoSeries, cx, y) : ''}
      ${hits}
    </svg>`;
}

function peakMarker(chronoSeries, cx, y) {
  let maxI = 0;
  chronoSeries.forEach((v, i) => { if (v > chronoSeries[maxI]) maxI = i; });
  const v = chronoSeries[maxI];
  if (v < 60) return '';
  return `<circle cx="${cx(maxI).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.4" fill="${MARK_B}"
      stroke="rgba(255,255,255,0.85)" stroke-width="1.4"/>
    <text x="${cx(maxI).toFixed(1)}" y="${(y(v) - 8).toFixed(1)}" text-anchor="middle" font-size="9"
      fill="rgba(255,255,255,0.75)">peak ${(v / 60).toFixed(1)}h</text>`;
}

// -------------------------------------------------- sleep times (bands)

// Each night as a vertical capsule from bedtime to wake on an 8 PM -> noon
// axis; naps as dots. The tightness of the band IS the consistency story.
export function sleepTimesSVG(nights, { height = 190, detail = false } = {}) {
  const H = height;
  const top = 14;
  const bottom = H - 30;
  const x0 = 34;
  const x1 = 416;
  const n = nights.length;
  const slot = (x1 - x0) / n;
  const barW = Math.max(3, Math.min(10, slot - 4));
  const chrono = [...nights].reverse();
  // minute-of-day mapped onto 20:00 (top) .. 12:00 next day (bottom)
  const yOf = (min) => {
    const m = Math.max(0, Math.min(960, ((min - 1200) % 1440 + 1440) % 1440));
    return top + (m / 960) * (bottom - top);
  };
  const cx = (i) => x0 + slot * i + slot / 2;

  const guides = [{ m: 1320, t: '10 PM' }, { m: 0, t: '12 AM' }, { m: 360, t: '6 AM' }, { m: 600, t: '10 AM' }]
    .map(({ m, t }) => {
      const gy = yOf(m);
      return `<line x1="${x0}" y1="${gy.toFixed(1)}" x2="${x1}" y2="${gy.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>
        <text x="${x0 - 5}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="${INK_FAINT}">${t}</text>`;
    }).join('');

  let underlay = '';
  let marks = '';
  const midPts = [];
  for (let i = 0; i < n; i++) {
    const night = chrono[i];
    if (detail && [0, 6].includes(night.date.getDay())) {
      underlay += `<rect x="${(cx(i) - slot / 2).toFixed(1)}" y="${top}" width="${slot.toFixed(1)}"
        height="${bottom - top}" fill="rgba(255,255,255,0.045)"/>`;
    }
    if (detail && night.mainSession) {
      midPts.push(`${cx(i).toFixed(1)},${yOf(night.mainSession.midMin).toFixed(1)}`);
    }
    const main = night.mainSession;
    if (main) {
      const yTop = yOf(minuteOfDayLocal(new Date(main.start)));
      const yBot = yOf(minuteOfDayLocal(new Date(main.end)));
      const [a, b] = yTop <= yBot ? [yTop, yBot] : [yBot, yTop];
      marks += `<rect x="${(cx(i) - barW / 2).toFixed(1)}" y="${a.toFixed(1)}" width="${barW.toFixed(1)}"
        height="${Math.max(4, b - a).toFixed(1)}" rx="${(barW / 2).toFixed(1)}" fill="${MARK_A}" opacity="0.92"/>`;
      marks += hit(cx(i) - slot / 2, top, slot, bottom - top,
        `${fmtDay(night.date)} · ${fmtClock(new Date(main.start))} – ${fmtClock(new Date(main.end))}`);
    }
    for (const nap of night.naps) {
      marks += `<circle cx="${cx(i).toFixed(1)}" cy="${yOf(nap.midMin).toFixed(1)}" r="3.4" fill="${MARK_B}"
        data-tip="${esc(`${fmtDay(night.date)} · nap ${fmtDur(nap.asleepMin)}`)}"/>`;
    }
  }

  const drift = detail && midPts.length > 1
    ? `<polyline points="${midPts.join(' ')}" fill="none" stroke="${GLOW}" stroke-width="1.2"
        stroke-dasharray="2 3" opacity="0.7"/>`
    : '';

  return `
    <svg viewBox="0 0 ${CHART_W} ${H}" role="img" aria-label="Sleep timing by night">
      ${underlay}
      ${guides}
      ${drift}
      ${marks}
    </svg>`;
}

// ------------------------------------------------------------- day map

// Horizontal timeline of today: busy blocks, the dip window, a suggested
// nap slot, and the "now" marker. Runs 6:00 -> 24:00.
export function dayMapSVG({ events = [], napSlot = null, dip = null, now, bedtime = null }) {
  const H = 96;
  const from = 6 * 60;
  const to = 24 * 60;
  const x0 = 12;
  const x1 = 418;
  const xm = (min) => x0 + ((Math.max(from, Math.min(to, min)) - from) / (to - from)) * (x1 - x0);
  const x = (date) => xm(minuteOfDayLocal(date));
  const trackY = 34;
  const trackH = 22;

  const dipBand = dip
    ? `<rect x="${x(dip.start).toFixed(1)}" y="${trackY - 8}" width="${(x(dip.end) - x(dip.start)).toFixed(1)}"
        height="${trackH + 16}" rx="6" fill="${MARK_A}" opacity="0.16"
        data-tip="${esc(`Afternoon dip · ${fmtClock(dip.start)}–${fmtClock(dip.end)}`)}"/>`
    : '';

  const blocks = events.map((e) => {
    const ex0 = x(e.start);
    const ex1 = x(e.end);
    if (ex1 - ex0 < 2) return '';
    return `<rect x="${ex0.toFixed(1)}" y="${trackY}" width="${(ex1 - ex0).toFixed(1)}" height="${trackH}"
      rx="6" fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.28)" stroke-width="1"
      data-tip="${esc(`${e.title} · ${fmtClock(e.start)}–${fmtClock(e.end)}`)}"/>`;
  }).join('');

  const nap = napSlot
    ? `<rect x="${x(napSlot.start).toFixed(1)}" y="${trackY + 3}" width="${Math.max(8, x(napSlot.end) - x(napSlot.start)).toFixed(1)}"
        height="${trackH - 6}" rx="6" fill="${MARK_B}"
        data-tip="${esc(`Suggested nap · ${fmtClock(napSlot.start)}–${fmtClock(napSlot.end)}`)}"/>`
    : '';

  const bedMark = bedtime && minuteOfDayLocal(bedtime) >= from
    ? `<g data-tip="${esc(`Recommended bedtime · ${fmtClock(bedtime)}`)}">
        <line x1="${x(bedtime).toFixed(1)}" y1="${trackY - 10}" x2="${x(bedtime).toFixed(1)}" y2="${trackY + trackH + 10}"
          stroke="${ACCENT}" stroke-width="1.4" stroke-dasharray="3 3"/>
        <text x="${x(bedtime).toFixed(1)}" y="${trackY - 14}" text-anchor="middle" font-size="8.5" fill="${INK_FAINT}">bed</text>
      </g>`
    : '';

  const nowMark = `<line x1="${x(now).toFixed(1)}" y1="${trackY - 10}" x2="${x(now).toFixed(1)}" y2="${trackY + trackH + 10}"
      stroke="${GLOW}" stroke-width="1.4"/>
    <circle cx="${x(now).toFixed(1)}" cy="${trackY - 10}" r="3" fill="${GLOW}"/>`;

  const ticks = [6, 9, 12, 15, 18, 21, 24].map((h) =>
    `<text x="${xm(h * 60).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="9" fill="${INK_FAINT}">
      ${h === 12 ? '12 PM' : h === 24 ? '12 AM' : h > 12 ? `${h - 12} PM` : `${h} AM`}</text>`).join('');

  return `
    <svg viewBox="0 0 ${CHART_W} ${H}" role="img" aria-label="Today's schedule map">
      <rect x="${x0}" y="${trackY}" width="${x1 - x0}" height="${trackH}" rx="7" fill="rgba(255,255,255,0.07)"/>
      ${dipBand}${blocks}${nap}${bedMark}${nowMark}${ticks}
    </svg>`;
}

// ------------------------------------------------------------ stage bar

export function stagebarHTML(stages) {
  const total = stages.deep + stages.core + stages.rem + stages.awake;
  if (total <= 0) return '';
  const w = (v) => ((v / total) * 100).toFixed(1);
  return `
    <div class="stagebar" role="img" aria-label="Sleep stages">
      <span class="stage-deep" style="width:${w(stages.deep)}%"></span>
      <span class="stage-core" style="width:${w(stages.core)}%"></span>
      <span class="stage-rem" style="width:${w(stages.rem)}%"></span>
      <span class="stage-awake" style="width:${w(stages.awake)}%"></span>
    </div>
    <div class="stage-legend">
      <span><i class="stage-deep"></i>Deep ${fmtDur(stages.deep)}</span>
      <span><i class="stage-core"></i>Core ${fmtDur(stages.core)}</span>
      <span><i class="stage-rem"></i>REM ${fmtDur(stages.rem)}</span>
      <span><i class="stage-awake"></i>Awake ${fmtDur(stages.awake)}</span>
    </div>`;
}
