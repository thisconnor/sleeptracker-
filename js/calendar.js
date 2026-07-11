// calendar.js — optional Google Calendar link, entirely client-side.
//
// Uses Google Identity Services' token client: the OAuth access token is
// requested in the browser, held in sessionStorage, and used to call the
// Calendar API directly. No token or event ever touches Supabase or any
// other server. Enabled only when CONFIG.GOOGLE_CLIENT_ID is set.

import { CONFIG } from './config.js';

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const TOKEN_KEY = 'gcalToken.v1';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

export const calendarConfigured = () => Boolean(CONFIG.GOOGLE_CLIENT_ID);

let gisReady = null;
function loadGis() {
  if (gisReady) return gisReady;
  gisReady = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google sign-in'));
    document.head.appendChild(s);
  });
  return gisReady;
}

function storedToken() {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY));
    if (t && t.expiresAt > Date.now() + 60000) return t.accessToken;
  } catch { /* ignore */ }
  return null;
}

export function hasToken() {
  return Boolean(storedToken());
}

export function forgetToken() {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

// Ask for (or silently refresh) an access token. `interactive` controls
// whether a consent popup may appear.
export async function getToken({ interactive = true } = {}) {
  const cached = storedToken();
  if (cached) return cached;
  if (!calendarConfigured()) throw new Error('Calendar is not configured');
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        try {
          sessionStorage.setItem(TOKEN_KEY, JSON.stringify({
            accessToken: resp.access_token,
            expiresAt: Date.now() + (Number(resp.expires_in) - 60) * 1000,
          }));
        } catch { /* ignore */ }
        resolve(resp.access_token);
      },
    });
    client.requestAccessToken({ prompt: interactive ? '' : 'none' });
  });
}

// Fetch timed events between two instants from the primary calendar.
// All-day events (date-only) are excluded — they don't anchor a day start
// and don't block nap gaps.
export async function fetchEvents(fromDate, toDate, token) {
  const params = new URLSearchParams({
    timeMin: fromDate.toISOString(),
    timeMax: toDate.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.status === 401) {
    forgetToken();
    throw new Error('Calendar session expired — link it again.');
  }
  if (!res.ok) throw new Error(`Calendar error ${res.status}`);
  const data = await res.json();
  return (data.items ?? [])
    .filter((e) => e.status !== 'cancelled' && e.start?.dateTime && e.end?.dateTime)
    .filter((e) => e.transparency !== 'transparent')
    .map((e) => ({
      title: e.summary || 'Busy',
      start: new Date(e.start.dateTime),
      end: new Date(e.end.dateTime),
    }));
}

// Everything the planner needs for today + tomorrow morning.
export async function fetchPlannerContext(now = new Date(), { interactive = true } = {}) {
  const token = await getToken({ interactive });
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowNoon = new Date(dayStart.getTime() + 36 * 3600000);
  const events = await fetchEvents(dayStart, tomorrowNoon, token);
  const tomorrow = new Date(dayStart.getTime() + 24 * 3600000);
  const todayEvents = events.filter((e) => e.start < tomorrow);
  const tomorrowEvents = events.filter((e) => e.start >= tomorrow);
  return {
    todayEvents,
    tomorrowFirstEvent: tomorrowEvents.length ? tomorrowEvents[0].start : null,
  };
}
