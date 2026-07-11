// anim.js — animation helpers. The Motion library (motion.dev, MIT) is
// vendored at js/vendor/motion.mjs for fluid springs and scroll-triggered
// reveals, with a CDN fallback; every helper degrades gracefully (CSS
// entrance animations, instant jumps) when the library is unavailable or
// the user prefers reduced motion.

export const reducedMotion = () =>
  typeof matchMedia !== 'undefined' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

const easeOut = (t) => 1 - (1 - t) ** 3;

// ------------------------------------------------------------ motion lib

let motionMod = null; // null = not tried, false = unavailable, object = loaded

export async function loadMotion() {
  if (motionMod !== null) return motionMod;
  if (reducedMotion()) { motionMod = false; return motionMod; }
  try {
    motionMod = await import('../vendor/motion.mjs');
  } catch {
    try {
      motionMod = await import('https://cdn.jsdelivr.net/npm/motion@11/+esm');
    } catch {
      motionMod = false;
    }
  }
  if (motionMod) document.documentElement.classList.add('motion-on');
  return motionMod;
}

export const motionReady = () => Boolean(motionMod);

const SPRING = { type: 'spring', stiffness: 380, damping: 26 };

// Scroll-reveal every card in a container: cards already on screen spring
// in with a stagger; cards below the fold animate as they scroll into view.
export function revealCards(container) {
  const m = motionMod;
  if (!m || reducedMotion()) return false;
  let eager = 0;
  for (const el of container.querySelectorAll('.card')) {
    el.classList.remove('card-enter');
    el.style.opacity = '0';
    m.inView(el, () => {
      const rect = el.getBoundingClientRect();
      const onScreen = rect.top < innerHeight;
      try {
        m.animate(el,
          { opacity: [0, 1], y: [22, 0] },
          { ...SPRING, delay: onScreen ? Math.min(0.05 * eager++, 0.25) : 0 });
      } catch {
        el.style.opacity = '1';
      }
    }, { margin: '0px 0px -12% 0px' });
  }
  return true;
}

// Springy press feedback on anything tappable, via delegation. The CSS
// :active fallback is disabled by the `motion-on` class when this runs.
export function attachPressFeedback(root = document) {
  const SELECTOR = '.btn, .pill, .tab, .step-btn, .icon-btn, .segmented button';
  root.addEventListener('pointerdown', (e) => {
    const m = motionMod;
    const b = e.target.closest(SELECTOR);
    if (!m || !b || reducedMotion()) return;
    try { m.animate(b, { scale: 0.955 }, { duration: 0.09 }); } catch { /* ignore */ }
  });
  const release = (e) => {
    const m = motionMod;
    const b = e.target.closest(SELECTOR);
    if (!m || !b || reducedMotion()) return;
    try { m.animate(b, { scale: 1 }, { type: 'spring', stiffness: 520, damping: 18 }); } catch { /* ignore */ }
  };
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', release);
}

// Fade the splash out instead of blinking it away.
export function dismissSplash(el) {
  if (!el) return;
  const m = motionMod;
  if (!m || reducedMotion()) { el.style.display = 'none'; return; }
  try {
    m.animate(el, { opacity: [1, 0], scale: [1, 1.06] }, { duration: 0.45, ease: 'easeOut' })
      .finished.then(() => { el.style.display = 'none'; });
  } catch {
    el.style.display = 'none';
  }
}

// ---------------------------------------------------------- hand-rolled

// Animate a numeric readout from its previous value to `to`, formatting
// with `fmt`. Remembers the last value per element so re-renders sweep
// from where they were.
const lastValues = new WeakMap();

export function countUp(el, to, fmt, duration = 700) {
  if (!el) return;
  const from = lastValues.get(el) ?? 0;
  lastValues.set(el, to);
  if (reducedMotion() || Math.abs(to - from) < 1e-9 || duration <= 0) {
    el.textContent = fmt(to);
    return;
  }
  const t0 = performance.now();
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / duration);
    el.textContent = fmt(from + (to - from) * easeOut(p));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Draw an SVG path in by animating stroke-dashoffset. Call after the path
// is in the DOM.
export function drawIn(path, duration = 900) {
  if (!path || reducedMotion()) return;
  const len = path.getTotalLength?.();
  if (!len) return;
  path.style.strokeDasharray = `${len}`;
  path.style.strokeDashoffset = `${len}`;
  path.getBoundingClientRect(); // flush so the transition runs
  path.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(.3,.6,.2,1)`;
  path.style.strokeDashoffset = '0';
  setTimeout(() => {
    path.style.strokeDasharray = '';
    path.style.transition = '';
  }, duration + 60);
}

// Sweep a gauge arc to its dasharray value.
export function sweepGauge(path, pct, duration = 800) {
  if (!path) return;
  if (reducedMotion()) {
    path.style.strokeDasharray = `${pct} 100`;
    return;
  }
  path.style.strokeDasharray = '0 100';
  path.getBoundingClientRect();
  path.style.transition = `stroke-dasharray ${duration}ms cubic-bezier(.3,.6,.2,1)`;
  path.style.strokeDasharray = `${pct} 100`;
}

// CSS-fallback entrance for a container's cards (used when Motion is
// unavailable).
export function replayEntrance(container) {
  if (!container || reducedMotion()) return;
  for (const el of container.querySelectorAll('.card')) {
    el.style.opacity = '';
    el.classList.remove('card-enter');
    void el.offsetWidth;
    el.classList.add('card-enter');
  }
}
