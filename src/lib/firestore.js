import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  deleteField,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { brandKeyFor } from './brands';
import { auth, db } from '../firebase';
import { reportDataError, clearDataError } from './dataErrors';

// Who is signed in, as far as Firestore is concerned.
//
// This exists because every listener below must wait for it. Firebase resolves
// the signed-in user asynchronously, and React runs hooks unconditionally --
// so without this, a listener attaches on the first render, while the user is
// still unknown. The rules see no auth, refuse the read, and the listener's
// dependencies never change again, so it is never retried: the collection
// stays empty for the rest of the session. That is a race, which is why it
// looked intermittent, and why a fresh sign-in lost to it most often.
function useAuthUid() {
  const [uid, setUid] = useState(() => auth.currentUser?.uid ?? null);
  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null)), []);
  return uid;
}

// ---------- generic realtime collection hook ----------
function useCollection(name, orderField) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const uid = useAuthUid();

  useEffect(() => {
    // No user yet, or signed out: hold off rather than being refused. `uid` is
    // in the dependencies, so signing in re-subscribes.
    if (!uid) {
      setData([]);
      return undefined;
    }
    const col = collection(db, name);
    const q = orderField ? query(col, orderBy(orderField)) : col;
    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
        // A listener that recovers should not leave its complaint on screen.
        clearDataError(`loading ${name}`);
      },
      (err) => {
        reportDataError(`loading ${name}`, err);
        setLoading(false);
      }
    );
    return unsub;
  }, [name, orderField, uid]);

  return { data, loading };
}

// Projects are sorted client-side rather than with a Firestore orderBy so a
// document missing `order` still appears (orderBy silently drops those).
// Anything without an order sorts to the end, then alphabetically by name.
export function useProjects() {
  const { data, loading } = useCollection('projects');
  const { data: brandTemplates } = useBrandTemplates();

  // A brand's extra fields are attached here rather than threaded through the
  // app. Progress, ordering, hiding and rendering all read the project, so
  // merging at the source means none of them need to know these fields came
  // from somewhere else -- and none of them can be missed and quietly report a
  // wrong percentage. Kept separate from the project's own `customFields` so a
  // write never persists a brand's fields into a project document.
  const sorted = useMemo(() => {
    const rank = (p) => (typeof p.order === 'number' ? p.order : Number.MAX_SAFE_INTEGER);
    return [...data]
      .map((p) => ({ ...p, brandFields: brandTemplates[brandKeyFor(p)]?.customFields || [] }))
      .sort((a, b) => rank(a) - rank(b) || (a.name || '').localeCompare(b.name || ''));
  }, [data, brandTemplates]);
  return { data: sorted, loading };
}

// Sorted by the order they had in the brand's spreadsheet, so the list reads
// the way the people who maintain it expect. Anything without an order sorts
// to the end -- the same rule projects use.
export function useContacts() {
  const { data, loading } = useCollection('contacts');
  const sorted = useMemo(() => {
    const rank = (c) => (typeof c.order === 'number' ? c.order : Number.MAX_SAFE_INTEGER);
    return [...data].sort(
      (a, b) => rank(a) - rank(b) || (a.category || '').localeCompare(b.category || '')
    );
  }, [data]);
  return { data: sorted, loading };
}

// Ordered by the sequence in the brand's sheet. Sorted client-side rather
// than with a Firestore orderBy because a document missing `order` is silently
// dropped by orderBy -- the same trap projects hit.
export function useTimeline() {
  const { data, loading } = useCollection('timeline');
  const sorted = useMemo(() => {
    const rank = (t) => (typeof t.order === 'number' ? t.order : Number.MAX_SAFE_INTEGER);
    return [...data].sort((a, b) => rank(a) - rank(b));
  }, [data]);
  return { data: sorted, loading };
}

export function useUsers() {
  return useCollection('users');
}

