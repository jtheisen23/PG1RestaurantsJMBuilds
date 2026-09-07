import { useMemo, useState } from 'react';
import { useActivity } from '../lib/firestore';
import { BRANDS, BRAND_BY_KEY, brandKeyFor } from '../lib/helpers';

const SHOW_REVERSALS_KEY = 'pg1.activity.showReversals';

// localStorage can throw in a private window, so both accesses are guarded.
function readShowReversals() {
  try {
    return localStorage.getItem(SHOW_REVERSALS_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeShowReversals(value) {
  try {
    localStorage.setItem(SHOW_REVERSALS_KEY, String(value));
  } catch {
    // Preference just won't persist; the toggle still works this session.
  }
}

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
  const [brand, setBrand] = useState('all');
  // Un-ticking something is recorded but not shown by default. A mis-click
  // costs a tick and an un-tick -- two rows for no progress -- and that noise
  // buried the real work. The entries are still written, because a completed
  // item being withdrawn after it has gone out in a digest is exactly the
  // thing you would want a record of.
  const [showReversals, setShowReversals] = useState(readShowReversals);

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

  // The brand is stamped on entries written from now on. Everything logged
  // before that is resolved from the project it points at, which covers every
  // existing entry -- they are all Jersey Mike's, the only brand at the time.
  const brandKeyOf = useMemo(() => {
    const byId = new Map(projects.map((p) => [p.id, brandKeyFor(p)]));
    return (e) => e.brandKey || byId.get(e.projectId) || '';
  }, [projects]);

  // Everything matching the dropdowns, reversals included -- so the count of
  // what is being hidden is accurate for the filters in force.
  const matching = useMemo(
    () =>
      entries.filter(
        (e) =>
          (who === 'all' || e.by === who) &&
          (project === 'all' || e.projectId === project) &&
          (brand === 'all' || brandKeyOf(e) === brand)
      ),
    [entries, who, project, brand, brandKeyOf]
  );

  const hiddenReversals = useMemo(
    () => (showReversals ? 0 : matching.filter((e) => !e.done).length),
    [matching, showReversals]
  );

  const filtered = useMemo(
    () => (showReversals ? matching : matching.filter((e) => e.done)),
    [matching, showReversals]
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
        <select className="log-select" value={brand} onChange={(e) => setBrand(e.target.value)}>
          <option value="all">All brands</option>
          {BRANDS.map((b) => (
            <option key={b.key} value={b.key}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          className="log-select"
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="all">All projects</option>
          {projects
            .filter((p) => brand === 'all' || brandKeyFor(p) === brand)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || 'Unnamed Location'}
              </option>
            ))}
        </select>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={showReversals}
            onChange={(e) => {
              setShowReversals(e.target.checked);
              writeShowReversals(e.target.checked);
            }}
          />
          Show reversals
        </label>
        <div className="log-count">
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
          {hiddenReversals > 0 && (
            <span className="log-hidden">
              {' · '}
              {hiddenReversals} reversal{hiddenReversals === 1 ? '' : 's'} hidden
            </span>
          )}
        </div>
      </div>

      {days.length === 0 ? (
        <div className="empty-state">
          <div className="big">
            {hiddenReversals > 0 ? 'Nothing completed' : 'No activity yet'}
          </div>
          {hiddenReversals > 0
            ? 'Only reversals match these filters. Tick "Show reversals" to see them.'
            : 'Checklist items completed from here on will appear in this log, grouped by day.'}
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
                <span className={`log-brand ${brandKeyOf(e)}`}>
                  {BRAND_BY_KEY[brandKeyOf(e)]?.name || '—'}
                </span>
                <span className="log-who">{e.by}</span>
              </div>
            ))}
          </div>
        ))
      )}

      <div className="footer-note">
        Records checklist items completed on projects and on the construction playbook. Un-ticking
        something is recorded too, but hidden unless you ask for it, so a mis-click does not bury
        the real work. Text and date fields are not logged; each project page still shows who
        edited it last.
      </div>
    </>
  );
}
