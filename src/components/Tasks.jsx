import { useMemo, useState } from 'react';
import { useTasks } from '../lib/firestore';
import { useAuth } from '../context/AuthContext';
import TaskList from './TaskList';

export default function Tasks({ projects, onAddTask }) {
  const { user, canEdit } = useAuth();
  const { data: tasks, loading } = useTasks();
  const [who, setWho] = useState('all');
  const [project, setProject] = useState('all');
  const [showDone, setShowDone] = useState(false);

  const people = useMemo(
    () => [...new Set(tasks.map((t) => t.assigneeEmail).filter(Boolean))].sort(),
    [tasks]
  );

  const filtered = useMemo(
    () =>
      tasks.filter((t) => {
        if (!showDone && t.done) return false;
        if (project !== 'all' && t.projectId !== project) return false;
        if (who === 'mine') return t.assigneeEmail === user?.email;
        if (who === 'unassigned') return !t.assigneeEmail;
        if (who !== 'all') return t.assigneeEmail === who;
        return true;
      }),
    [tasks, who, project, showDone, user]
  );

  const open = tasks.filter((t) => !t.done);
  const mine = open.filter((t) => t.assigneeEmail === user?.email);
  const unassigned = open.filter((t) => !t.assigneeEmail);

  if (loading) return <div className="empty-state">Loading tasks…</div>;

  return (
    <>
      <div className="stat-row">
        <div className="stat-card"><div className="num">{open.length}</div><div className="lbl">Open Tasks</div></div>
        <div className="stat-card"><div className="num">{mine.length}</div><div className="lbl">Assigned to You</div></div>
        <div className="stat-card"><div className="num">{unassigned.length}</div><div className="lbl">Unassigned</div></div>
        <div className="stat-card"><div className="num">{tasks.length - open.length}</div><div className="lbl">Completed</div></div>
      </div>

      <div className="controls">
        <select className="log-select" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="all">Everyone</option>
          <option value="mine">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
          {people.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select className="log-select" value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || p.brand || 'Unnamed Location'}
            </option>
          ))}
        </select>
        <label className="check-inline">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Show completed
        </label>
        {canEdit && (
          <button className="btn" onClick={() => onAddTask(null)}>
            + Add Task
          </button>
        )}
      </div>

      <TaskList
        tasks={filtered}
        emptyText={
          showDone ? 'No tasks match these filters.' : 'No open tasks match these filters.'
        }
      />

      <div className="footer-note">
        Tasks are one-off items raised against a project, separate from the fixed checklist and the
        construction playbook. Completing one is recorded in the Activity log and appears in the
        daily digest.
      </div>
    </>
  );
}
