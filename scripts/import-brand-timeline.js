/**
 * Imports a brand's construction playbook into Firestore.
 *
 * The third of the brand importers, alongside projects and contacts. The
 * playbook is a template shared by every project of one brand, and each
 * project ticks its own copy of the progress, so a duplicated row would show
 * up as an extra unticked step on every store. This refuses to re-create a row
 * already present for the brand.
 *
 * Grouping differs by brand and that is fine: Jersey Mike's groups its steps
 * into "Week 1".."Week 12", Dave's into build phases. Both live in the same
 * `week` field, which is really "the heading this step sits under".
 *
 * Usage:
 *   node scripts/import-brand-timeline.js scripts/seed-daves-timeline.json
 *   node scripts/import-brand-timeline.js scripts/seed-daves-timeline.json --apply
 *
 * Dry run by default.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const file = args.find((a) => !a.startsWith('--'));

if (!file) {
  console.error('\nUsage: node scripts/import-brand-timeline.js <timeline.json> [--apply]\n');
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

const incoming = JSON.parse(readFileSync(path.resolve(file), 'utf8'));
const norm = (v) => (v == null ? '' : String(v).trim().toLowerCase());
const identity = (t) => [t.brandKey || '', norm(t.week), norm(t.detail)].join('|');

async function main() {
  const snap = await db.collection('timeline').get();

  let maxOrder = -1;
  const existing = new Set();
  snap.forEach((doc) => {
    const d = doc.data();
    if (typeof d.order === 'number' && d.order > maxOrder) maxOrder = d.order;
    // Steps with no brandKey pre-date brands and are Jersey Mike's, matching
    // how the app reads them.
    existing.add(identity({ ...d, brandKey: d.brandKey || 'jerseymikes' }));
  });

  const fresh = incoming.filter((t) => !existing.has(identity(t)));
  const skipped = incoming.length - fresh.length;

  console.log(`Database holds ${snap.size} playbook steps. Highest order in use: ${maxOrder}.\n`);
  if (skipped) console.log(`Already present, will NOT be re-created: ${skipped}\n`);

  if (!fresh.length) {
    console.log('Nothing new to import.');
    process.exit(0);
  }

  console.log(`To import (${fresh.length}):`);
  fresh.forEach((t) =>
    console.log(
      `   ${(t.week || '').slice(0, 28).padEnd(30)} ${(t.detail || '').slice(0, 44).padEnd(46)} ` +
        `${(t.duration || '').padEnd(10)} ${norm(t.inspection) === 'yes' ? 'inspection' : ''}`
    )
  );

  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply to import these.');
    process.exit(0);
  }

  const batch = db.batch();
  fresh.forEach((t, i) => {
    batch.set(db.collection('timeline').doc(), {
      week: t.week || '',
      detail: t.detail || '',
      who: t.who || '',
      duration: t.duration || '',
      inspection: t.inspection || '',
      note: t.note || '',
      brandKey: t.brandKey || '',
      order: maxOrder + 1 + i,
    });
  });
  await batch.commit();

  console.log(`\nImported ${fresh.length} playbook step(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
