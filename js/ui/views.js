// views.js — DOM rendering for every screen. Interactive elements carry
// data-action attributes; main.js owns state and dispatches the actions.

import { icons, icon } from './icons.js';
import {
  countUp, drawIn, sweepGauge, replayEntrance, revealCards, motionReady,
} from './anim.js';
import {
  gaugeSVG, energyCurveSVG, durationBarsSVG, debtTrendSVG, sleepTimesSVG,
  dayMapSVG, stagebarHTML, attachChartTooltips, fmtDur, fmtClock,
} from './charts.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export { fmtDur, fmtClock };

export function injectIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    el.innerHTML = icons[el.dataset.icon] ?? '';
  }
}

// ---------------------------------------------------------------- shell

export function showSplash(on) {
  $('splash').style.display = on ? '' : 'none';
}

export function showAuth({ backendNote }) {
  $('auth').hidden = false;
  $('app').hidden = true;
  $('auth-note').textContent = backendNote;
}

export function showApp() {
  $('auth').hidden = true;
  $('app').hidden = false;
}

const VIEW_TITLES = {
  today: () => 'Today',
  sleep: () => 'Sleep',
  trends: () => 'Trends',
  settings: () => 'Settings',
};

export function switchView(view, subtitle = '') {
  for (const sec of document.querySelectorAll('.view')) {
    sec.hidden = sec.id !== `view-${view}`;
  }
  for (const tab of document.querySelectorAll('.tabbar .tab')) {
    tab.classList.toggle('active', tab.dataset.view === view);
  }
  $('view-title').textContent = VIEW_TITLES[view]?.() ?? 'Sleep';
  $('view-subtitle').textContent = subtitle;
  const active = $(`view-${view}`);
  active.classList.remove('view-enter');
  void active.offsetWidth;
  active.classList.add('view-enter');
  if (!revealCards(active)) replayEntrance(active);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

export function setTopbar(view, vm, state) {
  const side = $('topbar-side');
  if (view === 'sleep' && !state.isDemo) {
    side.innerHTML = `<button class="btn primary small" data-action="add-session">${icons.plus} Add sleep</button>`;
  } else if (view === 'today' && state.isDemo) {
    side.innerHTML = `<button class="btn small" data-action="exit-demo">Exit demo</button>`;
  } else {
    side.innerHTML = '';
  }
}

let toastTimer = null;
export function toast(msg, kind = 'ok') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast ${kind}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}

