import { useState } from 'react';
import {
  PHASES,
  PHASE_COLOR,
  headersByPhase,
  notesHeaders,
  checkboxCountByPhase,
  phaseProgress,
  pct,
} from '../lib/helpers';
import { updateProjectField, updateProjectMeta, deleteProject } from '../lib/firestore';
import { useAuth } from '../context/AuthContext';

const QUICK_LETTERS = ['C', 'F', 'T', 'U', 'X', 'AA', 'DF', 'GM'];

export default function ProjectDetail({ project, onBack }) {
  const { user, canEdit, isAdmin } = useAuth();
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
    await updateProjectField(project.id, letter, checked, user);
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
