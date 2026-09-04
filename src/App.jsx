import { useState } from 'react';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import TopBar from './components/TopBar';
import Overview from './components/Overview';
import ProjectDetail from './components/ProjectDetail';
import Contacts from './components/Contacts';
import ConstructionPlaybook from './components/ConstructionPlaybook';
import AdminPanel from './components/AdminPanel';
import Activity from './components/Activity';
import Tasks from './components/Tasks';
import TaskDialog from './components/TaskDialog';
import { useProjects, useContacts, useTimeline } from './lib/firestore';

export default function App() {
  const { user, loading, isAdmin, notInvited, authError, logout } = useAuth();
  const [view, setView] = useState('overview');
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  // null = closed. { projectId, phase } opens a blank form with those
  // pre-filled; { task } opens the same form editing an existing task.
  const [taskDialog, setTaskDialog] = useState(null);

  const { data: projects, loading: loadingProjects } = useProjects();
  const { data: contacts } = useContacts();
  const { data: timeline } = useTimeline();

  if (loading) {
    return <div className="loading-screen">Loading…</div>;
  }

  if (!user) {
    return <Login />;
  }

  // Signed in, but something went wrong reading or creating the profile. Show
  // it plainly: silently rendering an empty dashboard makes a permissions
  // problem look like missing data.
  if (authError) {
    return (
      <div className="center-screen">
        <div className="login-card">
          <h2>Couldn't load your access</h2>
          <p className="sub">{authError}</p>
          <button className="btn" onClick={() => window.location.reload()} style={{ width: '100%' }}>
            Reload
          </button>
          <button
            className="btn ghost"
            onClick={logout}
            style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Authenticated, but nobody invited this address. Anyone can create an
  // account with the public API key, so this is the expected landing place for
  // someone who does -- and the rules give them no data either way.
  if (notInvited) {
    return (
      <div className="center-screen">
        <div className="login-card">
          <h2>You're not on this team yet</h2>
          <p className="sub">
            <strong>{user.email}</strong> doesn't have an invitation to this dashboard. Ask an
            admin to invite that address from the Team tab, then sign in again.
          </p>
          <button className="btn" onClick={logout} style={{ width: '100%', marginTop: 8 }}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  function handleNav(key) {
    if (key === 'admin' && !isAdmin) return;
    setView(key);
    if (key !== 'detail') setSelectedProjectId(null);
  }

  function handleSelectProject(id) {
    setSelectedProjectId(id);
    setView('detail');
  }

  function handleAddTask(projectId, phase) {
    setTaskDialog({ projectId: projectId || '', phase: phase || '' });
  }

  function handleEditTask(task) {
    setTaskDialog({ task });
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div id="app">
      <TopBar view={view} onNav={handleNav} saving={loadingProjects} onAddTask={handleAddTask} />
      <main>
        {view === 'overview' && <Overview projects={projects} onSelect={handleSelectProject} />}
        {view === 'detail' && selectedProject && (
          <ProjectDetail
            key={selectedProject.id}
            project={selectedProject}
            onBack={() => handleNav('overview')}
            onAddTask={handleAddTask}
            onEditTask={handleEditTask}
          />
        )}
        {view === 'detail' && !selectedProject && !loadingProjects && (
          <div className="empty-state">
            <div className="big">Project not found</div>
            <button className="btn" onClick={() => handleNav('overview')} style={{ marginTop: 12 }}>
              Back to Projects
            </button>
          </div>
        )}
        {view === 'contacts' && <Contacts contacts={contacts} />}
        {view === 'construction' && <ConstructionPlaybook projects={projects} timeline={timeline} />}
        {view === 'tasks' && (
          <Tasks projects={projects} onAddTask={handleAddTask} onEditTask={handleEditTask} />
        )}
        {view === 'activity' && <Activity projects={projects} />}
        {view === 'admin' && isAdmin && <AdminPanel />}
      </main>
      {taskDialog && (
        <TaskDialog
          projects={projects}
          fixedProjectId={taskDialog.projectId}
          fixedPhase={taskDialog.phase}
          task={taskDialog.task}
          onClose={() => setTaskDialog(null)}
        />
      )}
    </div>
  );
}
