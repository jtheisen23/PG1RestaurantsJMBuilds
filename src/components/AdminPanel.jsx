import { useUsers, setUserRole } from '../lib/firestore';
import { ROLES, useAuth } from '../context/AuthContext';

export default function AdminPanel() {
  const { data: users, loading } = useUsers();
  const { user } = useAuth();

  async function handleRoleChange(uid, role) {
    await setUserRole(uid, role);
  }

  return (
    <>
      <div className="role-banner">
        Manage who can view vs. edit this dashboard. New sign-ins default to <strong>viewer</strong>.
        Only admins can see this page.
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
        <strong>viewer</strong> — read-only access.{' '}
        <strong>editor</strong> — can add/edit projects, contacts, and construction progress.{' '}
        <strong>admin</strong> — everything editors can do, plus deleting projects and managing roles.
        <br />
        To add a brand-new employee: create their login in the Firebase console (Authentication → Add
        user), then have them sign in once — they'll show up here automatically as a viewer, ready to
        be upgraded.
      </div>
    </>
  );
}
