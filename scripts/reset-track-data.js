/**
 * Clears one track's checklists back to empty, keeping the project name and
 * address.
 *
 * For replacing a checklist outright rather than revising it. The old items
 * are going away, so the values stored against their keys are not worth
 * carrying: at best they are orphaned, and at worst a key reissued to a
 * different item in the new list shows up as a tick against something nobody
 * has done.
 *
 * What it writes per project: `fields` reduced to the kept letters, and
 * hiddenFields, fieldLabels, customFields and fieldOrder emptied. The project
 * name is never in a payload, so it cannot be lost.
 *
 * Run this BEFORE deploying the new checklist. The other order leaves a
 * window where old ticks are displayed against new items; this one leaves a
 * window where the projects simply look empty, which they are about to be.
 *
 * Usage:
 *   node scripts/reset-track-data.js --brand jmacquisitions
 *   node scripts/reset-track-data.js --brand jmacquisitions --apply
 *   node scripts/reset-track-data.js --brand jmacquisitions --keep B,C,D
 *
 * Dry run by default. Read it before applying. This discards data on
 * purpose and there is no undo.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { planReset } = require('./lib/reset-plan.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

function valueOf(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const BRAND = valueOf('--brand', '');
const KEEP = valueOf('--keep', 'B,C')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const KNOWN = ['jerseymikes', 'jmacquisitions', 'daves', 'mogu', 'doghaus'];
if (!BRAND || !KNOWN.includes(BRAND)) {
  console.error(
    `\nUsage: node scripts/reset-track-data.js --brand <${KNOWN.join('|')}> [--apply]\n` +
      '\nNothing was cleared: a brand must be named, exactly. There is no default,\n' +
      'because the default would be somebody\'s whole pipeline.\n'
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

  const plan = planReset({ projects, brandKey: BRAND, keepLetters: KEEP });

  console.log(`\nTrack: ${BRAND}   |   keeping ${KEEP.join(', ')} on each project\n`);

  if (plan.skipped.length) {
    console.log(`Already clear, nothing to write (${plan.skipped.length}):`);
    plan.skipped.forEach((p) => console.log(`   ${p.name}`));
    console.log();
  }

  if (!plan.targets.length) {
    console.log('Nothing to clear.\n');
    process.exit(0);
  }

  const totalTicks = plan.targets.reduce((n, t) => n + t.ticked, 0);
  const totalValues = plan.targets.reduce((n, t) => n + t.droppedCount, 0);

  console.log(`To clear (${plan.targets.length}):`);
  plan.targets.forEach((t) =>
    console.log(
      `   ${(t.name || '(unnamed)').padEnd(32)} discards ${String(t.droppedCount).padStart(4)} value(s), ` +
        `${String(t.ticked).padStart(4)} of them ticked   keeps [${t.keptLetters.join(', ') || 'nothing'}]`
    )
  );
  console.log(
    `\n${totalValues} stored value(s) discarded in total, ${totalTicks} of them ticked boxes.`
  );
  console.log('Project names are not written by this script, so they cannot be lost.');

  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply.\n');
    process.exit(0);
  }

  for (let i = 0; i < plan.targets.length; i += 400) {
    const batch = db.batch();
    plan.targets.slice(i, i + 400).forEach((t) =>
      batch.update(db.collection('projects').doc(t.id), {
        ...t.update,
        updatedAt: new Date(),
        updatedBy: 'reset-track-data',
      })
    );
    await batch.commit();
  }

  console.log(`\nCleared ${plan.targets.length} project(s). This cannot be undone.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
