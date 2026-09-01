import { useState } from 'react';
import {
  HEADERS,
  PHASES,
  PHASE_COLOR,
  headersByPhase,
  notesHeaders,
  checkboxCountByPhase,
  phaseProgress,
  pct,
} from '../lib/helpers';
import { updateProjectField, updateProjectMeta, deleteProject, useTasks } from '../lib/firestore';
import TaskList from './TaskList';
import { useAuth } from '../context/AuthContext';

const QUICK_LETTERS = ['C', 'F', 'T', 'U', 'X', 'AA', 'DF', 'GM'];

export default function ProjectDetail({ project, onBack, onAddTask }) {
  const { user, canEdit, isAdmin } = useAuth();
  const { data: allTasks } = useTasks();
  const [openPhase, setOpenPhase] = useState('Real Estate');
  const [name, setName] = useState(project.name || '');
  const [brand, setBrand] = useState(project.brand || '');

  if (!project) return null;

  const fields = project.fields || {};

  async function commitMeta(patch) {
    if (!canEdit) return;
    await updateProjectMeta(project.id, patch, user);
  }

  async function toggleField(letter, checked) {
    if (!canEdit) return;
    const header = HEADERS.find((h) => h.letter === letter);
    await updateProjectField(project.id, letter, checked, user, {
      projectName: project.name || project.brand || '',
      label: header?.label || letter,
      phase: header?.phase || '',
    });
  }

  async function commitText(letter, value) {
    if (!canEdit) return;
    await updateProjectField(project.id, letter, value, user);
  }

  async function handleDelete() {
    if (!isAdmin) return;
    if (confirm('Delete this project? This cannot be undone.')) {
      await deleteProject(project.id);
      onBack();
    }
  }

  const quick = QUICK_LETTERS.map((letter) => {
    const h = headersByPhase['Real Estate']
      .concat(headersByPhase['Pre-Construction'], headersByPhase['Construction/Ops'])
      .find((hh) => hh.letter === letter);
    if (!h || h.type === 'checkbox') return null;
    return (
      <div className="qf-item" key={letter}>
        <label>{h.label}</label>
        <textarea
          rows={2}
          defaultValue={fields[letter] || ''}
          disabled={!canEdit}
          onBlur={(e) => commitText(letter, e.target.value)}
        />
      </div>
    );
  });

  return (
    <>
      <button className="back-link" onClick={onBack}>
        &larr; All Projects
      </button>

      <div className="detail-head">
        <div className="titles">
          <div className="title-inputs">
            <input
              className="brand-input"
              value={brand}
              placeholder="Brand"
              disabled={!canEdit}
              onChange={(e) => setBrand(e.target.value)}
              onBlur={() => commitMeta({ brand })}
            />
            <input
              className="name-input"
              value={name}
              placeholder="Location name"
              disabled={!canEdit}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => commitMeta({ name })}
            />
          </div>
          <div className="detail-actions">
            {canEdit && (
              <button className="btn small" onClick={() => onAddTask(project.id)}>
                + Add Task
              </button>
            )}
            {canEdit && (
              <button
                className="btn ghost small"
                onClick={() => commitMeta({ completed: !project.completed })}
              >
                {project.completed ? 'Return to Pipeline' : 'Mark as Completed'}
              </button>
            )}
            {isAdmin && (
              <button className="btn danger small" onClick={handleDelete}>
                Delete Project
              </button>
            )}
          </div>
        </div>

        <div className="rails3">
          {PHASES.map((phase) => (
            <Rail3Row key={phase} phase={phase} value={phaseProgress(project, phase)} />
          ))}
        </div>

        <div className="quickfacts">{quick}</div>
        {project.updatedBy && (
          <div className="last-edited">Last edited by {project.updatedBy}</div>
        )}
      </div>

      <ProjectTasks projectId={project.id} tasks={allTasks} canEdit={canEdit} onAddTask={onAddTask} />

      {PHASES.map((phase) => (
        <Accordion
          key={phase}
          phase={phase}
          project={project}
          open={openPhase === phase}
          onToggle={() => setOpenPhase(openPhase === phase ? null : phase)}
          canEdit={canEdit}
          toggleField={toggleField}
          commitText={commitText}
        />
      ))}

      {notesHeaders.length > 0 && (
        <NotesAccordion
          project={project}
          open={openPhase === 'Notes/PSA'}
          onToggle={() => setOpenPhase(openPhase === 'Notes/PSA' ? null : 'Notes/PSA')}
          canEdit={canEdit}
          toggleField={toggleField}
          commitText={commitText}
        />
      )}
    </>
  );
}

function Rail3Row({ phase, value }) {
  return (
    <div className="rail3-row">
      <div className="lbl">{phase}</div>
      <div className="rail-track">
        <div className="fill" style={{ width: `${pct(value)}%`, background: PHASE_COLOR[phase] }} />
      </div>
      <div className="pct">{pct(value)}%</div>
    </div>
  );
}

