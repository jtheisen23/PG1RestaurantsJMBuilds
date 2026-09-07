/**
 * Imports a brand's contacts from a converted spreadsheet into Firestore.
 *
 * The companion to import-brand-projects.js, and just as careful: contacts are
 * a live, hand-edited list, so this refuses to re-create a row that is already
 * there rather than quietly doubling the vendor list.
 *
 * A row counts as already present when the same brand already has a contact
 * with the same company/category, contact name and contact details. Editing a
 * row in the dashboard therefore makes it look new -- so read the dry run
 * before applying, rather than assuming a second run is a no-op.
 *
 * Usage:
 *   node scripts/import-brand-contacts.js scripts/seed-daves-contacts.json
 *   node scripts/import-brand-contacts.js scripts/seed-daves-contacts.json --apply
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
  console.error('\nUsage: node scripts/import-brand-contacts.js <contacts.json> [--apply]\n');
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
const identity = (c) =>
  [c.brandKey || '', norm(c.category), norm(c.contact_name), norm(c.contact)].join('|');

async function main() {
  const snap = await db.collection('contacts').get();

  let maxOrder = -1;
  const existing = new Set();
  snap.forEach((doc) => {
    const d = doc.data();
    if (typeof d.order === 'number' && d.order > maxOrder) maxOrder = d.order;
    // Contacts with no brandKey pre-date brands and are Jersey Mike's, which
    // is the same rule the app applies when it reads them.
    existing.add(identity({ ...d, brandKey: d.brandKey || 'jerseymikes' }));
  });

  const fresh = incoming.filter((c) => !existing.has(identity(c)));
  const skipped = incoming.length - fresh.length;

  console.log(`Database holds ${snap.size} contacts. Highest order in use: ${maxOrder}.\n`);
  if (skipped) console.log(`Already present, will NOT be re-created: ${skipped}\n`);

  if (!fresh.length) {
    console.log('Nothing new to import.');
    process.exit(0);
  }

  console.log(`To import (${fresh.length}):`);
  fresh.forEach((c) =>
    console.log(
      `   ${(c.category || '(no company)').slice(0, 26).padEnd(28)} ` +
        `${(c.contact_name || '').slice(0, 24).padEnd(26)} ${(c.contact || '').slice(0, 32)}`
    )
  );

  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply to import these.');
    process.exit(0);
  }

  const batch = db.batch();
  fresh.forEach((c, i) => {
    batch.set(db.collection('contacts').doc(), {
      category: c.category || '',
      company: c.company || '',
      contact_name: c.contact_name || '',
      contact: c.contact || '',
      notes: c.notes || '',
      brandKey: c.brandKey || '',
      order: maxOrder + 1 + i,
    });
  });
  await batch.commit();

  console.log(`\nImported ${fresh.length} contact(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
