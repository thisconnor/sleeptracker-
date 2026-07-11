// anim.js — tiny animation helpers. Everything checks the user's
// reduced-motion preference and degrades to an instant jump.

export const reducedMotion = () =>
  typeof matchMedia !== 'undefined' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

const easeOut = (t) => 1 - (1 - t) ** 3;

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

// Re-trigger a CSS entrance animation on a container's children.
export function replayEntrance(container) {
  if (!container || reducedMotion()) return;
  for (const el of container.querySelectorAll('.card')) {
    el.classList.remove('card-enter');
    void el.offsetWidth;
    el.classList.add('card-enter');
  }
}