export function greetingSubtitle(now, freshness) {
  let s = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  if (freshness) {
    const sameDay = freshness.toDateString() === now.toDateString();
    s += ` · data through ${sameDay ? fmtClock(freshness) : freshness.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  }
  return s;
}

// ---------------------------------------------------------------- today

export function renderToday(vm) {
  // hero: debt
  const debtH = vm.debtMin / 60;
  countUp($('debt-number'), debtH, (v) => `${v.toFixed(1)}h`);
  const zoneText = { good: 'In the good zone', moderate: 'Moderate debt', high: 'High debt' };
  const zoneEl = $('debt-zone');
  zoneEl.textContent = zoneText[vm.zone];
  zoneEl.className = `zone-label ${vm.zone}`;
  $('gauge').innerHTML = gaugeSVG(debtH);
  const sweep = $('gauge').querySelector('[data-sweep]');
  if (sweep) sweepGauge(sweep, Number(sweep.dataset.sweep));

  const delta = $('debt-delta');
  const diffH = (vm.debtMin - vm.prevDebtMin) / 60;
  if (Number.isFinite(diffH) && Math.abs(diffH) >= 0.05) {
    delta.hidden = false;
    delta.innerHTML = diffH < 0
      ? `▾ ${Math.abs(diffH).toFixed(1)}h since yesterday`
      : `▴ ${diffH.toFixed(1)}h since yesterday`;
    delta.classList.toggle('good-text', diffH < 0);
  } else {
    delta.hidden = true;
  }

  $('energy-chip').innerHTML = `<span class="dot-glow"></span> Energy potential ${vm.energy}`;
  const missing = $('missing-chip');
  missing.hidden = vm.missingCount === 0;
  if (vm.missingCount > 0) {
    missing.innerHTML = `${vm.missingCount} of 14 nights missing · <u data-action="goto-sleep">add</u>`;
  }

  renderTonight(vm);
  renderEnergy(vm);
  renderDayMap(vm);
  renderLastNight(vm);

  $('history-chart').innerHTML = durationBarsSVG(vm.nights14, vm.needMin);
  attachChartTooltips($('history-chart'));

  const notes = [];
  if (vm.isDemo) notes.push('Demo data — editing is disabled. Run the Shortcut to see your own sleep.');
  if (vm.skipped > 0) notes.push(`${vm.skipped} row${vm.skipped === 1 ? '' : 's'} couldn't be read.`);
  if (vm.inBedFallback) notes.push('No asleep records found — times shown are time in bed.');
  $('data-note').textContent = notes.join(' ');
  $('data-note').hidden = notes.length === 0;
}

export function renderLogNow(vm, timer) {
  const card = $('lognow-card');
  if (vm.isDemo) { card.hidden = true; return; }
  card.hidden = false;
  const body = $('lognow-body');
  const sub = $('lognow-sub');
  if (!timer) {
    sub.textContent = '';
    body.innerHTML = `
      <div class="btn-row lognow-idle">
        <button class="btn primary" data-action="timer-start" data-kind="sleep">${icons.moon} Going to sleep</button>
        <button class="btn" data-action="timer-start" data-kind="nap">${icons.nap} Starting a nap</button>
      </div>
      <p class="sub">One tap now, one when you wake. Your ${fmtDur(vm.marginMin)} fall-asleep margin is applied automatically, and you confirm the times before anything is saved.</p>`;
  } else {
    const started = new Date(timer.startedAt);
    const elapsed = Math.max(1, (vm.now - started) / 60000);
    sub.innerHTML = `<span class="live-dot"></span> live`;
    body.innerHTML = `
      <div class="lognow-active">
        <div>
          <div class="tile-value">${timer.kind === 'nap' ? 'Napping' : 'Sleeping'} · ${fmtDur(elapsed)}</div>
          <div class="sub">since ${fmtClock(started)}</div>
        </div>
        <div class="btn-row">
          <button class="btn primary" data-action="timer-finish">${icons.sun} I'm awake</button>
          <button class="btn small" data-action="timer-discard">Discard</button>
        </div>
      </div>`;
  }
}

function renderTonight(vm) {
  const { plan, schedule } = vm;
  const caffeinePassed = vm.now > plan.caffeineCutoff;
  const wakeSourceText = {
    calendar: 'first event − prep',
    setting: 'your target',
    history: 'usual wake',
    default: 'default',
  }[plan.wakeSource];

  $('tonight-grid').innerHTML = `
    <div class="tonight-tile">
      ${icon('moon')}
      <div class="tile-value">${fmtClock(plan.bedtime)}</div>
      <div class="tile-label">bedtime${plan.extraMin > 0 ? ` · +${plan.extraMin}m repay` : ''}</div>
    </div>
    <div class="tonight-tile ${caffeinePassed ? 'passed' : ''}">
      ${icon('coffee')}
      <div class="tile-value">${fmtClock(plan.caffeineCutoff)}</div>
      <div class="tile-label">${caffeinePassed ? 'caffeine cutoff · passed' : 'last caffeine'}</div>
    </div>
    <div class="tonight-tile">
      ${icon('target')}
      <div class="tile-value">${fmtClock(plan.wakeTarget)}</div>
      <div class="tile-label">wake · ${wakeSourceText}</div>
    </div>`;

  const mel = schedule.zones.find((z) => z.id === 'melatonin');
  const basisText = {
    fixed: 'your nightly setting',
    'auto-calendar': 'sized to your free evening',
    auto: 'auto pacing',
  }[plan.repayBasis] ?? 'auto pacing';
  const parts = [];
  if (plan.extraMin > 0) {
    parts.push(`Tonight repays ${plan.extraMin} min of debt — ${basisText} — for ${fmtDur(plan.sleepMin)} ahead of a ${fmtClock(plan.wakeTarget)} wake.`);
  } else if (vm.debtMin > 30 && plan.repayBasis === 'auto-calendar') {
    parts.push(`Your evening is too tight to repay debt tonight — ${fmtDur(plan.sleepMin)} ahead of a ${fmtClock(plan.wakeTarget)} wake holds the line.`);
  } else {
    parts.push(`No debt to repay — ${fmtDur(plan.sleepMin)} ahead of a ${fmtClock(plan.wakeTarget)} wake keeps you level.`);
  }
  if (mel) parts.push(`Melatonin window ${fmtClock(mel.start)}–${fmtClock(mel.end)}.`);
  $('tonight-note').textContent = parts.join(' ');
}

function renderEnergy(vm) {
  const { schedule, napSlot, now } = vm;
  const dip = schedule.zones.find((z) => z.id === 'dip');
  $('energy-chart').innerHTML = energyCurveSVG({
    points: schedule.points, zones: schedule.zones, now, napSlot,
  });
  drawIn($('energy-chart').querySelector('.curve-line'));
  attachChartTooltips($('energy-chart'));
  $('wake-line').textContent = `${schedule.wakeIsReal ? 'woke' : 'est. wake'} ${fmtClock(schedule.wake)}`;

  const upcoming = schedule.zones.filter((z) => z.end > now).slice(0, 3);
  const list = $('zones-list');
  let html = upcoming.map((z) => {
    const cls = z.id === 'melatonin' ? 'melatonin' : ['dip', 'inertia', 'windDown'].includes(z.id) ? 'dim' : '';
    const live = z.start <= now ? ' · now' : '';
    return `<li><span class="zone-dot ${cls}"></span>${z.label}${live}
      <span class="when">${fmtClock(z.start)} – ${fmtClock(z.end)}</span></li>`;
  }).join('');
  if (napSlot && napSlot.end > now && dip) {
    html += `<li class="nap-line">${icon('nap')}Best nap window
      <span class="when">${fmtClock(napSlot.start)} – ${fmtClock(napSlot.end)}</span></li>`;
  }
  if (!html) html = `<li><span class="zone-dot dim"></span>Past bedtime — tomorrow's schedule appears in the morning.</li>`;
  list.innerHTML = html;
}

function renderDayMap(vm) {
  const card = $('daymap-card');
  const cal = vm.calendar;
  if (!cal?.linked) { card.hidden = true; return; }
  card.hidden = false;
  const dip = vm.schedule.zones.find((z) => z.id === 'dip');
  $('daymap-chart').innerHTML = dayMapSVG({
    events: cal.todayEvents,
    napSlot: vm.napSlot,
    dip,
    now: vm.now,
    bedtime: vm.plan.bedtime,
  });
  attachChartTooltips($('daymap-chart'));
  const n = cal.todayEvents.length;
  $('daymap-sub').textContent = cal.error
    ? ''
    : n === 0
      ? 'no timed events today'
      : `${n} event${n === 1 ? '' : 's'} · day starts ${fmtClock(cal.todayEvents[0].start)}`;
  $('daymap-note').textContent = cal.error
    ? cal.error
    : vm.napSlot
      ? `Free for a ${vm.napSlot.durationMin}-minute nap at ${fmtClock(vm.napSlot.start)}${vm.napSlot.constrained ? ' — the best gap in your dip window' : ' — your whole dip window is open'}.`
      : 'No usable nap gap in your dip window today.';
}

function renderLastNight(vm) {
  const night = vm.nights14.find((n) => n.hasData);
  const dateEl = $('lastnight-date');
  const body = $('lastnight-body');
  if (!night) {
    dateEl.textContent = '';
    body.innerHTML = `<p class="sub">No sleep recorded yet. Run the Shortcut after a night's sleep, or add one manually in the Sleep tab.</p>`;
    return;
  }
  const isToday = night === vm.nights14[0];
  dateEl.textContent = isToday
    ? ''
    : `latest: ${night.date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}`;

  const main = night.mainSession ?? night.naps[0];
  const pct = Math.min(100, (night.totalMin / vm.needMin) * 100);
  const met = night.totalMin >= vm.needMin;

  const chips = [];
  if (main?.efficiency != null) chips.push(`${Math.round(main.efficiency * 100)}% efficient`);
  for (const nap of night.naps) chips.push(`nap ${fmtDur(nap.asleepMin)} · ${fmtClock(new Date(nap.start))}`);
  if (main?.row?.source === 'manual') chips.push('edited');

  body.innerHTML = `
    <div class="ln-main">
      <span class="big-number md">${fmtDur(night.totalMin)}</span>
      <span class="sub">of ${fmtDur(vm.needMin)} need${met ? ' · met' : ''}</span>
    </div>
    <div class="progress"><div class="progress-fill" style="width:${pct.toFixed(1)}%"></div></div>
    ${main ? `
    <div class="ln-times">
      <span>${icon('moon')} ${fmtClock(new Date(main.start))}</span>
      <span>${icon('sun')} ${fmtClock(new Date(main.end))}</span>
    </div>` : ''}
    ${chips.length ? `<div class="ln-chips">${chips.map((c) => `<span class="chip dim">${c}</span>`).join('')}</div>` : ''}
    ${main?.hasStages ? stagebarHTML(main.stages) : ''}`;
}

// ---------------------------------------------------------------- sleep

export function renderSleepLog(vm, visibleCount = 4) {
  const nights = vm.nights14;
  const withData = nights.filter((n) => n.hasData);
  const avg = withData.length
    ? withData.reduce((t, n) => t + n.totalMin, 0) / withData.length
    : 0;
  $('log-summary').innerHTML = `
    <span class="chip">${withData.length} of 14 nights</span>
    ${withData.length ? `<span class="chip">avg ${fmtDur(avg)}</span>` : ''}
    ${vm.isDemo ? '<span class="chip dim">demo — read-only</span>' : ''}`;

  const shown = nights.slice(0, visibleCount);
  const hidden = nights.length - shown.length;
  const moreBtn = hidden > 0
    ? `<button class="btn show-more" data-action="log-more">${icons.chevronDown} Show ${hidden} more night${hidden === 1 ? '' : 's'}</button>`
    : nights.length > 4
      ? `<button class="btn show-more" data-action="log-less">Show fewer</button>`
      : '';

  $('log-list').innerHTML = shown.map((night) => {
    const day = night.date.toLocaleDateString([], { weekday: 'short' });
    const date = night.date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const isToday = night === nights[0];

    let pills;
    if (!night.hasData) {
      pills = vm.isDemo ? '<span class="sub">no data</span>'
        : `<button class="pill add" data-action="add-night" data-date="${night.key}">${icons.plus} Add sleep</button>`;
    } else {
      pills = night.sessions.map((s) => {
        const label = s.isNap
          ? `${icons.nap} ${fmtClock(new Date(s.start))} · ${fmtDur(s.asleepMin)}`
          : `${icons.moon} ${fmtClock(new Date(s.start))} – ${fmtClock(new Date(s.end))}`;
        const edited = s.row?.source === 'manual' ? '<i class="edit-dot" title="edited"></i>' : '';
        return vm.isDemo
          ? `<span class="pill">${label}${edited}</span>`
          : `<button class="pill" data-action="edit-session" data-id="${esc(s.id)}">${label}${edited}</button>`;
      }).join('');
      if (!vm.isDemo) {
        pills += `<button class="pill add" data-action="add-night" data-date="${night.key}" aria-label="Add to ${date}">${icons.plus}</button>`;
      }
    }

    return `
      <article class="card log-night ${night.hasData ? '' : 'empty'}">
        <div class="log-date">
          <span class="log-day">${isToday ? 'Last night' : day}</span>
          <span class="sub">${date}</span>
        </div>
        <div class="log-body">
          <div class="log-total">${night.hasData ? fmtDur(night.totalMin) : '—'}
            ${night.hasData && night.totalMin >= vm.needMin ? `<span class="ok">${icons.check}</span>` : ''}
          </div>
          <div class="log-pills">${pills}</div>
        </div>
      </article>`;
  }).join('') + moreBtn;
}

// --------------------------------------------------------------- trends

// RISE-style "every night" list: exact bed/wake times and that morning's
// debt reading, tappable into the editor. Detailed mode only.
function renderTrendData(vm, nights, series, advanced, rowsExpanded) {
  const card = $('trend-data-card');
  const withData = nights
    .map((n, i) => ({ n, debt: series[i] }))
    .filter(({ n }) => n.hasData);
  if (!advanced || withData.length === 0) { card.hidden = true; return; }
  card.hidden = false;

  const limit = rowsExpanded ? withData.length : Math.min(7, withData.length);
  const rows = withData.slice(0, limit).map(({ n, debt }) => {
    const main = n.mainSession ?? n.naps[0];
    const isToday = n === vm.nightsLong[0];
    const label = isToday
      ? 'Last night'
      : n.date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const times = main
      ? `${fmtClock(new Date(main.start))} – ${fmtClock(new Date(main.end))}`
      : '—';
    const napNote = n.naps.length && n.mainSession
      ? ` <span class="nl-nap">+${fmtDur(n.naps.reduce((t, s) => t + s.asleepMin, 0))} nap</span>`
      : '';
    const inner = `
      <span class="nl-when"><strong>${label}</strong><span class="sub">${times}${napNote}</span></span>
      <span class="nl-nums">
        <span class="nl-slept">${fmtDur(n.totalMin)}</span>
        <span class="nl-debt ${debt <= 300 ? 'good-text' : 'error'}">${(debt / 60).toFixed(1)}h debt</span>
      </span>`;
    return vm.isDemo || !main?.id
      ? `<div class="night-row">${inner}</div>`
      : `<button class="night-row" data-action="edit-session" data-id="${esc(main.id)}">${inner}${icons.chevronRight}</button>`;
  }).join('');

  const more = withData.length > limit
    ? `<button class="btn show-more" data-action="trend-rows-more">${icons.chevronDown} Show all ${withData.length} nights</button>`
    : rowsExpanded && withData.length > 7
      ? `<button class="btn show-more" data-action="trend-rows-less">Show fewer</button>`
      : '';
  $('trend-data').innerHTML = rows + more;
}

export function renderTrends(vm, rangeDays, detail = 'clean', rowsExpanded = false) {
  for (const b of document.querySelectorAll('#trend-range button')) {
    b.classList.toggle('active', Number(b.dataset.range) === rangeDays);
  }
  for (const b of document.querySelectorAll('#trend-detail button')) {
    b.classList.toggle('active', b.dataset.detail === detail);
  }
  const advanced = detail === 'advanced';
  // Trim the window to where data actually exists (min two weeks) so a
  // young log doesn't render 90 days of emptiness.
  let nights = vm.nightsLong.slice(0, rangeDays);
  let lastIdx = -1;
  nights.forEach((n, i) => { if (n.hasData) lastIdx = i; });
  nights = nights.slice(0, Math.max(14, lastIdx + 1));
  const series = vm.seriesLong.slice(0, nights.length);
  const withData = nights.filter((n) => n.hasData);
  const avg = withData.length ? withData.reduce((t, n) => t + n.totalMin, 0) / withData.length : 0;
  const avgDebt = series.reduce((t, v) => t + v, 0) / Math.max(1, series.length);

  $('trend-stats').innerHTML = `
    <div class="stat"><span class="stat-v">${withData.length ? fmtDur(avg) : '—'}</span><span class="stat-l">avg sleep</span></div>
    <div class="stat"><span class="stat-v">${(avgDebt / 60).toFixed(1)}h</span><span class="stat-l">avg debt</span></div>
    <div class="stat"><span class="stat-v">${withData.length}<span class="stat-dim">/${nights.length}</span></span><span class="stat-l">nights logged</span></div>`;

  $('trend-debt').innerHTML = debtTrendSVG(series, nights, { detail: advanced });
  drawIn($('trend-debt').querySelector('.curve-line'), 700);
  attachChartTooltips($('trend-debt'));

  $('trend-duration').innerHTML = durationBarsSVG(nights, vm.needMin, {
    labelEvery: nights.length > 30 ? 14 : nights.length > 14 ? 5 : 1,
    detail: advanced,
  });
  attachChartTooltips($('trend-duration'));

  $('trend-times').innerHTML = sleepTimesSVG(nights, { detail: advanced });
  attachChartTooltips($('trend-times'));
  $('consistency-chip').textContent = vm.consistency ? `${vm.consistency.score} / 100` : 'needs more nights';

  renderTrendData(vm, nights, series, advanced, rowsExpanded);
}

// ------------------------------------------------------------- settings

export function renderSettings(state, vm) {
  const s = state.settings;

  // account
  const acct = $('acct-body');
  if (state.api.mode === 'supabase' && state.user) {
    acct.innerHTML = `
      <div class="setting-row"><span>${icon('user')} ${esc(state.user.email)}</span>
        <button class="btn small" data-action="sign-out">${icons.logout} Sign out</button></div>
      <label class="field"><span>Display name</span>
        <input id="display-name" value="${esc(s.displayName ?? '')}" placeholder="optional" data-action-change="save-name" /></label>
      <p class="sub">Synced to your account — your data follows you to any device.</p>`;
  } else if (state.api.mode === 'supabase') {
    acct.innerHTML = `
      <div class="setting-row"><span>${icon('user')} Guest</span>
        <button class="btn primary small" data-action="go-auth">Sign in</button></div>
      <p class="sub">Guest data lives only in this browser. Sign in to sync it to an account — existing local sessions merge in automatically.</p>`;
  } else {
    acct.innerHTML = `
      <div class="setting-row"><span>${icon('user')} Local mode</span></div>
      <p class="sub">No backend configured, so data lives in this browser. The README's "Set up the backend" section (10 minutes, free) enables accounts and sync.</p>`;
  }

  // need
  $('need-value').textContent = fmtDur(s.needMin);
  const sug = $('need-suggestion');
  if (vm.suggestion != null && Math.abs(vm.suggestion - s.needMin) >= 5 && !state.isDemo) {
    sug.hidden = false;
    $('suggestion-value').textContent = fmtDur(vm.suggestion);
  } else {
    sug.hidden = true;
  }

  // tonight plan settings
  const wakeInput = $('wake-target');
  const auto = s.wakeTargetMin == null;
  $('wake-auto').checked = auto;
  wakeInput.disabled = auto;
  const wakeShow = auto ? vm.plan.wakeTarget : null;
  wakeInput.value = auto
    ? `${String(wakeShow.getHours()).padStart(2, '0')}:${String(wakeShow.getMinutes()).padStart(2, '0')}`
    : `${String(Math.floor(s.wakeTargetMin / 60)).padStart(2, '0')}:${String(s.wakeTargetMin % 60).padStart(2, '0')}`;
  $('caff-value').textContent = `${(s.caffeineGapMin / 60).toFixed(s.caffeineGapMin % 60 ? 1 : 0)}h`;
  $('prep-row').hidden = !state.calendarConfigured;
  $('prep-value').textContent = `${s.prepBufferMin}m`;

  // repayment + fall-asleep margin
  for (const b of document.querySelectorAll('#repay-mode button')) {
    b.classList.toggle('active', b.dataset.repay === s.repayMode);
  }
  $('repay-fixed-row').hidden = s.repayMode !== 'fixed';
  $('repay-value').textContent = fmtDur(s.repayFixedMin);
  $('repay-note').textContent = s.repayMode === 'fixed'
    ? `Every night aims for +${fmtDur(s.repayFixedMin)} beyond your need until the debt is gone.`
    : state.calendar.linked
      ? 'Auto sizes tonight’s extra sleep to your debt and to the evening your calendar actually leaves free.'
      : 'Auto repays about a fifth of your debt per night, capped at an hour. Link your calendar to size it to your real evenings.';
  $('margin-value').textContent = `${s.sleepOnsetMarginMin}m`;

  // debt model
  for (const b of document.querySelectorAll('#debt-mode button')) {
    b.classList.toggle('active', b.dataset.mode === s.debtMode);
  }
  $('debt-mode-note').textContent = s.debtMode === 'weighted'
    ? 'Recent nights matter more (last night ≈ 15%) — the RISE-style headline.'
    : 'A literal sum of the last 14 nightly deficits.';

  // calendar
  const cal = $('cal-body');
  if (!state.calendarConfigured) {
    cal.innerHTML = `<p class="sub">Not set up yet. Add a Google OAuth client ID to <code>js/config.js</code> (README: "Set up the calendar link") to plan naps and bedtime around your real day.</p>`;
  } else if (state.calendar.linked) {
    cal.innerHTML = `
      <div class="setting-row"><span>${icon('check')} Linked</span>
        <span class="setting-controls">
          <button class="btn small" data-action="cal-refresh">Refresh</button>
          <button class="btn small" data-action="cal-unlink">Unlink</button>
        </span></div>
      <p class="sub">Read-only. Events are fetched by this browser and never sent anywhere else.</p>`;
  } else {
    cal.innerHTML = `
      <div class="setting-row"><span>${icon('calendar')} Not linked</span>
        <button class="btn primary small" data-action="cal-link">${icons.link} Link calendar</button></div>
      <p class="sub">Optional. Your first event anchors the day, nap windows dodge your meetings, and bedtime accounts for tomorrow's start. ${state.calendar.error ? `<span class="error">${esc(state.calendar.error)}</span>` : ''}</p>`;
  }

  $('url-snippet').textContent = `${state.baseUrl}#v=1&need=${s.needMin}&d=`;
}

// --------------------------------------------------------------- editor

const toLocalInput = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function openEditor({ row = null, defaultDateKey = null, prefill = null, note = null, title = null, now = new Date() }) {
  const dlg = $('editor');
  const isNew = !row;
  $('editor-title').textContent = title
    ?? (isNew ? 'Add sleep' : row.kind === 'nap' ? 'Edit nap' : 'Edit sleep');
  $('edit-delete').hidden = isNew;
  $('edit-error').hidden = true;
  $('edit-note').textContent = note ?? '';
  $('edit-note').hidden = !note;

  let start;
  let end;
  let kind;
  if (row) {
    start = row.start; end = row.end; kind = row.kind;
  } else if (prefill) {
    start = prefill.start; end = prefill.end; kind = prefill.kind ?? 'sleep';
  } else if (defaultDateKey) {
    const [y, m, d] = defaultDateKey.split('-').map(Number);
    end = new Date(y, m - 1, d, 7, 0);
    start = new Date(end.getTime() - 8 * 3600000);
    kind = 'sleep';
  } else {
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 0);
    start = new Date(end.getTime() - 8 * 3600000);
    kind = 'sleep';
  }
  $('edit-start').value = toLocalInput(start);
  $('edit-end').value = toLocalInput(end);
  setEditorKind(kind);
  updateEditorDuration();
  dlg.returnValue = '';
  dlg.showModal();
  return { rowId: row?.id ?? null };
}

