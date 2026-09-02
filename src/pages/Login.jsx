import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';

export default function Login() {
  const { login, signUp } = useAuth();
  const [mode, setMode] = useState('signin'); // 'signin' | 'setup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isSetup = mode === 'setup';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (isSetup && password.length < 6) {
      return setError('Choose a password of at least 6 characters.');
    }
    setBusy(true);
    try {
      if (isSetup) await signUp(email, password);
      else await login(email, password);
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    setError('');
    setPassword('');
  }

  return (
    <div className="center-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <Logo />
        <h2>Development Pipeline</h2>
        <p className="sub">
          {isSetup
            ? 'Set a password for the email address you were invited on.'
            : "Sign in to view and track your team's projects."}
        </p>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label htmlFor="password">{isSetup ? 'Choose a password' : 'Password'}</label>
        <input
          id="password"
          type="password"
          autoComplete={isSetup ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <div className="login-error">{error}</div>}

        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Working…' : isSetup ? 'Create my account' : 'Sign in'}
        </button>

        <div className="login-hint">
          {isSetup ? (
            <>
              Already set up?{' '}
              <button type="button" className="link-btn" onClick={() => switchMode('signin')}>
                Sign in instead
              </button>
              .
            </>
          ) : (
            <>
              First time here?{' '}
              <button type="button" className="link-btn" onClick={() => switchMode('setup')}>
                Set up your account
              </button>{' '}
              using the email address your admin invited. Your access is granted by
              that invitation, not by creating an account.
            </>
          )}
        </div>
      </form>
    </div>
  );
}

function friendlyError(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Incorrect email or password.';
    case 'auth/email-already-in-use':
      return 'That email already has an account. Sign in instead.';
    case 'auth/weak-password':
      return 'Choose a password of at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return 'Something went wrong signing in. Please try again.';
  }
}
