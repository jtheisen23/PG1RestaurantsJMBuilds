import { useMemo, useState } from 'react';
import { useActivity } from '../lib/firestore';

// Groups activity entries under a heading per calendar day, newest first.
function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function dayLabel(date) {
  const today = dayKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const key = dayKey(date);
  if (key === today) return 'Today';
  if (key === dayKey(yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

function timeLabel(date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function Activity({ projects }) {
  const { data: entries, loading } = useActivity();
  const [who, setWho] = useState('all');
  const [project, setProject] = useState('all');

  const people = useMemo(
    () => [...new Set(entries.map((e) => e.by).filter(Boolean))].sort(),
    [entries]
  );

  // Entries store the project name at write time so history survives a rename
  // or deletion. Older entries were written before empty names fell back to
  // the brand, so look the project up as a last resort rather than showing
  // "Unknown project" for a row that plainly has one.
  const nameFor = useMemo(() => {
    const byId = new Map(projects.map((p) => [p.id, p.name || p.brand || '']));
    return (e) => e.projectName || byId.get(e.projectId) || 'Unknown project';
  }, [projects]);

  const filtered = useMemo(
    () =>
      entries.filter(
        (e) => (who === 'all' || e.by === who) && (project === 'all' || e.projectId === project)
      ),
    [entries, who, project]
  );

  // serverTimestamp() is null for a beat on the writer's own client until the
  // server confirms, so skip entries that have no timestamp yet.
  const days = useMemo(() => {
    const groups = new Map();
    filtered.forEach((e) => {
      const date = e.at?.toDate?.();
      if (!date) return;
      const key = dayKey(date);
      if (!groups.has(key)) groups.set(key, { date, items: [] });
      groups.get(key).items.push({ ...e, date });
    });
    return [...groups.values()].sort((a, b) => b.date - a.date);
  }, [filtered]);

  if (loading) return <div className="empty-state">Loading activity…</div>;

  return (
    <>
      <div className="controls">
        <select className="log-select" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="all">Everyone</option>
          {people.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          className="log-select"
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || 'Unnamed Location'}
            </option>
          ))}
        </select>
        <div className="log-count">
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
        </div>
      </div>

      {days.length === 0 ? (
        <div className="empty-state">
          <div className="big">No activity yet</div>
          Checklist items completed from here on will appear in this log, grouped by day.
        </div>
      ) : (
        days.map((day) => (
          <div className="log-day" key={dayKey(day.date)}>
            <div className="section-head">
              <h3>{dayLabel(day.date)}</h3>
              <span className="count">{day.items.length}</span>
            </div>
            {day.items.map((e) => (
              <div className={`log-row ${e.done ? '' : 'undone'}`} key={e.id}>
                <span className="log-time">{timeLabel(e.date)}</span>
                <span className={`log-mark ${e.done ? 'done' : 'undone'}`}>
                  {e.done ? '✓' : '↺'}
                </span>
                <div className="log-body">
                  <div className="log-item">{e.item}</div>
                  <div className="log-meta">
                    {nameFor(e)}
                    {e.phase ? ` · ${e.phase}` : ''}
                  </div>
                </div>
                <span className="log-who">{e.by}</span>
              </div>
            ))}
          </div>
        ))
      )}

      <div className="footer-note">
        Records checklist items ticked or unticked, on projects and on the construction playbook.
        Text and date fields are not logged. Each project page still shows who edited it last.
      </div>
    </>
  );
}
