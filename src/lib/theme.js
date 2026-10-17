// Light or dark, remembered per browser.
//
// Three states, not two: 'light' and 'dark' are a choice someone made, and
// null means they have not made one, in which case the operating system's
// setting decides and keeps deciding. Someone who switches their laptop to
// dark at sunset should see this follow without having to touch it.
//
// localStorage throws in a private window, so every access is guarded and
// the page still works -- the preference just does not survive a reload.

const KEY = 'pg1.theme';

export function readTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function systemTheme() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

// What is actually on screen right now, whoever decided it.
export function effectiveTheme() {
  return readTheme() || systemTheme();
}

// The attribute the stylesheet keys off. Written on <html> rather than on a
// wrapper so it also reaches anything outside the React root.
export function applyTheme(theme) {
  const next = theme === 'dark' || theme === 'light' ? theme : systemTheme();
  document.documentElement.dataset.theme = next;
  return next;
}

export function writeTheme(theme) {
  try {
    if (theme) localStorage.setItem(KEY, theme);
    else localStorage.removeItem(KEY);
  } catch {
    // Preference just will not persist; this session still switches.
  }
  return applyTheme(theme);
}

// Follow the system until someone chooses for themselves. Returns an
// unsubscribe so React can clean it up.
export function watchSystemTheme(onChange) {
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (!readTheme()) onChange(applyTheme(null));
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  } catch {
    return () => {};
  }
}
