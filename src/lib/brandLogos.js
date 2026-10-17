// Brand logos, picked up from the folder rather than listed here.
//
// Vite resolves this glob at build time, so adding src/assets/brands/mogu.png
// is the entire job -- no import to add, no map to update, and nothing to
// forget when a fifth brand arrives. A brand with no file keeps its coloured
// initials, which is why this returns null rather than a placeholder.
const files = import.meta.glob('../assets/brands/*.{png,jpg,jpeg,svg,webp}', {
  eager: true,
  import: 'default',
});

const byKey = {};
for (const [path, url] of Object.entries(files)) {
  const name = path.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
  byKey[name] = url;
}

export function logoFor(brandKey) {
  if (!brandKey) return null;
  return byKey[brandKey] || null;
}

export function hasAnyLogo() {
  return Object.keys(byKey).length > 0;
}
