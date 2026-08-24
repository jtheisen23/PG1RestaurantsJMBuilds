import { useState } from 'react';
import { createContact, updateContact, deleteContact } from '../lib/firestore';
import { useAuth } from '../context/AuthContext';

const FIELDS = [
  ['category', 'Category / Role', 1],
  ['company', 'Company', 1],
  ['contact_name', 'Contact Name', 1],
  ['contact', 'Contact Info', 2],
  ['notes', 'Notes', 2],
];

export default function Contacts({ contacts }) {
  const { canEdit } = useAuth();
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    setAdding(true);
    try {
      await createContact({ category: '', company: '', contact_name: '', contact: '', notes: '' });
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <div className="controls">
        {canEdit && (
          <button className="btn" onClick={handleAdd} disabled={adding}>
            {adding ? 'Adding…' : '+ Add Contact'}
          </button>
        )}
      </div>
      <table className="ctable">
        <thead>
          <tr>
            {FIELDS.map(([key, label]) => (
              <th key={key}>{label}</th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {contacts.length ? (
            contacts.map((c) => <ContactRow key={c.id} contact={c} canEdit={canEdit} />)
          ) : (
            <tr>
              <td colSpan={FIELDS.length + 1} style={{ padding: 24, textAlign: 'center', color: 'var(--slate)' }}>
                No contacts yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="footer-note">Vendors, GCs, architects, and other partner contacts for the development pipeline.</div>
    </>
  );
}

function ContactRow({ contact, canEdit }) {
  const [values, setValues] = useState(contact);

  async function commit(field) {
    if (!canEdit) return;
    if (values[field] === contact[field]) return;
    await updateContact(contact.id, { [field]: values[field] });
  }

  async function handleDelete() {
    if (!canEdit) return;
    if (confirm('Delete this contact?')) await deleteContact(contact.id);
  }

  return (
    <tr>
      {FIELDS.map(([field, , rows]) => (
        <td key={field}>
          <textarea
            rows={rows}
            value={values[field] || ''}
            disabled={!canEdit}
            onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
            onBlur={() => commit(field)}
          />
        </td>
      ))}
      <td>
        {canEdit && (
          <button className="row-del" title="Delete row" onClick={handleDelete}>
            &times;
          </button>
        )}
      </td>
    </tr>
  );
}
