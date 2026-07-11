// config.js — deployment configuration.
//
// The app runs in LOCAL MODE (guest, data stored in this browser) until
// SUPABASE_URL and SUPABASE_ANON_KEY are filled in. See README "Set up the
// backend" for the 10-minute walkthrough. The anon key is designed to be
// public — security lives in the database's row-level-security policies.
//
// GOOGLE_CLIENT_ID enables the optional "Link Google Calendar" feature
// (README "Set up the calendar link"). Leave empty to hide it.

export const CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  GOOGLE_CLIENT_ID: '',
};
