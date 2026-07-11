# Sleep Check-in

A private sleep-debt and energy tracker in the spirit of RISE — rebuilt as your own. An iOS Shortcut reads your last 14 days of Apple Health sleep and opens this app; the app computes your **sleep debt**, today's **energy schedule**, and **tonight's plan** (recommended bedtime + caffeine cutoff), and — with an account — keeps your history forever, lets you **edit any night or add naps**, and can optionally plan naps and bedtime around your **Google Calendar**.

- **Frontend**: static, framework-free, hosted on GitHub Pages.
- **Backend**: [Supabase](https://supabase.com) free tier — accounts (email + password *and* magic links) and a Postgres store guarded by row-level security. Without a backend configured, the app runs in local mode (data stays in the browser).
- **Privacy**: check-in links carry sleep data after the `#`, which browsers never send to servers. Calendar access, if linked, happens entirely in your browser — events never touch the backend.

## The tabs

| Tab | What's there |
|---|---|
| **Today** | Sleep debt (14-night weighted, with a since-yesterday delta), energy potential, **Log now** (live sleep/nap timer), **Tonight** (recommended bedtime with debt repayment, last-caffeine time, wake target), the energy wave with peaks/dip/melatonin window and best nap window, your calendar day-map (if linked), last night, and the last 14 nights. |
| **Sleep** | The editable log. Every session is a pill — tap to adjust times, switch sleep↔nap, or delete. Add missing nights or naps. Manual edits win over imports and survive re-imports. |
| **Trends** | Sleep debt, nightly durations, and sleep-timing consistency over 2 weeks / 30 / 90 days, with a **Clean / Detailed** toggle (rolling average, good-zone band, peak marker, weekend shading, midpoint drift). |
| **Settings** | Account, sleep need (with a data-driven suggestion), wake target, caffeine gap, **debt repayment** (auto or a fixed nightly amount), **fall-asleep margin**, debt model (recent-weighted vs plain sum), calendar link, export. |

**Live logging**: tap *Going to sleep* or *Starting a nap* when you lie down, and *I'm awake* when you get up. Your fall-asleep margin (default 15 min, adjustable) is added to the start automatically, and a confirm sheet lets you adjust both times before anything is saved. Cancelling keeps the timer running; sessions under 3 minutes aren't logged.

**Debt repayment**: *Auto* repays about a fifth of your debt per night (capped at +60 min) — and when your calendar is linked, it sizes tonight's extra sleep to the evening your last event actually leaves free (up to +90 min, never past your remaining debt). *Fixed* aims for the same nightly amount, set in Settings, until the debt is gone.

## Setup

### 1. GitHub Pages (2 minutes)

Repo **Settings → Pages → Source: Deploy from a branch → `main` / (root)**. The app goes live at `https://thisconnor.github.io/sleeptracker-/`. It works immediately in local mode — accounts appear after step 2.

### 2. The backend (10 minutes, free, no card)

1. Create an account at [supabase.com](https://supabase.com) → **New project** (any name/region; save the generated database password somewhere).
2. In the project, open **SQL Editor**, paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql), and **Run** it.
3. **Authentication → URL Configuration**: set **Site URL** to `https://thisconnor.github.io/sleeptracker-/` and add the same URL under **Redirect URLs** (this is where magic links land).
4. **Project Settings → API** (or **Settings → Data API** on newer dashboards): copy the **Project URL** and the **anon / public key** into [`js/config.js`](js/config.js):

   ```js
   SUPABASE_URL: 'https://xxxx.supabase.co',
   SUPABASE_ANON_KEY: 'eyJ...',
   ```

   Commit and push — the anon key is designed to be public; every table is locked down per-user by the row-level-security policies from step 2.
5. Reload the app → create your account. Friends do the same.

   *Invite-only option:* in **Authentication → Sign In / Up**, disable **Allow new users to sign up**, and invite by email from **Authentication → Users → Invite**.

**Free-tier note**: Supabase pauses free projects after ~7 days with zero traffic. Daily check-ins keep it awake; if it ever pauses, un-pause it from the dashboard in one click.

### 3. The calendar link (optional, ~5 minutes)

Only needed if you want day-aware nap windows and bedtime (your first event anchors the day; tomorrow's first event pulls your wake target earlier when needed).

1. [Google Cloud Console](https://console.cloud.google.com) → new project → **APIs & Services → Library** → enable **Google Calendar API**.
2. **OAuth consent screen**: External → fill the three required fields → add yourself (and friends) under **Test users**. (Staying in "testing" mode is fine for personal use.)
3. **Credentials → Create credentials → OAuth client ID → Web application**, and add `https://thisconnor.github.io` to **Authorized JavaScript origins**.
4. Put the client ID in `js/config.js` → `GOOGLE_CLIENT_ID`. Push, reload, and **Settings → Google Calendar → Link**.

The token lives in your browser's session storage. Nothing calendar-related is ever written to Supabase.

### 4. The iPhone Shortcut (5 minutes)

Open **Shortcuts** → **+** → name it *Sleep Check-in* → add six actions:

1. **Find Health Samples** — type **Sleep Analysis**; filter **Start Date** → **is in the last** → **14 days**; sort by **Start Date**, **Oldest First**.
2. **Repeat with Each** — inside it, one **Text** action containing `Start,End,Value` where `Start`/`End` are the Repeat Item's **Start Date** / **End Date** with **Date Format: Custom** = `yyyyMMddHHmm`, and `Value` is the item's **Sleep Value** (called **Value** on some iOS versions). Type the commas literally.
3. **Combine Text** — Repeat Results, separator **Custom** `;`.
4. **URL Encode** — the combined text.
5. **Text** — `https://thisconnor.github.io/sleeptracker-/#v=1&need=480&d=` followed by the URL-encoded token. (Replace `480` with your sleep need in minutes; Settings shows this exact snippet with your current need filled in.)
6. **Open URLs**.

Run it each morning: signed in, the new nights sync into your account and the link data is cleared from the address bar; history builds up night after night.

## How the math works

- **Sleep debt** — rolling 14 nights, weights `e^(-i/7)` (last night ≈ 15%), scaled so a uniform shortfall reads as true cumulative hours; ≤ 5h is the good zone. Naps repay debt, oversleep offsets it, missing nights are flagged rather than counted, and Settings offers a plain-cumulative alternative.
- **Tonight's plan** — bedtime = wake target − (need + repayment). Repayment is ~⅕ of current debt in 15-minute steps, capped at +60 min/night (extending much past an hour mostly buys shallow sleep). Wake target priority: tomorrow's first calendar event − prep buffer, your explicit setting (the earlier of the two wins), your average wake, else 7:00. Caffeine cutoff = bedtime − 10h (adjustable 4–14h).
- **Energy schedule** — anchored to today's wake; the afternoon dip is centered ~12h after your circadian midpoint (mid-sleep), clamped to 6.5–9.5h after wake, and damped if you've napped. Peaks damp as debt grows. The melatonin window is the hour ending 1h before predicted bedtime.
- **Night assembly** — imported Health samples are union-merged across sources (iPhone + Watch never double-count), `Awake` spans are carved out, gaps under 90 min stay one night, short daytime sessions are naps, and each session belongs to the day you woke. Imports are de-duplicated by interval hash *and* overlap, so re-running the Shortcut is always safe; edited rows keep blocking their original import, and deletions leave tombstones so nothing resurrects.

## Development

No build step, no dependencies (Supabase's client loads from a CDN only when configured).

```sh
python3 -m http.server 8000     # open http://localhost:8000
node tests/tests.js             # 53 unit tests
```

`#demo` loads six weeks of synthetic data (`#demo=iphone` for the stage-less variant). Pure logic lives in `js/{parse,sessions,store,metrics,schedule,planner,settings}.js` — no DOM imports, all node-testable. UI lives in `js/ui/`.

## Troubleshooting

- **"N rows couldn't be read"** — the Shortcut's date format must be **Custom** `yyyyMMddHHmm` on both date tokens.
- **Magic link lands on a blank page** — the Site URL / Redirect URLs in Supabase (setup step 2.3) must exactly match the Pages URL, trailing `-/` included.
- **Calendar popup closes with an error** — your Google OAuth client's *Authorized JavaScript origins* must include `https://thisconnor.github.io`, and your account must be listed as a test user.
- **Everything shows as time-in-bed** — your iPhone logs only "In Bed" records; the app says so and falls back. An Apple Watch (or any app writing "Asleep" records) upgrades this automatically, including the Deep/Core/REM breakdown.
- **Data vanished in local mode** — Safari clears browser storage after 7 quiet days. Local mode is a convenience; accounts exist precisely so this can't happen.
