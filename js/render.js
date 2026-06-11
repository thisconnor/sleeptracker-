// render.js — all DOM and SVG rendering. The only module besides main.js
// that touches the document.

const $ = (id) => document.getElementById(id);

const ACCENT = '#8B9DFF';
const GLOW = '#FFB385';

// Shared horizontal geometry so the history and consistency columns align.
const PLOT = { x0: 34, x1: 416 };

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

const minuteOfDayLocal = (d) => d.getHours() * 60 + d.getMinutes();

// ------------------------------------------------------------- views

export function showView(view) {
  $('empty').hidden = view !== 'empty';
  $('dashboard').hidden = view !== 'dashboard';
}

export function renderHeader(now, freshness) {
  const h = now.getHours();
  const greeting = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  $('greeting').textContent = greeting;
  let dateline = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  if (freshness) {
    const sameDay = freshness.toDateString() === now.toDateString();
    dateline += ` · data through ${sameDay ? fmtClock(freshness) : freshness.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  }
  $('dateline').textContent = dateline;
}

// ------------------------------------------------------------- hero

export function renderDebt(vm) {
  const debtH = vm.debtMin / 60;
  $('debt-number').textContent = `${debtH.toFixed(1)}h`;
  const zoneText = { good: 'In the good zone', moderate: 'Moderate debt', high: 'High debt' };
  const zoneEl = $('debt-zone');
  zoneEl.textContent = zoneText[vm.zone];
  zoneEl.className = `zone-label ${vm.zone}`;

  // Gauge scale: 0-15h of debt across the semicircle.
  const pct = Math.min(debtH / 15, 1) * 100;
  $('gauge').innerHTML = `
    <svg viewBox="0 0 200 112" role="img" aria-label="Sleep debt ${debtH.toFixed(1)} hours">
      <defs>
        <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="${ACCENT}"/>
          <stop offset="1" stop-color="${GLOW}"/>
        </linearGradient>
      </defs>
      <path class="gauge-track" d="M 20 102 A 80 80 0 0 1 180 102" pathLength="100"/>
      ${pct > 0.5 ? `<path class="gauge-value" stroke="url(#gaugeGrad)"
        d="M 20 102 A 80 80 0 0 1 180 102" pathLength="100"
        stroke-dasharray="${pct.toFixed(1)} 100"/>` : ''}
    </svg>`;

  $('energy-chip').innerHTML = `<span class="dot-glow"></span> Energy potential ${vm.energy}`;
  const missing = $('missing-chip');
  missing.hidden = vm.missingCount === 0;
  if (vm.missingCount > 0) {
    missing.textContent = `${vm.missingCount} of 14 nights missing`;
  }
}

// --------------------------------------------------------- energy curve

export function renderSchedule(vm) {
  const { points, zones, wake, wakeIsReal } = vm.schedule;
  const now = vm.now;
  const W = 430;
  const H = 158;
  const top = 14;
  const bottom = 126;
  const x = (date) => 10 + (minuteOfDayLocal(date) / 1440) * 410;
  const xm = (min) => 10 + (min / 1440) * 410;
  const y = (v) => bottom - (v / 100) * (bottom - top);

  const dayStart = points[0].time;
  const sameDay = (d) => d.toDateString() === dayStart.toDateString();
  const clampX = (d) => Math.max(10, Math.min(420, sameDay(d) ? x(d) : d < dayStart ? 10 : 420));

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xm(i * 10).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(' ');
  const area = `${line} L 420 ${bottom} L 10 ${bottom} Z`;

  const bands = zones
    .map((z) => {
      const x0 = clampX(z.start);
      const x1 = clampX(z.end);
      if (x1 - x0 < 1) return '';
      const mel = z.id === 'melatonin';
      return `<rect x="${x0.toFixed(1)}" y="${top}" width="${(x1 - x0).toFixed(1)}" height="${bottom - top}"
        fill="${mel ? GLOW : '#FFFFFF'}" opacity="${mel ? 0.13 : 0.05}" rx="3"/>`;
    })
    .join('');

  let nowMark = '';
  if (sameDay(now)) {
    const nx = x(now);
    const idx = Math.min(points.length - 1, Math.round(minuteOfDayLocal(now) / 10));
    const ny = y(points[idx].value);
    nowMark = `
      <line x1="${nx.toFixed(1)}" y1="${top}" x2="${nx.toFixed(1)}" y2="${bottom}" stroke="${GLOW}" stroke-width="1.3" opacity="0.85"/>
      <circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="4.5" fill="${GLOW}"/>
      <circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="8" fill="${GLOW}" opacity="0.25"/>`;
  }

  const ticks = [0, 360, 720, 1080, 1440]
    .map((m, i) => {
      const labels = ['12 AM', '6 AM', '12 PM', '6 PM', '12 AM'];
      const anchor = i === 0 ? 'start' : i === 4 ? 'end' : 'middle';
      return `<text x="${xm(m).toFixed(1)}" y="${H - 8}" text-anchor="${anchor}"
        font-size="9.5" fill="rgba(255,255,255,0.4)">${labels[i]}</text>`;
    })
    .join('');

  $('energy-chart').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Today's energy curve">
      <defs>
        <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.4"/>
          <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${bands}
      <path d="${area}" fill="url(#curveFill)"/>
      <path d="${line}" fill="none" stroke="${ACCENT}" stroke-width="2.2" stroke-linejoin="round"/>
      ${nowMark}
      ${ticks}
    </svg>`;

  $('wake-line').textContent = `${wakeIsReal ? 'woke' : 'est. wake'} ${fmtClock(wake)}`;

  const upcoming = zones.filter((z) => z.end > now).slice(0, 3);
  const list = $('zones-list');
  if (upcoming.length === 0) {
    list.innerHTML = `<li><span class="zone-dot dim"></span>Past bedtime — tomorrow's schedule appears in the morning.</li>`;
    return;
  }
  list.innerHTML = upcoming
    .map((z) => {
      const cls = z.id === 'melatonin' ? 'melatonin' : z.id === 'dip' || z.id === 'inertia' || z.id === 'windDown' ? 'dim' : '';
      const live = z.start <= now ? ' · now' : '';
      return `<li><span class="zone-dot ${cls}"></span>${z.label}${live}
        <span class="when">${fmtClock(z.start)} – ${fmtClock(z.end)}</span></li>`;
    })
    .join('');
}

// ------------------------------------------------------------ last night

export function renderLastNight(vm) {
  const night = vm.nights.find((n) => n.hasData);
  const dateEl = $('lastnight-date');
  const body = $('lastnight-body');
  if (!night) {
    dateEl.textContent = '';
    body.innerHTML = `<p class="sub">No sleep recorded in the last 14 days.</p>`;
    return;
  }
  const isToday = night === vm.nights[0];
  dateEl.textContent = isToday
    ? ''
    : `latest: ${night.date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}`;

  const main = night.mainSession ?? night.naps[0];
  const pct = Math.min(100, (night.totalMin / vm.needMin) * 100);
  const met = night.totalMin >= vm.needMin;

  const chips = [];
  if (main?.efficiency != null) chips.push(`${Math.round(main.efficiency * 100)}% efficient`);
  for (const nap of night.naps) chips.push(`nap ${fmtDur(nap.asleepMin)} · ${fmtClock(new Date(nap.start))}`);
  if (vm.inBedFallback) chips.push('using time in bed');

  let stages = '';
  if (main?.hasStages) {
    const s = main.stages;
    const total = s.deep + s.core + s.rem + s.awake;
    const w = (v) => ((v / total) * 100).toFixed(1);
    stages = `
      <div class="stagebar" role="img" aria-label="Sleep stages">
        <span class="stage-deep" style="width:${w(s.deep)}%"></span>
        <span class="stage-core" style="width:${w(s.core)}%"></span>
        <span class="stage-rem" style="width:${w(s.rem)}%"></span>
        <span class="stage-awake" style="width:${w(s.awake)}%"></span>
      </div>
      <div class="stage-legend">
        <span><i class="stage-deep"></i>Deep ${fmtDur(s.deep)}</span>
        <span><i class="stage-core"></i>Core ${fmtDur(s.core)}</span>
        <span><i class="stage-rem"></i>REM ${fmtDur(s.rem)}</span>
        <span><i class="stage-awake"></i>Awake ${fmtDur(s.awake)}</span>
      </div>`;
  }

  body.innerHTML = `
    <div class="ln-main">
      <span class="big-number md">${fmtDur(night.totalMin)}</span>
      <span class="sub">of ${fmtDur(vm.needMin)} need${met ? ' · met' : ''}</span>
    </div>
    <div class="progress"><div class="progress-fill" style="width:${pct.toFixed(1)}%"></div></div>
    ${main ? `
    <div class="ln-times">
      <span>☾ ${fmtClock(new Date(main.start))}</span>
      <span>☀ ${fmtClock(new Date(main.end))}</span>
    </div>` : ''}
    ${chips.length ? `<div class="ln-chips">${chips.map((c) => `<span class="chip dim">${c}</span>`).join('')}</div>` : ''}
    ${stages}`;
}

// --------------------------------------------------------------- history

export function renderHistory(vm) {
  const W = 430;
  const H = 172;
  const top = 16;
  const bottom = 140;
  const n = vm.nights.length;
  const slot = (PLOT.x1 - PLOT.x0) / n;
  const barW = Math.min(18, slot - 9);

  const chrono = [...vm.nights].reverse(); // oldest first
  const series = [...vm.series].reverse();
  const maxMin = Math.max(vm.needMin * 1.25, ...chrono.map((d) => d.totalMin));
  const y = (min) => bottom - (min / maxMin) * (bottom - top);
  const cx = (i) => PLOT.x0 + slot * i + slot / 2;

  let bars = '';
  let labels = '';
  for (let i = 0; i < n; i++) {
    const night = chrono[i];
    const bx = (cx(i) - barW / 2).toFixed(1);
    if (!night.hasData) {
      bars += `<rect x="${bx}" y="${y(vm.needMin).toFixed(1)}" width="${barW}" height="${(bottom - y(vm.needMin)).toFixed(1)}"
        rx="5" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="1" stroke-dasharray="4 3"/>`;
    } else {
      const napMin = night.naps.reduce((t, s) => t + s.asleepMin, 0);
      const mainMin = night.totalMin - napMin;
      if (mainMin > 0) {
        bars += `<rect x="${bx}" y="${y(mainMin).toFixed(1)}" width="${barW}" height="${Math.max(2, bottom - y(mainMin)).toFixed(1)}"
          rx="5" fill="${ACCENT}" opacity="0.78"/>`;
      }
      if (napMin > 0) {
        const napTop = y(night.totalMin);
        bars += `<rect x="${bx}" y="${napTop.toFixed(1)}" width="${barW}" height="${Math.max(2, y(mainMin) - napTop - 2).toFixed(1)}"
          rx="3.5" fill="${ACCENT}" opacity="0.38"/>`;
      }
    }
    const wd = night.date.toLocaleDateString([], { weekday: 'narrow' });
    const isToday = i === n - 1;
    labels += `<text x="${cx(i).toFixed(1)}" y="${H - 16}" text-anchor="middle" font-size="9"
      fill="rgba(255,255,255,${isToday ? 0.85 : 0.38})">${wd}</text>`;
  }

  // Debt trend line on its own scale.
  const debtMax = Math.max(...series, 360);
  const dy = (min) => bottom - (min / (debtMax * 1.15)) * (bottom - top);
  const trend = series.map((v, i) => `${i === 0 ? 'M' : 'L'} ${cx(i).toFixed(1)} ${dy(v).toFixed(1)}`).join(' ');

  $('history-chart').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Last 14 nights of sleep">
      <line x1="${PLOT.x0}" y1="${y(vm.needMin).toFixed(1)}" x2="${PLOT.x1}" y2="${y(vm.needMin).toFixed(1)}"
        stroke="rgba(255,255,255,0.35)" stroke-width="1" stroke-dasharray="5 4"/>
      <text x="${PLOT.x0 - 5}" y="${(y(vm.needMin) + 3).toFixed(1)}" text-anchor="end" font-size="9"
        fill="rgba(255,255,255,0.4)">need</text>
      ${bars}
      <path d="${trend}" fill="none" stroke="${GLOW}" stroke-width="1.6" opacity="0.9" stroke-linejoin="round"/>
      ${labels}
    </svg>`;

  $('history-caption').innerHTML =
    `<span style="color:${ACCENT}">■</span> sleep (light = naps) · ` +
    `<span style="color:${GLOW}">—</span> debt trend · dashed = need / missing`;
}

// ------------------------------------------------------------ consistency

export function renderConsistency(vm) {
  const chip = $('consistency-chip');
  const chart = $('consistency-chart');
  if (!vm.consistency) {
    chip.textContent = 'needs more nights';
    chart.innerHTML = '';
    return;
  }
  chip.textContent = `${vm.consistency.score} / 100`;

  const W = 430;
  const H = 104;
  const top = 14;
  const bottom = 86;
  const n = vm.nights.length;
  const slot = (PLOT.x1 - PLOT.x0) / n;
  const cx = (i) => PLOT.x0 + slot * i + slot / 2;
  // Map midpoints onto a 8 PM -> noon window (wrapping past midnight).
  const yOf = (midMin) => {
    const m = Math.max(0, Math.min(960, (midMin - 1200 + 1440) % 1440));
    return top + (m / 960) * (bottom - top);
  };

  const chrono = [...vm.nights].reverse();
  const pts = [];
  let dots = '';
  for (let i = 0; i < n; i++) {
    const main = chrono[i].mainSession;
    if (!main) continue;
    const px = cx(i);
    const py = yOf(main.midMin);
    pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    const isLatest = chrono[i] === vm.nights.find((nn) => nn.mainSession);
    dots += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.5" fill="${ACCENT}"
      ${isLatest ? `stroke="${GLOW}" stroke-width="1.8"` : ''} opacity="0.92"/>`;
  }

  const guides = [{ m: 240, label: '12 AM' }, { m: 600, label: '6 AM' }]
    .map(({ m, label }) => {
      const gy = top + (m / 960) * (bottom - top);
      return `<line x1="${PLOT.x0}" y1="${gy.toFixed(1)}" x2="${PLOT.x1}" y2="${gy.toFixed(1)}"
          stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
        <text x="${PLOT.x0 - 5}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="9"
          fill="rgba(255,255,255,0.4)">${label}</text>`;
    })
    .join('');

  chart.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sleep midpoint consistency">
      ${guides}
      ${pts.length > 1 ? `<polyline points="${pts.join(' ')}" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1.2"/>` : ''}
      ${dots}
    </svg>`;
}

// ----------------------------------------------------------------- notes

export function renderDataNote(vm) {
  const notes = [];
  if (vm.isDemo) notes.push('Demo data — run the Shortcut to see your own sleep.');
  if (vm.skipped > 0) notes.push(`${vm.skipped} row${vm.skipped === 1 ? '' : 's'} couldn't be read.`);
  if (vm.inBedFallback) notes.push('No asleep records found — times shown are time in bed.');
  $('data-note').textContent = notes.join(' ');
  $('data-note').hidden = notes.length === 0;
}

export function renderDashboard(vm) {
  renderDebt(vm);
  renderSchedule(vm);
  renderLastNight(vm);
  renderHistory(vm);
  renderConsistency(vm);
  renderDataNote(vm);
}

// -------------------------------------------------------------- settings

export function updateSettingsPanel({ needMin, suggestion, baseUrl }) {
  $('need-value').textContent = fmtDur(needMin);
  const sug = $('need-suggestion');
  if (suggestion != null && Math.abs(suggestion - needMin) >= 5) {
    sug.hidden = false;
    $('suggestion-value').textContent = fmtDur(suggestion);
  } else {
    sug.hidden = true;
  }
  $('url-snippet').textContent = `${baseUrl}#v=1&need=${needMin}&d=`;
}
