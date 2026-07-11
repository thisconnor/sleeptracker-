// main.js — state, boot, and event dispatch. Rendering lives in js/ui/*.

import { parseFragment, parseAnyInput } from './parse.js';
import { buildSessions } from './sessions.js';
import {
  sleepDebtMin, debtZone, debtSeries, energyPotential, suggestNeed, consistencyScore,
} from './metrics.js';
import { buildSchedule } from './schedule.js';
import { bedtimePlan, napSuggestions } from './planner.js';
import { demoStoreRows } from './demo.js';
import {
  sessionsToRows, mergeImport, nightsFromRows, applyEdit, makeManualRow,
} from './store.js';
import { initApi, DEFAULT_SETTINGS } from './api.js';
import * as cal from './calendar.js';
import * as ui from './ui/views.js';

const $ = (id) => document.getElementById(id);

const GUEST_KEY = 'guestMode.v1';
const CAL_LINKED_KEY = 'calendarLinked.v1';

const state = {
  api: null,
  user: null,
  guest: safeGet(GUEST_KEY) === '1',
  settings: { ...DEFAULT_SETTINGS },
  rows: [],
  demoRows: null, // when set, we're in demo mode (in-memory, read-only)
  skipped: 0,
  view: 'today',
  trendRange: 14,
  editing: null, // { rowId } | { dateKey } | null
  calendar: { linked: false, todayEvents: [], tomorrowFirstEvent: null, error: null },
  calendarConfigured: cal.calendarConfigured(),
  pendingImport: null, // rows parsed from the hash while signed out
  baseUrl: location.protocol === 'file:'
    ? 'https://thisconnor.github.io/sleeptracker-/'
    : location.origin + location.pathname,
};

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
function safeDel(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

const isDemo = () => state.demoRows != null;
const activeRows = () => (isDemo() ? state.demoRows : state.rows);

// -------------------------------------------------------------- compute

function compute() {
  const now = new Date();
  const rows = activeRows();
  const nightsLong = nightsFromRows(rows, now, 92);
  const nights14 = nightsLong.slice(0, 14);
  const mode = state.settings.debtMode;
  const needMin = state.settings.needMin;
  const debtMin = sleepDebtMin(nights14, needMin, mode);
  const seriesLong = debtSeries(nightsLong, needMin, mode);
  const energy = energyPotential(debtMin);
  const schedule = buildSchedule(nights14, needMin, energy, now);
  const dip = schedule.zones.find((z) => z.id === 'dip');
  const plan = bedtimePlan({
    nights: nights14,
    settings: state.settings,
    debtMin,
    now,
    tomorrowFirstEvent: state.calendar.linked ? state.calendar.tomorrowFirstEvent : null,
  });
  const napSlot = napSuggestions({
    events: state.calendar.linked ? state.calendar.todayEvents : [],
    dip,
    now,
  })[0] ?? null;
  const live = rows.filter((r) => !r.deleted);
  const freshness = live.length
    ? live.reduce((m, r) => (r.end > m ? r.end : m), live[0].end)
    : null;
  return {
    now,
    nights14,
    nightsLong,
    needMin,
    debtMin,
    prevDebtMin: seriesLong[1] ?? NaN,
    zone: debtZone(debtMin),
    energy,
    seriesLong,
    schedule,
    plan,
    napSlot,
    calendar: state.calendar,
    suggestion: suggestNeed(nightsLong),
    consistency: consistencyScore(nightsLong.slice(0, state.trendRange)),
    missingCount: nights14.filter((n) => !n.hasData).length,
    skipped: state.skipped,
    isDemo: isDemo(),
    inBedFallback: state.inBedFallback ?? false,
    freshness,
  };
}

function render() {
  const vm = compute();
  ui.setTopbar(state.view, vm, { isDemo: isDemo() });
  $('welcome-card').hidden = activeRows().some((r) => !r.deleted);
  if (state.view === 'today') {
    $('view-subtitle').textContent = ui.greetingSubtitle(vm.now, vm.freshness);
    ui.renderToday(vm);
  } else if (state.view === 'sleep') {
    $('view-subtitle').textContent = '';
    ui.renderSleepLog(vm);
  } else if (state.view === 'trends') {
    $('view-subtitle').textContent = '';
    ui.renderTrends(vm, state.trendRange);
  } else if (state.view === 'settings') {
    $('view-subtitle').textContent = '';
    ui.renderSettings(state, vm);
  }
}

function switchView(view) {
  state.view = view;
  ui.switchView(view);
  render();
}

// ---------------------------------------------------------------- data

async function reloadRows() {
  state.rows = await state.api.rows.list(120);
}

// Turn a fragment's raw samples into store rows.
function samplesToImportRows(samples) {
  const { sessions, inBedFallback } = buildSessions(samples);
  state.inBedFallback = inBedFallback;
  return sessionsToRows(sessions);
}

async function importRows(incoming, { announce = true } = {}) {
  const fresh = mergeImport(state.rows, incoming);
  if (fresh.length) {
    await state.api.rows.insert(fresh);
    await reloadRows();
  }
  if (announce) {
    ui.toast(fresh.length
      ? `Synced ${fresh.length} new session${fresh.length === 1 ? '' : 's'}`
      : 'Already up to date');
  }
  return fresh.length;
}

// Process the URL fragment: demo, need setting, and/or sleep data.
async function handleFragment({ announce = true } = {}) {
  const parsed = parseFragment(location.hash.slice(1));
  if (parsed.needRaw != null) {
    const n = Math.round(Math.min(690, Math.max(300, Number(parsed.needRaw))));
    if (Number.isFinite(n) && n !== state.settings.needMin) {
      state.settings = await state.api.settings.save({ needMin: n });
    }
  }
  if (parsed.demo) {
    const kind = parsed.demo === 'iphone' ? 'iphone' : 'watch';
    state.demoRows = demoStoreRows(kind);
    state.skipped = 0;
    state.inBedFallback = false;
    return;
  }
  if (parsed.samples.length > 0) {
    state.skipped = parsed.skipped;
    const incoming = samplesToImportRows(parsed.samples);
    if (canWrite()) {
      await importRows(incoming, { announce });
      clearHash();
    } else {
      state.pendingImport = incoming;
    }
  } else {
    state.skipped = parsed.skipped;
  }
}

const canWrite = () => state.user != null || state.api?.mode === 'local' || state.guest;

function clearHash() {
  history.replaceState(null, '', location.pathname + location.search);
}

// ------------------------------------------------------------- calendar

async function refreshCalendar({ interactive = false } = {}) {
  if (!state.calendarConfigured || !state.calendar.linked) return;
  try {
    const ctx = await cal.fetchPlannerContext(new Date(), { interactive });
    state.calendar.todayEvents = ctx.todayEvents;
    state.calendar.tomorrowFirstEvent = ctx.tomorrowFirstEvent;
    state.calendar.error = null;
  } catch (err) {
    state.calendar.error = err.message;
    if (!cal.hasToken()) state.calendar.linked = false;
  }
}

// ------------------------------------------------------------------ auth

async function enterApp() {
  ui.showApp();
  await handleFragment({ announce: true });
  if (state.pendingImport && canWrite()) {
    await importRows(state.pendingImport);
    state.pendingImport = null;
    clearHash();
  }
  state.calendar.linked = state.calendarConfigured && safeGet(CAL_LINKED_KEY) === '1' && cal.hasToken();
  if (safeGet(CAL_LINKED_KEY) === '1' && state.calendarConfigured && !state.calendar.linked) {
    // Token expired between visits — silently try to renew.
    try {
      await cal.getToken({ interactive: false });
      state.calendar.linked = true;
    } catch { /* stays unlinked until the user relinks */ }
  }
  await refreshCalendar();
  switchView(state.view);
}

async function onSignedIn(user) {
  state.user = user;
  state.guest = false;
  safeDel(GUEST_KEY);
  state.settings = await state.api.settings.load();
  await reloadRows();
  // Merge any guest/local rows into the account, once.
  try {
    const localRaw = safeGet('sleepRows.v1');
    const localRows = localRaw ? JSON.parse(localRaw) : [];
    if (localRows.length) {
      const { rowFromJSON } = await import('./store.js');
      const merged = mergeImport(state.rows, localRows.map(rowFromJSON).filter((r) => !r.deleted));
      if (merged.length) {
        await state.api.rows.insert(merged.map((r) => ({ ...r, source: r.source ?? 'import' })));
        await reloadRows();
        ui.toast(`Moved ${merged.length} local session${merged.length === 1 ? '' : 's'} into your account`);
      }
      safeDel('sleepRows.v1');
    }
  } catch { /* best effort */ }
  await enterApp();
}

// ---------------------------------------------------------------- boot

async function boot() {
  ui.injectIcons();
  bindEvents();
  state.api = await initApi();
  state.settings = await state.api.settings.load();

  if (state.api.mode === 'supabase') {
    state.user = await state.api.auth.getUser();
    state.api.auth.onChange((user) => {
      const had = Boolean(state.user);
      if (user && !had) onSignedIn(user);
      if (!user && had) { state.user = null; location.reload(); }
    });
  }

  await reloadRows();
  ui.showSplash(false);

  if (state.api.mode === 'supabase' && !state.user && !state.guest) {
    // Peek at the fragment so a check-in link isn't lost behind the gate.
    const parsed = parseFragment(location.hash.slice(1));
    if (parsed.demo) { await enterApp(); return; }
    ui.showAuth({
      backendNote: parsed.samples.length > 0
        ? 'Your check-in link is loaded — sign in to save it to your account, or continue without one.'
        : 'Free account · your data is yours alone.',
    });
    return;
  }
  await enterApp();
}

// --------------------------------------------------------------- events

function bindEvents() {
  // tab bar
  for (const tab of document.querySelectorAll('.tabbar .tab')) {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  }

  // global action dispatch for dynamically rendered elements
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'edit-session') openEditorFor(el.dataset.id);
    else if (a === 'add-night') openEditorNew(el.dataset.date);
    else if (a === 'add-session') openEditorNew(null);
    else if (a === 'goto-sleep') switchView('sleep');
    else if (a === 'exit-demo') exitDemo();
    else if (a === 'sign-out') state.api.auth.signOut();
    else if (a === 'go-auth') { safeDel(GUEST_KEY); state.guest = false; location.reload(); }
    else if (a === 'cal-link') linkCalendar();
    else if (a === 'cal-unlink') unlinkCalendar();
    else if (a === 'cal-refresh') refreshCalendar({ interactive: true }).then(render);
  });
  document.addEventListener('change', async (e) => {
    if (e.target.id === 'display-name') {
      state.settings = await state.api.settings.save({ displayName: e.target.value.trim() || null });
      ui.toast('Saved');
    }
  });

  // auth
  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await authAction(() => state.api.auth.signInPassword($('auth-email').value.trim(), $('auth-password').value));
  });
  $('auth-signup').addEventListener('click', async () => {
    const email = $('auth-email').value.trim();
    const pw = $('auth-password').value;
    if (!email || pw.length < 8) { ui.authError('Enter an email and a password of at least 8 characters.'); return; }
    await authAction(async () => {
      const data = await state.api.auth.signUpPassword(email, pw);
      if (!data?.session) ui.authInfo('Account created — check your email to confirm, then sign in.');
    });
  });
  $('auth-magic').addEventListener('click', async () => {
    const email = $('auth-email').value.trim();
    if (!email) { ui.authError('Enter your email first.'); return; }
    await authAction(async () => {
      await state.api.auth.signInMagic(email);
      ui.authInfo('Magic link sent — open it on this device.');
    });
  });
  $('auth-reset').addEventListener('click', async () => {
    const email = $('auth-email').value.trim();
    if (!email) { ui.authError('Enter your email first.'); return; }
    await authAction(async () => {
      await state.api.auth.resetPassword(email);
      ui.authInfo('Password reset email sent.');
    });
  });
  $('auth-guest').addEventListener('click', async () => {
    state.guest = true;
    safeSet(GUEST_KEY, '1');
    await enterApp();
  });

  // settings: need stepper + suggestion
  $('need-minus').addEventListener('click', () => bumpSetting('needMin', -15, 300, 690));
  $('need-plus').addEventListener('click', () => bumpSetting('needMin', 15, 300, 690));
  $('use-suggestion').addEventListener('click', async () => {
    const vm = compute();
    if (vm.suggestion != null) {
      state.settings = await state.api.settings.save({ needMin: vm.suggestion });
      render();
    }
  });
  $('caff-minus').addEventListener('click', () => bumpSetting('caffeineGapMin', -30, 240, 840));
  $('caff-plus').addEventListener('click', () => bumpSetting('caffeineGapMin', 30, 240, 840));
  $('prep-minus').addEventListener('click', () => bumpSetting('prepBufferMin', -15, 0, 180));
  $('prep-plus').addEventListener('click', () => bumpSetting('prepBufferMin', 15, 0, 180));

  $('wake-auto').addEventListener('change', async (e) => {
    if (e.target.checked) {
      state.settings = await state.api.settings.save({ wakeTargetMin: null });
    } else {
      const [h, m] = ($('wake-target').value || '07:00').split(':').map(Number);
      state.settings = await state.api.settings.save({ wakeTargetMin: h * 60 + m });
    }
    render();
  });
  $('wake-target').addEventListener('change', async (e) => {
    if ($('wake-auto').checked) return;
    const [h, m] = e.target.value.split(':').map(Number);
    if (Number.isFinite(h)) {
      state.settings = await state.api.settings.save({ wakeTargetMin: h * 60 + m });
      render();
    }
  });
  for (const b of document.querySelectorAll('#debt-mode button')) {
    b.addEventListener('click', async () => {
      state.settings = await state.api.settings.save({ debtMode: b.dataset.mode });
      render();
    });
  }

  // settings: data
  $('copy-snippet').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('url-snippet').textContent);
      $('copy-done').hidden = false;
      setTimeout(() => { $('copy-done').hidden = true; }, 1600);
    } catch { /* snippet is select-all on tap */ }
  });
  $('demo-btn').addEventListener('click', () => {
    location.hash = 'demo';
  });
  $('paste-btn').addEventListener('click', async () => {
    const parsed = parseAnyInput($('paste-box').value);
    const errEl = $('paste-error');
    errEl.hidden = true;
    if (parsed.samples.length === 0) {
      errEl.textContent = parsed.skipped > 0
        ? `Found ${parsed.skipped} rows but none could be read — check the Shortcut's date format (yyyyMMddHHmm).`
        : 'No sleep rows found in that text.';
      errEl.hidden = false;
      return;
    }
    state.skipped = parsed.skipped;
    await importRows(samplesToImportRows(parsed.samples));
    $('paste-box').value = '';
    render();
  });
  $('export-btn').addEventListener('click', () => {
    const data = activeRows().filter((r) => !r.deleted).map((r) => ({
      start: r.start.toISOString(),
      end: r.end.toISOString(),
      kind: r.kind,
      asleepMin: r.asleepMin,
      stages: r.stages,
      source: r.source,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sleep-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // trends range
  for (const b of document.querySelectorAll('#trend-range button')) {
    b.addEventListener('click', () => {
      state.trendRange = Number(b.dataset.range);
      render();
    });
  }

  // editor
  for (const b of document.querySelectorAll('#edit-kind button')) {
    b.addEventListener('click', () => ui.setEditorKind(b.dataset.kind));
  }
  $('edit-start').addEventListener('input', ui.updateEditorDuration);
  $('edit-end').addEventListener('input', ui.updateEditorDuration);
  $('editor-close').addEventListener('click', ui.closeEditor);
  $('edit-cancel').addEventListener('click', ui.closeEditor);
  $('editor-form').addEventListener('submit', (e) => { e.preventDefault(); saveEditor(); });
  $('edit-delete').addEventListener('click', deleteEditor);
  $('editor').addEventListener('click', (e) => {
    if (e.target === $('editor')) ui.closeEditor();
  });

  window.addEventListener('hashchange', async () => {
    if (location.hash.replace('#', '') === '') return;
    await handleFragment({ announce: true });
    render();
  });
}

async function authAction(fn) {
  ui.authError(null);
  ui.authBusy(true);
  try {
    await fn();
  } catch (err) {
    ui.authError(err.message ?? 'Something went wrong.');
  } finally {
    ui.authBusy(false);
  }
}

async function bumpSetting(key, delta, min, max) {
  const next = Math.min(max, Math.max(min, (state.settings[key] ?? 0) + delta));
  state.settings = await state.api.settings.save({ [key]: next });
  render();
}

// --------------------------------------------------------------- editor

function openEditorFor(rowId) {
  if (isDemo()) return;
  const row = state.rows.find((r) => r.id === rowId);
  if (!row) return;
  state.editing = { rowId };
  ui.openEditor({ row });
}

function openEditorNew(dateKey) {
  if (isDemo()) { ui.toast('Exit the demo to edit your own data', 'warn'); return; }
  state.editing = { rowId: null, dateKey };
  ui.openEditor({ defaultDateKey: dateKey });
}

async function saveEditor() {
  const { start, end, kind } = ui.editorValues();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    ui.editorError('Enter both times.');
    return;
  }
  if (end <= start) { ui.editorError('Wake time must be after sleep time.'); return; }
  const durMin = (end - start) / 60000;
  if (durMin > 24 * 60) { ui.editorError('Longer than 24 hours — check the dates.'); return; }
  try {
    if (state.editing?.rowId) {
      const row = state.rows.find((r) => r.id === state.editing.rowId);
      await state.api.rows.update(applyEdit(row, { start, end, kind }));
    } else {
      await state.api.rows.insert([makeManualRow({ start, end, kind })]);
    }
    await reloadRows();
    ui.closeEditor();
    ui.toast('Saved');
    render();
  } catch (err) {
    ui.editorError(err.message ?? 'Could not save.');
  }
}

async function deleteEditor() {
  if (!state.editing?.rowId) return;
  try {
    await state.api.rows.softDelete(state.editing.rowId);
    await reloadRows();
    ui.closeEditor();
    ui.toast('Deleted');
    render();
  } catch (err) {
    ui.editorError(err.message ?? 'Could not delete.');
  }
}

// ----------------------------------------------------------------- demo

function exitDemo() {
  state.demoRows = null;
  state.skipped = 0;
  state.inBedFallback = false;
  clearHash();
  render();
}

// ------------------------------------------------------------- calendar

async function linkCalendar() {
  try {
    await cal.getToken({ interactive: true });
    state.calendar.linked = true;
    state.calendar.error = null;
    safeSet(CAL_LINKED_KEY, '1');
    await refreshCalendar();
    ui.toast('Calendar linked');
    render();
  } catch (err) {
    state.calendar.error = err.message;
    render();
  }
}

function unlinkCalendar() {
  cal.forgetToken();
  safeDel(CAL_LINKED_KEY);
  state.calendar = { linked: false, todayEvents: [], tomorrowFirstEvent: null, error: null };
  render();
}

boot();
