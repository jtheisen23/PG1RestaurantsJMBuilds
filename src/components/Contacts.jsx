import { useMemo, useState } from 'react';
import { updateContact, deleteContact } from '../lib/firestore';
import { useAuth } from '../context/AuthContext';
import { BRANDS, BRAND_BY_KEY, brandKeyFor } from '../lib/helpers';
import ContactDialog from './ContactDialog';

const FIELDS = [
  ['category', 'Category / Role', 1],
  ['company', 'Company', 1],
  ['contact_name', 'Contact Name', 1],
  ['contact', 'Contact Info', 2],
  ['notes', 'Notes', 2],
];

export default function Contacts({ contacts: allContacts, brandKey, onSelectBrand }) {
  const { canEdit } = useAuth();
  const [adding, setAdding] = useState(false);

  // Each brand keeps its own vendors, GCs and reps, so the list is scoped the
  // way the project list is. Contacts that pre-date brands have no brandKey
  // and resolve to Jersey Mike's, which is what they are.
  const contacts = useMemo(
    () => allContacts.filter((c) => brandKeyFor(c) === brandKey),
    [allContacts, brandKey]
  );

  // Placed after every existing contact, across all brands, so the orders
  // stay unique and a contact never jumps the list it was added to.
  const nextOrder =
    allContacts.reduce(
      (max, c) => (typeof c.order === 'number' && c.order > max ? c.order : max),
      -1
    ) + 1;

  return (
    <>
      <div className="controls">
        {BRANDS.map((b) => (
          <button
            key={b.key}
            className={`filter-chip ${brandKey === b.key ? 'active' : ''}`}
            onClick={() => onSelectBrand(b.key)}
          >
            {b.name}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {canEdit && (
          <button className="btn" onClick={() => setAdding(true)}>
            + Add Contact
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
                No contacts for {BRAND_BY_KEY[brandKey]?.name || 'this brand'} yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {adding && (
        <ContactDialog
          brandKey={brandKey}
          nextOrder={nextOrder}
          onClose={() => setAdding(false)}
        />
      )}

      <div className="footer-note">
        Vendors, GCs, architects, and other partner contacts, kept separately for each brand.
        Adding one here adds it to {BRAND_BY_KEY[brandKey]?.name || 'this brand'}.
      </div>
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
