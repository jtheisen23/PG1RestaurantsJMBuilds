import { useMemo, useRef, useState } from 'react';
import {
  phaseProgress,
  overallProgress,
  currentStage,
  pct,
  phaseKey,
  phaseColor,
  phaseHasChecks,
  brandKeyFor,
  templateFor,
  templateForProject,
  BRAND_BY_KEY,
  tracksFor,
} from '../lib/helpers';
import { createProject, setProjectOrder } from '../lib/firestore';
import { useAuth } from '../context/AuthContext';
import { planReorder } from '../lib/reorder';

// Dragging a project up or down the list.
//
// Only the handle is draggable; the row stays a link into the project. The
// row is the drop target, and a drop lands the dragged project immediately
// above it.
//
// The dragged id is read back out of the drag payload rather than from
// state, because React has no obligation to have flushed a dragstart setState
// by the time the drop arrives -- state here is only for the styling.
function useRowDrag({ enabled, onCommit }) {
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const dragged = useRef(null);
  // Which list the drag started in. Open projects and completed stores are
  // two separate lists on the page, and dragging between them would mean
  // nothing -- a project's position comes from its order, not its section.
  const fromGroup = useRef(null);

  function reset() {
    dragged.current = null;
    fromGroup.current = null;
    setDragId(null);
    setOverId(null);
  }

  return function rowDrag(project, group) {
    if (!enabled) return {};
    return {
      dragging: dragId === project.id,
      dropTarget: overId === project.id && Boolean(dragId) && dragId !== project.id,
      grip: {
        draggable: true,
        onDragStart: (e) => {
          dragged.current = project.id;
          fromGroup.current = group;
          setDragId(project.id);
          e.dataTransfer.effectAllowed = 'move';
          try {
            // Firefox refuses to start a drag with no payload.
            e.dataTransfer.setData('text/plain', project.id);
          } catch {
            // Not fatal: the id is in the ref too.
          }
        },
        onDragEnd: reset,
      },
      zone: {
        onDragOver: (e) => {
          // Not calling preventDefault is what tells the browser this is not
          // a valid drop, so a cross-section drag shows "no entry".
          if (fromGroup.current !== group) return;
          e.preventDefault();
          if (overId !== project.id) setOverId(project.id);
        },
        onDrop: (e) => {
          e.preventDefault();
          const source = e.dataTransfer.getData('text/plain') || dragged.current;
          const sameList = fromGroup.current === group;
          reset();
          if (sameList) onCommit(source, project.id);
        },
      },
    };
  };
}

