import { useMemo, useState } from 'react';
import { phaseProgress, overallProgress, currentStage, pct } from '../lib/helpers';
import { createProject } from '../lib/firestore';
import { useAuth } from '../context/AuthContext';

export default function Overview({ projects, onSelect }) {
  const { user, canEdit } = useAuth();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);

  // Completed stores are open and operating, so they're excluded from the
  // pipeline stats -- leaving them in would drag the averages around.
  const active = useMemo(() => projects.filter((p) => !p.completed), [projects]);

  const stats = useMemo(() => {
    const s = { re: 0, pc: 0, co: 0, done: 0 };
    let sum = 0;
    active.forEach((p) => {
      s[currentStage(p).key]++;
      sum += overallProgress(p);
    });
    return {
      ...s,
      total: active.length,
      completed: projects.length - active.length,
      avg: active.length ? Math.round((sum / active.length) * 100) : 0,
    };
  }, [projects, active]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return projects.filter((p) => {
      const stage = currentStage(p).key;
      const matchesStage = filter === 'all' || stage === filter;
      if (!matchesStage) return false;
      if (!q) return true;
      const hay = `${p.name || ''} ${p.brand || ''} ${p.fields?.C || ''} ${p.fields?.F || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [projects, search, filter]);

  const activeRows = useMemo(() => filtered.filter((p) => !p.completed), [filtered]);
  const completedRows = useMemo(() => filtered.filter((p) => p.completed), [filtered]);

  async function handleAdd() {
    setAdding(true);
    try {
      // Place new projects after every existing one.
      const nextOrder =
        projects.reduce((max, p) => (typeof p.order === 'number' && p.order > max ? p.order : max), -1) + 1;
      const ref = await createProject(
        { brand: 'Jersey Mikes', name: 'New Location', fields: {}, order: nextOrder },
        user
      );
      onSelect(ref.id);
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <div className="stat-row">
        <div className="stat-card"><div className="num">{stats.total}</div><div className="lbl">Active Projects</div></div>
        <div className="stat-card"><div className="num">{stats.re}</div><div className="lbl">In Real Estate</div></div>
        <div className="stat-card"><div className="num">{stats.pc}</div><div className="lbl">In Pre-Construction</div></div>
        <div className="stat-card"><div className="num">{stats.co}</div><div className="lbl">In Construction/Ops</div></div>
        <div className="stat-card"><div className="num">{stats.done}</div><div className="lbl">Open / Complete</div></div>
        <div className="stat-card"><div className="num">{stats.completed}</div><div className="lbl">Completed Stores</div></div>
        <div className="stat-card"><div className="num">{stats.avg}%</div><div className="lbl">Avg. Completion</div></div>
      </div>

      <div className="controls">
        <div className="search-wrap">
          <input
            type="text"
            placeholder="Search projects by name, address, LLC…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {[['all', 'All'], ['re', 'Real Estate'], ['pc', 'Pre-Construction'], ['co', 'Construction/Ops'], ['done', 'Open/Complete']].map(
          ([key, label]) => (
            <button
              key={key}
              className={`filter-chip ${filter === key ? 'active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          )
        )}
        {canEdit && (
          <button className="btn" onClick={handleAdd} disabled={adding}>
            {adding ? 'Adding…' : '+ Add Project'}
          </button>
        )}
      </div>

      <div className="plist">
        {activeRows.length ? (
          activeRows.map((p) => <ProjectRow key={p.id} project={p} onClick={() => onSelect(p.id)} />)
        ) : (
          !completedRows.length && (
            <div className="empty-state">
              <div className="big">No projects match</div>
              Try a different search or filter.
            </div>
          )
        )}
      </div>

      {completedRows.length > 0 && (
        <>
          <div className="section-head">
            <h3>Completed Stores</h3>
            <span className="count">{completedRows.length}</span>
          </div>
          <div className="plist completed">
            {completedRows.map((p) => (
              <ProjectRow key={p.id} project={p} onClick={() => onSelect(p.id)} />
            ))}
          </div>
        </>
      )}

      <div className="footer-note">
        Progress bars reflect checklist items only (text/date fields are not counted). Data is shared
        live across everyone signed in to this dashboard.
      </div>
    </>
  );
}

function ProjectRow({ project, onClick }) {
  const re = phaseProgress(project, 'Real Estate');
  const pc = phaseProgress(project, 'Pre-Construction');
  const co = phaseProgress(project, 'Construction/Ops');
  const stage = currentStage(project);
  const overall = overallProgress(project);
  const addr = project.fields?.C || '';

  return (
    <div className="prow" onClick={onClick}>
      <div>
        <div className="pname">{project.name || 'Unnamed Location'}</div>
        <div className="paddr">{addr || 'No address on file'}</div>
      </div>
      <div>
        <div className="rail" title={`Real Estate ${pct(re)}% · Pre-Construction ${pct(pc)}% · Construction ${pct(co)}%`}>
          <div className="seg re" style={{ width: '33.33%', opacity: 0.28 + 0.72 * re }} />
          <div className="seg pc" style={{ width: '33.33%', opacity: 0.28 + 0.72 * pc }} />
          <div className="seg co" style={{ width: '33.33%', opacity: 0.28 + 0.72 * co }} />
        </div>
        <div className="rail-labels">
          <span>Real Estate</span>
          <span>Pre-Con</span>
          <span>Construction</span>
        </div>
      </div>
      <div className="pct-block">
        <span className={`stage-badge ${stage.key}`}>{stage.label}</span>
        <div className="pctnum">{pct(overall)}%</div>
        <div className="pctlbl">overall</div>
      </div>
    </div>
  );
}
