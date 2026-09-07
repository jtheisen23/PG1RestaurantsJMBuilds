/**
 * Stamps an explicit `brandKey` on every project, contact and playbook step
 * that lacks one.
 *
 * Projects imported from the original spreadsheet carry only a free-text
 * `brand` column ("Jersey Mikes ", trailing space and all). The app resolves
 * that to a brand at read time, which works -- but it means the checklist a
 * project is measured against depends on a text field someone can edit. Once
 * `brandKey` is set it is authoritative and the label is just a label.
 *
 * Run this once after deploying brand support. It is safe to re-run: projects
 * that already have a brandKey are left alone.
 *
 *   node scripts/backfill-brand-key.js            # dry run
 *   node scripts/backfill-brand-key.js --apply
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');

// Kept in step with src/lib/brands.js. Duplicated rather than imported
// because this script runs under the Admin SDK, outside the Vite bundle.
const BRANDS = [
  { key: 'jerseymikes', aliases: ['jersey mikes', "jersey mike's", 'jm'] },
  { key: 'daves', aliases: ['daves hot chicken', "dave's hot chicken", 'dhc', 'daves'] },
  { key: 'mogu', aliases: ['mogu'] },
];
const DEFAULT_BRAND_KEY = 'jerseymikes';

function resolve(brandText) {
  const text = (brandText || '').trim().toLowerCase();
  if (!text) return { key: DEFAULT_BRAND_KEY, matched: false };
  const hit = BRANDS.find((b) => b.key === text || b.aliases.includes(text));
  return hit ? { key: hit.key, matched: true } : { key: DEFAULT_BRAND_KEY, matched: false };
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
  await stampProjects();
  await stampContacts();
  await stampCollection('timeline', 'Playbook steps');
  process.exit(0);
}

// Generic stamper for the collections whose rows carry no brand of their own:
// everything that pre-dates brands came from the Jersey Mike's workbook.
async function stampCollection(name, label) {
  const snap = await db.collection(name).get();
  const todo = [];
  snap.forEach((doc) => {
    if (!doc.data().brandKey) todo.push(doc.id);
  });

  console.log(`\n${label}: ${snap.size} total, ${snap.size - todo.length} already stamped.`);
  if (!todo.length) return console.log('  Nothing to do.');
  console.log(`  ${todo.length} would be stamped ${DEFAULT_BRAND_KEY}.`);
  if (!APPLY) return console.log('  DRY RUN - nothing written.');

  for (let i = 0; i < todo.length; i += 400) {
    const batch = db.batch();
    todo.slice(i, i + 400).forEach((id) =>
      batch.update(db.collection(name).doc(id), { brandKey: DEFAULT_BRAND_KEY })
    );
    await batch.commit();
  }
  console.log(`  Stamped ${todo.length}.`);
}

// Contacts have no brand column of their own -- the ones that pre-date brands
// all came from the Jersey Mike's workbook, so they are stamped as such.
async function stampContacts() {
  const snap = await db.collection('contacts').get();
  const todo = [];
  snap.forEach((doc) => {
    if (!doc.data().brandKey) todo.push(doc.id);
  });

  console.log(`\nContacts: ${snap.size} total, ${snap.size - todo.length} already stamped.`);
  if (!todo.length) return console.log('  Nothing to do.');
  console.log(`  ${todo.length} would be stamped ${DEFAULT_BRAND_KEY}.`);

  if (!APPLY) return console.log('  DRY RUN - nothing written.');

  for (let i = 0; i < todo.length; i += 400) {
    const batch = db.batch();
    todo.slice(i, i + 400).forEach((id) =>
      batch.update(db.collection('contacts').doc(id), { brandKey: DEFAULT_BRAND_KEY })
    );
    await batch.commit();
  }
  console.log(`  Stamped ${todo.length} contact(s).`);
}

async function stampProjects() {
  const snap = await db.collection('projects').get();
  const todo = [];
  let already = 0;

  snap.forEach((doc) => {
    const d = doc.data();
    if (d.brandKey) return already++;
    const { key, matched } = resolve(d.brand);
    todo.push({ id: doc.id, name: d.name || '(unnamed)', brand: d.brand || '(blank)', key, matched });
  });

  console.log(`Scanned ${snap.size} projects. ${already} already have a brandKey.\n`);

  if (!todo.length) {
    console.log('Nothing to do.');
    return;
  }

  const guessed = todo.filter((t) => !t.matched);
  todo.forEach((t) =>
    console.log(`  ${t.key.padEnd(12)} ${t.matched ? '  ' : '? '} ${t.name}   [brand: "${t.brand}"]`)
  );
  if (guessed.length) {
    console.log(
      `\n? = the brand column did not match any known brand, so it defaults to ` +
        `${DEFAULT_BRAND_KEY} (${guessed.length} project(s)). Check those above before applying.`
    );
  }

  if (!APPLY) {
    console.log(`\nDRY RUN - nothing written. Re-run with --apply to stamp ${todo.length} project(s).`);
    return;
  }

  // Firestore batches cap at 500 writes; well clear of that here, but chunk
  // anyway so this keeps working as the pipeline grows.
  for (let i = 0; i < todo.length; i += 400) {
    const batch = db.batch();
    todo.slice(i, i + 400).forEach((t) =>
      batch.update(db.collection('projects').doc(t.id), { brandKey: t.key })
    );
    await batch.commit();
  }

  console.log(`\nStamped ${todo.length} project(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
