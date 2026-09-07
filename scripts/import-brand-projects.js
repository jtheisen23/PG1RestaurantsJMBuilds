/**
 * Imports a brand's projects from a converted spreadsheet into Firestore.
 *
 * The original seed.js loaded the Jersey Mike's spreadsheet into an empty
 * database. This does the same job for a brand being added to a database that
 * is already live, so it is more careful than seed.js was:
 *
 *   - it refuses to create a project whose name already exists for that brand,
 *     so running it twice does not duplicate the pipeline
 *   - it stamps brandKey, so the projects are pinned to their own checklist
 *   - it preserves the completed flag and the spreadsheet's row order,
 *     placing the new projects after everything already in the database
 *
 * Usage:
 *   node scripts/import-brand-projects.js scripts/seed-daves-projects.json
 *   node scripts/import-brand-projects.js scripts/seed-daves-projects.json --apply
 *
 * Dry run by default. Read the output before applying.
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
  console.error('\nUsage: node scripts/import-brand-projects.js <projects.json> [--apply]\n');
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

async function main() {
  const snap = await db.collection('projects').get();

  // Highest order in use, so the new brand lands after the existing pipeline
  // rather than interleaving with it.
  let maxOrder = -1;
  const existing = new Set();
  snap.forEach((doc) => {
    const d = doc.data();
    if (typeof d.order === 'number' && d.order > maxOrder) maxOrder = d.order;
    existing.add(`${d.brandKey || ''}|${(d.name || '').trim().toLowerCase()}`);
  });

  const fresh = [];
  const skipped = [];
  incoming.forEach((p) => {
    const key = `${p.brandKey || ''}|${(p.name || '').trim().toLowerCase()}`;
    if (existing.has(key)) skipped.push(p);
    else fresh.push(p);
  });

  console.log(`Database holds ${snap.size} projects. Highest order in use: ${maxOrder}.\n`);

  if (skipped.length) {
    console.log(`Already present, will NOT be re-created (${skipped.length}):`);
    skipped.forEach((p) => console.log(`   ${p.name}`));
    console.log();
  }

  if (!fresh.length) {
    console.log('Nothing new to import.');
    process.exit(0);
  }

  console.log(`To import (${fresh.length}):`);
  fresh.forEach((p, i) => {
    const ticked = Object.values(p.fields || {}).filter((v) => v === true).length;
    const text = Object.keys(p.fields || {}).length - ticked;
    console.log(
      `   ${(p.completed ? '[completed]' : '[active]   ').padEnd(12)} order ${String(maxOrder + 1 + i).padStart(3)}  ` +
        `${(p.name || '(unnamed)').padEnd(32)} ${String(ticked).padStart(3)} ticked, ${String(text).padStart(3)} text`
    );
  });

  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply to import these.');
    process.exit(0);
  }

  const batch = db.batch();
  fresh.forEach((p, i) => {
    const ref = db.collection('projects').doc();
    batch.set(ref, {
      brand: p.brand || '',
      brandKey: p.brandKey || '',
      name: p.name || '',
      order: maxOrder + 1 + i,
      completed: Boolean(p.completed),
      fields: p.fields || {},
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: 'import-script',
    });
  });
  await batch.commit();

  console.log(`\nImported ${fresh.length} project(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
