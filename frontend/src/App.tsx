import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import LandingPage from './pages/LandingPage';
import Docs from './pages/Docs';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import OrganizationList from './pages/organizations/OrganizationList';
import OrganizationDetail from './pages/organizations/OrganizationDetail';
import OrganizationSettings from './pages/organizations/OrganizationSettings';
import OrganizationMembers from './pages/organizations/OrganizationMembers';
import CreateOrganization from './pages/organizations/CreateOrganization';
import ProjectDetail from './pages/ProjectDetail';
import ProjectSettings from './pages/projects/ProjectSettings';
import BrandFlags from './pages/projects/BrandFlags';
import FeatureFlags from './pages/FeatureFlags';
import FeatureFlagDetail from './pages/FeatureFlagDetail';
import SDKTester from './pages/SDKTester';
import ApiKeys from './pages/ApiKeys';
import Settings from './pages/Settings';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  const { token } = useAuthStore();

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={token ? <Navigate to="/dashboard" /> : <LandingPage />} />
      <Route path="/login" element={!token ? <Login /> : <Navigate to="/dashboard" />} />
      <Route path="/register" element={!token ? <Register /> : <Navigate to="/dashboard" />} />
      <Route path="/forgot-password" element={!token ? <ForgotPassword /> : <Navigate to="/dashboard" />} />
      <Route path="/reset-password" element={!token ? <ResetPassword /> : <Navigate to="/dashboard" />} />
      <Route path="/docs" element={<Docs />} />
      <Route path="/docs/*" element={<Docs />} />
      
      {/* Protected Routes */}
      <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route path="dashboard" element={<Dashboard />} />
        
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
        <Route path="projects/:projectId/brands/:brandId/flags" element={<BrandFlags />} />
        
        {/* Feature Flags */}
        <Route path="feature-flags" element={<FeatureFlags />} />
        <Route path="feature-flags/:id" element={<FeatureFlagDetail />} />
        <Route path="sdk-tester" element={<SDKTester />} />
        
        {/* API Keys */}
        <Route path="api-keys" element={<ApiKeys />} />
        
        {/* Settings */}
        <Route path="settings" element={<Settings />} />
        
        {/* Catch all - redirect to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Route>
    </Routes>
  );
}

export default App;
