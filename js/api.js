// api.js — one interface, two backends.
//
// When js/config.js has Supabase credentials, this talks to Supabase
// (auth + Postgres with row-level security). Without them the app runs in
// LOCAL MODE: a guest "account" whose rows live in this browser's
// localStorage. Both expose the same surface so the rest of the app never
// branches on the backend.

import { CONFIG } from './config.js';
import { rowToJSON, rowFromJSON } from './store.js';

const LOCAL_ROWS_KEY = 'sleepRows.v1';
const LOCAL_SETTINGS_KEY = 'sleepSettings.v1';

export const DEFAULT_SETTINGS = {
  displayName: null,
  needMin: 480,
  caffeineGapMin: 600,
  wakeTargetMin: null,
  prepBufferMin: 60,
  debtMode: 'weighted',
  sleepOnsetMarginMin: 15,
  repayMode: 'auto',
  repayFixedMin: 30,
  timerStartedAt: null,
  timerKind: null,
};

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

// --------------------------------------------------------------- local

function makeLocalApi() {
  const readRows = () => {
    try { return (JSON.parse(safeGet(LOCAL_ROWS_KEY)) ?? []).map(rowFromJSON); }
    catch { return []; }
  };
  const writeRows = (rows) =>
    safeSet(LOCAL_ROWS_KEY, JSON.stringify(rows.map(rowToJSON)));

  return {
    mode: 'local',
    auth: {
      async getUser() { return null; },
      onChange() {},
      async signInPassword() { throw new Error('No backend configured'); },
      async signUpPassword() { throw new Error('No backend configured'); },
      async signInMagic() { throw new Error('No backend configured'); },
      async resetPassword() { throw new Error('No backend configured'); },
      async signOut() {},
    },
    rows: {
      async list() { return readRows(); },
      async insert(rows) {
        if (rows.length) writeRows([...readRows(), ...rows]);
        return rows;
      },
      async update(row) {
        writeRows(readRows().map((r) => (r.id === row.id ? row : r)));
        return row;
      },
      async softDelete(id) {
        writeRows(readRows().map((r) => (r.id === id ? { ...r, deleted: true } : r)));
      },
    },
    social: { supported: false },
    settings: {
      async load() {
        try {
          const stored = JSON.parse(safeGet(LOCAL_SETTINGS_KEY)) ?? {};
          // Migrate the v1 single-key setting if present.
          const legacyNeed = Number(safeGet('sleepNeedMin'));
          if (!stored.needMin && Number.isFinite(legacyNeed) && legacyNeed > 0) {
            stored.needMin = legacyNeed;
          }
          return { ...DEFAULT_SETTINGS, ...stored };
        } catch { return { ...DEFAULT_SETTINGS }; }
      },
      async save(patch) {
        const current = await this.load();
        const next = { ...current, ...patch };
        safeSet(LOCAL_SETTINGS_KEY, JSON.stringify(next));
        return next;
      },
    },
  };
}

// ------------------------------------------------------------- supabase

const toDb = (r) => ({
  start_ts: r.start.toISOString(),
  end_ts: r.end.toISOString(),
  kind: r.kind,
  asleep_min: r.asleepMin,
  in_bed_min: r.inBedMin,
  stages: r.stages,
  source: r.source,
  import_hash: r.importHash,
  deleted: r.deleted,
});

const fromDb = (d) => rowFromJSON({
  id: d.id,
  start: d.start_ts,
  end: d.end_ts,
  kind: d.kind,
  asleepMin: d.asleep_min,
  inBedMin: d.in_bed_min,
  stages: d.stages,
  source: d.source,
  importHash: d.import_hash,
  deleted: d.deleted,
});

const settingsFromDb = (d) => ({
  displayName: d.display_name,
  needMin: d.need_min,
  caffeineGapMin: d.caffeine_gap_min,
  wakeTargetMin: d.wake_target_min,
  prepBufferMin: d.prep_buffer_min,
  debtMode: d.debt_mode,
  sleepOnsetMarginMin: d.sleep_onset_margin_min,
  repayMode: d.repay_mode,
  repayFixedMin: d.repay_fixed_min,
  timerStartedAt: d.timer_started_at,
  timerKind: d.timer_kind,
});

