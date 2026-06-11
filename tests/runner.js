// runner.js — tiny assert harness that works in node and the browser.

const results = [];

export function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, err });
  }
}

export function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

export function assertEq(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertClose(actual, expected, eps = 1e-6, msg = '') {
  if (!(Math.abs(actual - expected) <= eps)) {
    throw new Error(`${msg} expected ~${expected} (±${eps}), got ${actual}`);
  }
}

export function report() {
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    if (r.ok) console.log(`  ok  ${r.name}`);
    else console.log(`FAIL  ${r.name}\n      ${r.err.message}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (typeof process !== 'undefined' && failed.length > 0) process.exitCode = 1;
  return results;
}
