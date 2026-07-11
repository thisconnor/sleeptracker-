// store.js — the session row model shared by local mode and the backend.
// Pure module: no DOM, no network.
//
// A "row" is one stored sleep session or nap:
//   { id, start: Date, end: Date, kind: 'sleep'|'nap', asleepMin,
//     inBedMin|null, stages|null, source: 'import'|'manual',
//     importHash|null, deleted: bool }
//
// Import rules (what makes re-running the Shortcut safe):
//   - every imported session gets importHash = `${startEpochMin}-${endEpochMin}`
//   - an incoming session whose hash already exists is skipped — even if the
//     stored row was edited (source flipped to 'manual') or deleted
//     (tombstone), so user changes survive re-imports
//   - an incoming session that substantially overlaps any live stored row is
//     skipped too (Health sometimes re-emits a night with slightly shifted
//     boundaries; a 1-minute shift must not duplicate the night)

import { dateKey, minuteOfDay } from './sessions.js';

const MS_PER_MIN = 60000;

export function hashInterval(start, end) {
  const s = Math.round(new Date(start).getTime() / MS_PER_MIN);
  const e = Math.round(new Date(end).getTime() / MS_PER_MIN);
  return `${s}-${e}`;
}

let idCounter = 0;
export function makeLocalId() {
  idCounter += 1;
  return `local-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Convert assembled sessions (from sessions.js buildSessions/assembleNights)
// into storable rows.
export function sessionsToRows(sessions) {
  return sessions.map((s) => ({
    id: makeLocalId(),
    start: new Date(s.start),
    end: new Date(s.end),
    kind: s.isNap ? 'nap' : 'sleep',
    asleepMin: Math.round(s.asleepMin),
    inBedMin: s.inBedMin ? Math.round(s.inBedMin) : null,
    stages: s.hasStages || s.stages?.awake > 0 ? s.stages : null,
    source: 'import',
    importHash: hashInterval(s.start, s.end),
    deleted: false,
  }));
}

function overlapMin(a, b) {
  const s = Math.max(a.start.getTime(), b.start.getTime());
  const e = Math.min(a.end.getTime(), b.end.getTime());
  return Math.max(0, e - s) / MS_PER_MIN;
}

const durationMin = (r) => (r.end.getTime() - r.start.getTime()) / MS_PER_MIN;

// Decide which incoming import rows are genuinely new.
export function mergeImport(existingRows, incomingRows) {
  const knownHashes = new Set(
    existingRows.map((r) => r.importHash).filter(Boolean),
  );
  const live = existingRows.filter((r) => !r.deleted);
  const fresh = [];
  for (const row of incomingRows) {
    if (row.importHash && knownHashes.has(row.importHash)) continue;
    const dup = live.some((r) => {
      const ov = overlapMin(r, row);
      return ov > 0.5 * Math.min(durationMin(r), durationMin(row));
    });
    if (dup) continue;
    fresh.push(row);
    knownHashes.add(row.importHash);
  }
  return fresh;
}

// Apply a user edit to a row: it becomes manual (so it wins over imports)
// but keeps its importHash (so the original can never re-import).
export function applyEdit(row, patch) {
  const next = { ...row, ...patch, source: 'manual' };
  next.start = new Date(next.start);
  next.end = new Date(next.end);
  if (patch.start || patch.end) {
    // Times changed by hand: awake gaps inside the old record are unknowable
    // now, so the span is the sleep time. Stage detail no longer matches.
    if (patch.asleepMin == null) next.asleepMin = Math.round(durationMin(next));
    next.stages = null;
    next.inBedMin = null;
  }
  return next;
}

export function makeManualRow({ start, end, kind = 'sleep' }) {
  const row = {
    id: makeLocalId(),
    start: new Date(start),
    end: new Date(end),
    kind,
    asleepMin: 0,
    inBedMin: null,
    stages: null,
    source: 'manual',
    importHash: null,
    deleted: false,
  };
  row.asleepMin = Math.round(durationMin(row));
  return row;
}

// Rebuild the nights[] structure (the shape metrics.js and schedule.js
// consume) from stored rows. Rows fully contained inside another live row
// of the same day are ignored to avoid double counting.
export function nightsFromRows(rows, now = new Date(), days = 14) {
  const live = rows
    .filter((r) => !r.deleted)
    .slice()
    .sort((a, b) => a.start - b.start);

  const byKey = new Map();
  for (const row of live) {
    const key = dateKey(row.end);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
  }

  const nights = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dateKey(date);
    const all = byKey.get(key) ?? [];
    const kept = all.filter(
      (r) => !all.some((other) => other !== r && contains(other, r)),
    );
    const list = kept.map(rowToSessionView);
    const main = list
      .filter((s) => !s.isNap)
      .sort((a, b) => b.asleepMin - a.asleepMin)[0] ?? null;
    nights.push({
      date,
      key,
      sessions: list,
      mainSession: main,
      naps: list.filter((s) => s.isNap),
      totalMin: list.reduce((t, s) => t + s.asleepMin, 0),
      hasData: list.length > 0,
    });
  }
  return nights;
}

const contains = (outer, inner) =>
  outer.start <= inner.start && outer.end >= inner.end &&
  durationMin(outer) > durationMin(inner);

// A view over a row matching the session shape the rest of the app expects.
export function rowToSessionView(row) {
  const stages = row.stages ?? { core: 0, deep: 0, rem: 0, awake: 0 };
  return {
    id: row.id,
    row,
    start: row.start.getTime(),
    end: row.end.getTime(),
    asleepMin: row.asleepMin,
    inBedMin: row.inBedMin ?? 0,
    efficiency: row.inBedMin ? Math.min(1, row.asleepMin / row.inBedMin) : null,
    stages,
    hasStages: stages.core + stages.deep + stages.rem > 0,
    isNap: row.kind === 'nap',
    midMin: minuteOfDay(new Date((row.start.getTime() + row.end.getTime()) / 2)),
  };
}

// ---- live timer reconciliation ----

export const TIMER_MAX_AGE_MS = 24 * 3600e3;

const timerFresh = (t, now) => {
  if (!t?.startedAt || !['sleep', 'nap'].includes(t.kind)) return false;
  const age = now.getTime() - new Date(t.startedAt).getTime();
  return age < TIMER_MAX_AGE_MS && age > -60000;
};

// Decide which live timer wins between this device's cache and the
// account's server-side copy. The server is authoritative (it's what other
// devices see); a fresh local-only timer gets pushed up; stale server
// timers get cleared.
export function reconcileTimer(localTimer, serverTimer, now = new Date()) {
  if (timerFresh(serverTimer, now)) {
    return { timer: serverTimer, pushToServer: false, clearServer: false };
  }
  if (timerFresh(localTimer, now)) {
    return { timer: localTimer, pushToServer: true, clearServer: false };
  }
  return { timer: null, pushToServer: false, clearServer: Boolean(serverTimer?.startedAt) };
}

// ---- (de)serialization used by local mode and the API layer ----

export function rowToJSON(r) {
  return {
    id: r.id,
    start: r.start.toISOString(),
    end: r.end.toISOString(),
    kind: r.kind,
    asleepMin: r.asleepMin,
    inBedMin: r.inBedMin,
    stages: r.stages,
    source: r.source,
    importHash: r.importHash,
    deleted: r.deleted,
  };
}

export function rowFromJSON(j) {
  return {
    ...j,
    start: new Date(j.start),
    end: new Date(j.end),
    inBedMin: j.inBedMin ?? null,
    stages: j.stages ?? null,
    importHash: j.importHash ?? null,
    deleted: Boolean(j.deleted),
  };
}
