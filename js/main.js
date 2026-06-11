// main.js — bootstrap and event wiring.

import { parseFragment, parseAnyInput, canonicalFragment } from './parse.js';
import { assembleNights } from './sessions.js';
import {
  sleepDebtMin, debtZone, debtSeries, energyPotential, suggestNeed, consistencyScore,
} from './metrics.js';
import { buildSchedule } from './schedule.js';
import { resolveNeed, saveNeed, clampNeed } from './settings.js';
import { makeDemoFragment } from './demo.js';
import * as ui from './render.js';

const $ = (id) => document.getElementById(id);

const store = {
  get(k) { return localStorage.getItem(k); },
  set(k, v) { localStorage.setItem(k, v); },
};

const baseUrl = location.protocol === 'file:'
  ? 'https://thisconnor.github.io/sleeptracker-/'
  : location.origin + location.pathname;

const state = { samples: [], skipped: 0, isDemo: false, needMin: 480, suggestion: null };

const DEMO_KINDS = new Set(['iphone', 'watch', 'messy']);
const demoKind = (k) => (DEMO_KINDS.has(k) ? k : 'watch');

function loadFromHash() {
  const parsed = parseFragment(location.hash.slice(1));
  state.needMin = resolveNeed(parsed.needRaw, store).needMin;
  if (parsed.demo) {
    const demo = parseFragment(makeDemoFragment(demoKind(parsed.demo)));
    state.samples = demo.samples;
    state.skipped = demo.skipped;
    state.isDemo = true;
  } else {
    state.samples = parsed.samples;
    state.skipped = parsed.skipped;
    state.isDemo = false;
  }
  render();
}

function render() {
  const now = new Date();
  if (state.samples.length === 0) {
    ui.renderHeader(now, null);
    state.suggestion = null;
    syncSettings();
    ui.showView('empty');
    return;
  }
  const { nights, inBedFallback } = assembleNights(state.samples, now);
  const debtMin = sleepDebtMin(nights, state.needMin);
  const energy = energyPotential(debtMin);
  state.suggestion = suggestNeed(nights);
  const vm = {
    now,
    nights,
    inBedFallback,
    needMin: state.needMin,
    debtMin,
    zone: debtZone(debtMin),
    energy,
    series: debtSeries(nights, state.needMin),
    consistency: consistencyScore(nights),
    schedule: buildSchedule(nights, state.needMin, energy, now),
    missingCount: nights.filter((n) => !n.hasData).length,
    skipped: state.skipped,
    isDemo: state.isDemo,
  };
  const freshness = state.samples.reduce((m, s) => (s.end > m ? s.end : m), state.samples[0].end);
  ui.renderHeader(now, freshness);
  ui.renderDashboard(vm);
  syncSettings();
  ui.showView('dashboard');
}

function syncSettings() {
  ui.updateSettingsPanel({ needMin: state.needMin, suggestion: state.suggestion, baseUrl });
}

function setNeed(min) {
  const n = clampNeed(min);
  if (n == null || n === state.needMin) return;
  state.needMin = n;
  saveNeed(n, store);
  render();
}

function loadPasted(text, errEl) {
  errEl.hidden = true;
  const parsed = parseAnyInput(text);
  if (parsed.demo) {
    location.hash = 'demo';
    loadFromHash();
    return true;
  }
  if (parsed.samples.length === 0) {
    errEl.textContent = parsed.skipped > 0
      ? `Found ${parsed.skipped} rows but none could be read — check the Shortcut's date format (yyyyMMddHHmm).`
      : 'No sleep rows found in that text.';
    errEl.hidden = false;
    return false;
  }
  const frag = canonicalFragment(text);
  if (location.hash.slice(1) === frag) loadFromHash();
  else location.hash = frag; // hashchange triggers loadFromHash
  return true;
}

function wireUp() {
  const dialog = $('settings');
  $('settings-btn').addEventListener('click', () => dialog.showModal());
  $('settings-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  $('need-minus').addEventListener('click', () => setNeed(state.needMin - 15));
  $('need-plus').addEventListener('click', () => setNeed(state.needMin + 15));
  $('use-suggestion').addEventListener('click', () => {
    if (state.suggestion != null) setNeed(state.suggestion);
  });

  $('copy-snippet').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('url-snippet').textContent);
      $('copy-done').hidden = false;
      setTimeout(() => { $('copy-done').hidden = true; }, 1600);
    } catch {
      // Clipboard unavailable (insecure context); the snippet is
      // select-all on tap, so manual copy still works.
    }
  });

  for (const id of ['demo-btn', 'demo-btn-2']) {
    $(id).addEventListener('click', () => {
      dialog.close();
      if (location.hash === '#demo') loadFromHash();
      else location.hash = 'demo';
    });
  }

  $('paste-btn').addEventListener('click', () => {
    loadPasted($('paste-box').value, $('paste-error'));
  });
  $('paste-btn-2').addEventListener('click', () => {
    if (loadPasted($('paste-box-2').value, $('paste-error-2'))) dialog.close();
  });

  window.addEventListener('hashchange', loadFromHash);
}

wireUp();
loadFromHash();

// Console helper for trying synthetic datasets end-to-end:
//   location.hash = makeDemoFragment('iphone' | 'watch' | 'messy')
window.makeDemoFragment = makeDemoFragment;