export default function Overview({
  projects: allProjects,
  brandKey,
  // Which of the brand's tracks is open. Equal to brandKey for a brand that
  // has only one, which is every brand but Jersey Mike's today.
  track,
  onSelectTrack,
  onSelect,
  onBack,
}) {
  const { user, canEdit } = useAuth();
  const brand = BRAND_BY_KEY[brandKey];
  // Empty unless the brand runs more than one kind of work, so no toggle
  // appears where there is nothing to toggle between.
  const tracks = tracksFor(brandKey);
  const trackBrand = BRAND_BY_KEY[track] || brand;
  const template = templateFor(track);

  // Only this track's projects, everywhere on the page -- the stat tiles
  // included, since averaging across checklists that measure different work
  // would not mean anything. New builds and acquisitions are as separate here
  // as two brands are.
  const projects = useMemo(
    () => allProjects.filter((p) => brandKeyFor(p) === track),
    [allProjects, track]
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
      // A phase no active project can tick has no percentage to report. The
      // rail already shows a dash for this; the tile said 100%, because a
      // phase with nothing outstanding counts as done. Same lie, bigger type.
      phases: template.phases.map((phase) => ({
        phase,
        value: active.some((p) => phaseHasChecks(p, phase))
          ? mean(active.reduce((sum, p) => sum + phaseProgress(p, phase), 0))
          : null,
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

  // Reordering a filtered list is not a question with an answer: dropping a
  // project above the one below it on screen says nothing about where it
  // belongs among the rows the filter is hiding. So the handles appear only
  // on the whole list.
  const searching = Boolean(search.trim()) || filter !== 'all';
  const canDrag = canEdit && !searching;

  const rowDrag = useRowDrag({
    enabled: canDrag,
    onCommit: (sourceId, targetId) =>
      // Planned against the track's full list rather than the rendered
      // section, so the saved order stays coherent across both of them.
      setProjectOrder(planReorder({ items: projects, sourceId, targetId })),
  });

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
          // Pins the project to this track's checklist. Without it the ticked
          // boxes would be read against whichever brand the free-text name
          // happened to match -- and an acquisition's would be read against
          // the new-build checklist, which is a different list entirely.
          brandKey: track,
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
          // Named, because the heading is the brand and the empty checklist
          // may belong to one of its tracks -- Jersey Mike's own list is
          // loaded even when Acquisitions' is not.
          <span className="brand-warn">
            {tracks.length ? `${trackBrand.trackName || trackBrand.name} ` : ''}checklist not
            loaded yet
          </span>
        )}
      </div>

      {tracks.length > 0 && (
        <div className="track-switch" role="tablist" aria-label={`${brand.name} project types`}>
          {tracks.map((t) => {
            const count = allProjects.filter(
              (p) => brandKeyFor(p) === t.key && !p.completed
            ).length;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={t.key === track}
                className={`track-tab ${t.key === track ? 'active' : ''}`}
                onClick={() => onSelectTrack(t.key)}
              >
                {t.trackName || t.name}
                <span className="track-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="stat-row">
        <div className="stat-card"><div className="num">{stats.total}</div><div className="lbl">Active Projects</div></div>
        {stats.phases.map((s) => (
          <div className="stat-card" key={s.phase}>
            <div className="num">{s.value === null ? '—' : `${s.value}%`}</div>
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

      {canEdit && searching && activeRows.length > 1 && (
        <div className="plist-hint">Clear the search and filter to drag projects into a new order.</div>
      )}

      <div className="plist">
        {activeRows.length ? (
          activeRows.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              onClick={() => onSelect(p.id)}
              drag={rowDrag(p, 'active')}
            />
          ))
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
              <ProjectRow
                key={p.id}
                project={p}
                onClick={() => onSelect(p.id)}
                drag={rowDrag(p, 'completed')}
              />
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

// Abbreviations for the rail, which has one narrow column per phase. Anything
// not listed falls back to its full name.
const RAIL_LABEL = {
  'Real Estate': 'Real Est',
  'Pre-Construction': 'Pre-Con',
  Construction: 'Const',
  Operations: 'Ops',
  'Post Opening': 'Post Open',
};

function ProjectRow({ project, onClick, drag = {} }) {
  const { grip, zone, dragging, dropTarget } = drag;
  // Driven by the project's own brand rather than a fixed three: the phases a
  // brand runs are data, and hardcoding them here is how the rail came to
  // disagree with the project page.
  const phases = templateForProject(project).phases;
  const progress = phases.map((p) => phaseProgress(project, p));
  const tickable = phases.map((p) => phaseHasChecks(project, p));
  const stage = currentStage(project);
  const overall = overallProgress(project);
  const addr = project.fields?.C || '';
  const width = `${100 / phases.length}%`;

  return (
    <div
      className={[
        'prow',
        grip ? 'draggable' : '',
        dragging ? 'dragging' : '',
        dropTarget ? 'drop-before' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      {...zone}
    >
      {grip && (
        <span
          className="prow-grip"
          title="Drag to reorder"
          aria-hidden="true"
          // Without this the mouse-up at the end of a drag opens the project.
          onClick={(e) => e.stopPropagation()}
          {...grip}
        >
          ⠿
        </span>
      )}
      <div>
        <div className="pname">{project.name || 'Unnamed Location'}</div>
        <div className="paddr">{addr || 'No address on file'}</div>
      </div>
      <div>
        <div
          className="rail"
          title={phases
            .map((p, i) => `${p} ${tickable[i] ? `${pct(progress[i])}%` : 'nothing to tick'}`)
            .join(' · ')}
        >
          {phases.map((p, i) => (
            <div
              key={p}
              className="seg"
              style={{
                width,
                background: phaseColor(p, i),
                opacity: tickable[i] ? 0.28 + 0.72 * progress[i] : 0.18,
              }}
            />
          ))}
        </div>
        <div className="rail-labels">
          {phases.map((p, i) => (
            <span key={p}>
              <i>{RAIL_LABEL[p] || p}</i>
              <b>{tickable[i] ? `${pct(progress[i])}%` : '—'}</b>
            </span>
          ))}
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
