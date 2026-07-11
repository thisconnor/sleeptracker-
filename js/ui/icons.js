// icons.js — the app's icon set. Hand-drawn 24x24 strokes, consistent
// weight and rounding, so every glyph feels like one family.

const base = (inner, { filled = false } = {}) =>
  `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="${filled ? 'currentColor' : 'none'}"
     stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
     aria-hidden="true">${inner}</svg>`;

export const icons = {
  sun: base(`<circle cx="12" cy="12" r="4.2"/>
    <path d="M12 2.8v2.2M12 19v2.2M2.8 12h2.2M19 12h2.2M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M18.5 5.5l-1.6 1.6M7.1 16.9l-1.6 1.6"/>`),
  moon: base(`<path d="M19.5 14.2A8 8 0 0 1 9.8 4.5a8 8 0 1 0 9.7 9.7Z"/>`),
  bed: base(`<path d="M3 18v-8m0 4h18v4m0-4v-2a3 3 0 0 0-3-3h-8v5"/><circle cx="6.7" cy="11.2" r="1.6"/>`),
  wave: base(`<path d="M2.5 14c2.6 0 2.6-6 5.2-6s2.6 8 5.2 8 2.6-10 5.3-10 2.7 8 3.3 8"/>`),
  trend: base(`<path d="M3.5 19.5v-16M3.5 19.5h17"/><path d="M6.5 15.5l3.5-4 3 2.5 4.5-6"/>`),
  gear: base(`<circle cx="12" cy="12" r="3"/><path d="M12 4.5V3m0 18v-1.5M6.7 6.7 5.6 5.6m12.8 12.8-1.1-1.1M4.5 12H3m18 0h-1.5M6.7 17.3l-1.1 1.1M18.4 5.6l-1.1 1.1"/>`),
  calendar: base(`<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5"/>`),
  coffee: base(`<path d="M4 9h12v5.5a4.5 4.5 0 0 1-4.5 4.5h-3A4.5 4.5 0 0 1 4 14.5V9Z"/>
    <path d="M16 10h1.6a2.4 2.4 0 0 1 0 4.8H16M7.3 5.6c.8-.9.8-1.7 0-2.6M11 5.6c.8-.9.8-1.7 0-2.6"/>`),
  plus: base(`<path d="M12 5.5v13M5.5 12h13"/>`),
  pencil: base(`<path d="m14.5 5.5 4 4L8 20l-4.6.6L4 16 14.5 5.5ZM13 7l4 4"/>`),
  trash: base(`<path d="M4.5 6.5h15M9.5 6V4.5A1.5 1.5 0 0 1 11 3h2a1.5 1.5 0 0 1 1.5 1.5V6M6.5 6.5 7.3 19a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12.5M10 10.5v6M14 10.5v6"/>`),
  x: base(`<path d="M6 6l12 12M18 6 6 18"/>`),
  check: base(`<path d="m4.5 12.5 5 5L19.5 7"/>`),
  chevronRight: base(`<path d="m9 5.5 6.5 6.5L9 18.5"/>`),
  sparkle: base(`<path d="M12 3.5c.7 4.2 2.3 5.8 6.5 6.5-4.2.7-5.8 2.3-6.5 6.5-.7-4.2-2.3-5.8-6.5-6.5 4.2-.7 5.8-2.3 6.5-6.5Z"/><path d="M18.5 15.5c.3 1.8 1 2.5 2.8 2.8-1.8.3-2.5 1-2.8 2.8-.3-1.8-1-2.5-2.8-2.8 1.8-.3 2.5-1 2.8-2.8Z"/>`),
  link: base(`<path d="M10 14.5 14.5 10M8.5 12 6 14.5a3.5 3.5 0 0 0 5 5L13.5 17M15.5 12 18 9.5a3.5 3.5 0 0 0-5-5L10.5 7"/>`),
  user: base(`<circle cx="12" cy="8.2" r="3.7"/><path d="M4.5 20.5c1.2-3.7 4-5.5 7.5-5.5s6.3 1.8 7.5 5.5"/>`),
  logout: base(`<path d="M13.5 3.5H8A2.5 2.5 0 0 0 5.5 6v12A2.5 2.5 0 0 0 8 20.5h5.5M10.5 12h10m0 0-3.5-3.5M20.5 12 17 15.5"/>`),
  target: base(`<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>`),
  nap: base(`<path d="M4 17v-6.5M4 14h9.5V17m0-3v-1a2.5 2.5 0 0 0-2.5-2.5H8"/><path d="M15.5 4.5H20l-4.5 5H20"/>`),
  mail: base(`<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7.5 8 6 8-6"/>`),
  key: base(`<circle cx="8.5" cy="12" r="4"/><path d="M12.5 12h8m-3 0v3.2M17.5 12v2.2"/>`),
  clock: base(`<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`),
  export: base(`<path d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5"/><path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14"/>`),
  today: base(`<circle cx="12" cy="12" r="4"/><path d="M12 3v1.6M12 19.4V21M3 12h1.6M19.4 12H21M5.9 5.9l1.2 1.2M16.9 16.9l1.2 1.2M18.1 5.9l-1.2 1.2M7.1 16.9l-1.2 1.2" opacity=".85"/>`),
  shield: base(`<path d="M12 3.2 5 5.8v5.4c0 4.4 2.9 7.6 7 9.6 4.1-2 7-5.2 7-9.6V5.8L12 3.2Z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>`),
  chevronDown: base(`<path d="m5.5 9 6.5 6.5L18.5 9"/>`),
  flame: base(`<path d="M12 21c-3.6 0-6.2-2.4-6.2-5.8 0-2.5 1.5-4.3 2.9-6 .3 1 .9 1.9 1.8 2.4C10.4 8.8 11 5.5 13.6 3c-.2 2 .3 3.4 1.6 4.9 1.3 1.5 3 3.2 3 6.3 0 3.4-2.6 5.8-6.2 5.8Z"/><path d="M12 21c-1.7 0-2.9-1.2-2.9-2.9 0-1.3 1-2.3 1.8-3.3.5.7 1 1 1.6 1.2 0-1 .3-2 1.3-2.9.2 1.4 2.1 2.3 2.1 4.5 0 1.9-1.5 3.4-3.9 3.4Z" opacity="0.6"/>`),
  trophy: base(`<path d="M8 4h8v5.2a4 4 0 0 1-8 0V4Z"/><path d="M8 5.4H5.2a2.6 2.6 0 0 0 2.9 3.5M16 5.4h2.8a2.6 2.6 0 0 1-2.9 3.5M12 13.2V17m-3.2 3.5h6.4M9.8 20.5 10.5 17h3l.7 3.5"/>`),
  friends: base(`<circle cx="9" cy="8.5" r="3.2"/><path d="M2.8 20c1-3.2 3.4-4.8 6.2-4.8s5.2 1.6 6.2 4.8"/><circle cx="17" cy="9.5" r="2.6" opacity="0.75"/><path d="M16.2 15.4c2.4.2 4.3 1.7 5 4.6" opacity="0.75"/>`),
};

export const icon = (name, cls = '') =>
  `<span class="icon ${cls}">${icons[name] ?? ''}</span>`;
