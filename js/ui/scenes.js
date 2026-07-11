// scenes.js — original layered SVG "dusk" artscapes used behind the
// onboarding carousel and login screen. Vector gradients + silhouettes
// render soft and photographic under transparency and backdrop blur,
// weigh ~2KB each, and need no external assets or licenses.

const NIGHT = '#0B1026';
const ACCENT = '#8B9DFF';
const GLOW = '#FFB385';

// Deterministic pseudo-random for star fields (stable art, stable tests).
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function stars(count, seed, { yMax = 0.6, rMax = 1.3, opacity = 0.8 } = {}) {
  const rnd = lcg(seed);
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = (rnd() * 100).toFixed(1);
    const y = (rnd() * yMax * 100).toFixed(1);
    const r = (0.3 + rnd() * rMax).toFixed(2);
    const o = (0.25 + rnd() * opacity).toFixed(2);
    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${o}"/>`;
  }
  return out;
}

const wrap = (id, inner) => `
  <svg viewBox="0 0 100 178" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    ${inner.replaceAll('__ID__', id)}
  </svg>`;

// 1 — mountain ridges at dusk, first stars out.
export const duskPeaks = () => wrap('dp', `
  <defs>
    <linearGradient id="__ID__sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#141A3E"/><stop offset="0.55" stop-color="#2A2E5E"/>
      <stop offset="0.78" stop-color="#7A5C74"/><stop offset="0.92" stop-color="${GLOW}"/>
    </linearGradient>
    <radialGradient id="__ID__sun" cx="0.5" cy="0.9" r="0.5">
      <stop offset="0" stop-color="#FFD9BF" stop-opacity="0.9"/><stop offset="1" stop-color="#FFD9BF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100" height="178" fill="url(#__ID__sky)"/>
  ${stars(26, 7, { yMax: 0.45 })}
  <ellipse cx="50" cy="158" rx="60" ry="34" fill="url(#__ID__sun)"/>
  <path d="M0 122 L16 96 L30 116 L44 88 L60 112 L74 94 L88 114 L100 100 V178 H0 Z" fill="#1A1F42" opacity="0.9"/>
  <path d="M0 138 L20 116 L38 132 L58 110 L76 130 L100 118 V178 H0 Z" fill="#10142E"/>
  <path d="M0 156 L28 138 L52 152 L78 136 L100 148 V178 H0 Z" fill="#080B1C"/>
  <ellipse cx="30" cy="128" rx="26" ry="3.5" fill="#fff" opacity="0.05"/>
  <ellipse cx="72" cy="120" rx="20" ry="2.5" fill="#fff" opacity="0.04"/>`);

// 2 — a low moon over calm water, reflection shimmering.
export const moonSea = () => wrap('ms', `
  <defs>
    <linearGradient id="__ID__sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0A0E24"/><stop offset="0.6" stop-color="#1C2350"/>
      <stop offset="0.72" stop-color="#39406F"/>
    </linearGradient>
    <linearGradient id="__ID__sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#252C58"/><stop offset="1" stop-color="#05070F"/>
    </linearGradient>
    <radialGradient id="__ID__halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#DFE5FF" stop-opacity="0.75"/><stop offset="1" stop-color="#DFE5FF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100" height="128" fill="url(#__ID__sky)"/>
  ${stars(30, 21, { yMax: 0.55 })}
  <circle cx="68" cy="46" r="17" fill="url(#__ID__halo)"/>
  <circle cx="68" cy="46" r="8" fill="#E8ECFF"/>
  <circle cx="65" cy="43" r="1.6" fill="#C9D2F5" opacity="0.7"/>
  <circle cx="71" cy="49" r="1.1" fill="#C9D2F5" opacity="0.6"/>
  <rect y="128" width="100" height="50" fill="url(#__ID__sea)"/>
  <g opacity="0.55">
    <rect x="63" y="130" width="10" height="1.4" rx="0.7" fill="#DFE5FF" opacity="0.8"/>
    <rect x="65" y="134" width="7" height="1.2" rx="0.6" fill="#DFE5FF" opacity="0.6"/>
    <rect x="61" y="139" width="13" height="1.2" rx="0.6" fill="#DFE5FF" opacity="0.45"/>
    <rect x="64" y="145" width="8" height="1.1" rx="0.55" fill="#DFE5FF" opacity="0.35"/>
    <rect x="60" y="152" width="15" height="1" rx="0.5" fill="#DFE5FF" opacity="0.25"/>
  </g>
  <rect y="127" width="100" height="1" fill="#9BA6E8" opacity="0.35"/>`);

