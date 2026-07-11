// social.js — pure helpers for the friends leaderboard. No DOM, no network.

export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export function normalizeHandle(raw) {
  const h = String(raw ?? '').trim().toLowerCase().replace(/^@/, '');
  return HANDLE_RE.test(h) ? h : null;
}

const STALE_MS = 48 * 3600e3;

// Assemble the ranked board: you + accepted friends, lowest debt first.
// Friends whose stats are older than 48h rank after fresh ones and are
// flagged so the UI can dim them. Ties share a rank.
export function buildBoard({ me, friends = [], now = new Date() }) {
  const rows = [];
  if (me) {
    rows.push({
      isMe: true,
      name: me.name || 'You',
      handle: me.handle ?? null,
      debtMin: Math.round(me.debtMin ?? 0),
      energy: me.energy ?? null,
      stale: false,
    });
  }
  for (const f of friends) {
    if (f.debtMin == null) continue; // never shared stats yet
    rows.push({
      isMe: false,
      name: f.displayName || f.handle,
      handle: f.handle,
      debtMin: Math.round(f.debtMin),
      energy: f.energy ?? null,
      stale: f.updatedAt ? now.getTime() - new Date(f.updatedAt).getTime() > STALE_MS : true,
    });
  }
  rows.sort((a, b) => (a.stale !== b.stale ? (a.stale ? 1 : -1) : a.debtMin - b.debtMin));
  let rank = 0;
  let prevKey = null;
  rows.forEach((r, i) => {
    const key = `${r.stale}:${r.debtMin}`;
    if (key !== prevKey) { rank = i + 1; prevKey = key; }
    r.rank = rank;
  });
  return rows;
}

// The demo board seen in demo/local mode, so the feature shows itself
// before the backend exists.
export function demoBoard(myDebtMin) {
  return buildBoard({
    me: { name: 'You', debtMin: myDebtMin, energy: null },
    friends: [
      { displayName: 'Alex', handle: 'alex_sleeps', debtMin: 186, energy: 82, updatedAt: new Date().toISOString() },
      { displayName: 'Sam', handle: 'sam_owl', debtMin: 405, energy: 61, updatedAt: new Date().toISOString() },
      { displayName: 'Riley', handle: 'riley_r', debtMin: 522, energy: 48, updatedAt: new Date().toISOString() },
    ],
  });
}
