/**
 * Works out how to clear a track's checklists back to an empty state.
 *
 * Used when a checklist is being replaced outright rather than revised. The
 * old items are going away, so the values stored against their keys are not
 * worth carrying: at best they would be orphaned, and at worst -- if a key
 * from the old list happens to be reissued to a different item in the new
 * one -- they would show up as ticks against things nobody has done.
 *
 * What survives is named explicitly rather than by exclusion, so adding a
 * field to the checklist later can never accidentally make it survivable.
 *
 * Kept free of Firebase so the rule can be tested directly. A project
 * already clear produces no write at all, which is what makes running this
 * twice harmless.
 */

const ALIASES = {
  jerseymikes: ['jersey mikes', "jersey mike's", 'jm'],
  jmacquisitions: ['acquisitions', 'jm acquisitions', "jersey mike's acquisitions"],
  daves: ['daves hot chicken', "dave's hot chicken", 'dhc', 'daves'],
  mogu: ['mogu'],
  doghaus: ['dog haus', 'doghaus', 'dh'],
};

function brandKeyOf(p) {
  if (p.brandKey && ALIASES[p.brandKey]) return p.brandKey;
  const text = (p.brand || '').trim().toLowerCase();
  const hit = Object.entries(ALIASES).find(([k, a]) => k === text || a.includes(text));
  return hit ? hit[0] : 'jerseymikes';
}

const asArray = (v) => (Array.isArray(v) ? v : []);
const asObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function planReset({ projects, brandKey, keepLetters = ['B', 'C'] }) {
  const targets = [];
  const skipped = [];

  projects.forEach((p) => {
    if (brandKeyOf(p) !== brandKey) return;

    const fields = asObject(p.fields);
    const kept = {};
    keepLetters.forEach((letter) => {
      const v = fields[letter];
      // Only a value worth keeping. An empty string is not one, and writing
      // it back would make a cleared project look like it still holds data.
      if (v !== undefined && v !== null && v !== '') kept[letter] = v;
    });

    const dropped = Object.keys(fields).filter((k) => !(k in kept));
    const ticked = dropped.filter((k) => fields[k] === true).length;

    const structure =
      asArray(p.hiddenFields).length +
      Object.keys(asObject(p.fieldLabels)).length +
      asArray(p.customFields).length +
      Object.keys(asObject(p.fieldOrder)).length;

    if (!dropped.length && !structure) {
      skipped.push({ id: p.id, name: p.name });
      return;
    }

    targets.push({
      id: p.id,
      name: p.name,
      ticked,
      droppedCount: dropped.length,
      keptLetters: Object.keys(kept),
      update: {
        fields: kept,
        hiddenFields: [],
        fieldLabels: {},
        customFields: [],
        fieldOrder: {},
      },
    });
  });

  return { targets, skipped };
}

module.exports = { planReset, brandKeyOf };
