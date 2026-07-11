// config.js — deployment configuration.
//
// These values are public by design: the publishable key is guarded by the
// database's row-level-security policies, and the Google client ID only
// identifies the app. The secrets (Supabase service_role / secret keys,
// Google client secret) live in their dashboards and must never be here.

export const CONFIG = {
  SUPABASE_URL: 'https://ixpghtttwprullumnxmv.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_5zaLhC-6yLWYgHtju2pD4g__Lv_VsJk',
  GOOGLE_CLIENT_ID: '819192713659-7svehq7vtvavsb6bv70d3fgqh8oagi59.apps.googleusercontent.com',
};
