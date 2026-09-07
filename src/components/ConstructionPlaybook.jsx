import { useMemo, useState } from 'react';
import { useConstructionProgress, createTimelineTask, updateTimelineTask, deleteTimelineTask, setConstructionCheck } from '../lib/firestore';
import { useAuth } from '../context/AuthContext';
import { BRANDS, BRAND_BY_KEY, brandKeyFor } from '../lib/helpers';

export default function ConstructionPlaybook({
  projects: allProjects,
  timeline: allTimeline,
  brandKey,
  onSelectBrand,
}) {
  const { user, canEdit } = useAuth();
  const [projectId, setProjectId] = useState('');
  const [addingTask, setAddingTask] = useState(false);

  // Each brand builds its stores differently -- Jersey Mike's runs a 12-week
  // schedule, Dave's a sequence of build phases -- so the playbook and the
  // projects it can be tracked against are both scoped to one brand.
  const projects = useMemo(
    () => allProjects.filter((p) => brandKeyFor(p) === brandKey),
    [allProjects, brandKey]
  );
  const timeline = useMemo(
    () => allTimeline.filter((t) => brandKeyFor(t) === brandKey),
    [allTimeline, brandKey]
  );

  // Falling back to the first project of the brand keeps the selector valid
  // when the brand changes underneath it.
  const effectiveProjectId = projects.some((p) => p.id === projectId)
    ? projectId
    : projects[0]?.id || '';
  const { data: progress } = useConstructionProgress(effectiveProjectId);

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
    const task = timeline.find((t) => t.id === taskId);
    const proj = projects.find((p) => p.id === effectiveProjectId);
    await setConstructionCheck(effectiveProjectId, taskId, checked, user, {
      projectName: proj?.name || proj?.brand || '',
      item: task?.detail || taskId,
      week: task?.week || 'Construction Playbook',
    });
  }

  async function handleAddTask() {
    if (!canEdit) return;
    setAddingTask(true);
    try {
      const lastGroup = timeline.length ? timeline[timeline.length - 1].week : 'Week 1';
      const nextOrder =
        allTimeline.reduce(
          (max, t) => (typeof t.order === 'number' && t.order > max ? t.order : max),
          -1
        ) + 1;
      await createTimelineTask({
        week: lastGroup,
        detail: 'New task',
        who: '',
        // Without the brand the new row would resolve to Jersey Mike's and
        // vanish from the playbook of whoever added it.
        brandKey,
        order: nextOrder,
      });
    } finally {
      setAddingTask(false);
    }
  }

  const brandChips = (
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
    </div>
  );

  if (!projects.length) {
    return (
      <>
        {brandChips}
        <div className="empty-state">
          <div className="big">No {BRAND_BY_KEY[brandKey]?.name || ''} projects yet</div>
          Add a project for this brand to start tracking construction.
        </div>
      </>
    );
  }

  return (
    <>
      {brandChips}
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
        <div className="empty-state">
          <div className="big">No playbook for {BRAND_BY_KEY[brandKey]?.name || 'this brand'} yet</div>
          Its build-out steps have not been imported.
        </div>
      )}

      <div className="footer-note">
        The build-out playbook for {BRAND_BY_KEY[brandKey]?.name || 'this brand'}. Checkboxes track
        progress per project; editing a step's text changes the template for everyone on this brand.
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
      <div className="citem-meta">
        {item.who && <span className="who">{item.who}</span>}
        {item.duration && <span className="cmeta dur">{item.duration}</span>}
        {String(item.inspection || '').toLowerCase() === 'yes' && (
          <span className="cmeta insp">Inspection</span>
        )}
      </div>
      {canEdit && (
        <button className="row-del" title="Remove task" onClick={handleDelete}>
          &times;
        </button>
      )}
      {item.note && <div className="citem-note">{item.note}</div>}
    </div>
  );
}
