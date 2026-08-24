import { useEffect, useState } from 'react';
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

export function useProjects() {
  return useCollection('projects');
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

// ---------- write helpers ----------
// Every write stamps updatedAt/updatedBy so you can see who touched a
// record last (shown in the UI as a small "last edited by" note).

export async function createProject(project, user) {
  return addDoc(collection(db, 'projects'), {
    ...project,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: user?.email || 'unknown',
  });
}

export async function updateProjectField(projectId, field, value, user) {
  const ref = doc(db, 'projects', projectId);
  return updateDoc(ref, {
    [`fields.${field}`]: value,
    updatedAt: serverTimestamp(),
    updatedBy: user?.email || 'unknown',
  });
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

export async function setConstructionCheck(projectId, taskId, checked, user) {
  const ref = doc(db, 'constructionProgress', projectId);
  return setDoc(
    ref,
    { [taskId]: checked, updatedAt: serverTimestamp(), updatedBy: user?.email || 'unknown' },
    { merge: true }
  );
}

export async function setUserRole(uid, role) {
  return updateDoc(doc(db, 'users', uid), { role });
}