// Everything a brand overlays on its shipped checklist: reworded labels, and
// extra fields every project of that brand should have. One document per
// brand, keyed by brand key.
function useBrandTemplates() {
  const { data, loading } = useCollection('brandTemplates');
  const byBrand = useMemo(() => {
    const out = {};
    data.forEach((d) => {
      out[d.id] = { labels: d.labels || {}, customFields: d.customFields || [] };
    });
    return out;
  }, [data]);
  return { data: byBrand, loading };
}

export function useBrandLabels() {
  const { data, loading } = useBrandTemplates();
  const byBrand = useMemo(() => {
    const out = {};
    Object.entries(data).forEach(([key, v]) => {
      out[key] = v.labels;
    });
    return out;
  }, [data]);
  return { data: byBrand, loading };
}

// Adding a field to every project of a brand. One document is written, not
// forty: the field belongs to the brand, so projects created later get it too,
// and rewording or removing it later is still one decision rather than forty.
// The shape of an added field, in one place. Both entry points below build it
// through this: when they each did their own destructuring, both quietly
// dropped `resp` and the responsible name never reached the page.
export function buildCustomField({ phase, label, type, resp }) {
  return {
    id: `cf_${Math.random().toString(16).slice(2, 10)}`,
    phase,
    label: (label || '').trim() || 'Untitled',
    type: type === 'text' ? 'text' : 'checkbox',
    resp: (resp || '').trim(),
  };
}

export async function addBrandCustomField(brandKey, spec, current, user) {
  const field = buildCustomField(spec);
  await reportingWrite('adding a field', () =>
    setDoc(
      doc(db, 'brandTemplates', brandKey),
      {
        customFields: [...(Array.isArray(current) ? current : []), field],
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || 'unknown',
      },
      { merge: true }
    )
  );
  return field;
}

// Changing an added field in place -- its wording, or who is responsible for
// it. Routed by where the field lives: one added to a project is edited on the
// project, one added to a brand on the brand, so it stays a single definition
// either way rather than forking per project.
export async function updateCustomField(target, fieldId, patch, current, user) {
  const list = (Array.isArray(current) ? current : []).map((f) =>
    f?.id === fieldId ? { ...f, ...patch } : f
  );
  if (target.brandKey) {
    return reportingWrite('saving a field', () =>
      setDoc(
        doc(db, 'brandTemplates', target.brandKey),
        { customFields: list, updatedAt: serverTimestamp(), updatedBy: user?.email || 'unknown' },
        { merge: true }
      )
    );
  }
  return reportingWrite('saving a field', () =>
    updateDoc(doc(db, 'projects', target.projectId), {
      customFields: list,
      updatedAt: serverTimestamp(),
      updatedBy: user?.email || 'unknown',
    })
  );
}

export async function deleteBrandCustomField(brandKey, fieldId, current, user) {
  const next = (Array.isArray(current) ? current : []).filter((f) => f?.id !== fieldId);
  return reportingWrite('deleting a field', () =>
    setDoc(
      doc(db, 'brandTemplates', brandKey),
      { customFields: next, updatedAt: serverTimestamp(), updatedBy: user?.email || 'unknown' },
      { merge: true }
    )
  );
}

// Rewording one checklist item for every project of a brand. Admin-only, in
// the rules as well as the interface. An empty label clears the override and
// the item goes back to what the brand's checklist file says.
export async function setBrandFieldLabel(brandKey, letter, label, user) {
  const text = (label || '').trim();
  return reportingWrite('renaming a checklist item', () =>
    setDoc(
      doc(db, 'brandTemplates', brandKey),
      {
        labels: { [letter]: text || deleteField() },
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || 'unknown',
      },
      { merge: true }
    )
  );
}

