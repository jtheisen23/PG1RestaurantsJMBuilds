/**
 * Decides which projects a deletion run may remove.
 *
 * Kept separate from the script that talks to Firestore so the rule that
 * matters -- never delete a project anyone has put work into -- can be tested
 * against made-up data rather than against the live database.
 *
 * Three things have to hold before a project is deletable:
 *
 *   1. its name matches one you asked for, exactly (case and surrounding
 *      space aside). No substring matching: "Marion, NC" must not be reachable
 *      by typing "Marion".
 *   2. it belongs to the brand you named. Two projects can share a name on
 *      different tracks -- that is how this mess started -- so the track is
 *      part of the identity, not a detail.
 *   3. nothing is ticked on it, and it holds no more than `maxValues` stored
 *      values. A project someone has worked on is reported and spared.
 */

// Mirrors src/lib/brands.js. A project created before brandKey existed has
// only the free-text brand column.
const ALIASES = {
  jerseymikes: ['jersey mikes', "jersey mike's", 'jm'],
  jmacquisitions: ['acquisitions', 'jm acquisitions', "jersey mike's acquisitions"],
  daves: ['daves hot chicken', "dave's hot chicken", 'dhc', 'daves'],
  mogu: ['mogu'],
};

function brandKeyOf(p) {
  if (p.brandKey && ALIASES[p.brandKey]) return p.brandKey;
  const text = (p.brand || '').trim().toLowerCase();
  const hit = Object.entries(ALIASES).find(([k, a]) => k === text || a.includes(text));
  return hit ? hit[0] : 'jerseymikes';
}

function norm(s) {
  return (s || '').trim().toLowerCase();
}

function planDeletions({ projects, names, brandKey, maxValues = 6 }) {
  const wanted = names.map(norm).filter(Boolean);
  const seen = new Set();

  const toDelete = [];
  const hasData = [];
  const otherBrand = [];

  projects.forEach((p) => {
    const n = norm(p.name);
    if (!wanted.includes(n)) return;

    const key = brandKeyOf(p);
    if (key !== brandKey) {
      // Same name, different track. This is the case that must never be
      // deleted by accident -- it is usually the record being kept.
      otherBrand.push({ id: p.id, name: p.name, brandKey: key });
      return;
    }

    seen.add(n);
    const fields = p.fields || {};
    const ticked = Object.values(fields).filter((v) => v === true).length;
    const values = Object.keys(fields).length;

    if (ticked > 0 || values > maxValues) {
      hasData.push({ id: p.id, name: p.name, ticked, values });
      return;
    }
    toDelete.push({ id: p.id, name: p.name, ticked, values });
  });

  const notFound = names.filter((n) => norm(n) && !seen.has(norm(n)));

  return { toDelete, hasData, otherBrand, notFound };
}

module.exports = { planDeletions, brandKeyOf };
