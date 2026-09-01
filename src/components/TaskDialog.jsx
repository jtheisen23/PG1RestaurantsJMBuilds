import { useEffect, useState } from 'react';
import { createTask, useUsers } from '../lib/firestore';
import { useAuth } from '../context/AuthContext';

// Modal for raising a task against a project. Opened either from the top bar
// (project not chosen yet) or from a project page (project fixed).
export default function TaskDialog({ projects, fixedProjectId, onClose }) {
  const { user } = useAuth();
  const { data: users } = useUsers();

  const [projectId, setProjectId] = useState(fixedProjectId || '');
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const [notes, setNotes] = useState('');
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
    if (!title.trim()) return setError('Give the task a description.');
    if (!projectId) return setError('Choose which project this is for.');

    setError('');
    setSaving(true);
    try {
      const project = projects.find((p) => p.id === projectId);
      const person = users.find((u) => u.email === assignee);
      await createTask(
        {
          projectId,
          // Stored so the task stays readable if the project is renamed.
          projectName: project?.name || project?.brand || '',
          title: title.trim(),
          assigneeEmail: assignee,
          assigneeName: person?.name || '',
          due,
          notes: notes.trim(),
        },
        user
      );
      onClose();
    } catch (err) {
      console.error('Failed to create task:', err);
      setError('Could not save the task. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={handleSubmit}>
        <div className="modal-head">
          <h3>New task</h3>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <label htmlFor="task-title">Task</label>
        <input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Chase the landlord on the HVAC punch list"
          autoFocus
        />

        <label htmlFor="task-project">Project</label>
        <select
          id="task-project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          disabled={Boolean(fixedProjectId)}
        >
          <option value="">Choose a project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || p.brand || 'Unnamed Location'}
            </option>
          ))}
        </select>

        <div className="modal-row">
          <div>
            <label htmlFor="task-assignee">Responsible</label>
            <select
              id="task-assignee"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.email}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="task-due">Due (optional)</label>
            <input id="task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>

        <label htmlFor="task-notes">Notes (optional)</label>
        <textarea
          id="task-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything the person picking this up should know"
        />

        {error && <div className="login-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Add task'}
          </button>
        </div>
      </form>
    </div>
  );
}