// The same, for one project only. Kept on the project document beside
// hiddenFields, since both describe this project's copy of the checklist.
export async function setProjectFieldLabel(projectId, letter, label, currentLabels, user) {
  const text = (label || '').trim();
  const next = { ...(currentLabels || {}) };
  if (text) next[letter] = text;
  else delete next[letter];
  return reportingWrite('renaming a checklist item', () =>
    updateDoc(doc(db, 'projects', projectId), {
      fieldLabels: next,
      updatedAt: serverTimestamp(),
      updatedBy: user?.email || 'unknown',
    })
  );
}

// The list of people allowed in. Keyed by lowercased email, because the
// security rules match the document id against the auth token's email and
// have no lowercase function of their own.
export const inviteId = (email) => (email || '').trim().toLowerCase();

export function useInvites() {
  return useCollection('invites');
}

export async function createInvite({ email, role, name }, user) {
  const id = inviteId(email);
  return setDoc(doc(db, 'invites', id), {
    email: id,
    role,
    name: name || '',
    invitedBy: user?.email || 'unknown',
    invitedAt: serverTimestamp(),
  });
}

export async function deleteInvite(email) {
  return deleteDoc(doc(db, 'invites', inviteId(email)));
}

// Ad-hoc tasks raised against a project, each with someone responsible.
// Separate from the fixed checklist in `fields` and the shared construction
// playbook: those are the same for every project, these are one-offs.
export function useTasks() {
  const { data, loading } = useCollection('tasks');
  const sorted = useMemo(() => {
    const millis = (t) => t.createdAt?.toMillis?.() ?? 0;
    return [...data].sort(
      // Open first, then newest.
      (a, b) => Number(Boolean(a.done)) - Number(Boolean(b.done)) || millis(b) - millis(a)
    );
  }, [data]);
  return { data: sorted, loading };
}

