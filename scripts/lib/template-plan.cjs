/**
 * Works out how to make every project of a brand match one chosen project's
 * checklist setup, without touching anyone's data.
 *
 * This is possible at all because a project document keeps the two apart:
 *
 *   fields        what people have entered and ticked -- the data
 *   hiddenFields  which items are removed here
 *   fieldLabels   which items are reworded here
 *   customFields  which items were added here
 *   fieldOrder    what order they appear in
 *
 * Only the last four describe the setup. The plan below never writes `fields`,
 * which is what makes "carry the data over" true by construction rather than
 * by being careful.
 *
 * Two of the four are promoted to the brand rather than copied forty times:
 * added fields and rewordings become the brand's, so they are one definition,
 * they reach projects created later, and changing one later is one edit. The
 * other two are per-project by nature and are copied.
 *
 * Kept free of Firebase so it can be tested directly.
 */

const asArray = (v) => (Array.isArray(v) ? v : []);
const asObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function planTemplateRollout({ source, targets, brandDoc }) {
  const srcCustom = asArray(source.customFields);
  const srcLabels = asObject(source.fieldLabels);
  const srcHidden = asArray(source.hiddenFields);
  const srcOrder = asObject(source.fieldOrder);

  // Promote the source's own added fields to the brand. Ids are kept, so a
  // value already stored against one stays pointing at the same field.
  const existingBrand = asArray(brandDoc.customFields);
  const byId = new Map(existingBrand.map((f) => [f.id, f]));
  srcCustom.forEach((f) => byId.set(f.id, f));
  const brandCustomFields = [...byId.values()];

  // Same for rewordings. The source's win where they disagree: it is the one
  // being treated as the template.
  const brandLabels = { ...asObject(brandDoc.labels), ...srcLabels };

  const plan = {
    brand: {
      customFields: brandCustomFields,
      labels: brandLabels,
      // The setup a project created from now on should start with. Added
      // fields and rewordings already reach a new project, because they
      // belong to the brand -- these two do not, so the brand carries them
      // as a default for createProject to copy. Without this a new location
      // would get every field but in the spreadsheet's order rather than the
      // one the template was arranged into.
      defaults: { hiddenFields: srcHidden, fieldOrder: srcOrder },
    },
    // Cleared on the source once promoted, or every added field would appear
    // twice there -- once from the brand, once from the project.
    sourceUpdate: { customFields: [], fieldLabels: {} },
    targets: [],
  };

  const brandIdsBefore = new Set(existingBrand.map((f) => f.id));

  targets.forEach((t) => {
    const tHidden = new Set(asArray(t.hiddenFields));
    const values = asObject(t.fields);

    const newlyHidden = srcHidden.filter((k) => !tHidden.has(k));
    const unhidden = [...tHidden].filter((k) => !srcHidden.includes(k));

    plan.targets.push({
      id: t.id,
      name: t.name || '(unnamed)',
      // What actually gets written. `fields` is deliberately absent.
      update: { hiddenFields: [...srcHidden], fieldOrder: srcOrder },
      report: {
        gainsFields: srcCustom.filter((f) => !brandIdsBefore.has(f.id)).map((f) => f.label),
        newlyHidden,
        // The number worth pausing over: items this project has ticked that
        // the template removes. The tick is not deleted -- the value stays in
        // `fields` and comes back if the item is restored -- but it stops
        // counting towards progress here.
        newlyHiddenButTicked: newlyHidden.filter((k) => values[k] === true),
        unhidden,
        keepsOwnFields: asArray(t.customFields).map((f) => f.label),
        ordersApplied: Object.keys(srcOrder).length,
      },
    });
  });

  return plan;
}

module.exports = { planTemplateRollout };
