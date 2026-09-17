import { useRef, useState } from 'react';
import {
  phaseColor,
  phaseKey,
  phaseProgress,
  pct,
  templateForProject,
  hiddenFieldsOf,
  labelFor,
  brandKeyFor,
  BRAND_BY_KEY,
  visibleHeaders,
  removedHeaders,
  NOTES_PHASE,
} from '../lib/helpers';
import {
  updateProjectField,
  updateProjectMeta,
  deleteProject,
  setFieldHidden,
  deleteCustomField,
  setFieldOrder,
  useTasks,
} from '../lib/firestore';
import TaskList from './TaskList';
import FieldLabelDialog from './FieldLabelDialog';
import AddFieldDialog from './AddFieldDialog';
import { useAuth } from '../context/AuthContext';

const QUICK_LETTERS = ['C', 'F', 'T', 'U', 'X', 'AA', 'DF', 'GM'];

export default function ProjectDetail({ project, onBack, onAddTask, onEditTask, brandLabels }) {
  const { user, canEdit, isAdmin } = useAuth();
  const { data: allTasks } = useTasks();
  const [openPhase, setOpenPhase] = useState('Real Estate');
  const [name, setName] = useState(project.name || '');
  const [brand, setBrand] = useState(project.brand || '');

  if (!project) return null;

  // Which brand's checklist this project is filled in against. A column
  // letter means a different item in a different brand's spreadsheet, so
  // every lookup below goes through the project's own template.
  const tpl = templateForProject(project);
  const fields = project.fields || {};
  const hidden = hiddenFieldsOf(project);
  const [renaming, setRenaming] = useState(null);
  const [addingTo, setAddingTo] = useState(null);

  // What removing means depends on who owns the field. One added to this
  // project exists nowhere else, so it is really deleted. One from the brand --
  // or from the spreadsheet -- is on every project of that brand, so here it
  // can only be hidden.
  async function removeField(header) {
    if (!isAdmin) return;
    if (header.custom && header.owner === 'project') {
      if (
        !confirm(
          `Delete "${nameOf(header)}" from this project?\n\n` +
            'This field was added here, so deleting it also deletes whatever is in it. ' +
            'This cannot be undone.'
        )
      ) {
        return;
      }
      await deleteCustomField(project.id, header.letter, project.customFields, user);
      return;
    }
    await setHidden(header.letter, nameOf(header), true);
  }

  async function reorder(phase, keys) {
    if (!isAdmin) return;
    await setFieldOrder(project.id, phase, keys, user);
  }

  // Resolves the project's own wording, then the brand's, then the checklist
  // file. Passed down so every field renders the same way.
  const nameOf = (header) => labelFor(header, project, brandLabels);

  // Removing a checklist item affects only this project; the template it comes
  // from is shared by every project of the brand. The rules enforce admin-only
  // as well, so this is not the only thing standing between an editor and a
  // 200-column template.
  async function setHidden(letter, label, isHidden) {
    if (!isAdmin) return;
    if (
      isHidden &&
      !confirm(
        `Remove "${label}" from this project?\n\n` +
          `It disappears from this page and stops counting towards progress. ` +
          `Every other project keeps it. You can put it back afterwards.`
      )
    ) {
      return;
    }
    await setFieldHidden(project.id, letter, isHidden, project.hiddenFields, user);
  }

  async function commitMeta(patch) {
    if (!canEdit) return;
    // `brand` is the free-text label from the spreadsheet; `brandKey` is what
    // decides which checklist the ticked letters are read against. On a
    // project that pre-dates brands, pin the key to whatever it resolves to
    // now, so renaming the label cannot silently re-point 200 columns at a
    // different brand's checklist.
    const guard =
      'brand' in patch && !project.brandKey ? { brandKey: tpl.key } : null;
    await updateProjectMeta(project.id, guard ? { ...patch, ...guard } : patch, user);
  }

  async function toggleField(letter, checked) {
    if (!canEdit) return;
    const header = tpl.headers.find((h) => h.letter === letter);
    await updateProjectField(project.id, letter, checked, user, {
      projectName: project.name || project.brand || '',
      brandKey: tpl.key,
      label: header ? nameOf(header) : letter,
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
    const h = tpl.headers.find((hh) => hh.letter === letter && hh.phase);
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
          {tpl.phases.map((phase, i) => (
            <Rail3Row key={phase} phase={phase} index={i} value={phaseProgress(project, phase)} />
          ))}
        </div>

        <div className="quickfacts">{quick}</div>
        {project.updatedBy && (
          <div className="last-edited">Last edited by {project.updatedBy}</div>
        )}
      </div>

      <ProjectTasks
        projectId={project.id}
        tasks={allTasks}
        canEdit={canEdit}
        onAddTask={onAddTask}
        onEditTask={onEditTask}
      />

      {tpl.isEmpty && (
        <div className="acc-hint brand-empty">
          The {tpl.name} checklist has not been imported yet, so the phases below are empty. You
          can still raise tasks against a stage, and they will stay put once the checklist lands.
        </div>
      )}

      {tpl.phases.map((phase, i) => (
        <Accordion
          key={phase}
          phase={phase}
          index={i}
          project={project}
          template={tpl}
          open={openPhase === phase}
          onToggle={() => setOpenPhase(openPhase === phase ? null : phase)}
          canEdit={canEdit}
          toggleField={toggleField}
          commitText={commitText}
          tasks={allTasks.filter((t) => t.projectId === project.id && t.phase === phase)}
          onAddTask={onAddTask}
          onEditTask={onEditTask}
          isAdmin={isAdmin}
          hidden={hidden}
          onSetHidden={setHidden}
          nameOf={nameOf}
          onRename={setRenaming}
          onRemoveField={removeField}
          onAddField={() => setAddingTo(phase)}
          onReorder={reorder}
        />
      ))}

      {addingTo && (
        <AddFieldDialog
          project={project}
          phase={addingTo}
          brandKey={brandKeyFor(project)}
          brandName={BRAND_BY_KEY[brandKeyFor(project)]?.name || 'this brand'}
          onClose={() => setAddingTo(null)}
        />
      )}

      {renaming && (
        <FieldLabelDialog
          project={{ ...project, brandKeyResolved: brandKeyFor(project) }}
          header={renaming}
          brandName={BRAND_BY_KEY[brandKeyFor(project)]?.name || 'this brand'}
          original={nameOf(renaming)}
          onClose={() => setRenaming(null)}
        />
      )}

      {tpl.notesHeaders.length > 0 && (
        <NotesAccordion
          project={project}
          template={tpl}
          isAdmin={isAdmin}
          hidden={hidden}
          onSetHidden={setHidden}
          nameOf={nameOf}
          onRename={setRenaming}
          onRemoveField={removeField}
          onAddField={() => setAddingTo(NOTES_PHASE)}
          onReorder={reorder}
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

function Rail3Row({ phase, index, value }) {
  return (
    <div className="rail3-row">
      <div className="lbl">{phase}</div>
      <div className="rail-track">
        <div className="fill" style={{ width: `${pct(value)}%`, background: phaseColor(phase, index) }} />
      </div>
      <div className="pct">{pct(value)}%</div>
    </div>
  );
}

// Drag-to-reorder for a phase's fields. Shared by the phase sections and the
// notes section, which differ in everything except this.
function useFieldDrag(hs, phase, isAdmin, onReorder) {
  const [dragKey, setDragKey] = useState(null);
  const [overKey, setOverKey] = useState(null);
  // The drop handler must not depend on the state set by dragstart. React has
  // no obligation to have flushed it by the time the drop arrives, and the
  // browser is already carrying the answer: the key went into the drag payload
  // when the drag began. State is kept only for the styling.
  const dragged = useRef(null);

  // Dropping puts the dragged field immediately before the one under the
  // cursor. The new order is written over the phase's full list, not the
  // filtered one, so hiding completed items while dragging cannot quietly
  // drop them out of the saved order.
  function commitDrop(sourceKey, targetKey) {
    const from = hs.findIndex((h) => h.letter === sourceKey);
    const to = hs.findIndex((h) => h.letter === targetKey);
    setDragKey(null);
    setOverKey(null);
    if (from < 0 || to < 0 || from === to) return;
    const keys = hs.map((h) => h.letter);
    keys.splice(to, 0, keys.splice(from, 1)[0]);
    onReorder(phase, keys);
  }

  return function dragProps(h) {
    if (!isAdmin) return {};
    return {
      draggable: true,
      onDragStart: (e) => {
        dragged.current = h.letter;
        setDragKey(h.letter);
        e.dataTransfer.effectAllowed = 'move';
        // Firefox refuses to start a drag with no payload.
        try {
          e.dataTransfer.setData('text/plain', h.letter);
        } catch {
          // Not fatal: the key is already in state.
        }
      },
      onDragEnd: () => {
        dragged.current = null;
        setDragKey(null);
        setOverKey(null);
      },
      onDragOver: (e) => {
        e.preventDefault();
        if (overKey !== h.letter) setOverKey(h.letter);
      },
      onDrop: (e) => {
        e.preventDefault();
        const source = e.dataTransfer.getData('text/plain') || dragged.current;
        dragged.current = null;
        commitDrop(source, h.letter);
      },
      dragging: dragKey === h.letter,
      dropTarget: overKey === h.letter && Boolean(dragKey) && dragKey !== h.letter,
    };
  };
}

function Accordion({
  phase,
  index,
  project,
  template,
  open,
  onToggle,
  canEdit,
  toggleField,
  commitText,
  tasks,
  onAddTask,
  onEditTask,
  isAdmin,
  hidden,
  onSetHidden,
  nameOf,
  onRename,
  onRemoveField,
  onAddField,
  onReorder,
}) {
  // Both lists come from the project rather than the template, so added
  // fields appear inline with the brand's and the saved order applies.
  const hs = visibleHeaders(project, phase);
  const removed = removedHeaders(project, phase);
  const prog = phaseProgress(project, phase);
  const fields = project.fields || {};
  const doneCount = hs.filter((h) => h.type === 'checkbox' && fields[h.letter] === true).length;
  const checkboxTotal = hs.filter((h) => h.type === 'checkbox').length;
  const key = phaseKey(phase, index);

  const [hideDone, setHideDone] = useState(() => readHideDone(phase));
  const dragProps = useFieldDrag(hs, phase, isAdmin, onReorder);

  const openTasks = tasks.filter((t) => !t.done);

  // Only ticked checkboxes are hidden. Text and date fields are data entry
  // rather than progress -- there is no "completed" state to hide them by, and
  // dropping them would take the address and lease terms off the page.
  const visible = hideDone
    ? hs.filter((h) => !(h.type === 'checkbox' && fields[h.letter] === true))
    : hs;

  // The handler belongs on the input, not on the surrounding label. A label
  // forwards its click to the input, which bubbles back up, so a handler on the
  // label fires twice for one click -- and because React flushes the first
  // click before the second arrives, the second reads the already-updated state
  // and toggles it straight back, leaving the checkbox stuck. The label's own
  // onClick is only there to stop the click collapsing the accordion.
  function onHideDoneChange(e) {
    const next = e.target.checked;
    setHideDone(next);
    writeHideDone(phase, next);
  }

  return (
    <div className={`accordion ${open ? 'open' : ''}`}>
      <div className="acc-head" onClick={onToggle}>
        <span className={`dot ${key}`} />
        <h3>{phase}</h3>
        <div className="track">
          <div className="fill" style={{ width: `${pct(prog)}%`, background: phaseColor(phase, index) }} />
        </div>
        <div className="pct">{doneCount}/{checkboxTotal} done</div>
        {open && doneCount > 0 && (
          <label className="check-inline acc-filter" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={hideDone} onChange={onHideDoneChange} />
            Hide completed
          </label>
        )}
        {openTasks.length > 0 && (
          <span className="task-count" title="Open tasks in this stage">
            {openTasks.length} task{openTasks.length === 1 ? '' : 's'}
          </span>
        )}
        {open && isAdmin && (
          <button
            className="btn ghost small"
            onClick={(e) => {
              e.stopPropagation();
              onAddField();
            }}
          >
            + Add Field
          </button>
        )}
        {open && canEdit && (
          <button
            className="btn ghost small"
            onClick={(e) => {
              e.stopPropagation();
              onAddTask(project.id, phase);
            }}
          >
            + Add Task
          </button>
        )}
        <span className="chev">&#9656;</span>
      </div>
      <div className="acc-body">
        {hideDone && (
          <div className="acc-hint">
            Showing the {visible.filter((h) => h.type === 'checkbox').length} outstanding item
            {visible.filter((h) => h.type === 'checkbox').length === 1 ? '' : 's'} in this phase.{' '}
            {doneCount} completed {doneCount === 1 ? 'item is' : 'items are'} hidden.
          </div>
        )}
        {/* The checklist below is the same fixed template on every project, so
            it cannot be added to. Anything specific to this location and this
            stage goes here as a task instead. */}
        <div className="phase-tasks">
          <div className="phase-tasks-head">Tasks in this stage</div>
          <TaskList
            tasks={tasks}
            showProject={false}
            showPhase={false}
            onEdit={onEditTask}
            emptyText="Nothing raised against this stage yet."
          />
        </div>

        <div className="field-grid">
          {visible.map((h) =>
            h.type === 'checkbox' ? (
              <CheckField
                key={h.letter}
                h={h}
                checked={fields[h.letter] === true}
                disabled={!canEdit}
                onChange={(checked) => toggleField(h.letter, checked)}
                isAdmin={isAdmin}
                label={nameOf(h)}
                onRemove={() => onRemoveField(h)}
                onRename={() => onRename(h)}
                drag={dragProps(h)}
              />
            ) : (
              <TextField
                key={h.letter}
                h={h}
                value={fields[h.letter]}
                disabled={!canEdit}
                onCommit={(v) => commitText(h.letter, v)}
                isAdmin={isAdmin}
                label={nameOf(h)}
                onRemove={() => onRemoveField(h)}
                onRename={() => onRename(h)}
                drag={dragProps(h)}
              />
            )
          )}
        </div>

        {isAdmin && removed.length > 0 && (
          <RemovedList items={removed} onRestore={onSetHidden} nameOf={nameOf} />
        )}

      </div>
    </div>
  );
}

function NotesAccordion({
  project,
  open,
  onToggle,
  canEdit,
  toggleField,
  commitText,
  isAdmin,
  nameOf,
  onRename,
  onRemoveField,
  onAddField,
  onReorder,
}) {
  const fields = project.fields || {};
  const visible = visibleHeaders(project, NOTES_PHASE);
  const removed = removedHeaders(project, NOTES_PHASE);
  const dragProps = useFieldDrag(visible, NOTES_PHASE, isAdmin, onReorder);
  return (
    <div className={`accordion ${open ? 'open' : ''}`}>
      <div className="acc-head" onClick={onToggle}>
        <span className="dot notes" />
        <h3>PSA / Notes</h3>
        <div className="track" />
        <div className="pct" />
        {open && isAdmin && (
          <button
            className="btn ghost small"
            onClick={(e) => {
              e.stopPropagation();
              onAddField();
            }}
          >
            + Add Field
          </button>
        )}
        <span className="chev">&#9656;</span>
      </div>
      <div className="acc-body">
        <div className="field-grid">
          {visible.map((h) =>
            h.type === 'checkbox' ? (
              <CheckField
                key={h.letter}
                h={h}
                checked={fields[h.letter] === true}
                disabled={!canEdit}
                onChange={(checked) => toggleField(h.letter, checked)}
                isAdmin={isAdmin}
                label={nameOf(h)}
                onRemove={() => onRemoveField(h)}
                onRename={() => onRename(h)}
                drag={dragProps(h)}
              />
            ) : (
              <TextField
                key={h.letter}
                h={h}
                value={fields[h.letter]}
                disabled={!canEdit}
                onCommit={(v) => commitText(h.letter, v)}
                isAdmin={isAdmin}
                label={nameOf(h)}
                onRemove={() => onRemoveField(h)}
                onRename={() => onRename(h)}
                drag={dragProps(h)}
              />
            )
          )}
        </div>

        {isAdmin && removed.length > 0 && (
          <RemovedList items={removed} onRestore={onSetHidden} nameOf={nameOf} />
        )}
      </div>
    </div>
  );
}

function CheckField({ h, checked, disabled, onChange, isAdmin, label, onRemove, onRename, drag = {} }) {
  const reworded = label !== h.label;
  const { dragging, dropTarget, ...handlers } = drag;
  return (
    <div className={fieldClass(handlers.draggable, dragging, dropTarget)} {...handlers}>
      {isAdmin && <span className="fld-grip" aria-hidden="true">⠿</span>}
      <input
        type="checkbox"
        id={`fld-${h.letter}`}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={`fld-${h.letter}`} className={reworded ? 'label-edited' : undefined}>
        {label}
        {h.resp ? <span className="resp-tag">({h.resp})</span> : null}
        {h.custom && <span className="custom-tag">added</span>}
      </label>
      {isAdmin && (
        <FieldActions label={label} onRemove={onRemove} onRename={onRename} custom={h.custom} />
      )}
    </div>
  );
}

function fieldClass(draggable, dragging, dropTarget) {
  return [
    'cb-field',
    draggable ? 'draggable' : '',
    dragging ? 'dragging' : '',
    dropTarget ? 'drop-before' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

// Admin-only. "Remove" rather than "delete", because the shared checklist is
// not being edited -- this project's copy of it is. An added field is the
// exception: it exists only here, so its button really does delete it.
function FieldActions({ label, onRemove, onRename, custom }) {
  return (
    <span className="fld-actions">
      <button
        type="button"
        className="fld-edit"
        title={`Reword "${label}"`}
        aria-label={`Reword ${label}`}
        onClick={onRename}
      >
        Edit
      </button>
      <button
        type="button"
        className="fld-remove"
        title={custom ? `Delete "${label}"` : `Remove "${label}" from this project`}
        aria-label={custom ? `Delete ${label}` : `Remove ${label} from this project`}
        onClick={onRemove}
      >
        &times;
      </button>
    </span>
  );
}

// Restoring is deliberately tucked behind a toggle: it is a short list that
// only admins see, and it should not compete with the checklist itself.
function RemovedList({ items, onRestore, nameOf }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="removed-block">
      <button type="button" className="link-btn" onClick={() => setOpen(!open)}>
        {items.length} item{items.length === 1 ? '' : 's'} removed from this project
        {open ? ' — hide' : ' — show'}
      </button>
      {open && (
        <div className="removed-list">
          {items.map((h) => (
            <div className="removed-row" key={h.letter}>
              <span>{nameOf(h)}</span>
              <button
                type="button"
                className="link-btn"
                onClick={() => onRestore(h.letter, nameOf(h), false)}
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TextField({ h, value, disabled, onCommit, isAdmin, label, onRemove, onRename, drag = {} }) {
  const [val, setVal] = useState(value || '');
  const reworded = label !== h.label;
  const { dragging, dropTarget, ...handlers } = drag;
  return (
    <div className={`${fieldClass(handlers.draggable, dragging, dropTarget)} txt-field`} {...handlers}>
      <label className={reworded ? 'label-edited' : undefined}>
        {isAdmin && <span className="fld-grip" aria-hidden="true">⠿</span>}
        {label}
        {h.resp ? <span className="resp-tag">({h.resp})</span> : null}
        {h.custom && <span className="custom-tag">added</span>}
        {isAdmin && (
        <FieldActions label={label} onRemove={onRemove} onRename={onRename} custom={h.custom} />
      )}
      </label>
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
const HIDE_DONE_PREFIX = 'pg1.phase.hideCompleted.';

// Whether a phase is hiding its ticked items, remembered per phase. Someone
// working through Construction/Ops wants that section decluttered every time
// they come back, without affecting the phases they are still filling in.
function readHideDone(phase) {
  try {
    return localStorage.getItem(HIDE_DONE_PREFIX + phase) === 'true';
  } catch {
    return false;
  }
}

function writeHideDone(phase, value) {
  try {
    localStorage.setItem(HIDE_DONE_PREFIX + phase, String(value));
  } catch {
    // Preference just won't persist; the toggle still works this session.
  }
}

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

function ProjectTasks({ projectId, tasks, canEdit, onAddTask, onEditTask }) {
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
          onEdit={onEditTask}
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
