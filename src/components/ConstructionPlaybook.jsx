import { useMemo, useState } from 'react';
import { useConstructionProgress, createTimelineTask, updateTimelineTask, deleteTimelineTask, setConstructionCheck } from '../lib/firestore';
import { useAuth } from '../context/AuthContext';

export default function ConstructionPlaybook({ projects, timeline }) {
  const { user, canEdit } = useAuth();
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const { data: progress } = useConstructionProgress(projectId);
  const [addingTask, setAddingTask] = useState(false);

  const effectiveProjectId = projectId || projects[0]?.id || '';

  const byWeek = useMemo(() => {
    const map = {};
    const order = [];
    timeline.forEach((item) => {
      if (!map[item.week]) {
        map[item.week] = [];
        order.push(item.week);
      }
      map[item.week].push(item);
    });
    return { map, order };
  }, [timeline]);

  const totalItems = timeline.length;
  const doneItems = timeline.filter((it) => progress[it.id]).length;

  async function handleCheck(taskId, checked) {
    if (!canEdit || !effectiveProjectId) return;
    await setConstructionCheck(effectiveProjectId, taskId, checked, user);
  }

  async function handleAddTask() {
    if (!canEdit) return;
    setAddingTask(true);
    try {
      const lastWeek = timeline.length ? timeline[timeline.length - 1].week : 'Week 1';
      await createTimelineTask({ week: lastWeek, detail: 'New task', who: '', order: timeline.length });
    } finally {
      setAddingTask(false);
    }
  }

  if (!projects.length) {
    return <div className="empty-state">Add a project first to start tracking construction.</div>;
  }

  return (
    <>
      <div className="cselect">
        <label style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--slate)' }}>Tracking construction for:</label>
        <select value={effectiveProjectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="mono" style={{ fontSize: 13, color: 'var(--slate)' }}>
          {doneItems}/{totalItems} tasks complete
        </span>
        {canEdit && (
          <button className="btn ghost small" style={{ marginLeft: 'auto' }} onClick={handleAddTask} disabled={addingTask}>
            + Add Task
          </button>
        )}
      </div>

      {byWeek.order.length ? (
        byWeek.order.map((wk) => (
          <WeekGroup
            key={wk}
            week={wk}
            items={byWeek.map[wk]}
            progress={progress}
            canEdit={canEdit}
            onCheck={handleCheck}
          />
        ))
      ) : (
        <div className="empty-state">No construction playbook tasks yet.</div>
      )}

      <div className="footer-note">
        This is the standard 12-week build-out playbook. Checkboxes track progress per project; editing
        task text updates the shared template for everyone.
      </div>
    </>
  );
}

function WeekGroup({ week, items, progress, canEdit, onCheck }) {
  const doneCount = items.filter((it) => progress[it.id]).length;
  return (
    <div className="week-group">
      <div className="week-title">
        {week} <span className="wk-pct">{doneCount}/{items.length}</span>
      </div>
      {items.map((item) => (
        <TaskItem key={item.id} item={item} checked={!!progress[item.id]} canEdit={canEdit} onCheck={onCheck} />
      ))}
    </div>
  );
}

function TaskItem({ item, checked, canEdit, onCheck }) {
  const [detail, setDetail] = useState(item.detail || '');

  async function commitDetail() {
    if (!canEdit || detail === item.detail) return;
    await updateTimelineTask(item.id, { detail });
  }

  async function handleDelete() {
    if (!canEdit) return;
    if (confirm('Remove this task from the playbook?')) await deleteTimelineTask(item.id);
  }

  return (
    <div className={`citem ${checked ? 'done' : ''}`}>
      <input type="checkbox" checked={checked} disabled={!canEdit} onChange={(e) => onCheck(item.id, e.target.checked)} />
      <textarea
        rows={1}
        value={detail}
        disabled={!canEdit}
        onChange={(e) => setDetail(e.target.value)}
        onBlur={commitDetail}
      />
      <span className="who">{item.who || ''}</span>
      {canEdit && (
        <button className="row-del" title="Remove task" onClick={handleDelete}>
          &times;
        </button>
      )}
    </div>
  );
}
