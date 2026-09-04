import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase';

// ---------- generic realtime collection hook ----------
function useCollection(name, orderField) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const col = collection(db, name);
    const q = orderField ? query(col, orderBy(orderField)) : col;
    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error(`Failed to load ${name}:`, err);
        setLoading(false);
      }
    );
    return unsub;
  }, [name, orderField]);

  return { data, loading };
}

// Projects are sorted client-side rather than with a Firestore orderBy so a
// document missing `order` still appears (orderBy silently drops those).
// Anything without an order sorts to the end, then alphabetically by name.
export function useProjects() {
  const { data, loading } = useCollection('projects');
  const sorted = useMemo(() => {
    const rank = (p) => (typeof p.order === 'number' ? p.order : Number.MAX_SAFE_INTEGER);
    return [...data].sort(
      (a, b) => rank(a) - rank(b) || (a.name || '').localeCompare(b.name || '')
    );
  }, [data]);
  return { data: sorted, loading };
}

export function useContacts() {
  return useCollection('contacts');
}

export function useTimeline() {
  return useCollection('timeline', 'order');
}

export function useUsers() {
  return useCollection('users');
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

  useEffect(() => {
    if (!projectId) {
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
      },
      () => setLoading(false)
    );
    return unsub;
  }, [projectId]);

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
    console.error('Activity log write failed (the edit itself was saved):', err);
  }
}

// Most recent activity first. Capped because this collection only grows.
export function useActivity(max = 500) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'activity'), orderBy('at', 'desc'), limit(max));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('Failed to load activity:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [max]);

  return { data, loading };
}

// ---------- write helpers ----------
// Every write stamps updatedAt/updatedBy so you can see who touched a
// record last (shown in the UI as a small "last edited by" note).

export async function createProject(project, user) {
  return addDoc(collection(db, 'projects'), {
    order: Number.MAX_SAFE_INTEGER,
    ...project,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: user?.email || 'unknown',
  });
}

// `meta` ({ projectName, label, phase }) is supplied by the caller, which has
// the header definitions. Only checkbox toggles are logged -- logging every
// text edit would bury the checklist history in noise.
export async function updateProjectField(projectId, field, value, user, meta) {
  const ref = doc(db, 'projects', projectId);
  const result = await updateDoc(ref, {
    [`fields.${field}`]: value,
    updatedAt: serverTimestamp(),
    updatedBy: user?.email || 'unknown',
  });
  if (typeof value === 'boolean' && meta) {
    await logActivity({
      by: user?.email || 'unknown',
      projectId,
      projectName: meta.projectName || '',
      phase: meta.phase || '',
      item: meta.label || field,
      done: value,
    });
  }
  return result;
}

export async function updateProjectMeta(projectId, patch, user) {
  const ref = doc(db, 'projects', projectId);
  return updateDoc(ref, {
    ...patch,
    updatedAt: serverTimestamp(),
    updatedBy: user?.email || 'unknown',
  });
}

export async function deleteProject(projectId) {
  await deleteDoc(doc(db, 'projects', projectId));
  await deleteDoc(doc(db, 'constructionProgress', projectId)).catch(() => {});
}

export async function createContact(contact) {
  return addDoc(collection(db, 'contacts'), contact);
}

export async function updateContact(contactId, patch) {
  return updateDoc(doc(db, 'contacts', contactId), patch);
}

export async function deleteContact(contactId) {
  return deleteDoc(doc(db, 'contacts', contactId));
}

export async function createTimelineTask(task) {
  return addDoc(collection(db, 'timeline'), task);
}

export async function updateTimelineTask(taskId, patch) {
  return updateDoc(doc(db, 'timeline', taskId), patch);
}

export async function deleteTimelineTask(taskId) {
  return deleteDoc(doc(db, 'timeline', taskId));
}

export async function setConstructionCheck(projectId, taskId, checked, user, meta) {
  const ref = doc(db, 'constructionProgress', projectId);
  const result = await setDoc(
    ref,
    { [taskId]: checked, updatedAt: serverTimestamp(), updatedBy: user?.email || 'unknown' },
    { merge: true }
  );
  if (meta) {
    await logActivity({
      by: user?.email || 'unknown',
      projectId,
      projectName: meta.projectName || '',
      phase: meta.week || 'Construction Playbook',
      item: meta.item || taskId,
      done: checked,
    });
  }
  return result;
}

export async function createTask(task, user) {
  return addDoc(collection(db, 'tasks'), {
    title: '',
    projectId: '',
    projectName: '',
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
  });
}

export async function updateTask(taskId, patch, user) {
  return updateDoc(doc(db, 'tasks', taskId), {
    ...patch,
    updatedAt: serverTimestamp(),
    updatedBy: user?.email || 'unknown',
  });
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
    phase: 'Task',
    item: task.title || 'Task',
    done,
  });
  return result;
}

export async function deleteTask(taskId) {
  return deleteDoc(doc(db, 'tasks', taskId));
}

export async function setUserRole(uid, role) {
  return updateDoc(doc(db, 'users', uid), { role });
}
