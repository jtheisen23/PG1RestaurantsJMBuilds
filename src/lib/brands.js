import jerseyMikes from '../data/brands/jersey-mikes.json';

// The three phases every brand's checklist is grouped into. A brand may
// override this, but nothing does yet: the phases are how PG1 runs a
// development project, not something Jersey Mike's imposes.
export const DEFAULT_PHASES = ['Real Estate', 'Pre-Construction', 'Construction/Ops'];

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
    // Matched case-insensitively against a project's free-text `brand` field
    // for the projects that pre-date brandKey. Trailing spaces and the
    // apostrophe-less spelling both appear in the original import.
    aliases: ['jersey mikes', "jersey mike's", 'jm'],
    headers: jerseyMikes,
  },
  {
    key: 'daves',
    name: "Dave's Hot Chicken",
    initials: 'DHC',
    aliases: ['daves hot chicken', "dave's hot chicken", 'dhc', 'daves'],
    headers: [],
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
