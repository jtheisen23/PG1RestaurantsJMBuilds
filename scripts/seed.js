/**
 * One-time script to load the original spreadsheet data (43 projects,
 * 12 contacts, 35 construction-playbook tasks) into a fresh Firestore
 * database.
 *
 * Setup:
 *   1. In the Firebase console: Project settings > Service accounts >
 *      "Generate new private key". Save the downloaded file as
 *      scripts/serviceAccountKey.json (this file is gitignored — never
 *      commit it).
 *   2. npm install firebase-admin --save-dev
 *   3. node scripts/seed.js
 *
 * Safe to run once. Running it again will create duplicate documents,
 * since it always adds new docs rather than checking for existing ones.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const projects = JSON.parse(readFileSync(path.join(__dirname, 'seed-projects.json'), 'utf8'));
const contacts = JSON.parse(readFileSync(path.join(__dirname, 'seed-contacts.json'), 'utf8'));
const timeline = JSON.parse(readFileSync(path.join(__dirname, 'seed-timeline.json'), 'utf8'));

async function seedProjects() {
  const batchSize = 400;
  for (let i = 0; i < projects.length; i += batchSize) {
    const batch = db.batch();
    projects.slice(i, i + batchSize).forEach((p) => {
      const ref = db.collection('projects').doc();
      batch.set(ref, {
        brand: p.brand || '',
        name: p.name || '',
        fields: p.fields || {},
        createdAt: new Date(),
        updatedAt: new Date(),
        updatedBy: 'seed-script',
      });
    });
    await batch.commit();
  }
  console.log(`Seeded ${projects.length} projects.`);
}

async function seedContacts() {
  const batch = db.batch();
  contacts.forEach((c) => {
    const ref = db.collection('contacts').doc();
    batch.set(ref, {
      category: c.category || '',
      company: c.company || '',
      contact_name: c.contact_name || '',
      contact: c.contact || '',
      notes: c.notes || '',
    });
  });
  await batch.commit();
  console.log(`Seeded ${contacts.length} contacts.`);
}

async function seedTimeline() {
  const batch = db.batch();
  timeline.forEach((t, i) => {
    const ref = db.collection('timeline').doc();
    batch.set(ref, {
      week: t.week || '',
      detail: t.detail || '',
      who: t.who || '',
      duration: t.duration || '',
      inspection: t.inspection || '',
      note: t.note || '',
      order: i,
    });
  });
  await batch.commit();
  console.log(`Seeded ${timeline.length} construction playbook tasks.`);
}

async function main() {
  await seedProjects();
  await seedContacts();
  await seedTimeline();
  console.log('\nDone. Your Firestore database now has the starting data.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