// construction progress: one doc per project, fields keyed by task id
export function useConstructionProgress(projectId) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const uid = useAuthUid();

  useEffect(() => {
    if (!projectId || !uid) {
      setData({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'constructionProgress', projectId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setData(snap.exists() ? snap.data() : {});
        setLoading(false);
        clearDataError('loading construction progress');
      },
      (err) => {
        reportDataError('loading construction progress', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [projectId, uid]);

  return { data, loading };
}

// ---------- activity log ----------
// Every checklist toggle appends a row to `activity`, giving a day-by-day
// history of who completed what. This is written from the client rather than
// a Cloud Function so it works on Firebase's free plan; all edits go through
// this app, so nothing is missed in practice.
//
// A failed log write must never break the edit that triggered it, so errors
// are swallowed deliberately.
async function logActivity(entry) {
  try {
    await addDoc(collection(db, 'activity'), { ...entry, at: serverTimestamp() });
  } catch (err) {
    // Still never blocks the edit that triggered it, but no longer invisible:
    // a log that silently stops recording is worse than one that complains.
    reportDataError('recording activity', err);
  }
}

// Wraps a write so a refusal reaches the screen instead of becoming an
// unhandled rejection. The error is re-thrown, so callers that already show
// their own message (the task and contact dialogs) still do.
async function reportingWrite(what, run) {
  try {
    return await run();
  } catch (err) {
    reportDataError(what, err);
    throw err;
  }
}

// Most recent activity first. Capped because this collection only grows.
export function useActivity(max = 500) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const uid = useAuthUid();

  useEffect(() => {
    if (!uid) {
      setData([]);
      return undefined;
    }
    const q = query(collection(db, 'activity'), orderBy('at', 'desc'), limit(max));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
        clearDataError('loading activity');
      },
      (err) => {
        reportDataError('loading activity', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [max, uid]);

  return { data, loading };
}

// ---------- write helpers ----------
// Every write stamps updatedAt/updatedBy so you can see who touched a
// record last (shown in the UI as a small "last edited by" note).

export async function createProject(project, user) {
  return reportingWrite('creating a project', () =>
    addDoc(collection(db, 'projects'), {
    order: Number.MAX_SAFE_INTEGER,
    ...project,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
      updatedBy: user?.email || 'unknown',
    })
  );
}

// `meta` ({ projectName, label, phase }) is supplied by the caller, which has
// the header definitions. Only checkbox toggles are logged -- logging every
// text edit would bury the checklist history in noise.
export async function updateProjectField(projectId, field, value, user, meta) {
  const ref = doc(db, 'projects', projectId);
  const result = await reportingWrite('saving a checklist item', () =>
    updateDoc(ref, {
      [`fields.${field}`]: value,
      updatedAt: serverTimestamp(),
      updatedBy: user?.email || 'unknown',
    })
  );
  if (typeof value === 'boolean' && meta) {
    await logActivity({
      by: user?.email || 'unknown',
      projectId,
      projectName: meta.projectName || '',
      // Stored so the log still shows the brand after a project is deleted,
      // the same reason the project name is stored rather than looked up.
      brandKey: meta.brandKey || '',
      phase: meta.phase || '',
      item: meta.label || field,
      done: value,
    });
  }
  return result;
}

export async function updateProjectMeta(projectId, patch, user) {
  const ref = doc(db, 'projects', projectId);
  return reportingWrite('saving project details', () =>
    updateDoc(ref, {
      ...patch,
      updatedAt: serverTimestamp(),
      updatedBy: user?.email || 'unknown',
    })
  );
}

// Removing a checklist item from one project, or putting it back. Admin-only,
// enforced by the security rules as well as the interface: it changes what the
// project is measured against, and the template it comes from is shared by
// every project of that brand.
//
// The stored value is left alone rather than deleted. A removal is a judgement
// that an item does not apply here, and judgements get revised -- restoring it
// should bring back what was there, not a blank.
export async function setFieldHidden(projectId, letter, hidden, currentHidden, user) {
  const next = new Set(Array.isArray(currentHidden) ? currentHidden : []);
  if (hidden) next.add(letter);
  else next.delete(letter);
  return reportingWrite(hidden ? 'removing a checklist item' : 'restoring a checklist item', () =>
    updateDoc(doc(db, 'projects', projectId), {
      hiddenFields: [...next],
      updatedAt: serverTimestamp(),
      updatedBy: user?.email || 'unknown',
    })
  );
}

// Adding a checklist item this project needs and its brand's spreadsheet does
// not have. Admin-only, like removing and rewording, because it changes what
// the project is measured against -- a new tick-box is one more thing standing
// between here and 100%.
//
// The id is generated and prefixed so it can never collide with a spreadsheet
// column letter, and the value lives in `fields` beside everything else, so
// ticking and progress need no special case.
export async function addCustomField(projectId, spec, current, user) {
  const field = buildCustomField(spec);
  const next = [...(Array.isArray(current) ? current : []), field];
  await reportingWrite('adding a field', () =>
    updateDoc(doc(db, 'projects', projectId), {
      customFields: next,
      updatedAt: serverTimestamp(),
      updatedBy: user?.email || 'unknown',
    })
  );
  return field;
}

// Deleting an added field, along with whatever was entered in it. Unlike a
// spreadsheet item -- which is only ever hidden, because it belongs to the
// brand -- this one exists nowhere else, so removing it really does remove it.
export async function deleteCustomField(projectId, fieldId, current, user) {
  const next = (Array.isArray(current) ? current : []).filter((f) => f?.id !== fieldId);
  return reportingWrite('deleting a field', () =>
    updateDoc(doc(db, 'projects', projectId), {
      customFields: next,
      [`fields.${fieldId}`]: deleteField(),
      updatedAt: serverTimestamp(),
      updatedBy: user?.email || 'unknown',
    })
  );
}

// The order fields appear in, for one phase of one project. Layout is a local
// preference -- how this location's page reads -- so it is not shared with the
// brand the way wording is.
export async function setFieldOrder(projectId, phase, keys, user) {
  return reportingWrite('reordering fields', () =>
    updateDoc(doc(db, 'projects', projectId), {
      [`fieldOrder.${phase}`]: keys,
      updatedAt: serverTimestamp(),
      updatedBy: user?.email || 'unknown',
    })
  );
}

export async function deleteProject(projectId) {
  await reportingWrite('deleting a project', () => deleteDoc(doc(db, 'projects', projectId)));
  await deleteDoc(doc(db, 'constructionProgress', projectId)).catch(() => {});
}

export async function createContact(contact) {
  return reportingWrite('adding a contact', () => addDoc(collection(db, 'contacts'), contact));
}

export async function updateContact(contactId, patch) {
  return reportingWrite('saving a contact', () =>
    updateDoc(doc(db, 'contacts', contactId), patch)
  );
}

export async function deleteContact(contactId) {
  return reportingWrite('deleting a contact', () => deleteDoc(doc(db, 'contacts', contactId)));
}

export async function createTimelineTask(task) {
  return reportingWrite('adding a playbook step', () => addDoc(collection(db, 'timeline'), task));
}

export async function updateTimelineTask(taskId, patch) {
  return reportingWrite('saving a playbook step', () =>
    updateDoc(doc(db, 'timeline', taskId), patch)
  );
}

export async function deleteTimelineTask(taskId) {
  return reportingWrite('deleting a playbook step', () =>
    deleteDoc(doc(db, 'timeline', taskId))
  );
}

export async function setConstructionCheck(projectId, taskId, checked, user, meta) {
  const ref = doc(db, 'constructionProgress', projectId);
  const result = await reportingWrite('saving a playbook step', () =>
    setDoc(
      ref,
      { [taskId]: checked, updatedAt: serverTimestamp(), updatedBy: user?.email || 'unknown' },
      { merge: true }
    )
  );
  if (meta) {
    await logActivity({
      by: user?.email || 'unknown',
      projectId,
      projectName: meta.projectName || '',
      brandKey: meta.brandKey || '',
      phase: meta.week || 'Construction Playbook',
      item: meta.item || taskId,
      done: checked,
    });
  }
  return result;
}

export async function createTask(task, user) {
  return reportingWrite('creating a task', () =>
    addDoc(collection(db, 'tasks'), {
    title: '',
    projectId: '',
    projectName: '',
    // The project's brand, so completing a task can be attributed to a brand
    // in the activity log without looking the project up.
    brandKey: '',
    // Which stage the task sits under, or '' for one that belongs to the
    // project as a whole. Matches a value in PHASES.
    phase: '',
    assigneeEmail: '',
    assigneeName: '',
    due: '',
    notes: '',
    ...task,
      done: false,
      createdAt: serverTimestamp(),
      createdBy: user?.email || 'unknown',
    })
  );
}

export async function updateTask(taskId, patch, user) {
  return reportingWrite('saving a task', () =>
    updateDoc(doc(db, 'tasks', taskId), {
      ...patch,
      updatedAt: serverTimestamp(),
      updatedBy: user?.email || 'unknown',
    })
  );
}

// Completing a task is real progress, so it belongs in the activity log and
// the daily digest alongside checklist items.
export async function setTaskDone(task, done, user) {
  const result = await updateTask(
    task.id,
    { done, completedAt: done ? serverTimestamp() : null, completedBy: done ? user?.email || 'unknown' : '' },
    user
  );
  await logActivity({
    by: user?.email || 'unknown',
    projectId: task.projectId || '',
    projectName: task.projectName || '',
    brandKey: task.brandKey || '',
    phase: 'Task',
    item: task.title || 'Task',
    done,
  });
  return result;
}

export async function deleteTask(taskId) {
  return reportingWrite('deleting a task', () => deleteDoc(doc(db, 'tasks', taskId)));
}

export async function setUserRole(uid, role) {
  return reportingWrite('changing a role', () => updateDoc(doc(db, 'users', uid), { role }));
}
