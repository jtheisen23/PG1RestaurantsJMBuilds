import { useState } from 'react';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import TopBar from './components/TopBar';
import Overview from './components/Overview';
import ProjectDetail from './components/ProjectDetail';
import Contacts from './components/Contacts';
import ConstructionPlaybook from './components/ConstructionPlaybook';
import AdminPanel from './components/AdminPanel';
import { useProjects, useContacts, useTimeline } from './lib/firestore';

export default function App() {
  const { user, loading, isAdmin } = useAuth();
  const [view, setView] = useState('overview');
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const { data: projects, loading: loadingProjects } = useProjects();
  const { data: contacts } = useContacts();
  const { data: timeline } = useTimeline();

  if (loading) {
    return <div className="loading-screen">Loading…</div>;
  }

  if (!user) {
    return <Login />;
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

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div id="app">
      <TopBar view={view} onNav={handleNav} saving={loadingProjects} />
      <main>
        {view === 'overview' && <Overview projects={projects} onSelect={handleSelectProject} />}
        {view === 'detail' && selectedProject && (
          <ProjectDetail key={selectedProject.id} project={selectedProject} onBack={() => handleNav('overview')} />
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
        {view === 'admin' && isAdmin && <AdminPanel />}
      </main>
    </div>
  );
}
