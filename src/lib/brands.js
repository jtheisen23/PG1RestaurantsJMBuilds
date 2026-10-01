import jerseyMikes from '../data/brands/jersey-mikes.json';
import davesHotChicken from '../data/brands/daves-hot-chicken.json';
import jmAcquisitions from '../data/brands/jm-acquisitions.json';

// The phases every brand's checklist is grouped into. A brand may override
// this, but nothing does yet: the phases are how PG1 runs a development
// project, not something Jersey Mike's imposes.
//
// Operations and Post Opening were split out of what used to be one
// 'Construction/Ops' phase, which had grown to over a hundred items covering
// three different kinds of work: putting the building up, fitting the store
// out, and what happens once it is open.
export const DEFAULT_PHASES = [
  'Real Estate',
  'Pre-Construction',
  'Construction',
  'Operations',
  'Post Opening',
];

// What 'Construction/Ops' became. Tasks and activity-log rows written before
// the split still name the old phase, and rather than rewrite stored history
// the app reads it as the phase it turned into.
export const LEGACY_PHASE_ALIAS = { 'Construction/Ops': 'Construction' };

// Acquiring a store that is already open and trading is not a development
// project with a shorter checklist -- it is different work, split around the
// closing date rather than around building anything.
export const ACQUISITION_PHASES = ['Pre Close', 'Post Close'];

// One entry per brand PG1 develops. `headers` is that brand's checklist,
// exported from its spreadsheet -- the column definitions that decide what
// appears on a project page and what the progress bars count.
//
// A brand with no checklist yet is still listed: its projects can be created
// and named, and the project page says the checklist has not been loaded
// rather than showing an empty page that looks broken.
export const BRANDS = [
  {
    key: 'jerseymikes',
    name: "Jersey Mike's",
    initials: 'JM',
    // What this track is called once Jersey Mike's has more than one. The
    // brand name alone would not distinguish it from its acquisitions.
    trackName: 'New Builds',
    // Matched case-insensitively against a project's free-text `brand` field
    // for the projects that pre-date brandKey. Trailing spaces and the
    // apostrophe-less spelling both appear in the original import.
    aliases: ['jersey mikes', "jersey mike's", 'jm'],
    headers: jerseyMikes,
  },
  {
    key: 'jmacquisitions',
    name: 'Acquisitions',
    // Spelled out where 'Acquisitions' alone would not say whose -- the
    // activity filter lists every track together.
    fullName: "Jersey Mike's \u2014 Acquisitions",
    initials: 'ACQ',
    // Not a brand: a second track of Jersey Mike's work. `parent` keeps it
    // off the brand picker and puts it behind a toggle on Jersey Mike's
    // project list instead. Everything downstream still keys off this entry,
    // because what a project needs from a brand is its checklist, and this
    // track has its own.
    parent: 'jerseymikes',
    trackName: 'Acquisitions',
    aliases: ['acquisitions', 'jm acquisitions', "jersey mike's acquisitions"],
    phases: ACQUISITION_PHASES,
    headers: jmAcquisitions,
  },
  {
    key: 'daves',
    name: "Dave's Hot Chicken",
    initials: 'DHC',
    aliases: ['daves hot chicken', "dave's hot chicken", 'dhc', 'daves'],
    headers: davesHotChicken,
  },
  {
    key: 'mogu',
    name: 'Mogu',
    initials: 'MO',
    aliases: ['mogu'],
    headers: [],
  },
];

export const BRAND_BY_KEY = Object.fromEntries(BRANDS.map((b) => [b.key, b]));

// What the brand picker offers. A track belongs to its parent's card, not
// beside it.
export const TOP_BRANDS = BRANDS.filter((b) => !b.parent);
export const DEFAULT_BRAND_KEY = 'jerseymikes';

// Which brand's checklist a project is filled in against.
//
// `brandKey` is authoritative once set. Projects created before brands
// existed have only the free-text `brand` column from the spreadsheet, so it
// is matched against the aliases above; anything unrecognised falls back to
// Jersey Mike's, which is what every project imported from the original
// spreadsheet actually is.
//
// This matters more than it looks: a project's ticked boxes are stored by
// spreadsheet column letter, and the same letter means a different item in a
// different brand's checklist. Resolving to the wrong brand would not lose
// data, but it would relabel it.
export function brandKeyFor(project) {
  if (project?.brandKey && BRAND_BY_KEY[project.brandKey]) return project.brandKey;
  const text = (project?.brand || '').trim().toLowerCase();
  if (text) {
    const hit = BRANDS.find((b) => b.key === text || b.aliases.includes(text));
    if (hit) return hit.key;
  }
  return DEFAULT_BRAND_KEY;
}

export function brandFor(project) {
  return BRAND_BY_KEY[brandKeyFor(project)];
}

// The brand a track belongs to -- itself, for a brand with no parent. Used
// wherever something should be filed under Jersey Mike's whether it is a new
// build or an acquisition: the picker's counts, the heading, a new project's
// free-text brand column.
export function rootBrandFor(brandKey) {
  const b = BRAND_BY_KEY[brandKey];
  if (!b) return BRAND_BY_KEY[DEFAULT_BRAND_KEY];
  return b.parent ? BRAND_BY_KEY[b.parent] || BRAND_BY_KEY[DEFAULT_BRAND_KEY] : b;
}

// The tracks to offer on a brand's project list, or an empty list when the
// brand has only one -- which is the signal to show no toggle at all rather
// than a toggle with a single option.
export function tracksFor(brandKey) {
  const parent = BRAND_BY_KEY[brandKey];
  if (!parent || parent.parent) return [];
  const children = BRANDS.filter((b) => b.parent === parent.key);
  return children.length ? [parent, ...children] : [];
}
