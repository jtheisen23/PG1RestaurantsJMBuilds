/**
 * Gives one brand exactly the checklist another brand's projects show.
 *
 * The checklist file ships with the app, but what Jersey Mike's projects
 * actually display has grown past it: items added brand-wide (all of Post
 * Opening, for one), items reworded, items removed and reordered by the
 * template rollout, and the construction playbook. All of that is in the
 * database, and this copies it across:
 *
 *   added fields, rewordings,   copied onto the target brand's template, so
 *   new-project defaults        projects created from now on get them too
 *   removals and order          applied to the target brand's existing projects
 *   construction playbook       re-created for the target brand
 *
 * It refuses unless both brands ship the same checklist file, letter for
 * letter: everything above is keyed by column letter and would land on the
 * wrong items otherwise.
 *
 * No project's `fields` -- what people have ticked and typed -- is written.
 * Fields the target brand added for itself are kept, not removed. A second run
 * plans nothing new.
 *
 * Usage:
 *   node scripts/copy-brand-checklist.js --from jerseymikes --to mogu
 *   node scripts/copy-brand-checklist.js --from jerseymikes --to mogu --apply
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
const { planChecklistCopy, brandKeyOf } = require('./lib/copy-checklist-plan.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1].trim() : '';
}

// Kept in step with the imports in src/lib/brands.js.
const CHECKLIST_FILES = {
  jerseymikes: 'jersey-mikes.json',
  jmacquisitions: 'jm-acquisitions.json',
  daves: 'daves-hot-chicken.json',
  mogu: 'mogu.json',
  doghaus: 'dog-haus.json',
};

const FROM = valueOf('--from');
const TO = valueOf('--to');
const known = Object.keys(CHECKLIST_FILES).join('|');
if (!CHECKLIST_FILES[FROM] || !CHECKLIST_FILES[TO]) {
  console.error(
    `\nUsage: node scripts/copy-brand-checklist.js --from <${known}> --to <${known}> [--apply]\n` +
      '\nBoth brands must be named, exactly. There is no default.\n'
  );
  process.exit(1);
}

const headersOf = (key) =>
  JSON.parse(readFileSync(path.join(__dirname, '..', 'src', 'data', 'brands', CHECKLIST_FILES[key]), 'utf8'));

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

const list = (items, empty = '(none)') => (items.length ? items.join(', ') : empty);

async function main() {
  const [srcSnap, tgtSnap, projSnap, tlSnap] = await Promise.all([
    db.collection('brandTemplates').doc(FROM).get(),
    db.collection('brandTemplates').doc(TO).get(),
    db.collection('projects').get(),
    db.collection('timeline').get(),
  ]);

  const targetProjects = projSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => brandKeyOf(p) === TO);

  const plan = planChecklistCopy({
    sourceKey: FROM,
    targetKey: TO,
    sourceHeaders: headersOf(FROM),
    targetHeaders: headersOf(TO),
    sourceDoc: srcSnap.exists ? srcSnap.data() : {},
    targetDoc: tgtSnap.exists ? tgtSnap.data() : {},
    targetProjects,
    timeline: tlSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  });

  if (plan.error) {
    console.error(`\nNothing was written. ${plan.error}\n`);
    process.exit(1);
  }

  console.log(`\nCopying the ${FROM} checklist setup to ${TO}.`);
  console.log(`Both brands ship the same ${headersOf(FROM).length}-item checklist file.`);

  const b = plan.brand;
  console.log(`\nBrand template (${TO}):`);
  console.log(`   ${b.copiedFields.length} added field(s): ${list(b.copiedFields.map((f) => `${f.label} [${f.phase}]`))}`);
  console.log(`   ${Object.keys(b.labels).length} rewording(s)`);
  console.log(
    `   new projects start with ${b.defaults.hiddenFields.length} item(s) removed, ` +
      `order set on ${Object.keys(b.defaults.fieldOrder).length} phase(s)`
  );
  if (!srcSnap.exists) {
    console.log(`   (${FROM} has no brand template in the database -- only the file is copied.)`);
  }
  if (b.keptFields.length) {
    console.log(`   ${TO} keeps ${b.keptFields.length} field(s) it added itself: ${list(b.keptFields.map((f) => f.label))}`);
  }
  if (b.droppedLabels.length) {
    console.log(`   ${TO}'s own rewording of ${list(b.droppedLabels)} is replaced by ${FROM}'s wording.`);
  }
  if (!b.update) console.log('   already matches -- no change');

  console.log(`\n${TO} projects (${plan.projects.length}):`);
  if (!plan.projects.length) console.log('   (none yet -- new ones will start from the template)');
  plan.projects.forEach((p) => {
    const r = p.report;
    const bits = [];
    if (r.newlyHidden.length) bits.push(`${r.newlyHidden.length} item(s) removed`);
    if (p.update && r.orderedPhases) bits.push(`order set on ${r.orderedPhases} phase(s)`);
    console.log(`   ${p.name.padEnd(32)} ${bits.join(', ') || 'no change'}${p.completed ? '  (completed)' : ''}`);
  });

  const lettered = plan.projects.filter((p) => p.report.letteredValues.length);
  if (lettered.length) {
    console.log(`\n!! ${lettered.length} ${TO} project(s) already hold values under checklist columns.`);
    console.log(`   They will now appear against the ${FROM} item with that column letter:`);
    lettered.forEach((p) => console.log(`     ${p.name}: ${p.report.letteredValues.join(', ')}`));
  }
  const ownHidden = plan.projects.filter((p) => p.report.keptOwnHidden.length);
  if (ownHidden.length) {
    console.log(`\n   ${ownHidden.length} project(s) keep removals of their own:`);
    ownHidden.forEach((p) => console.log(`     ${p.name}: ${p.report.keptOwnHidden.join(', ')}`));
  }
  const ownFields = plan.projects.filter((p) => p.report.ownFields.length);
  if (ownFields.length) {
    console.log(`\n   ${ownFields.length} project(s) keep fields they added themselves:`);
    ownFields.forEach((p) => console.log(`     ${p.name}: ${p.report.ownFields.join(', ')}`));
  }

  const pb = plan.playbook;
  console.log(`\nConstruction playbook: ${FROM} has ${pb.sourceCount} step(s).`);
  if (pb.alreadyThere) console.log(`   ${pb.alreadyThere} already on ${TO}, not re-created.`);
  console.log(`   ${pb.steps.length} to create for ${TO}.`);
  if (pb.targetOwn) {
    console.log(`!! ${TO} already has ${pb.targetOwn} playbook step(s) of its own. They are kept, so its`);
    console.log(`   playbook will be ${FROM}'s steps plus those.`);
  }
  let lastWeek = null;
  pb.steps.forEach((t) => {
    if (t.week !== lastWeek) console.log(`   ${t.week}`);
    lastWeek = t.week;
    console.log(`      ${t.detail.slice(0, 60)}`);
  });

  console.log(`\nNo project's data is touched: "fields" is not written by this script.`);

  const projectWrites = plan.projects.filter((p) => p.update);
  if (!b.update && !projectWrites.length && !pb.steps.length) {
    console.log('\nNothing to do: everything already matches.\n');
    process.exit(0);
  }

  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply.\n');
    process.exit(0);
  }

  if (b.update) {
    // mergeFields rather than merge: merge would fold the labels map into the
    // target's existing one key by key, and leave any rewording it had behind.
    await db.collection('brandTemplates').doc(TO).set(
      {
        ...b.update,
        updatedAt: new Date(),
        updatedBy: 'copy-brand-checklist',
      },
      { mergeFields: ['customFields', 'labels', 'defaults', 'updatedAt', 'updatedBy'] }
    );
  }

  for (let i = 0; i < projectWrites.length; i += 400) {
    const batch = db.batch();
    projectWrites.slice(i, i + 400).forEach((p) =>
      batch.update(db.collection('projects').doc(p.id), {
        ...p.update,
        updatedAt: new Date(),
        updatedBy: 'copy-brand-checklist',
      })
    );
    await batch.commit();
  }

  for (let i = 0; i < pb.steps.length; i += 400) {
    const batch = db.batch();
    pb.steps.slice(i, i + 400).forEach((t) => batch.set(db.collection('timeline').doc(), t));
    await batch.commit();
  }

  console.log(
    `\nDone. Brand template ${b.update ? 'updated' : 'unchanged'}, ` +
      `${projectWrites.length} project(s) updated, ${pb.steps.length} playbook step(s) created.\n`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
