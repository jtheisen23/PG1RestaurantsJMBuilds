import { useEffect, useState } from 'react';
import { createContact } from '../lib/firestore';
import { BRAND_BY_KEY } from '../lib/helpers';

// Adding a contact used to append a blank row to the bottom of the table for
// someone to fill in place. That worked, but it put an empty row into a shared
// live list the moment you clicked, and on a long list you had to go and find
// it. This collects the whole contact first and only writes once it is real.
export default function ContactDialog({ brandKey, nextOrder, onClose }) {
  const [values, setValues] = useState({
    category: '',
    company: '',
    contact_name: '',
    contact: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const brand = BRAND_BY_KEY[brandKey];

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    // Every field is optional on its own -- plenty of rows in the sheets are a
    // company with only a phone number, or a role with no name yet -- but a
    // row with nothing identifying in it is just clutter.
    if (!values.category.trim() && !values.company.trim() && !values.contact_name.trim()) {
      return setError('Fill in at least a category, company, or contact name.');
    }

    setError('');
    setSaving(true);
    try {
      await createContact({
        category: values.category.trim(),
        company: values.company.trim(),
        contact_name: values.contact_name.trim(),
        contact: values.contact.trim(),
        notes: values.notes.trim(),
        brandKey,
        order: nextOrder,
      });
      onClose();
    } catch (err) {
      console.error('Failed to create contact:', err);
      setError('Could not save the contact. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={handleSubmit}>
        <div className="modal-head">
          <h3>New contact</h3>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="modal-sub">
          Added to <strong>{brand?.name || 'this brand'}</strong>.
        </p>

        <div className="modal-row">
          <div>
            <label htmlFor="c-category">Category / Role</label>
            <input
              id="c-category"
              value={values.category}
              onChange={set('category')}
              placeholder="e.g. Exterior Signage"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="c-company">Company</label>
            <input
              id="c-company"
              value={values.company}
              onChange={set('company')}
              placeholder="e.g. Phoenix Signs"
            />
          </div>
        </div>

        <label htmlFor="c-name">Contact Name</label>
        <input
          id="c-name"
          value={values.contact_name}
          onChange={set('contact_name')}
          placeholder="e.g. Randy Ulrey"
        />

        <label htmlFor="c-info">Contact Info</label>
        <textarea
          id="c-info"
          rows={2}
          value={values.contact}
          onChange={set('contact')}
          placeholder="Phone, email, whatever you use to reach them"
        />

        <label htmlFor="c-notes">Notes</label>
        <textarea
          id="c-notes"
          rows={2}
          value={values.notes}
          onChange={set('notes')}
          placeholder="Anything worth knowing before calling them"
        />

        {error && <div className="login-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save contact'}
          </button>
        </div>
      </form>
    </div>
  );
}
