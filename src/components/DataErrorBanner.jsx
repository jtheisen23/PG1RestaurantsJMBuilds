import { useEffect, useState } from 'react';
import { subscribeDataErrors, clearDataErrors, isPermissionProblem } from '../lib/dataErrors';
import { useAuth } from '../context/AuthContext';

// Shows Firestore failures instead of letting them be a page that does
// nothing. A refused read used to leave an empty dashboard and a refused write
// used to leave a click that appeared to miss -- both indistinguishable from
// "there is no data yet".
export default function DataErrorBanner() {
  const { role, user } = useAuth();
  const [errors, setErrors] = useState([]);

  useEffect(() => subscribeDataErrors(setErrors), []);

  if (!errors.length) return null;

  const denied = isPermissionProblem(errors);

  return (
    <div className={`data-error ${denied ? 'denied' : ''}`}>
      <div className="data-error-body">
        <strong>
          {denied
            ? 'The database refused some of this.'
            : 'Something went wrong talking to the database.'}
        </strong>
        <ul>
          {errors.map((e) => (
            <li key={e.key}>
              {e.what} — <code>{e.code}</code>
            </li>
          ))}
        </ul>
        {denied && (
          <div className="data-error-hint">
            You are signed in as <strong>{user?.email}</strong> with the role{' '}
            <strong>{role}</strong>. If that role looks right, the security rules on the server are
            probably older than this app — an admin can fix it by running{' '}
            <code>firebase deploy --only firestore:rules</code>. Quote this whole message when
            reporting it.
          </div>
        )}
      </div>
      <button className="data-error-x" onClick={clearDataErrors} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
