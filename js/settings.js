// settings.js — sleep-need resolution. Pure module: the store is injected
// (main.js passes a localStorage wrapper; tests pass a plain object).
//
// Precedence: URL fragment > stored value > default. A need in the URL is
// written through to the store, so the daily Shortcut run keeps the cache
// fresh even though Safari wipes localStorage after 7 idle days.

export const DEFAULT_NEED_MIN = 480;
export const NEED_LIMITS = { min: 300, max: 690 };

export function clampNeed(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(NEED_LIMITS.max, Math.max(NEED_LIMITS.min, n)));
}

export function resolveNeed(urlNeed, store) {
  const fromUrl = clampNeed(urlNeed);
  if (fromUrl != null) {
    try { store.set('sleepNeedMin', String(fromUrl)); } catch { /* private mode */ }
    return { needMin: fromUrl, source: 'url' };
  }
  let stored = null;
  try { stored = store.get('sleepNeedMin'); } catch { /* private mode */ }
  const fromStore = clampNeed(stored);
  if (fromStore != null) return { needMin: fromStore, source: 'stored' };
  return { needMin: DEFAULT_NEED_MIN, source: 'default' };
}

export function saveNeed(needMin, store) {
  const n = clampNeed(needMin);
  if (n == null) return null;
  try { store.set('sleepNeedMin', String(n)); } catch { /* private mode */ }
  return n;
}
