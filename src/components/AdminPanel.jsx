import { useMemo, useState } from 'react';
import {
  useUsers,
  useInvites,
  setUserRole,
  createInvite,
  deleteInvite,
  inviteId,
} from '../lib/firestore';
import { ROLES, useAuth } from '../context/AuthContext';

const APP_URL = window.location.origin;

function invitationText(address) {
  return [
    `You've been given access to the PG1 development pipeline dashboard.`,
    '',
    `1. Go to ${APP_URL}`,
    `2. Choose "Set up your account"`,
    `3. Sign up with this exact address: ${address}`,
    `4. Pick your own password`,
    '',
    `That address is the one that has been invited, so it has to match exactly.`,
  ].join('\n');
}

export default function AdminPanel() {
  const { data: users, loading } = useUsers();
  const { data: invites } = useInvites();
  const { user } = useAuth();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('editor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invited, setInvited] = useState('');
  const [copied, setCopied] = useState('');

  // An invite is "used up" once that person has signed in and been provisioned.
  const signedUp = useMemo(
    () => new Set(users.map((u) => (u.email || '').toLowerCase())),
    [users]
  );
  const pending = invites.filter((i) => !signedUp.has(inviteId(i.email)));

  async function handleInvite(e) {
    e.preventDefault();
    const id = inviteId(email);
    if (!id.includes('@')) return setError('Enter a valid email address.');
    if (signedUp.has(id)) return setError('That person already has an account.');

    setError('');
    setBusy(true);
    try {
      await createInvite({ email: id, role, name }, user);
      setInvited(id);
      setEmail('');
      setName('');
    } catch (err) {
      console.error('Failed to create invite:', err);
      setError('Could not save the invitation. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(uid, next) {
    await setUserRole(uid, next);
  }

  // Inviting someone records that they are allowed in; it does not send them
  // anything. Nothing in this app can send mail -- there is no server to send
  // it from -- so the invitation has to be passed on by whoever created it.
  // This puts the whole message on the clipboard so that is one click.
  async function copyInvite(address) {
    const text = invitationText(address);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(address);
      setTimeout(() => setCopied(''), 4000);
    } catch {
      // Clipboard access can be refused (an insecure origin, a locked-down
      // browser). Fall back to something they can copy by hand.
      window.prompt('Copy this message and send it to them:', text);
    }
  }

  return (
    <>
      <div className="role-banner">
        Invite someone by email and they can set their own password at the sign-in page. Nobody
        can reach any data without an invitation — that is enforced by the security rules, not
        just hidden in the interface.
        <br />
        <strong>Inviting does not email them.</strong> Use <em>Copy invitation</em> below and send
        it to them yourself, however you normally would.
      </div>

      <form className="invite-form" onSubmit={handleInvite}>
        <div className="invite-fields">
          <div>
            <label htmlFor="inv-email">Email</label>
            <input
              id="inv-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@pg1restaurants.com"
              required
            />
          </div>
          <div>
            <label htmlFor="inv-name">Name (optional)</label>
            <input
              id="inv-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mike Alvarez"
            />
          </div>
          <div>
            <label htmlFor="inv-role">Role</label>
            <select id="inv-role" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Inviting…' : 'Invite'}
          </button>
        </div>
        {error && <div className="login-error">{error}</div>}
        {invited && !error && (
          <div className="invite-ok">
            <strong>{invited}</strong> is invited — but nothing has been emailed to them.{' '}
            <button type="button" className="link-btn" onClick={() => copyInvite(invited)}>
              {copied === invited ? 'Copied ✓' : 'Copy invitation'}
            </button>{' '}
            and send it to them, then they can set their own password.
          </div>
        )}
      </form>

      {pending.length > 0 && (
        <>
          <div className="section-head">
            <h3>Invited, not signed up yet</h3>
            <span className="count">{pending.length}</span>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role when they join</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pending.map((i) => (
                <tr key={i.id}>
                  <td>{i.email}</td>
                  <td>{i.name || '—'}</td>
                  <td>{i.role}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="link-btn"
                      style={{ marginRight: 12 }}
                      onClick={() => copyInvite(i.email)}
                    >
                      {copied === i.email ? 'Copied ✓' : 'Copy invitation'}
                    </button>
                    <button
                      className="row-del"
                      title="Withdraw invitation"
                      onClick={() => {
                        if (confirm(`Withdraw the invitation for ${i.email}?`)) {
                          deleteInvite(i.email);
                        }
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="section-head">
        <h3>Team</h3>
        <span className="count">{users.length}</span>
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={3} style={{ textAlign: 'center', padding: 24 }}>
                Loading team…
              </td>
            </tr>
          ) : (
            users.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.name || '—'}
                  {u.id === user?.uid && <span className="you-tag">You</span>}
                </td>
                <td>{u.email}</td>
                <td>
                  <select value={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value)}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="footer-note">
        Anyone listed as invited has not signed up yet. If they say they never got anything, that
        is expected — the invitation is only sent when you send it.
        <br />
        Removing someone: withdraw a pending invitation here, or set an existing member to
        “viewer” to make the dashboard read-only for them. Deleting their sign-in credentials
        outright is still a Firebase console job (Authentication → Users).
      </div>
    </>
  );
}
