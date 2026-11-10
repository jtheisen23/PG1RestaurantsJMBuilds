/**
 * Works out how to give one brand exactly the checklist another brand has.
 *
 * A brand's checklist lives in two places. The list itself ships with the app
 * (src/data/brands/*.json). Everything an admin has done to it since -- items
 * added brand-wide, items reworded, items removed, the order they sit in, and
 * the construction playbook -- lives in the database. Copying the file alone
 * would give the new brand the raw spreadsheet, not the checklist the source
 * brand's projects actually show.
 *
 * Everything in the database half is keyed by spreadsheet column letter, so it
 * only means the same thing on a brand whose shipped list is the same list.
 * That is checked first, and the plan refuses rather than relabelling: carried
 * onto a different list, "hide column AR" would hide some other item.
 *
 * What it writes:
 *
 *   brand template  the source's added fields, rewordings and new-project
 *                   defaults, replacing the target's. Added fields keep their
 *                   ids, so the two brands share a definition, not data:
 *                   values are stored on each project.
 *   projects        the defaults (removals and order) applied to the target
 *                   brand's existing projects. `fields` is never written, so
 *                   nothing anyone has entered can be lost.
 *   playbook        the source's construction steps, re-created for the
 *                   target. Fresh documents, so each brand ticks its own.
 *
 * What it deliberately keeps: fields the target brand or its projects added
 * for themselves. They may hold data, so they are listed, not removed.
 *
 * Kept free of Firebase so it can be tested directly. Running it a second time
 * plans nothing new.
 */

// Kept in step with src/lib/brands.js.
const ALIASES = {
  jerseymikes: ['jersey mikes', "jersey mike's", 'jm'],
  jmacquisitions: ['acquisitions', 'jm acquisitions', "jersey mike's acquisitions"],
  daves: ['daves hot chicken', "dave's hot chicken", 'dhc', 'daves'],
  mogu: ['mogu'],
  doghaus: ['dog haus', 'doghaus', 'dh'],
};

// The same rule the app uses. A playbook step with no brandKey pre-dates
// brands and is Jersey Mike's, which this falls back to.
function brandKeyOf(d) {
  if (d.brandKey && ALIASES[d.brandKey]) return d.brandKey;
  const text = (d.brand || '').trim().toLowerCase();
  const hit = Object.entries(ALIASES).find(([k, a]) => k === text || a.includes(text));
  return hit ? hit[0] : 'jerseymikes';
}

const asArray = (v) => (Array.isArray(v) ? v : []);
const asObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const norm = (v) => (v == null ? '' : String(v).trim().toLowerCase());
const isCustomKey = (k) => k.startsWith('cf_');
const isPriorityKey = (k) => k.endsWith('__pri');

// The part of a shipped item the database setup depends on.
const shape = (h) => [h.letter, h.phase, h.type, h.label].join('\u0001');

