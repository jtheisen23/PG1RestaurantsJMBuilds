import { BRANDS, BRAND_BY_KEY, DEFAULT_PHASES, brandKeyFor } from './brands';

export const PHASES = DEFAULT_PHASES;
// Not a phase of the flow -- a trailing section for PSA details and free
// notes, with no progress of its own.
export const NOTES_PHASE = 'Notes/PSA';
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
  // Indexed alongside the phases so the PSA / Notes section can be built the
  // same way -- it takes added and removed items too, it just has no progress.
  byPhase[NOTES_PHASE] = headers.filter((h) => h.phase === NOTES_PHASE);
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

// Checklist items an admin has removed from this one project, because they do
// not apply to this location. They are gone from its page and excluded from
// both sides of its progress -- otherwise a project with an inapplicable item
// could never reach 100%.
export function hiddenFieldsOf(project) {
  const list = project?.hiddenFields;
  return new Set(Array.isArray(list) ? list : []);
}

// What a checklist item is called here. The brand's file ships with the app,
// so rewording has to live in the database: an admin can reword an item for
// one project, or for every project of the brand. Most specific wins, and an
// override is only ever a label -- the column letter, type and phase still
// come from the file, so progress is unaffected by what anything is called.
export function labelFor(header, project, brandLabels) {
  const perProject = project?.fieldLabels?.[header.letter];
  if (perProject) return perProject;
  const perBrand = brandLabels?.[brandKeyFor(project)]?.[header.letter];
  if (perBrand) return perBrand;
  return header.label;
}

// Extra checklist items added to this project that its brand's spreadsheet
// does not have. They behave exactly like items from the file -- same storage,
// same tick-box or text box, and they count towards progress -- so the rest of
// the app needs no idea they came from somewhere else. `letter` is a generated
// id rather than a spreadsheet column, which is why ids are prefixed: a custom
// field can never collide with a real column.
export const CUSTOM_PREFIX = 'cf_';

export function customFieldsOf(project, phase) {
  const list = Array.isArray(project?.customFields) ? project.customFields : [];
  return list
    .filter((f) => f && f.id && (phase === undefined || f.phase === phase))
    .map((f) => ({
      letter: f.id,
      label: f.label || 'Untitled',
      phase: f.phase,
      type: f.type === 'text' ? 'text' : 'checkbox',
      resp: f.resp || null,
      hint: null,
      custom: true,
    }));
}

// Everything on one phase of this project, in the order it should appear:
// the brand's items plus any added here, minus any removed, arranged by the
// project's own ordering where it has one.
//
// An explicit order lists keys; anything it does not mention keeps its place
// from the file and follows. That way a saved order never loses an item, which
// matters because the file gains items whenever a brand's checklist is
// re-imported.
export function visibleHeaders(project, phase) {
  const tpl = templateForProject(project);
  const hidden = hiddenFieldsOf(project);
  const all = [...(tpl.headersByPhase[phase] || []), ...customFieldsOf(project, phase)].filter(
    (h) => !hidden.has(h.letter)
  );

  const order = project?.fieldOrder?.[phase];
  if (!Array.isArray(order) || !order.length) return all;

  const rank = new Map(order.map((key, i) => [key, i]));
  return [...all].sort((a, b) => {
    const ra = rank.has(a.letter) ? rank.get(a.letter) : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b.letter) ? rank.get(b.letter) : Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return all.indexOf(a) - all.indexOf(b);
  });
}

// The items removed from one phase, for the admin list that puts them back.
export function removedHeaders(project, phase) {
  const tpl = templateForProject(project);
  const hidden = hiddenFieldsOf(project);
  return [...(tpl.headersByPhase[phase] || []), ...customFieldsOf(project, phase)].filter((h) =>
    hidden.has(h.letter)
  );
}

export function phaseProgress(project, phase) {
  const hs = visibleHeaders(project, phase).filter((h) => h.type === 'checkbox');
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
    visibleHeaders(project, p)
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
