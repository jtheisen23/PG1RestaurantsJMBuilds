import { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthContext = createContext(null);

// Roles, from least to most access:
//   viewer  - can read everything, cannot edit
//   editor  - can read and edit projects, contacts, and construction progress
//   admin   - editor + can manage user roles and delete records
export const ROLES = ['viewer', 'editor', 'admin'];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [profile, setProfile] = useState(null); // { role, name, email }
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(
      ref,
      async (snap) => {
        if (snap.exists()) {
          setProfile(snap.data());
        } else {
          // First time this user has signed in: create a profile.
          // New users default to "viewer" until an admin upgrades them.
          const newProfile = {
            email: user.email,
            name: user.email.split('@')[0],
            role: 'viewer',
            createdAt: serverTimestamp(),
          };
          await setDoc(ref, newProfile);
          setProfile(newProfile);
        }
        setProfileLoading(false);
      },
      () => setProfileLoading(false)
    );
    return unsub;
  }, [user]);

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const logout = () => signOut(auth);

  const role = profile?.role || 'viewer';
  const canEdit = role === 'editor' || role === 'admin';
  const isAdmin = role === 'admin';

  const value = {
    user,
    profile,
    loading: user === undefined || (user && profileLoading),
    login,
    logout,
    role,
    canEdit,
    isAdmin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
