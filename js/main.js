// main.js — state, boot, and event dispatch. Rendering lives in js/ui/*.

import { parseFragment, parseAnyInput } from './parse.js';
import { buildSessions } from './sessions.js';
import {
  sleepDebtMin, debtZone, debtSeries, energyPotential, suggestNeed, consistencyScore,
} from './metrics.js';
import { buildSchedule } from './schedule.js';
import { bedtimePlan, napSuggestions, busyBlocks } from './planner.js';
import { demoStoreRows } from './demo.js';
import {
  sessionsToRows, mergeImport, nightsFromRows, applyEdit, makeManualRow,
  reconcileTimer,
} from './store.js';
import { initApi, DEFAULT_SETTINGS } from './api.js';
import * as cal from './calendar.js';
import { pickGreeting } from './greeting.js';
import { normalizeHandle, buildBoard, demoBoard } from './social.js';
import { goodZoneStreaks, celebrationFor } from './streaks.js';
import * as ui from './ui/views.js';
import { loadMotion, attachPressFeedback, dismissSplash as animatedSplashOut, celebrate } from './ui/anim.js';
import { dateKey } from './sessions.js';

const $ = (id) => document.getElementById(id);

const GUEST_KEY = 'guestMode.v1';
const CAL_LINKED_KEY = 'calendarLinked.v1';
const TIMER_KEY = 'activeTimer.v1';
const TREND_DETAIL_KEY = 'trendDetail.v1';
const ONBOARDED_KEY = 'onboarded.v1';
const CELEBRATED_KEY = 'celebrated.v1';
const STATS_PUSH_KEY = 'statsPushedAt.v1';
const WELCOME_DISMISSED_KEY = 'welcomeDismissed.v1';

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
  trendDetail: 'clean',
  trendRowsExpanded: false,
  logCount: 4,
  editing: null, // { rowId } | { dateKey } | null
  timer: null, // { startedAt: ISO, kind } while a live sleep/nap is running
  timerPending: false, // the confirm sheet for a finished timer is open
  calendar: { linked: false, todayEvents: [], tomorrowFirstEvent: null, error: null },
  calendarConfigured: cal.calendarConfigured(),
  social: { supported: false, user: null, profile: null, connections: null, board: [], demoBoard: [] },
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
  const todayBlocks = state.calendar.linked ? busyBlocks(state.calendar.todayEvents) : [];
  const plan = bedtimePlan({
    nights: nights14,
    settings: state.settings,
    debtMin,
    now,
    tomorrowFirstEvent: state.calendar.linked ? state.calendar.tomorrowFirstEvent : null,
    lastEventEnd: todayBlocks.length ? todayBlocks[todayBlocks.length - 1].end : null,
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
  const streaks = goodZoneStreaks(nightsLong, seriesLong);
  return {
    now,
    streaks,
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
    marginMin: state.settings.sleepOnsetMarginMin ?? 15,
  };
}

function render() {
  const vm = compute();
  ui.setTopbar(state.view, vm, { isDemo: isDemo() });
  $('welcome-card').hidden = activeRows().some((r) => !r.deleted)
    || safeGet(WELCOME_DISMISSED_KEY) === '1';
  if (state.view === 'today') {
    $('view-subtitle').textContent = ui.greetingSubtitle(vm.now, vm.freshness);
    const name = state.settings.displayName?.trim()
      || (state.user?.email ? state.user.email.split('@')[0] : null);
    ui.setHeaderGreeting(pickGreeting({
      name,
      now: vm.now,
      nights: vm.nights14,
      plan: vm.plan,
      schedule: vm.schedule,
      timerKind: state.timer?.kind ?? null,
      debtMin: vm.debtMin,
      needMin: vm.needMin,
    }));
    ui.renderLogNow(vm, state.timer);
    ui.renderToday(vm);
    syncSocialState(vm);
    ui.renderFriends(vm, state.social);
    maybeCelebrate(vm);
    pushStatsThrottled(vm);
  } else if (state.view === 'sleep') {
    $('view-subtitle').textContent = '';
    ui.renderSleepLog(vm, state.logCount);
  } else if (state.view === 'trends') {
    $('view-subtitle').textContent = '';
    ui.renderTrends(vm, state.trendRange, state.trendDetail, state.trendRowsExpanded);
  } else if (state.view === 'settings') {
    $('view-subtitle').textContent = '';
    ui.renderSettings(state, vm);
    ui.renderSocialSettings(state.social);
  }
}

// ---------------------------------------------------------------- social

function syncSocialState(vm) {
  state.social.supported = state.api.social?.supported ?? false;
  state.social.user = state.user;
  state.social.demoBoard = demoBoard(vm.debtMin);
  if (state.social.supported && state.user && state.social.connections) {
    state.social.board = buildBoard({
      me: {
        name: state.settings.displayName || 'You',
        handle: state.social.profile?.handle,
        debtMin: vm.debtMin,
        energy: vm.energy,
      },
      friends: state.social.connections.friends,
      now: vm.now,
    });
  }
}

async function loadSocial() {
  if (!state.api.social?.supported || !state.user) return;
  try {
    state.social.profile = await state.api.social.profile();
    state.social.connections = await state.api.social.connections();
  } catch (err) {
    console.error('social load failed:', err);
  }
}

// Share the headline numbers with friends at most every 30 minutes
// (throttled per account — profiles can share a browser).
function pushStatsThrottled(vm) {
  if (!state.api.social?.supported || !state.user || !state.social.profile?.handle || isDemo()) return;
  const key = `${STATS_PUSH_KEY}:${state.user.id}`;
  const last = Number(safeGet(key) ?? 0);
  if (Date.now() - last < 30 * 60000) return;
  safeSet(key, String(Date.now()));
  state.api.social.pushStats({ debtMin: vm.debtMin, energy: vm.energy }).catch(() => {});
}

// The claim UI renders in both the Today friends card and Settings, so
// resolve the input and error line relative to the button that was tapped.
async function saveHandle(btn) {
  const row = btn.closest('.handle-row');
  const input = row?.querySelector('input');
  const errEl = row?.parentElement.querySelector('.error');
  const showErr = (msg) => {
    if (errEl) { errEl.textContent = msg ?? ''; errEl.hidden = !msg; }
  };
  const handle = normalizeHandle(input?.value);
  if (!handle) {
    showErr('3–20 characters: letters, numbers, underscores.');
    return;
  }
  try {
    await state.api.social.setHandle(handle, state.settings.displayName ?? null);
    state.social.profile = { handle, displayName: state.settings.displayName ?? null };
    ui.toast(`You're @${handle}`);
    render();
  } catch (err) {
    showErr(err.message);
  }
}

async function friendSearch() {
  const raw = $('friend-search')?.value;
  const handle = normalizeHandle(raw);
  if (!handle) { ui.friendSearchResult(null, '3–20 characters: letters, numbers, underscores.'); return; }
  if (handle === state.social.profile?.handle) { ui.friendSearchResult(null, 'That would be you.'); return; }
  try {
    const result = await state.api.social.search(handle);
    ui.friendSearchResult(result, null);
  } catch (err) {
    ui.friendSearchResult(null, err.message);
  }
}

async function friendAction(kind, id) {
  try {
    if (kind === 'request') await state.api.social.request(id);
    else if (kind === 'accept') await state.api.social.accept(id);
    else if (kind === 'remove') await state.api.social.remove(id);
    state.social.connections = await state.api.social.connections();
    ui.toast(kind === 'request' ? 'Request sent' : kind === 'accept' ? 'Friend added' : 'Removed');
    render();
  } catch (err) {
    ui.toast(err.message, 'warn');
  }
}

// ----------------------------------------------------------- celebrations

function maybeCelebrate(vm) {
  if (isDemo()) return;
  const event = celebrationFor({
    debtMin: vm.debtMin,
    streaks: vm.streaks,
    hasAnyData: vm.nights14.some((n) => n.hasData),
  });
  if (!event) return;
  const stamp = `${dateKey(vm.now)}:${event.id}`;
  if (safeGet(CELEBRATED_KEY) === stamp) return;
  safeSet(CELEBRATED_KEY, stamp);
  setTimeout(() => {
    celebrate($('debt-hero'));
    ui.toast(event.message);
  }, 650);
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
  try {
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
  } catch (err) {
    ui.toast(`Sync failed: ${err.message}`, 'warn');
    return 0;
  }
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
  adoptTimer();
  await loadSocial();
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
  loadMotion(); // fire-and-forget: springs upgrade in when the CDN answers
  attachPressFeedback(document);
  state.timer = readLocalTimer();
  state.trendDetail = safeGet(TREND_DETAIL_KEY) === 'advanced' ? 'advanced' : 'clean';
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
  animatedSplashOut(document.getElementById('splash'));

  // Brand-new visitor with nothing loaded: explain the app first.
  const peek = parseFragment(location.hash.slice(1));
  const isFresh = !safeGet(ONBOARDED_KEY) && !state.user
    && !peek.demo && peek.samples.length === 0
    && state.rows.filter((r) => !r.deleted).length === 0;
  if (isFresh) {
    ui.showOnboarding({ canLogin: state.api.mode === 'supabase' });
    return;
  }
  await routeAfterOnboarding();
}

async function routeAfterOnboarding() {
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

function finishOnboarding() {
  safeSet(ONBOARDED_KEY, '1');
  ui.hideOnboarding();
  routeAfterOnboarding();
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
    else if (a === 'try-demo') { location.hash = 'demo'; }
    else if (a === 'dismiss-welcome') {
      safeSet(WELCOME_DISMISSED_KEY, '1');
      $('welcome-card').hidden = true;
      ui.toast('Hidden — the Shortcut guide stays in Settings and the README');
    }
    else if (a === 'timer-start') startTimer(el.dataset.kind);
    else if (a === 'timer-finish') finishTimer();
    else if (a === 'timer-discard') discardTimer();
    else if (a === 'log-more') { state.logCount = 14; render(); }
    else if (a === 'log-less') { state.logCount = 4; render(); window.scrollTo({ top: 0 }); }
    else if (a === 'trend-rows-more') { state.trendRowsExpanded = true; render(); }
    else if (a === 'trend-rows-less') { state.trendRowsExpanded = false; render(); }
    else if (a === 'goto-settings') switchView('settings');
    else if (a === 'save-handle') saveHandle(el);
    else if (a === 'friend-search') friendSearch();
    else if (a === 'friend-request') friendAction('request', el.dataset.id);
    else if (a === 'friend-accept') friendAction('accept', el.dataset.id);
    else if (a === 'friend-remove') friendAction('remove', el.dataset.id);
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
  $('auth-google').addEventListener('click', async () => {
    await authAction(async () => {
      await state.api.auth.signInGoogle();
      // signInGoogle navigates away on success; an error lands here.
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
  $('repay-minus').addEventListener('click', () => bumpSetting('repayFixedMin', -15, 0, 120));
  $('repay-plus').addEventListener('click', () => bumpSetting('repayFixedMin', 15, 0, 120));
  $('margin-minus').addEventListener('click', () => bumpSetting('sleepOnsetMarginMin', -5, 0, 45));
  $('margin-plus').addEventListener('click', () => bumpSetting('sleepOnsetMarginMin', 5, 0, 45));
  for (const b of document.querySelectorAll('#repay-mode button')) {
    b.addEventListener('click', async () => {
      state.settings = await state.api.settings.save({ repayMode: b.dataset.repay });
      render();
    });
  }

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

  // trends range + detail
  for (const b of document.querySelectorAll('#trend-range button')) {
    b.addEventListener('click', () => {
      state.trendRange = Number(b.dataset.range);
      render();
    });
  }
  for (const b of document.querySelectorAll('#trend-detail button')) {
    b.addEventListener('click', () => {
      state.trendDetail = b.dataset.detail;
      safeSet(TREND_DETAIL_KEY, state.trendDetail);
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
  $('editor').addEventListener('close', () => {
    // Cancelling the confirm sheet keeps a finished timer running so the
    // user can re-open it; only a save or an explicit discard clears it.
    if (state.timerPending) { state.timerPending = false; render(); }
  });
  $('editor-form').addEventListener('submit', (e) => { e.preventDefault(); saveEditor(); });
  $('edit-delete').addEventListener('click', deleteEditor);
  $('editor').addEventListener('click', (e) => {
    if (e.target === $('editor')) ui.closeEditor();
  });

  // onboarding
  $('ob-next').addEventListener('click', () => {
    if (ui.obAdvance()) finishOnboarding();
  });
  $('ob-skip').addEventListener('click', finishOnboarding);

  window.addEventListener('hashchange', async () => {
    if (location.hash.replace('#', '') === '') return;
    if (!document.getElementById('onboarding').hidden) {
      safeSet(ONBOARDED_KEY, '1');
      ui.hideOnboarding();
    }
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
    clearTimerAfterSave();
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

// ---------------------------------------------------------- live logging

function readLocalTimer() {
  try {
    const t = JSON.parse(safeGet(TIMER_KEY));
    if (t?.startedAt && ['sleep', 'nap'].includes(t.kind)) return t;
  } catch { /* ignore */ }
  return null;
}

// Persist the timer locally (offline cache) AND to the account when signed
// in, so a timer started on the phone can be finished on any device.
function writeTimer(timer) {
  state.timer = timer;
  if (timer) safeSet(TIMER_KEY, JSON.stringify(timer));
  else safeDel(TIMER_KEY);
  if (state.api?.mode === 'supabase' && state.user) {
    state.api.settings
      .save({ timerStartedAt: timer?.startedAt ?? null, timerKind: timer?.kind ?? null })
      .then((s) => { state.settings = s; })
      .catch(() => { /* offline — the local cache still carries it */ });
  }
}

// On entry (boot or sign-in), merge this device's cached timer with the
// account's copy. The server wins; a fresh local-only timer is pushed up.
function adoptTimer() {
  const serverTimer = state.settings.timerStartedAt
    ? { startedAt: state.settings.timerStartedAt, kind: state.settings.timerKind ?? 'sleep' }
    : null;
  const { timer, pushToServer, clearServer } = reconcileTimer(readLocalTimer(), serverTimer);
  state.timer = timer;
  if (timer) safeSet(TIMER_KEY, JSON.stringify(timer));
  else safeDel(TIMER_KEY);
  if ((pushToServer || clearServer) && state.api?.mode === 'supabase' && state.user) {
    writeTimer(timer);
  }
}

function startTimer(kind) {
  if (isDemo()) { ui.toast('Exit the demo first', 'warn'); return; }
  writeTimer({ startedAt: new Date().toISOString(), kind: kind === 'nap' ? 'nap' : 'sleep' });
  ui.toast(kind === 'nap' ? 'Nap timer running — tap "I\'m awake" after' : 'Sleep timer running — see you in the morning');
  render();
}

function finishTimer() {
  if (!state.timer) return;
  const pressed = new Date(state.timer.startedAt);
  const end = new Date();
  const margin = state.settings.sleepOnsetMarginMin ?? 15;
  const elapsedMin = (end - pressed) / 60000;
  if (elapsedMin < 3) {
    ui.toast('Under 3 minutes — nothing worth logging yet. Keep resting, or discard the timer.', 'warn');
    return;
  }
  // Apply the fall-asleep margin unless it would eat the whole session.
  const appliedMargin = elapsedMin - margin >= 5 ? margin : 0;
  const start = new Date(pressed.getTime() + appliedMargin * 60000);
  state.editing = { rowId: null };
  state.timerPending = true;
  ui.openEditor({
    prefill: { start, end, kind: state.timer.kind },
    title: 'Confirm your sleep',
    note: appliedMargin > 0
      ? `Start includes your ${appliedMargin}-minute fall-asleep margin (button pressed ${ui.fmtClock(pressed)}). Adjust anything before saving.`
      : 'Too short for the fall-asleep margin — times are exactly as pressed. Adjust anything before saving.',
  });
}

function discardTimer() {
  state.timerPending = false;
  writeTimer(null);
  ui.toast('Timer discarded');
  render();
}

function clearTimerAfterSave() {
  if (!state.timerPending) return;
  state.timerPending = false;
  writeTimer(null);
}

// Keep the elapsed readout fresh while a timer runs.
setInterval(() => {
  if (state.timer && state.view === 'today' && !document.hidden && !document.getElementById('editor').open) {
    render();
  }
}, 60000);

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
