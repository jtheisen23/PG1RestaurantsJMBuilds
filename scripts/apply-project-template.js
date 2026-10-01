/**
 * Makes every project of a brand match one project's checklist setup, leaving
 * every project's own data alone.
 *
 * The reason this is safe rather than delicate: a project document keeps the
 * setup and the data in different keys. `fields` holds what people have
 * entered and ticked; hiddenFields, fieldLabels, customFields and fieldOrder
 * describe the checklist around it. This script writes only the second group
 * -- `fields` is never in a payload it sends, so nothing anyone has entered
 * can be lost, whatever the setup does.
 *
 * What it does with each part of the setup:
 *
 *   added fields   promoted to the brand, keeping their ids, so they are one
 *                  definition rather than forty copies -- projects created
 *                  later get them too, and editing one later is one edit
 *   rewordings     promoted to the brand for the same reason
 *   removals       copied to every project: this is the part that changes
 *                  what each project is measured against, so read the dry run
 *   order          copied to every project
 *
 * What it deliberately does NOT do: delete fields another project added for
 * itself. Those hold data, and removing them would delete it. They are listed
 * in the dry run so you can see where projects still differ.
 *
 * Usage:
 *   node scripts/apply-project-template.js --from "Seminole"
 *   node scripts/apply-project-template.js --from "Seminole" --apply
 *
 * Dry run by default. Read it before applying.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { planTemplateRollout } = require('./lib/template-plan.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const fromIdx = args.indexOf('--from');
const FROM = fromIdx >= 0 ? args[fromIdx + 1] : null;
const INCLUDE_COMPLETED = args.includes('--include-completed');

if (!FROM) {
  console.error('\nUsage: node scripts/apply-project-template.js --from "<project name>" [--apply]\n');
  process.exit(1);
}

// Kept in step with src/lib/brands.js.
//
// jmacquisitions must be listed even though it is a track of Jersey Mike's
// rather than a brand: without it, an acquisition's brandKey would not be
// recognised, the free-text "Jersey Mike's" in its brand column would win,
// and a rollout from a new-build template would be applied to a store whose
// checklist is a completely different list.
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

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(path.join(__dirname, 'serviceAccountKey.json'), 'utf8'));
} catch {
  console.error(
    '\nMissing scripts/serviceAccountKey.json.\n' +
      'Download it from Firebase console > Project settings > Service accounts > Generate new private key.\n'
  );
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const snap = await db.collection('projects').get();
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const needle = FROM.trim().toLowerCase();
  // An exact name wins outright. Without this, --from "Seminole" is ambiguous
  // the moment an acquisition called "-Seminole Trail" exists, and there is
  // no substring of the new build's name that excludes it.
  const exact = all.filter((p) => (p.name || '').trim().toLowerCase() === needle);
  const matches = exact.length ? exact : all.filter((p) => (p.name || '').toLowerCase().includes(needle));
  if (!matches.length) {
    console.error(`\nNo project matches "${FROM}".\n`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`\n"${FROM}" matches ${matches.length} projects:`);
    matches.forEach((m) => console.error(`   ${m.name}`));
    console.error('\nUse a more specific name.\n');
    process.exit(1);
  }

  const source = matches[0];
  const brandKey = brandKeyOf(source);
  const targets = all.filter(
    (p) => p.id !== source.id && brandKeyOf(p) === brandKey && (INCLUDE_COMPLETED || !p.completed)
  );

  const brandRef = db.collection('brandTemplates').doc(brandKey);
  const brandDoc = (await brandRef.get()).data() || {};

  const plan = planTemplateRollout({ source, targets, brandDoc });

  console.log(`\nTemplate:  ${source.name}   (brand: ${brandKey})`);
  console.log(`Applying to ${targets.length} other ${brandKey} project(s)` +
    (INCLUDE_COMPLETED ? ', completed ones included.' : '. Completed stores are skipped; pass --include-completed to include them.'));

  console.log(`\nPromoted to the brand, so every project gets them:`);
  console.log(`   ${plan.brand.customFields.length} added field(s): ` +
    (plan.brand.customFields.map((f) => f.label).join(', ') || '(none)'));
  console.log(`   ${Object.keys(plan.brand.labels).length} rewording(s)`);

  const ticked = plan.targets.filter((t) => t.report.newlyHiddenButTicked.length);
  const restored = plan.targets.filter((t) => t.report.unhidden.length);
  const ownFields = plan.targets.filter((t) => t.report.keepsOwnFields.length);

  console.log(`\nPer project:`);
  plan.targets.forEach((t) => {
    const r = t.report;
    const bits = [];
    if (r.newlyHidden.length) bits.push(`${r.newlyHidden.length} item(s) removed`);
    if (r.unhidden.length) bits.push(`${r.unhidden.length} restored`);
    if (r.ordersApplied) bits.push(`order set on ${r.ordersApplied} phase(s)`);
    console.log(`   ${t.name.padEnd(32)} ${bits.join(', ') || 'no change'}`);
  });

  if (ticked.length) {
    console.log(`\n!! ${ticked.length} project(s) have TICKED items the template removes.`);
    console.log(`   The ticks are not deleted -- the value stays and returns if the item is`);
    console.log(`   restored -- but they stop counting towards progress, so percentages move:`);
    ticked.forEach((t) =>
      console.log(`     ${t.name}: ${t.report.newlyHiddenButTicked.join(', ')}`)
    );
  }
  if (restored.length) {
    console.log(`\n   ${restored.length} project(s) had their own removals, which the template puts back:`);
    restored.forEach((t) => console.log(`     ${t.name}: ${t.report.unhidden.join(', ')}`));
  }
  if (ownFields.length) {
    console.log(`\n   ${ownFields.length} project(s) keep fields they added themselves. These hold`);
    console.log(`   data, so they are left alone rather than made to match:`);
    ownFields.forEach((t) => console.log(`     ${t.name}: ${t.report.keepsOwnFields.join(', ')}`));
  }

  console.log(`\nNo project's data is touched: "fields" is not written by this script.`);

  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply.\n');
    process.exit(0);
  }

  await brandRef.set(
    {
      customFields: plan.brand.customFields,
      labels: plan.brand.labels,
      updatedAt: new Date(),
      updatedBy: 'apply-project-template',
    },
    { merge: true }
  );
  await db.collection('projects').doc(source.id).update({
    ...plan.sourceUpdate,
    updatedAt: new Date(),
    updatedBy: 'apply-project-template',
  });

  for (let i = 0; i < plan.targets.length; i += 400) {
    const batch = db.batch();
    plan.targets.slice(i, i + 400).forEach((t) =>
      batch.update(db.collection('projects').doc(t.id), {
        ...t.update,
        updatedAt: new Date(),
        updatedBy: 'apply-project-template',
      })
    );
    await batch.commit();
  }

  console.log(`\nApplied to ${plan.targets.length} project(s). Brand template updated.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
