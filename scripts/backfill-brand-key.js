/**
 * Stamps an explicit `brandKey` on every project that lacks one.
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
    process.exit(0);
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
    process.exit(0);
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
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