export function setEditorKind(kind) {
  for (const b of document.querySelectorAll('#edit-kind button')) {
    b.classList.toggle('active', b.dataset.kind === kind);
  }
}

export function editorKind() {
  return document.querySelector('#edit-kind button.active')?.dataset.kind ?? 'sleep';
}

export function editorValues() {
  const start = new Date($('edit-start').value);
  const end = new Date($('edit-end').value);
  return { start, end, kind: editorKind() };
}

export function updateEditorDuration() {
  const { start, end } = editorValues();
  const el = $('edit-duration');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    el.textContent = '';
    return;
  }
  el.textContent = `Duration ${fmtDur((end - start) / 60000)}`;
}

export function editorError(msg) {
  const el = $('edit-error');
  el.textContent = msg;
  el.hidden = !msg;
}

export function closeEditor() {
  $('editor').close();
}

// ---------------------------------------------------------- onboarding

export function showOnboarding({ canLogin }) {
  const ob = $('onboarding');
  ob.hidden = false;
  $('auth').hidden = true;
  $('app').hidden = true;
  $('ob-skip').textContent = canLogin ? 'Log in' : 'Skip';

  const track = $('ob-track');
  const slides = [...track.children];
  const dots = $('ob-dots');
  dots.innerHTML = slides.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('');

  const syncDots = () => {
    const idx = obIndex();
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i === idx));
    $('ob-next').textContent = idx === slides.length - 1 ? "Let's get started" : 'Next';
  };
  track.addEventListener('scroll', () => requestAnimationFrame(syncDots), { passive: true });
  syncDots();
}

export function obIndex() {
  const track = $('ob-track');
  return Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
}

export function obAdvance() {
  const track = $('ob-track');
  const slides = track.children.length;
  const idx = obIndex();
  if (idx >= slides - 1) return true; // finished
  track.scrollTo({ left: (idx + 1) * track.clientWidth, behavior: 'smooth' });
  return false;
}

export function hideOnboarding() {
  $('onboarding').hidden = true;
}

// ------------------------------------------------------------- auth ui

export function authBusy(on) {
  for (const id of ['auth-signin', 'auth-signup', 'auth-magic']) $(id).disabled = on;
}

export function authError(msg) {
  $('auth-error').textContent = msg ?? '';
  $('auth-error').hidden = !msg;
  $('auth-info').hidden = true;
}

export function authInfo(msg) {
  $('auth-info').textContent = msg ?? '';
  $('auth-info').hidden = !msg;
  $('auth-error').hidden = true;
}
