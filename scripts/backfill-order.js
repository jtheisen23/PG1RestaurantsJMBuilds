/**
 * Syncs two pieces of list metadata onto every projects/{id} document:
 *   - `order`     position from scripts/project-order.json
 *   - `completed` true for names in scripts/completed-stores.json
 *
 * The dashboard lists projects by `order` and files completed ones into their
 * own section, so both need to be set on the documents themselves.
 *
 * The seed script dropped the spreadsheet's row number, so Firestore had no
 * ordering to work from. This assigns each project its position from
 * scripts/project-order.json.
 *
 * Matching is by name, case- and whitespace-insensitive. Documents whose name
 * isn't in that file (added in the app since seeding, renamed, or the two
 * leftover spreadsheet section-header rows) are appended after the listed ones,
 * oldest first, so nothing disappears.
 *
 * Usage:
 *   node scripts/backfill-order.js            # dry run - prints the plan only
 *   node scripts/backfill-order.js --apply    # actually writes
 *
 * Safe to re-run: it writes absolute positions rather than shifting anything.
 * To change the order later, edit scripts/project-order.json and re-run.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');

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

const desired = JSON.parse(readFileSync(path.join(__dirname, 'project-order.json'), 'utf8'));
const completedNames = JSON.parse(readFileSync(path.join(__dirname, 'completed-stores.json'), 'utf8'));
const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

const position = new Map();
desired.forEach((name, i) => position.set(norm(name), i));
const completedSet = new Set(completedNames.map(norm));

async function main() {
  const snap = await db.collection('projects').get();
  console.log(`Firestore has ${snap.size} project documents.`);
  console.log(`project-order.json lists ${desired.length} names.\n`);

  const listed = [];
  const extra = [];

  snap.forEach((doc) => {
    const d = doc.data();
    const pos = position.get(norm(d.name));
    const entry = {
      id: doc.id,
      brand: d.brand,
      name: d.name,
      current: d.order,
      currentCompleted: d.completed === true,
      completed: completedSet.has(norm(d.name)),
      createdAt: d.createdAt,
    };
    if (pos === undefined) extra.push(entry);
    else listed.push({ ...entry, order: pos });
  });

  const seen = new Set(listed.map((e) => norm(e.name)));
  const notFound = desired.filter((n) => !seen.has(norm(n)));
  if (notFound.length) {
    console.log('WARNING - listed in project-order.json but no matching document:');
    notFound.forEach((n) => console.log(`   - "${n}"`));
    console.log('');
  }

  // Anything unlisted goes after every listed project, oldest first for stability.
  extra.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
  extra.forEach((e, i) => {
    e.order = desired.length + i;
  });

  if (extra.length) {
    console.log(`Not listed, appended at the end (${extra.length}):`);
    extra.forEach((e) => console.log(`   ${e.order}  ${e.brand || ''} ${e.name || '(no name)'}`.trimEnd()));
    console.log('');
  }

  const all = [...listed, ...extra].sort((a, b) => a.order - b.order);
  const changing = all.filter((e) => e.current !== e.order || e.currentCompleted !== e.completed);
  console.log(`Documents changing: ${changing.length} of ${all.length}`);
  console.log(`Marked completed: ${all.filter((e) => e.completed).length}\n`);

  console.log('Resulting order:');
  all.forEach((e) =>
    console.log(
      `  ${String(e.order).padStart(2)}  ${e.name || '(no name)'}${e.name ? '' : ` [${e.brand}]`}${e.completed ? '   <- completed' : ''}`
    )
  );

  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply to save.');
    process.exit(0);
  }

  const batchSize = 400;
  for (let i = 0; i < all.length; i += batchSize) {
    const batch = db.batch();
    all.slice(i, i + batchSize).forEach((e) => {
      batch.update(db.collection('projects').doc(e.id), { order: e.order, completed: e.completed });
    });
    await batch.commit();
  }
  console.log(`\nWrote order and completed status to ${all.length} documents.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
