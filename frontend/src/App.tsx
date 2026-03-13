import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import OrganizationList from './pages/organizations/OrganizationList';
import OrganizationDetail from './pages/organizations/OrganizationDetail';
import OrganizationSettings from './pages/organizations/OrganizationSettings';
import OrganizationMembers from './pages/organizations/OrganizationMembers';
import CreateOrganization from './pages/organizations/CreateOrganization';
import ProjectDetail from './pages/ProjectDetail';
import ProjectSettings from './pages/projects/ProjectSettings';
import ApiKeys from './pages/ApiKeys';
import Settings from './pages/Settings';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  const { token } = useAuthStore();

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={!token ? <Login /> : <Navigate to="/" />} />
      <Route path="/register" element={!token ? <Register /> : <Navigate to="/" />} />
      
      {/* Protected Routes */}
      <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        
        {/* Organizations */}
        <Route path="organizations" element={<OrganizationList />} />
        <Route path="organizations/new" element={<CreateOrganization />} />
        <Route path="organizations/:orgId" element={<OrganizationDetail />} />
        <Route path="organizations/:orgId/settings" element={<OrganizationSettings />} />
        <Route path="organizations/:orgId/members" element={<OrganizationMembers />} />
        
        {/* Projects - Note: Route with orgId and projectId */}
        <Route path="organizations/:orgId/projects/:projectId" element={<ProjectDetail />} />
        <Route path="projects/:projectId" element={<ProjectDetail />} />
        <Route path="projects/:projectId/settings" element={<ProjectSettings />} />
        
        {/* API Keys */}
        <Route path="api-keys" element={<ApiKeys />} />
        
        {/* Settings */}
        <Route path="settings" element={<Settings />} />
        
        {/* Catch all - redirect to dashboard */}
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  );
}

export default App;
