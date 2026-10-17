import { BRANDS } from './brands';

// Brand logos, picked up from the folder rather than listed here.
//
// Vite resolves this glob at build time, so dropping a file into
// src/assets/brands is the whole job -- no import to add, no map to update,
// and nothing to forget when a fifth brand arrives.
const files = import.meta.glob('../assets/brands/*.{png,jpg,jpeg,svg,webp}', {
  eager: true,
  import: 'default',
});

// Names are matched loosely, because a logo arrives called whatever the
// brand's own press kit called it: "Dog Haus.png", "Daves Hot Chicken
// logo.jpeg", "Jersey_Mike's_logo.svg.webp". Insisting on an exact
// filename means a perfectly good upload silently shows nothing, and the
// person who uploaded it has no way to tell why.
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Longest first, so "jerseymikes" wins over a shorter alias that also
// happens to appear in the same filename.
const CANDIDATES = BRANDS.flatMap((b) =>
  [b.key, ...(b.aliases || [])].map((a) => ({ key: b.key, token: squash(a) }))
)
  .filter((c) => c.token)
  .sort((a, b) => b.token.length - a.token.length);

function brandForFilename(name) {
  const n = squash(name);
  if (!n) return null;
  const exact = CANDIDATES.find((c) => c.token === n);
  if (exact) return exact.key;
  return CANDIDATES.find((c) => n.includes(c.token))?.key || null;
}

const byKey = {};
for (const [path, url] of Object.entries(files)) {
  const base = path.split('/').pop().replace(/\.[^.]+$/, '');
  const key = brandForFilename(base);
  // First match wins, so a tidily named file is never displaced by a
  // stray one that happens to mention the same brand.
  if (key && !byKey[key]) byKey[key] = url;
}

export function logoFor(brandKey) {
  if (!brandKey) return null;
  return byKey[brandKey] || null;
}

export function hasAnyLogo() {
  return Object.keys(byKey).length > 0;
}
