import { useEffect, useState } from 'react';
import { setBrandFieldLabel, setProjectFieldLabel } from '../lib/firestore';
import { useAuth } from '../context/AuthContext';

// Rewording a checklist item. Admin-only.
//
// The scope choice is the whole point. A clumsy question is usually clumsy on
// every project of that brand, and fixing it forty times is not a feature --
// but a note that only makes sense at one location should not be imposed on
// the other thirty-nine. Defaults to this project, matching how removal works,
// because it is the reversible one.
export default function FieldLabelDialog({ project, header, brandName, original, onClose }) {
  const { user } = useAuth();
  const [label, setLabel] = useState(original || '');
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

  const fileLabel = header.label;
  const trimmed = label.trim();
  const isReset = trimmed === '' || trimmed === fileLabel;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      // Saving the original wording back clears the override rather than
      // storing a copy of it, so the item follows the checklist file again.
      const value = isReset ? '' : trimmed;
      if (scope === 'brand') {
        await setBrandFieldLabel(project.brandKeyResolved, header.letter, value, user);
      } else {
        await setProjectFieldLabel(project.id, header.letter, value, project.fieldLabels, user);
      }
      onClose();
    } catch (err) {
      console.error('Failed to rename the field:', err);
      setError('Could not save the new wording. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={handleSubmit}>
        <div className="modal-head">
          <h3>Reword this item</h3>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="modal-sub">
          Column {header.letter} · originally “{fileLabel}”
        </p>

        <label htmlFor="fld-label">Wording</label>
        <textarea
          id="fld-label"
          rows={2}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
        />

        <label>Apply to</label>
        <div className="scope-choice">
          <label className="check-inline">
            <input
              type="radio"
              name="scope"
              checked={scope === 'project'}
              onChange={() => setScope('project')}
            />
            Just {project.name || 'this project'}
          </label>
          <label className="check-inline">
            <input
              type="radio"
              name="scope"
              checked={scope === 'brand'}
              onChange={() => setScope('brand')}
            />
            Every {brandName} project
          </label>
        </div>

        {isReset && (
          <div className="acc-hint" style={{ marginTop: 12 }}>
            This is the original wording, so saving will clear the override
            {scope === 'brand' ? ' for the whole brand' : ' for this project'} rather than store
            it.
          </div>
        )}

        {error && <div className="login-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Saving…' : isReset ? 'Reset to original' : 'Save wording'}
          </button>
        </div>
      </form>
    </div>
  );
}
