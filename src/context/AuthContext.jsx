import { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
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
  // Signed in but with no invite: authenticated, yet not a member of this team.
  const [notInvited, setNotInvited] = useState(false);
  // Set when the profile could not be read or created. Without this the app
  // rendered a signed-in shell with a null profile -- a "?" avatar and an
  // empty dashboard -- which looks like a data problem rather than a denial.
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setNotInvited(false);
      setAuthError('');
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
          setNotInvited(false);
        } else {
          // First sign-in. The profile is provisioned from the invite an admin
          // left, which also decides the role -- there is no default, because
          // anyone can create an account with the public API key and a default
          // would hand them access. The rules enforce the same thing server
          // side; this is just the matching client behaviour.
          const email = (user.email || '').toLowerCase();
          const invite = await getDoc(doc(db, 'invites', email)).catch(() => null);
          if (!invite?.exists()) {
            setNotInvited(true);
            setProfile(null);
            setProfileLoading(false);
            return;
          }
          const newProfile = {
            email,
            name: invite.data().name || email.split('@')[0],
            role: invite.data().role,
            createdAt: serverTimestamp(),
          };
          try {
            await setDoc(ref, newProfile);
          } catch (err) {
            console.error('Could not create the user profile:', err);
            setAuthError(
              'Your account is invited, but setting up your profile was refused. ' +
                'This usually means the app is running an outdated copy — try a hard refresh. ' +
                `(${err.code || 'unknown error'})`
            );
            setProfile(null);
            setProfileLoading(false);
            return;
          }
          setProfile(newProfile);
          setNotInvited(false);
          setAuthError('');
        }
        setProfileLoading(false);
      },
      (err) => {
        // Reaching here means reading the profile was denied outright.
        console.error('Could not read the user profile:', err);
        setAuthError(
          `Signed in, but reading your profile was refused (${err.code || 'unknown error'}). ` +
            'An admin may need to re-deploy the security rules.'
        );
        setProfile(null);
        setProfileLoading(false);
      }
    );
    return unsub;
  }, [user]);

  const login = (email, password) =>
    signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);

  // Lowercased on the way in so the auth token's email matches the invite
  // document id exactly. Security rules cannot lowercase, so this is the only
  // place that normalisation can happen.
  const signUp = (email, password) =>
    createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);

  const logout = () => signOut(auth);

  const role = profile?.role || 'viewer';
  const canEdit = role === 'editor' || role === 'admin';
  const isAdmin = role === 'admin';

  const value = {
    user,
    profile,
    notInvited,
    authError,
    loading: user === undefined || (user && profileLoading),
    login,
    signUp,
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