const settingsToDb = (s) => {
  const out = {};
  if ('displayName' in s) out.display_name = s.displayName;
  if ('needMin' in s) out.need_min = s.needMin;
  if ('caffeineGapMin' in s) out.caffeine_gap_min = s.caffeineGapMin;
  if ('wakeTargetMin' in s) out.wake_target_min = s.wakeTargetMin;
  if ('prepBufferMin' in s) out.prep_buffer_min = s.prepBufferMin;
  if ('debtMode' in s) out.debt_mode = s.debtMode;
  if ('sleepOnsetMarginMin' in s) out.sleep_onset_margin_min = s.sleepOnsetMarginMin;
  if ('repayMode' in s) out.repay_mode = s.repayMode;
  if ('repayFixedMin' in s) out.repay_fixed_min = s.repayFixedMin;
  if ('timerStartedAt' in s) out.timer_started_at = s.timerStartedAt;
  if ('timerKind' in s) out.timer_kind = s.timerKind;
  return out;
};

async function makeSupabaseApi() {
  const { createClient } = await import(
    'https://esm.sh/@supabase/supabase-js@2'
  );
  const client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

  const uid = async () => {
    const { data } = await client.auth.getUser();
    return data?.user?.id ?? null;
  };

  const bail = (error) => {
    if (error) throw new Error(error.message ?? String(error));
  };

  return {
    mode: 'supabase',
    client,
    auth: {
      async getUser() {
        const { data } = await client.auth.getSession();
        return data?.session?.user ?? null;
      },
      onChange(cb) {
        client.auth.onAuthStateChange((_event, session) => cb(session?.user ?? null));
      },
      async signInPassword(email, password) {
        const { error } = await client.auth.signInWithPassword({ email, password });
        bail(error);
      },
      async signUpPassword(email, password) {
        const { data, error } = await client.auth.signUp({ email, password });
        bail(error);
        return data;
      },
      async signInMagic(email) {
        const { error } = await client.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: location.origin + location.pathname },
        });
        bail(error);
      },
      async signInGoogle() {
        const { error } = await client.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: location.origin + location.pathname },
        });
        bail(error);
      },
      async resetPassword(email) {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + location.pathname,
        });
        bail(error);
      },
      async signOut() { await client.auth.signOut(); },
    },
    rows: {
      async list(sinceDays = 120) {
        const since = new Date(Date.now() - sinceDays * 864e5).toISOString();
        const { data, error } = await client
          .from('sleep_sessions')
          .select('*')
          .gte('end_ts', since)
          .order('end_ts', { ascending: true });
        bail(error);
        return (data ?? []).map(fromDb);
      },
      async insert(rows) {
        if (!rows.length) return [];
        const userId = await uid();
        const payload = rows.map((r) => ({ ...toDb(r), user_id: userId }));
        // Plain insert: mergeImport() already de-duplicates client-side, and
        // the partial unique index on (user_id, import_hash) backstops races
        // (e.g. two devices syncing at once). On a duplicate collision, fall
        // back to row-by-row so the non-duplicates still land.
        const { data, error } = await client.from('sleep_sessions').insert(payload).select();
        if (error?.code === '23505') {
          const kept = [];
          for (const row of payload) {
            const one = await client.from('sleep_sessions').insert(row).select();
            if (one.error && one.error.code !== '23505') bail(one.error);
            if (one.data?.length) kept.push(one.data[0]);
          }
          return kept.map(fromDb);
        }
        bail(error);
        return (data ?? []).map(fromDb);
      },
      async update(row) {
        const { data, error } = await client
          .from('sleep_sessions')
          .update({ ...toDb(row), updated_at: new Date().toISOString() })
          .eq('id', row.id)
          .select()
          .single();
        bail(error);
        return fromDb(data);
      },
      async softDelete(id) {
        const { error } = await client
          .from('sleep_sessions')
          .update({ deleted: true, updated_at: new Date().toISOString() })
          .eq('id', id);
        bail(error);
      },
    },
    social: {
      supported: true,
      async profile() {
        const { data, error } = await client.from('handles').select('*').eq('user_id', await uid()).maybeSingle();
        bail(error);
        return data ? { handle: data.handle, displayName: data.display_name } : null;
      },
      async setHandle(handle, displayName) {
        const { error } = await client.from('handles').upsert(
          { user_id: await uid(), handle, display_name: displayName ?? null, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        );
        if (error?.code === '23505') throw new Error('That handle is taken — try another.');
        bail(error);
      },
      async search(handle) {
        const { data, error } = await client.from('handles').select('*').eq('handle', handle).maybeSingle();
        bail(error);
        return data ? { userId: data.user_id, handle: data.handle, displayName: data.display_name } : null;
      },
      async request(addresseeId) {
        const { error } = await client.from('friendships').insert({
          requester_id: await uid(), addressee_id: addresseeId,
        });
        if (error?.code === '23505') throw new Error('Request already sent.');
        bail(error);
      },
      async accept(id) {
        const { error } = await client.from('friendships').update({ status: 'accepted' }).eq('id', id);
        bail(error);
      },
      async remove(id) {
        const { error } = await client.from('friendships').delete().eq('id', id);
        bail(error);
      },
      // Everything the friends UI needs in one call: accepted friends with
      // handle + stats, incoming pending requests, outgoing pending.
      async connections() {
        const myId = await uid();
        const { data: fr, error } = await client.from('friendships').select('*');
        bail(error);
        const rows = fr ?? [];
        const otherId = (f) => (f.requester_id === myId ? f.addressee_id : f.requester_id);
        const ids = [...new Set(rows.map(otherId))];
        let handles = [];
        let stats = [];
        if (ids.length) {
          const h = await client.from('handles').select('*').in('user_id', ids);
          bail(h.error);
          handles = h.data ?? [];
          const s = await client.from('shared_stats').select('*').in('user_id', ids);
          bail(s.error);
          stats = s.data ?? [];
        }
        const handleOf = (id) => handles.find((x) => x.user_id === id);
        const statOf = (id) => stats.find((x) => x.user_id === id);
        const decorate = (f) => {
          const id = otherId(f);
          return {
            friendshipId: f.id,
            userId: id,
            incoming: f.addressee_id === myId,
            handle: handleOf(id)?.handle ?? 'unknown',
            displayName: handleOf(id)?.display_name ?? null,
            debtMin: statOf(id)?.debt_min ?? null,
            energy: statOf(id)?.energy ?? null,
            updatedAt: statOf(id)?.updated_at ?? null,
          };
        };
        return {
          friends: rows.filter((f) => f.status === 'accepted').map(decorate),
          incoming: rows.filter((f) => f.status === 'pending' && f.addressee_id === myId).map(decorate),
          outgoing: rows.filter((f) => f.status === 'pending' && f.requester_id === myId).map(decorate),
        };
      },
      async pushStats({ debtMin, energy }) {
        const { error } = await client.from('shared_stats').upsert(
          { user_id: await uid(), debt_min: Math.round(debtMin), energy, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        );
        bail(error);
      },
    },
    settings: {
      async load() {
        const { data, error } = await client.from('settings').select('*').maybeSingle();
        bail(error);
        return data ? { ...DEFAULT_SETTINGS, ...settingsFromDb(data) } : { ...DEFAULT_SETTINGS };
      },
      async save(patch) {
        const userId = await uid();
        const { data, error } = await client
          .from('settings')
          .upsert(
            { user_id: userId, ...settingsToDb(patch), updated_at: new Date().toISOString() },
            { onConflict: 'user_id' },
          )
          .select()
          .single();
        bail(error);
        return { ...DEFAULT_SETTINGS, ...settingsFromDb(data) };
      },
    },
  };
}

export function backendConfigured() {
  return Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
}

export async function initApi() {
  if (backendConfigured()) {
    try {
      return await makeSupabaseApi();
    } catch (err) {
      console.error('Supabase unavailable, falling back to local mode:', err);
    }
  }
  return makeLocalApi();
}

export const LOCAL_KEYS = { rows: LOCAL_ROWS_KEY, settings: LOCAL_SETTINGS_KEY };
