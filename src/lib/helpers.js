import headers from '../data/headers.json';

export const PHASES = ['Real Estate', 'Pre-Construction', 'Construction/Ops'];
export const PHASE_KEY = { 'Real Estate': 're', 'Pre-Construction': 'pc', 'Construction/Ops': 'co' };
export const PHASE_COLOR = {
  'Real Estate': 'var(--forest)',
  'Pre-Construction': 'var(--amber)',
  'Construction/Ops': 'var(--brick)',
};

export const HEADERS = headers;
export const headersByPhase = {};
PHASES.forEach((p) => {
  headersByPhase[p] = HEADERS.filter((h) => h.phase === p);
});
export const notesHeaders = HEADERS.filter((h) => h.phase === 'Notes/PSA');
export const checkboxCountByPhase = {};
PHASES.forEach((p) => {
  checkboxCountByPhase[p] = headersByPhase[p].filter((h) => h.type === 'checkbox').length;
});

export function phaseProgress(project, phase) {
  const hs = headersByPhase[phase].filter((h) => h.type === 'checkbox');
  if (!hs.length) return 0;
  const fields = project.fields || {};
  let checked = 0;
  hs.forEach((h) => {
    if (fields[h.letter] === true) checked++;
  });
  return checked / hs.length;
}

export function overallProgress(project) {
  let totalChecked = 0;
  let total = 0;
  const fields = project.fields || {};
  PHASES.forEach((p) => {
    headersByPhase[p]
      .filter((h) => h.type === 'checkbox')
      .forEach((h) => {
        total++;
        if (fields[h.letter] === true) totalChecked++;
      });
  });
  return total ? totalChecked / total : 0;
}

export function currentStage(project) {
  const re = phaseProgress(project, 'Real Estate');
  const pc = phaseProgress(project, 'Pre-Construction');
  const co = phaseProgress(project, 'Construction/Ops');
  if (co >= 0.999 && pc >= 0.999 && re >= 0.999) return { key: 'done', label: 'Open / Complete' };
  if (re < 0.999) return { key: 're', label: 'Real Estate' };
  if (pc < 0.999) return { key: 'pc', label: 'Pre-Construction' };
  return { key: 'co', label: 'Construction/Ops' };
}

export function pct(n) {
  return Math.round(n * 100);
}
