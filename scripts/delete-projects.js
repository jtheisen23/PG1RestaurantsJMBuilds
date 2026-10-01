/**
 * Deletes named projects from one brand, and only ones nobody has worked on.
 *
 * Written for a specific mess: five stores appeared on the acquisitions
 * spreadsheet that already existed as empty placeholders in the Jersey
 * Mike's pipeline, so importing the acquisitions produced two records for
 * the same store. The placeholders are the ones to go.
 *
 * Deleting by name alone would be dangerous here, because the duplicate
 * pairs share a name -- that is the whole problem. So the brand is part of
 * the identity: --brand decides which of the two a name refers to, and the
 * other one is reported as spared rather than quietly included.
 *
 * It will not delete a project with anything ticked on it, or with more
 * than --max-values stored values, whatever you ask for. Such projects are
 * listed and left alone. If you genuinely want to remove one of those,
 * delete it from the project page in the app, where you can see what you
 * are throwing away.
 *
 * Usage:
 *   node scripts/delete-projects.js --names "A|B|C"
 *   node scripts/delete-projects.js --names "A|B|C" --apply
 *   node scripts/delete-projects.js --names "A" --brand jmacquisitions --apply
 *
 * Names are pipe-separated and matched exactly, ignoring case and
 * surrounding space. "Marion" will not match "Marion, NC".
 *
 * Dry run by default. Deletion is permanent; there is no undo. Activity-log
 * entries pointing at a deleted project are kept -- they carry a snapshot of
 * the project name, so the history stays readable.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { planDeletions } = require('./lib/delete-plan.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

function valueOf(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const NAMES = valueOf('--names', '');
const BRAND = valueOf('--brand', 'jerseymikes');
const MAX_VALUES = Number(valueOf('--max-values', '6'));

const names = NAMES.split('|').map((s) => s.trim()).filter(Boolean);

if (!names.length) {
  console.error(
    '\nUsage: node scripts/delete-projects.js --names "Name One|Name Two" [--brand <key>] [--apply]\n' +
      '\nNothing was deleted: no names were given. An empty list is not a wildcard.\n'
  );
  process.exit(1);
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
  const projects = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const plan = planDeletions({ projects, names, brandKey: BRAND, maxValues: MAX_VALUES });

  console.log(`\nBrand: ${BRAND}   |   ${names.length} name(s) asked for\n`);

  if (plan.otherBrand.length) {
    console.log(`Same name on another track -- NOT touched (${plan.otherBrand.length}):`);
    plan.otherBrand.forEach((p) => console.log(`   ${p.name.padEnd(28)} [${p.brandKey}]`));
    console.log();
  }

  if (plan.hasData.length) {
    console.log(`Has data, so SPARED (${plan.hasData.length}):`);
    plan.hasData.forEach((p) =>
      console.log(`   ${p.name.padEnd(28)} ${p.ticked} ticked, ${p.values} stored values`)
    );
    console.log('   Delete these from the project page if you really mean to.\n');
  }

  if (plan.notFound.length) {
    console.log(`No ${BRAND} project with this name (${plan.notFound.length}):`);
    plan.notFound.forEach((n) => console.log(`   ${n}`));
    console.log();
  }

  if (!plan.toDelete.length) {
    console.log('Nothing to delete.\n');
    process.exit(0);
  }

  console.log(`To delete (${plan.toDelete.length}):`);
  plan.toDelete.forEach((p) =>
    console.log(`   ${p.name.padEnd(28)} ${p.ticked} ticked, ${p.values} stored values`)
  );

  if (!APPLY) {
    console.log('\nDRY RUN - nothing deleted. Re-run with --apply.\n');
    process.exit(0);
  }

  const batch = db.batch();
  plan.toDelete.forEach((p) => batch.delete(db.collection('projects').doc(p.id)));
  await batch.commit();

  console.log(`\nDeleted ${plan.toDelete.length} project(s). This cannot be undone.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
