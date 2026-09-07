import { BRANDS, BRAND_BY_KEY, DEFAULT_PHASES, brandKeyFor } from './brands';

export const PHASES = DEFAULT_PHASES;
// Short keys and colours for the phases PG1 has always used. A brand whose
// flow has different stages gets keys and colours by position instead, so the
// dots, chips and stage badges still work without hardcoding its stage names.
const KNOWN_PHASE_KEY = { 'Real Estate': 're', 'Pre-Construction': 'pc', 'Construction/Ops': 'co' };
const KNOWN_PHASE_COLOR = {
  'Real Estate': 'var(--accent)',
  'Pre-Construction': 'var(--amber)',
  'Construction/Ops': 'var(--brick)',
};
const PHASE_COLOR_CYCLE = ['var(--accent)', 'var(--amber)', 'var(--brick)', 'var(--slate)'];

export function phaseKey(phase, index = 0) {
  return KNOWN_PHASE_KEY[phase] || `ph${index}`;
}

export function phaseColor(phase, index = 0) {
  return KNOWN_PHASE_COLOR[phase] || PHASE_COLOR_CYCLE[index % PHASE_COLOR_CYCLE.length];
}

// A brand's checklist, pre-grouped the way the project page needs it.
// Built once per brand at module load rather than on every render: the
// Jersey Mike's list is 200 columns and every progress bar re-reads it.
function buildTemplate(brand) {
  const headers = brand.headers || [];
  const phases = brand.phases || DEFAULT_PHASES;
  const byPhase = {};
  const checkboxCount = {};
  phases.forEach((p) => {
    byPhase[p] = headers.filter((h) => h.phase === p);
    checkboxCount[p] = byPhase[p].filter((h) => h.type === 'checkbox').length;
  });
  return {
    key: brand.key,
    name: brand.name,
    phases,
    headers,
    headersByPhase: byPhase,
    notesHeaders: headers.filter((h) => h.phase === 'Notes/PSA'),
    checkboxCountByPhase: checkboxCount,
    // A brand whose checklist has not been imported yet. The project page
    // says so instead of rendering as though the project has no data.
    isEmpty: headers.length === 0,
  };
}

const TEMPLATES = Object.fromEntries(BRANDS.map((b) => [b.key, buildTemplate(b)]));

export function templateFor(brandKey) {
  return TEMPLATES[brandKey] || TEMPLATES[BRANDS[0].key];
}

// Every progress calculation is relative to the project's own brand: a
// checklist item's column letter means a different thing in a different
// brand's spreadsheet, and the denominators differ too.
export function templateForProject(project) {
  return templateFor(brandKeyFor(project));
}

export function phaseProgress(project, phase) {
  const tpl = templateForProject(project);
  const hs = (tpl.headersByPhase[phase] || []).filter((h) => h.type === 'checkbox');
  if (!hs.length) return 0;
  const fields = project.fields || {};
  let checked = 0;
  hs.forEach((h) => {
    if (fields[h.letter] === true) checked++;
  });
  return checked / hs.length;
}

export function overallProgress(project) {
  const tpl = templateForProject(project);
  let totalChecked = 0;
  let total = 0;
  const fields = project.fields || {};
  tpl.phases.forEach((p) => {
    (tpl.headersByPhase[p] || [])
      .filter((h) => h.type === 'checkbox')
      .forEach((h) => {
        total++;
        if (fields[h.letter] === true) totalChecked++;
      });
  });
  return total ? totalChecked / total : 0;
}

// The first phase of the project's own flow that is not yet finished. Walking
// the brand's phase list rather than the three Jersey Mike's names means a
// brand with a different flow gets a correct badge instead of a fixed one.
export function currentStage(project) {
  const tpl = templateForProject(project);
  const phases = tpl.phases;
  for (let i = 0; i < phases.length; i++) {
    if (phaseProgress(project, phases[i]) < 0.999) {
      return { key: phaseKey(phases[i], i), label: phases[i] };
    }
  }
  return { key: 'done', label: 'Open / Complete' };
}

export function pct(n) {
  return Math.round(n * 100);
}

// Kept for callers that only ever meant the Jersey Mike's list. New code
// should go through templateForProject so it follows the project's brand.
export const HEADERS = TEMPLATES[BRANDS[0].key].headers;
export const headersByPhase = TEMPLATES[BRANDS[0].key].headersByPhase;
export const notesHeaders = TEMPLATES[BRANDS[0].key].notesHeaders;
export const checkboxCountByPhase = TEMPLATES[BRANDS[0].key].checkboxCountByPhase;

export { BRANDS, BRAND_BY_KEY, brandKeyFor };
