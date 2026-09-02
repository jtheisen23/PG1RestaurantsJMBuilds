/**
 * Security-rules regression tests, run against the Firestore emulator.
 *
 * These cover the boundary that decides whether the dashboard's data is
 * private: signing in is NOT the same as belonging here, because anyone can
 * create an account with the public web API key. Membership means having a
 * users/{uid} document, and that can only be created against an invite.
 *
 * One-time setup (kept out of package.json: firebase-tools pulls a ~140MB
 * emulator jar, which is not worth imposing on every npm install):
 *
 *   npm install --no-save firebase-tools @firebase/rules-unit-testing
 *
 * Then:
 *
 *   npm run test:rules
 *
 * Requires Java, which the Firestore emulator runs on.
 */
const { initializeTestEnvironment, assertFails, assertSucceeds } =
  require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, deleteDoc } = require('firebase/firestore');
const fs = require('fs');

let pass = 0, fail = 0;
const check = async (label, promise) => {
  try { await promise; console.log('  PASS  ' + label); pass++; }
  catch (e) { console.log('  FAIL  ' + label + '  -> ' + (e.message || e).slice(0, 120)); fail++; }
};

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'rules-test',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });

  // Seed: one admin, one ordinary member, one invite, and some data.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/admin1'), { email: 'admin@x.com', role: 'admin', name: 'Admin' });
    await setDoc(doc(db, 'users/editor1'), { email: 'editor@x.com', role: 'editor', name: 'Ed' });
    await setDoc(doc(db, 'invites/invited@x.com'), { email: 'invited@x.com', role: 'editor' });
    await setDoc(doc(db, 'projects/p1'), { name: 'Lexington Park', fields: {} });
    await setDoc(doc(db, 'tasks/t1'), { title: 'Chase landlord', projectId: 'p1' });
    await setDoc(doc(db, 'activity/a1'), { by: 'editor@x.com', item: 'LOI Sent', done: true });
  });

  const admin   = env.authenticatedContext('admin1',   { email: 'admin@x.com'   }).firestore();
  const editor  = env.authenticatedContext('editor1',  { email: 'editor@x.com'  }).firestore();
  const invited = env.authenticatedContext('newuid',   { email: 'invited@x.com' }).firestore();
  const stranger= env.authenticatedContext('attacker', { email: 'attacker@evil.com' }).firestore();
  const anon    = env.unauthenticatedContext().firestore();

  console.log('\n--- THE HOLE THIS CLOSES: a self-signed-up stranger ---');
  await check('stranger cannot read projects',      assertFails(getDoc(doc(stranger, 'projects/p1'))));
  await check('stranger cannot read contacts',      assertFails(getDoc(doc(stranger, 'contacts/c1'))));
  await check('stranger cannot read tasks',         assertFails(getDoc(doc(stranger, 'tasks/t1'))));
  await check('stranger cannot read activity',      assertFails(getDoc(doc(stranger, 'activity/a1'))));
  await check('stranger cannot read the team list', assertFails(getDoc(doc(stranger, 'users/admin1'))));
  await check('stranger cannot self-provision',
    assertFails(setDoc(doc(stranger, 'users/attacker'), { email: 'attacker@evil.com', role: 'viewer' })));
  await check('stranger cannot self-provision as admin',
    assertFails(setDoc(doc(stranger, 'users/attacker'), { email: 'attacker@evil.com', role: 'admin' })));
  await check('stranger cannot read someone else\'s invite',
    assertFails(getDoc(doc(stranger, 'invites/invited@x.com'))));
  await check('stranger cannot invite themselves',
    assertFails(setDoc(doc(stranger, 'invites/attacker@evil.com'), { email: 'attacker@evil.com', role: 'admin' })));

  console.log('\n--- ANONYMOUS ---');
  await check('anonymous cannot read projects', assertFails(getDoc(doc(anon, 'projects/p1'))));

  console.log('\n--- AN INVITED PERSON PROVISIONING THEMSELVES ---');
  await check('can read their own invite',  assertSucceeds(getDoc(doc(invited, 'invites/invited@x.com'))));
  await check('cannot claim a higher role than invited',
    assertFails(setDoc(doc(invited, 'users/newuid'), { email: 'invited@x.com', role: 'admin' })));
  await check('cannot provision under someone else\'s uid',
    assertFails(setDoc(doc(invited, 'users/editor1'), { email: 'invited@x.com', role: 'editor' })));
  await check('CAN provision with the invited role',
    assertSucceeds(setDoc(doc(invited, 'users/newuid'), { email: 'invited@x.com', role: 'editor' })));

  console.log('\n--- EXISTING MEMBERS KEEP WORKING ---');
  await check('editor reads projects',        assertSucceeds(getDoc(doc(editor, 'projects/p1'))));
  await check('editor reads tasks',           assertSucceeds(getDoc(doc(editor, 'tasks/t1'))));
  await check('editor reads activity',        assertSucceeds(getDoc(doc(editor, 'activity/a1'))));
  await check('editor reads the team list',   assertSucceeds(getDoc(doc(editor, 'users/admin1'))));
  await check('editor updates a project',     assertSucceeds(setDoc(doc(editor, 'projects/p1'), { name: 'Lexington Park', fields: {} })));
  await check('editor cannot invite anyone',
    assertFails(setDoc(doc(editor, 'invites/friend@x.com'), { email: 'friend@x.com', role: 'admin' })));
  await check('editor cannot change roles',
    assertFails(setDoc(doc(editor, 'users/editor1'), { email: 'editor@x.com', role: 'admin' })));

  console.log('\n--- ADMIN ---');
  await check('admin invites someone',
    assertSucceeds(setDoc(doc(admin, 'invites/newhire@x.com'), { email: 'newhire@x.com', role: 'viewer' })));
  await check('admin withdraws an invite',
    assertSucceeds(deleteDoc(doc(admin, 'invites/newhire@x.com'))));
  await check('admin changes a role',
    assertSucceeds(setDoc(doc(admin, 'users/editor1'), { email: 'editor@x.com', role: 'viewer' })));

  console.log(`\n${pass} passed, ${fail} failed`);
  await env.cleanup();
  process.exit(fail ? 1 : 0);
})();