function compareChecklists(source, target) {
  if (!target.length) return 'its checklist file is empty';
  if (source.length !== target.length) {
    return `it has ${target.length} items to the source's ${source.length}`;
  }
  const i = source.findIndex((h, n) => shape(h) !== shape(target[n]));
  if (i === -1) return null;
  return `item ${i + 1} differs: "${source[i].label}" (${source[i].letter}) against "${target[i].label}" (${target[i].letter})`;
}

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function planChecklistCopy({
  sourceKey,
  targetKey,
  sourceHeaders,
  targetHeaders,
  sourceDoc,
  targetDoc,
  targetProjects,
  timeline,
}) {
  if (sourceKey === targetKey) {
    return { error: 'The source and target are the same brand.' };
  }
  const mismatch = compareChecklists(asArray(sourceHeaders), asArray(targetHeaders));
  if (mismatch) {
    return {
      error:
        `${targetKey} does not ship the same checklist as ${sourceKey}: ${mismatch}. ` +
        `The setup being copied is keyed by column letter, so it would land on the wrong items. ` +
        `Make the two checklist files identical first -- and if this is running from GitHub, ` +
        `choose the branch that has that change.`,
    };
  }

  const src = asObject(sourceDoc);
  const tgt = asObject(targetDoc);

  // ---- brand template ----
  const srcFields = asArray(src.customFields).filter((f) => f && f.id);
  const srcIds = new Set(srcFields.map((f) => f.id));
  // The target's own added fields may already hold values on its projects,
  // so they stay -- after the copied ones, so the copied ones read in the
  // source's order.
  const keptFields = asArray(tgt.customFields).filter((f) => f && f.id && !srcIds.has(f.id));
  const customFields = [...srcFields, ...keptFields];

  // Rewordings are replaced outright rather than merged: a rewording is only a
  // label, so dropping one loses no data, and merging would leave the target
  // reading differently from the source.
  const labels = { ...asObject(src.labels) };
  const droppedLabels = Object.keys(asObject(tgt.labels)).filter(
    (k) => asObject(tgt.labels)[k] !== labels[k]
  );

  const srcDefaults = asObject(src.defaults);
  const defaults = {
    hiddenFields: asArray(srcDefaults.hiddenFields),
    fieldOrder: asObject(srcDefaults.fieldOrder),
  };

  // ---- the target brand's existing projects ----
  const projects = [];
  asArray(targetProjects).forEach((p) => {
    const hiddenBefore = asArray(p.hiddenFields);
    // A union, not a replacement: anything this project already removed is
    // its own judgement and stays removed.
    const hidden = [...defaults.hiddenFields];
    hiddenBefore.forEach((k) => {
      if (!hidden.includes(k)) hidden.push(k);
    });

    const orderBefore = asObject(p.fieldOrder);
    const order = { ...orderBefore };
    Object.entries(defaults.fieldOrder).forEach(([phase, keys]) => {
      const base = asArray(keys);
      const own = asArray(orderBefore[phase]).filter((k) => !base.includes(k));
      order[phase] = [...base, ...own];
    });

    const orderChanged = Object.keys(order).some(
      (ph) => !sameList(asArray(order[ph]), asArray(orderBefore[ph]))
    );
    const hiddenChanged = !sameList(hidden, hiddenBefore);

    // Values already sitting under a spreadsheet letter will now be shown
    // against that letter's item. On a brand that had no checklist there
    // should be none; if there are, they are worth seeing before applying.
    const values = asObject(p.fields);
    const lettered = Object.keys(values).filter(
      (k) => !isCustomKey(k) && !isPriorityKey(k) && values[k] !== '' && values[k] != null
    );

    projects.push({
      id: p.id,
      name: p.name || '(unnamed)',
      completed: Boolean(p.completed),
      update: hiddenChanged || orderChanged ? { hiddenFields: hidden, fieldOrder: order } : null,
      report: {
        newlyHidden: hidden.filter((k) => !hiddenBefore.includes(k)),
        keptOwnHidden: hiddenBefore.filter((k) => !defaults.hiddenFields.includes(k)),
        orderedPhases: Object.keys(defaults.fieldOrder).length,
        ownFields: asArray(p.customFields).map((f) => f?.label || f?.id),
        letteredValues: lettered,
      },
    });
  });

  // ---- construction playbook ----
  const rows = asArray(timeline);
  const rank = (t) => (typeof t.order === 'number' ? t.order : Number.MAX_SAFE_INTEGER);
  const maxOrder = rows.reduce(
    (max, t) => (typeof t.order === 'number' && t.order > max ? t.order : max),
    -1
  );
  const sourceSteps = rows.filter((t) => brandKeyOf(t) === sourceKey).sort((a, b) => rank(a) - rank(b));
  const targetSteps = rows.filter((t) => brandKeyOf(t) === targetKey);
  const identity = (t) => `${norm(t.week)}|${norm(t.detail)}`;
  const present = new Set(targetSteps.map(identity));
  const freshSteps = sourceSteps.filter((t) => !present.has(identity(t)));

  const steps = freshSteps.map((t, i) => ({
    week: t.week || '',
    detail: t.detail || '',
    who: t.who || '',
    duration: t.duration || '',
    inspection: t.inspection || '',
    note: t.note || '',
    brandKey: targetKey,
    order: maxOrder + 1 + i,
  }));

  const brandChanged =
    JSON.stringify(customFields) !== JSON.stringify(asArray(tgt.customFields)) ||
    JSON.stringify(labels) !== JSON.stringify(asObject(tgt.labels)) ||
    JSON.stringify(defaults) !==
      JSON.stringify({
        hiddenFields: asArray(asObject(tgt.defaults).hiddenFields),
        fieldOrder: asObject(asObject(tgt.defaults).fieldOrder),
      });

  return {
    brand: {
      update: brandChanged ? { customFields, labels, defaults } : null,
      customFields,
      copiedFields: srcFields,
      keptFields,
      labels,
      droppedLabels,
      defaults,
    },
    projects,
    playbook: {
      sourceCount: sourceSteps.length,
      alreadyThere: sourceSteps.length - freshSteps.length,
      targetOwn: targetSteps.filter(
        (t) => !sourceSteps.some((s) => identity(s) === identity(t))
      ).length,
      steps,
    },
  };
}

module.exports = { planChecklistCopy, compareChecklists, brandKeyOf, ALIASES };
