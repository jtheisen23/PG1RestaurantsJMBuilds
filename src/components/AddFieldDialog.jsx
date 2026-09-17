import { useEffect, useState } from 'react';
import { addBrandCustomField, addCustomField, useUsers } from '../lib/firestore';
import { useAuth } from '../context/AuthContext';

// Adding a checklist item to one phase of one project.
//
// Deliberately not a task. A task has an owner and a due date and lives in its
// own list; this is just another line on the checklist, stored and ticked like
// every other one, and counted in the phase's progress.
export default function AddFieldDialog({ project, phase, brandKey, brandName, onClose, onAdded }) {
  const { user } = useAuth();
  const { data: users } = useUsers();
  const [label, setLabel] = useState('');
  const [type, setType] = useState('checkbox');
  const [resp, setResp] = useState('');
  const [scope, setScope] = useState('project');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!label.trim()) return setError('Give the field a name.');
    setError('');
    setSaving(true);
    try {
      const spec = { phase, label, type, resp: resp.trim() };
      const field =
        scope === 'brand'
          ? await addBrandCustomField(brandKey, spec, project.brandFields, user)
          : await addCustomField(project.id, spec, project.customFields, user);
      onAdded?.(field);
      onClose();
    } catch (err) {
      console.error('Failed to add the field:', err);
      setError('Could not add the field. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={handleSubmit}>
        <div className="modal-head">
          <h3>Add a field</h3>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="modal-sub">
          Added to <strong>{phase}</strong>. It appears with the other fields, and each project
          can drag it into place.
        </p>

        <label htmlFor="nf-label">Field name</label>
        <input
          id="nf-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Landlord Official Turnover Letter"
          autoFocus
        />

        <div className="modal-row">
          <div>
            <label htmlFor="nf-resp">Responsible (optional)</label>
            <select id="nf-resp" value={resp} onChange={(e) => setResp(e.target.value)}>
              <option value="">Nobody in particular</option>
              {users.map((u) => (
                <option key={u.id} value={u.name || u.email}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="nf-scope">Apply to</label>
            <select id="nf-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="project">Just {project.name || 'this project'}</option>
              <option value="brand">Every {brandName} project</option>
            </select>
          </div>
        </div>

        <label>Type</label>
        <div className="scope-choice">
          <label className="check-inline">
            <input
              type="radio"
              name="fieldtype"
              checked={type === 'checkbox'}
              onChange={() => setType('checkbox')}
            />
            Tick box — something to complete, counts towards progress
          </label>
          <label className="check-inline">
            <input
              type="radio"
              name="fieldtype"
              checked={type === 'text'}
              onChange={() => setType('text')}
            />
            Text — somewhere to write, not counted
          </label>
        </div>

        {scope === 'brand' && (
          <div className="acc-hint" style={{ marginTop: 12 }}>
            This adds the field to every {brandName} project, including ones created later. Each
            project keeps its own tick and its own position for it.
          </div>
        )}

        {error && <div className="login-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Adding…' : 'Add field'}
          </button>
        </div>
      </form>
    </div>
  );
}
