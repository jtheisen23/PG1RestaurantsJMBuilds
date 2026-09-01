import { setTaskDone, deleteTask } from '../lib/firestore';
import { useAuth } from '../context/AuthContext';

function dueLabel(due) {
  if (!due) return null;
  // A date input gives YYYY-MM-DD. Parsing that directly would be read as UTC
  // and can shift a day in western timezones, so build it as a local date.
  const [y, m, d] = due.split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date - today) / 86400000);
  const text = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (days < 0) return { text: `${text} · overdue`, tone: 'over' };
  if (days === 0) return { text: `${text} · today`, tone: 'soon' };
  if (days <= 3) return { text: `${text} · in ${days}d`, tone: 'soon' };
  return { text, tone: '' };
}

// Shared by the Tasks tab and the tasks section on a project page.
// `showProject` is off on a project page, where every row is that project.
export default function TaskList({ tasks, showProject = true, emptyText = 'No tasks.' }) {
  const { user, canEdit, isAdmin } = useAuth();

  if (!tasks.length) {
    return <div className="task-empty">{emptyText}</div>;
  }

  return (
    <div className="task-list">
      {tasks.map((t) => {
        const due = t.done ? null : dueLabel(t.due);
        const mine = t.assigneeEmail && t.assigneeEmail === user?.email;
        return (
          <div className={`task-row ${t.done ? 'done' : ''}`} key={t.id}>
            <input
              type="checkbox"
              checked={Boolean(t.done)}
              disabled={!canEdit}
              onChange={(e) => setTaskDone(t, e.target.checked, user)}
              aria-label={t.done ? 'Reopen task' : 'Mark task complete'}
            />
            <div className="task-body">
              <div className="task-title">{t.title}</div>
              <div className="task-meta">
                {showProject && <span className="task-project">{t.projectName || 'Unknown project'}</span>}
                {t.assigneeEmail ? (
                  <span className={`task-who ${mine ? 'mine' : ''}`}>
                    {t.assigneeName || t.assigneeEmail}
                    {mine ? ' (you)' : ''}
                  </span>
                ) : (
                  <span className="task-who unassigned">Unassigned</span>
                )}
                {due && <span className={`task-due ${due.tone}`}>{due.text}</span>}
              </div>
              {t.notes && <div className="task-notes">{t.notes}</div>}
            </div>
            {isAdmin && (
              <button
                className="row-del"
                title="Delete task"
                onClick={() => {
                  if (confirm(`Delete this task?\n\n${t.title}`)) deleteTask(t.id);
                }}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
