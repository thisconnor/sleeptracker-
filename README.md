# Sleep Check-in

A private, RISE-inspired **morning sleep check-in**. One tap on an iPhone Shortcut reads your last 14 days of Apple Health sleep, packs it into a link, and opens this page — which computes your **sleep debt**, today's **energy schedule**, and other sleep insights, entirely on your device.

- **No app, no account, no server.** A static page on GitHub Pages.
- **Private by construction.** Your sleep data travels in the link *after the `#`* (the URL fragment). Fragments are never sent to any server — the page reads them with JavaScript on your device.
- **iPhone-only tracking works today; Apple Watch lights up more.** With plain iPhone sleep tracking you get debt, energy schedule, history and consistency. Once a Watch (or any stage-recording device) writes Core/Deep/REM data to Health, a stage breakdown appears automatically.

## What it shows

| Card | What it means |
|---|---|
| **Sleep debt** | How much sleep you owe your body, over a rolling 14-night window, weighted toward recent nights (last night ≈ 15%). ≤ 5h is the good zone. Naps pay debt down; oversleeping offsets it. |
| **Energy potential** | A 0–100 score of how much your sleep can support you today — it falls as debt rises. |
| **Energy schedule** | Your predicted energy wave for today, anchored to when you woke: grogginess, morning peak, afternoon dip, evening peak, wind-down, and your ~1-hour **melatonin window** (the ideal time to head to bed). |
| **Last night** | Duration vs. need, bed/wake times, efficiency, naps — plus a Deep/Core/REM/Awake bar when stage data exists. |
| **Last 14 nights** | Nightly sleep vs. your need line, naps stacked on top, missing nights hollow, with your debt trend drawn over it. |
| **Consistency** | How steady your sleep midpoint is night to night — a steadier midpoint means a happier body clock. |

## One-time setup

### 1. Turn on GitHub Pages

In this repository: **Settings → Pages → Source: Deploy from a branch → `main` / (root)**. After a minute the page is live at:

```
https://thisconnor.github.io/sleeptracker-/
```

(Open it once in Safari — you'll see the welcome screen and a demo button.)

### 2. Set up the iPhone Shortcut

Open the **Shortcuts** app → **+** → name it something like *Sleep Check-in*, then add these six actions in order:

1. **Find Health Samples**
   - Tap *All Health Samples* and set the type to **Sleep Analysis** (search "sleep").
   - Add filter: **Start Date** → **is in the last** → **14** → **days**.
   - Sort by: **Start Date**, Order: **Oldest First**. Leave *Limit* off.

2. **Repeat with Each** *(it will receive the Health Samples automatically)*
   - Inside the repeat, add a **Text** action containing exactly:

     ```
     Start,End,Value
     ```

     where each piece is a magic variable from **Repeat Item**:
     - `Start` → tap the variable → choose **Start Date** → tap it again → **Date Format: Custom** → format string: `yyyyMMddHHmm`
     - `End` → **End Date**, same custom format `yyyyMMddHHmm`
     - `Value` → the sample's **Sleep Value** (on some iOS versions it's called just **Value**)
     - the commas are typed literally between the variables

3. **Combine Text** — combine **Repeat Results** with separator **Custom** → `;`

4. **URL Encode** — input: the Combined Text. (Mode: Encode.)

5. **Text** — build the final link (one line):

   ```
   https://thisconnor.github.io/sleeptracker-/#v=1&need=480&d=
   ```

   followed immediately by the **URL Encoded Text** variable. Replace `480` with *your* sleep need in **minutes** (480 = 8h, 450 = 7h 30m…). This keeps your setting in the link itself, so Safari can never forget it.

6. **Open URLs** — input: the Text from step 5.

The first run will ask permission to read Sleep data from Health — allow it.

> **Tip:** add the Shortcut to your Home Screen or an Action-button/Back-tap gesture, and run it with your morning coffee.

### 3. Set your sleep need

Open the page's ⚙ settings: adjust your need in 15-minute steps, or accept the suggestion computed from your own data (the 75th percentile of your last two weeks — "your longest typical nights"). Then copy the snippet shown there into the Shortcut's step-5 Text so the setting is permanent.

## Everyday use

Wake up → run the Shortcut → read your morning. That's the whole product.

- **Demo:** open `…/#demo` (or tap *See it with demo data*). Variants: `#demo=iphone`, `#demo=watch`, `#demo=messy`.
- **Paste fallback:** the welcome screen and settings sheet accept a pasted link (or just its data part) if you'd rather copy than open.

## How the math works

- **Sleep debt** = exponentially weighted shortfall over 14 nights: weight `e^(-i/7)` for the night `i` days ago, scaled so a uniform shortfall reads as its true cumulative hours. Last night carries ~15% of the total. Missing nights count as zero deficit (and are flagged), oversleep offsets debt, the total clamps at 0.
- **Energy schedule** is anchored to today's wake time (or, before any data lands, your average recent wake): sleep inertia ~90 min, morning peak ~1.5–4.5h after wake, afternoon dip ~7–9.5h after wake, evening peak, then wind-down toward your predicted bedtime (`wake + 24h − need`). The **melatonin window** is the hour starting 2h before that bedtime.
- **Night assembly** is the careful part: overlapping records from multiple sources (iPhone + Watch) are union-merged so nothing double-counts, `Awake` spans are carved out, sleep separated by less than 90 minutes is one night, short daytime sleeps are naps, and every session belongs to the calendar day you woke up.

## Development

No build step, no dependencies. Plain ES modules.

```sh
python3 -m http.server 8000     # then open http://localhost:8000
node tests/tests.js             # run the unit tests (39 of them)
```

`tests/tests.html` runs the same tests in a browser. The pure logic lives in `js/parse.js`, `js/sessions.js`, `js/metrics.js`, `js/schedule.js`, `js/settings.js` — none of them touch the DOM.

## Troubleshooting

- **"N rows couldn't be read"** — almost always the date format. In the Shortcut's step 2, both dates must use **Custom** format `yyyyMMddHHmm`. (The parser also accepts most natural date strings, but commas inside them break the row format.)
- **Everything shows as time-in-bed** — your iPhone is logging only "In Bed" records. The page falls back to those and says so. An Apple Watch (or third-party sleep app writing "Asleep" records) fixes it.
- **The link does nothing / page is blank** — make sure GitHub Pages is enabled (setup step 1) and the URL in Shortcut step 5 matches your Pages URL exactly, including the trailing `-/`.
- **Settings forgotten** — Safari clears site storage after 7 days without a visit. Put `need=` in the Shortcut link (step 5) and it can never be lost.

## Privacy

Sleep data is health data. This tool keeps it in the URL fragment, which never leaves your device, and stores nothing anywhere else. Two things to know: the link in your Safari history contains your sleep data, and anyone you *send* the link to could read it. Don't share check-in links.
