import { useEffect, useState } from 'react';
import { createTask, updateTask, useUsers } from '../lib/firestore';
import { useAuth } from '../context/AuthContext';
import { PHASES } from '../lib/helpers';

// Modal for raising a task against a project, or editing one that exists.
// Opened from the top bar (project not chosen yet), a project page (project
// fixed), a phase accordion (project and stage fixed), or the edit button on
// any task row (`task` supplied).
export default function TaskDialog({ projects, fixedProjectId, fixedPhase, task, onClose }) {
  const { user } = useAuth();
  const { data: users } = useUsers();

  const editing = Boolean(task);

  const [projectId, setProjectId] = useState(task?.projectId || fixedProjectId || '');
  const [phase, setPhase] = useState(task?.phase ?? fixedPhase ?? '');
  const [title, setTitle] = useState(task?.title || '');
  const [assignee, setAssignee] = useState(task?.assigneeEmail || '');
  const [due, setDue] = useState(task?.due || '');
  const [notes, setNotes] = useState(task?.notes || '');
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
    const project = projects.find((p) => p.id === projectId);
    const person = users.find((u) => u.email === assignee);
    const payload = {
      projectId,
      // Stored so the task stays readable if the project is renamed.
      projectName: project?.name || project?.brand || '',
      phase,
      title: title.trim(),
      assigneeEmail: assignee,
      assigneeName: person?.name || '',
      due,
      notes: notes.trim(),
    };
    try {
      if (editing) await updateTask(task.id, payload, user);
      else await createTask(payload, user);
      onClose();
    } catch (err) {
      console.error(editing ? 'Failed to update task:' : 'Failed to create task:', err);
      setError(
        editing
          ? 'Could not save the changes. Please try again.'
          : 'Could not save the task. Please try again.'
      );
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={handleSubmit}>
        <div className="modal-head">
          <h3>{editing ? 'Edit task' : 'New task'}</h3>
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

        <div className="modal-row">
          <div>
            <label htmlFor="task-project">Project</label>
            <select
              id="task-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={!editing && Boolean(fixedProjectId)}
            >
              <option value="">Choose a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.brand || 'Unnamed Location'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="task-phase">Stage</label>
            <select id="task-phase" value={phase} onChange={(e) => setPhase(e.target.value)}>
              <option value="">No stage</option>
              {PHASES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

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
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add task'}
          </button>
        </div>
      </form>
    </div>
  );
}
