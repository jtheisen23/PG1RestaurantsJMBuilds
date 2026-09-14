// A place for Firestore failures to surface.
//
// Reads that are refused resolve to an empty collection, and writes that are
// refused reject a promise nobody awaits. Both end up as a console message and
// a screen that simply does nothing -- which is indistinguishable from "there
// is no data" or "my click missed". That cost a day of guessing once, so
// failures now reach the person looking at the screen.
//
// Deliberately a tiny module-level store rather than context: the write
// helpers in firestore.js are plain functions called from event handlers, not
// components, and they have no way to reach a provider.

const listeners = new Set();
let errors = [];

function emit() {
  listeners.forEach((fn) => fn(errors));
}

export function reportDataError(what, err) {
  const code = err?.code || 'unknown';
  // One entry per kind of failure. A denied listener retries and would
  // otherwise pile up hundreds of identical rows.
  const key = `${what}|${code}`;
  if (errors.some((e) => e.key === key)) return;
  errors = [...errors, { key, what, code, message: err?.message || String(err) }];
  console.error(`[${what}] ${code}:`, err);
  emit();
}

// Drops one source's complaint once it starts working again -- a listener
// that recovers should not leave a stale banner on screen.
export function clearDataError(what) {
  const next = errors.filter((e) => e.what !== what);
  if (next.length === errors.length) return;
  errors = next;
  emit();
}

export function clearDataErrors() {
  errors = [];
  emit();
}

export function subscribeDataErrors(fn) {
  listeners.add(fn);
  fn(errors);
  return () => listeners.delete(fn);
}

// True when anything failed because the security rules said no, as opposed to
// the network being down. The two need different advice.
export function isPermissionProblem(list) {
  return list.some((e) => e.code === 'permission-denied');
}