// 3 — ember horizon: the sun's last light under banded clouds.
export const emberHorizon = () => wrap('eh', `
  <defs>
    <linearGradient id="__ID__sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0C1029"/><stop offset="0.5" stop-color="#3A2E58"/>
      <stop offset="0.74" stop-color="#8A4E5E"/><stop offset="0.88" stop-color="#E08A52"/>
      <stop offset="1" stop-color="#FFC59B"/>
    </linearGradient>
    <radialGradient id="__ID__core" cx="0.5" cy="1" r="0.55">
      <stop offset="0" stop-color="#FFE3C8" stop-opacity="0.95"/><stop offset="1" stop-color="#FFE3C8" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100" height="178" fill="url(#__ID__sky)"/>
  ${stars(14, 33, { yMax: 0.3 })}
  <ellipse cx="50" cy="178" rx="55" ry="42" fill="url(#__ID__core)"/>
  <ellipse cx="28" cy="112" rx="30" ry="2.6" fill="#1A1230" opacity="0.55"/>
  <ellipse cx="66" cy="124" rx="36" ry="3" fill="#1A1230" opacity="0.6"/>
  <ellipse cx="40" cy="136" rx="42" ry="3.4" fill="#160F28" opacity="0.65"/>
  <path d="M20 96 q2.5 -2.5 5 0 M25 96 q2.5 -2.5 5 0" stroke="#0B0A18" stroke-width="0.7" fill="none" opacity="0.8"/>
  <path d="M62 84 q2 -2 4 0 M66 84 q2 -2 4 0" stroke="#0B0A18" stroke-width="0.6" fill="none" opacity="0.7"/>
  <rect y="160" width="100" height="18" fill="#05070F"/>`);

// 4 — pines under a deep night sky, fireflies drifting.
export const pineNight = () => wrap('pn', `
  <defs>
    <linearGradient id="__ID__sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#060918"/><stop offset="0.62" stop-color="#131A3E"/>
      <stop offset="1" stop-color="#20295C"/>
    </linearGradient>
  </defs>
  <rect width="100" height="178" fill="url(#__ID__sky)"/>
  ${stars(34, 55, { yMax: 0.5 })}
  <g fill="#0C1129">
    <path d="M8 178 V150 L2 152 L8 138 L3.5 140 L10 124 L16.5 140 L12 138 L18 152 L12 150 V178 Z"/>
    <path d="M34 178 V144 L27 146 L34 130 L29 132 L36 114 L43 132 L38 130 L45 146 L38 144 V178 Z"/>
    <path d="M88 178 V148 L82 150 L88 136 L83.5 138 L90 122 L96.5 138 L92 136 L98 150 L92 148 V178 Z"/>
  </g>
  <g fill="#070B1D">
    <path d="M58 178 V140 L50 142 L58 124 L52.5 126 L60 106 L67.5 126 L62 124 L70 142 L62 140 V178 Z"/>
    <path d="M20 178 V156 L15 157 L20 146 L16.5 147.5 L22 134 L27.5 147.5 L24 146 L29 157 L24 156 V178 Z"/>
  </g>
  <g fill="${GLOW}">
    <circle cx="30" cy="150" r="0.9" opacity="0.9"/>
    <circle cx="47" cy="160" r="0.7" opacity="0.7"/>
    <circle cx="72" cy="152" r="0.8" opacity="0.85"/>
    <circle cx="63" cy="166" r="0.6" opacity="0.6"/>
    <circle cx="14" cy="164" r="0.7" opacity="0.75"/>
  </g>`);

// 5 — deep starfield with a soft galactic band and one shooting star.
export const starfield = () => wrap('sf', `
  <defs>
    <linearGradient id="__ID__sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#03040C"/><stop offset="1" stop-color="#101636"/>
    </linearGradient>
    <linearGradient id="__ID__band" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0"/>
      <stop offset="0.5" stop-color="${ACCENT}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="__ID__shoot" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0.9"/>
    </linearGradient>
  </defs>
  <rect width="100" height="178" fill="url(#__ID__sky)"/>
  <ellipse cx="55" cy="80" rx="70" ry="26" fill="url(#__ID__band)" transform="rotate(-24 55 80)"/>
  ${stars(60, 89, { yMax: 1, rMax: 1.1, opacity: 0.75 })}
  <rect x="18" y="38" width="17" height="0.8" rx="0.4" fill="url(#__ID__shoot)" transform="rotate(-18 26 38)"/>
  <circle cx="36.5" cy="32.5" r="1" fill="#fff" opacity="0.95"/>`);

export const SCENES = [duskPeaks, moonSea, emberHorizon, pineNight, starfield];