function Accordion({ phase, project, open, onToggle, canEdit, toggleField, commitText }) {
  const hs = headersByPhase[phase];
  const prog = phaseProgress(project, phase);
  const fields = project.fields || {};
  const doneCount = hs.filter((h) => h.type === 'checkbox' && fields[h.letter] === true).length;
  const key = { 'Real Estate': 're', 'Pre-Construction': 'pc', 'Construction/Ops': 'co' }[phase];

  return (
    <div className={`accordion ${open ? 'open' : ''}`}>
      <div className="acc-head" onClick={onToggle}>
        <span className={`dot ${key}`} />
        <h3>{phase}</h3>
        <div className="track">
          <div className="fill" style={{ width: `${pct(prog)}%`, background: PHASE_COLOR[phase] }} />
        </div>
        <div className="pct">{doneCount}/{checkboxCountByPhase[phase]} done</div>
        <span className="chev">&#9656;</span>
      </div>
      <div className="acc-body">
        <div className="field-grid">
          {hs.map((h) =>
            h.type === 'checkbox' ? (
              <CheckField
                key={h.letter}
                h={h}
                checked={fields[h.letter] === true}
                disabled={!canEdit}
                onChange={(checked) => toggleField(h.letter, checked)}
              />
            ) : (
              <TextField
                key={h.letter}
                h={h}
                value={fields[h.letter]}
                disabled={!canEdit}
                onCommit={(v) => commitText(h.letter, v)}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}

function NotesAccordion({ project, open, onToggle, canEdit, toggleField, commitText }) {
  const fields = project.fields || {};
  return (
    <div className={`accordion ${open ? 'open' : ''}`}>
      <div className="acc-head" onClick={onToggle}>
        <span className="dot notes" />
        <h3>PSA / Notes</h3>
        <div className="track" />
        <div className="pct" />
        <span className="chev">&#9656;</span>
      </div>
      <div className="acc-body">
        <div className="field-grid">
          {notesHeaders.map((h) =>
            h.type === 'checkbox' ? (
              <CheckField
                key={h.letter}
                h={h}
                checked={fields[h.letter] === true}
                disabled={!canEdit}
                onChange={(checked) => toggleField(h.letter, checked)}
              />
            ) : (
              <TextField
                key={h.letter}
                h={h}
                value={fields[h.letter]}
                disabled={!canEdit}
                onCommit={(v) => commitText(h.letter, v)}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}

function CheckField({ h, checked, disabled, onChange }) {
  return (
    <div className="cb-field">
      <input
        type="checkbox"
        id={`fld-${h.letter}`}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={`fld-${h.letter}`}>
        {h.label}
        {h.resp ? <span className="resp-tag">({h.resp})</span> : null}
      </label>
    </div>
  );
}

function TextField({ h, value, disabled, onCommit }) {
  const [val, setVal] = useState(value || '');
  return (
    <div className="cb-field txt-field">
      <label>{h.label}</label>
      <textarea
        rows={1}
        value={val}
        disabled={disabled}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => onCommit(val)}
      />
    </div>
  );
}

const SHOW_DONE_KEY = 'pg1.projectTasks.showCompleted';

// Remembered across projects and visits: someone who wants to see completed
// tasks generally wants that everywhere, and having it reset on every project
// page would be the opposite of easier visibility. localStorage can throw in
// a private window, so every access is guarded.
function readShowDone() {
  try {
    return localStorage.getItem(SHOW_DONE_KEY) === 'true';
  } catch {
    return false;
  }
}

function ProjectTasks({ projectId, tasks, canEdit, onAddTask }) {
  const [showDone, setShowDone] = useState(readShowDone);

  const mine = tasks.filter((t) => t.projectId === projectId);
  const open = mine.filter((t) => !t.done);
  const done = mine.length - open.length;
  const visible = showDone ? mine : open;

  function toggle(next) {
    setShowDone(next);
    try {
      localStorage.setItem(SHOW_DONE_KEY, String(next));
    } catch {
      // Preference just won't persist; the toggle still works this session.
    }
  }

  return (
    <div className="accordion open project-tasks">
      <div className="acc-head" style={{ cursor: 'default' }}>
        <span className="dot notes" />
        <h3>Tasks</h3>
        <span className="task-count">{open.length} open</span>
        {done > 0 && <span className="task-count muted">{done} done</span>}
        <div style={{ flex: 1 }} />
        {done > 0 && (
          <label className="check-inline">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => toggle(e.target.checked)}
            />
            Show completed
          </label>
        )}
        {canEdit && (
          <button className="btn ghost small" onClick={() => onAddTask(projectId)}>
            + Add Task
          </button>
        )}
      </div>
      <div className="acc-body">
        <TaskList
          tasks={visible}
          showProject={false}
          emptyText={
            mine.length
              ? 'Nothing open — every task here is complete.'
              : 'No tasks yet for this project.'
          }
        />
      </div>
    </div>
  );
}
