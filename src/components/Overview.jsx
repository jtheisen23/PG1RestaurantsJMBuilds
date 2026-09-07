import { useMemo, useState } from 'react';
import {
  phaseProgress,
  overallProgress,
  currentStage,
  pct,
  phaseKey,
  brandKeyFor,
  templateFor,
  BRAND_BY_KEY,
} from '../lib/helpers';
import { createProject } from '../lib/firestore';
import { useAuth } from '../context/AuthContext';

export default function Overview({ projects: allProjects, brandKey, onSelect, onBack }) {
  const { user, canEdit } = useAuth();
  const brand = BRAND_BY_KEY[brandKey];
  const template = templateFor(brandKey);

  // Only this brand's projects, everywhere on the page -- the stat tiles
  // included, since averaging across brands with different checklists would
  // not mean anything.
  const projects = useMemo(
    () => allProjects.filter((p) => brandKeyFor(p) === brandKey),
    [allProjects, brandKey]
  );
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);

  // Completed stores are open and operating, so they're excluded from the
  // pipeline stats -- leaving them in would drag the averages around.
  const active = useMemo(() => projects.filter((p) => !p.completed), [projects]);

  const stats = useMemo(() => {
    // Average completion per phase across active projects. Head-counts by
    // "current stage" were misleading: a project sits in one bucket only, so
    // work already done in later phases stayed invisible.
    //
    // One tile per phase of this brand's flow, not a fixed three, so a brand
    // with different stages gets its own.
    const mean = (n) => (active.length ? Math.round((n / active.length) * 100) : 0);
    return {
      phases: template.phases.map((phase) => ({
        phase,
        value: mean(active.reduce((sum, p) => sum + phaseProgress(p, phase), 0)),
      })),
      started: active.filter((p) => overallProgress(p) > 0).length,
      total: active.length,
      completed: projects.length - active.length,
    };
  }, [projects, active, template]);

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
        allProjects.reduce(
          (max, p) => (typeof p.order === 'number' && p.order > max ? p.order : max),
          -1
        ) + 1;
      const ref = await createProject(
        {
          brand: brand.name,
          // Pins the project to this brand's checklist. Without it the ticked
          // boxes would be read against whichever brand the free-text name
          // happened to match.
          brandKey,
          name: 'New Location',
          fields: {},
          order: nextOrder,
        },
        user
      );
      onSelect(ref.id);
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <button className="back-link" onClick={onBack}>
        &larr; All Brands
      </button>
      <div className="brand-head">
        <h2>{brand.name}</h2>
        {template.isEmpty && (
          <span className="brand-warn">Checklist not loaded yet</span>
        )}
      </div>

      <div className="stat-row">
        <div className="stat-card"><div className="num">{stats.total}</div><div className="lbl">Active Projects</div></div>
        {stats.phases.map((s) => (
          <div className="stat-card" key={s.phase}>
            <div className="num">{s.value}%</div>
            <div className="lbl">{s.phase}</div>
          </div>
        ))}
        <div className="stat-card"><div className="num">{stats.started}</div><div className="lbl">With Progress Logged</div></div>
        <div className="stat-card"><div className="num">{stats.completed}</div><div className="lbl">Completed Stores</div></div>
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
        {[
          ['all', 'All'],
          ...template.phases.map((phase, i) => [phaseKey(phase, i), phase]),
          ['done', 'Open/Complete'],
        ].map(
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
          <span>Real Estate <b>{pct(re)}%</b></span>
          <span>Pre-Con <b>{pct(pc)}%</b></span>
          <span>Construction <b>{pct(co)}%</b></span>
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
