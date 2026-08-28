/**
 * Deletes the leftover spreadsheet section-header rows that the seed script
 * imported as if they were projects.
 *
 * The original spreadsheet used divider rows ("Acquisition", "Completed
 * Stores") to separate groups of locations. seed.js treated every row as a
 * project, so those two became documents with no name and a single field
 * holding the section label. They show in the project list as "Unnamed
 * Location", which invites people to open them and tick checkboxes.
 *
 * Deliberately conservative: a document is only ever a candidate if it has no
 * name AND at most one populated field. Anything with real data is left
 * alone, whatever it is called.
 *
 * That safety rule has one awkward consequence. Because these rows look like
 * ordinary projects in the list, someone may already have ticked checkboxes
 * on one -- which gives it "data" and makes the script spare it. Such rows are
 * listed but not deleted; --force-unnamed removes every project with no name
 * regardless of what has been ticked on it. Read the dry run before using it.
 *
 * Usage:
 *   node scripts/remove-placeholder-projects.js                    # dry run
 *   node scripts/remove-placeholder-projects.js --apply            # delete
 *   node scripts/remove-placeholder-projects.js --apply --force-unnamed
 *   node scripts/remove-placeholder-projects.js --apply --purge-activity
 *
 * By default any activity-log entries pointing at a deleted project are kept,
 * with the project's name stamped onto them so the history stays readable —
 * that is what the stored name snapshot is for. Pass --purge-activity to
 * remove those entries instead. Note this is the only way to remove activity
 * entries at all: the security rules deny deletes, and only the service
 * account can bypass them.
 *
 * Deletion is permanent. There is no undo.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const PURGE_ACTIVITY = process.argv.includes('--purge-activity');
const FORCE_UNNAMED = process.argv.includes('--force-unnamed');

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

const populatedFieldCount = (fields = {}) =>
  Object.values(fields).filter((v) => v !== null && v !== undefined && v !== '' && v !== false)
    .length;

async function main() {
  const snap = await db.collection('projects').get();
  console.log(`Scanning ${snap.size} projects.\n`);

  const candidates = [];
  const spared = [];

  snap.forEach((doc) => {
    const d = doc.data();
    const named = Boolean((d.name || '').trim());
    const count = populatedFieldCount(d.fields);
    if (!named && (count <= 1 || FORCE_UNNAMED)) {
      candidates.push({ id: doc.id, brand: d.brand, count });
    } else if (!named) {
      spared.push({ id: doc.id, brand: d.brand, count });
    }
  });

  if (spared.length) {
    console.log('Unnamed, but has data - LEFT ALONE:');
    spared.forEach((c) =>
      console.log(`   [${c.brand || 'no brand'}]  ${c.count} populated fields   id=${c.id}`)
    );
    console.log(
      '\nThese are unnamed, so they are probably placeholders that someone has\n' +
        'since ticked boxes on. Check the brand above: if it is a section heading\n' +
        'rather than a location, re-run with --force-unnamed to remove them too.\n'
    );
  }

  if (!candidates.length) {
    console.log('Nothing to remove. (Already cleaned up, or nothing matched.)');
    process.exit(0);
  }

  console.log(`Placeholder rows to delete (${candidates.length}):`);
  candidates.forEach((c) =>
    console.log(`   [${c.brand || 'no brand'}]  no name, ${c.count} populated field(s)   id=${c.id}`)
  );

  // Anything else pointing at these documents.
  const ids = new Set(candidates.map((c) => c.id));
  const activitySnap = await db.collection('activity').get();
  const orphaned = activitySnap.docs.filter((d) => ids.has(d.data().projectId));

  const progressDocs = [];
  for (const c of candidates) {
    const ref = db.collection('constructionProgress').doc(c.id);
    if ((await ref.get()).exists) progressDocs.push(ref);
  }

  console.log(`\nConstruction progress documents to delete: ${progressDocs.length}`);
  console.log(
    `Activity entries referencing them: ${orphaned.length}` +
      (orphaned.length
        ? PURGE_ACTIVITY
          ? '  -> will be DELETED (--purge-activity)'
          : '  -> will be KEPT, with the project name stamped on'
        : '')
  );
  orphaned.forEach((d) => {
    const e = d.data();
    console.log(`     "${e.item}" by ${e.by}`);
  });

  if (!APPLY) {
    console.log('\nDRY RUN - nothing deleted. Re-run with --apply to remove these.');
    process.exit(0);
  }

  const brandById = new Map(candidates.map((c) => [c.id, c.brand || 'Removed project']));
  const batch = db.batch();

  orphaned.forEach((d) => {
    if (PURGE_ACTIVITY) batch.delete(d.ref);
    else if (!d.data().projectName) {
      // Keep the history readable once the project it points at is gone.
      batch.update(d.ref, { projectName: brandById.get(d.data().projectId) });
    }
  });
  progressDocs.forEach((ref) => batch.delete(ref));
  candidates.forEach((c) => batch.delete(db.collection('projects').doc(c.id)));

  await batch.commit();

  console.log(`\nDeleted ${candidates.length} placeholder project(s).`);
  console.log(`Deleted ${progressDocs.length} construction progress document(s).`);
  console.log(
    PURGE_ACTIVITY
      ? `Deleted ${orphaned.length} activity entr${orphaned.length === 1 ? 'y' : 'ies'}.`
      : `Kept ${orphaned.length} activity entr${orphaned.length === 1 ? 'y' : 'ies'}, name stamped on.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
