import { Navigate, Route, Routes } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import MainLayout from './components/layout/MainLayout'
import ProtectedRoute from './components/ProtectedRoute'
import ApiKeys from './pages/ApiKeys'
import Dashboard from './pages/Dashboard'
import Docs from './pages/Docs'
import FeatureFlagDetail from './pages/FeatureFlagDetail'
import FeatureFlags from './pages/FeatureFlags'
import ForgotPassword from './pages/ForgotPassword'
import InviteAccept from './pages/InviteAccept'
import LandingPage from './pages/LandingPage'
import Login from './pages/Login'
import CreateOrganization from './pages/organizations/CreateOrganization'
import OrganizationDetail from './pages/organizations/OrganizationDetail'
import OrganizationList from './pages/organizations/OrganizationList'
import OrganizationMembers from './pages/organizations/OrganizationMembers'
import OrganizationSettings from './pages/organizations/OrganizationSettings'
import ProjectDetail from './pages/ProjectDetail'
import BrandFlags from './pages/projects/BrandFlags'
import ProjectSettings from './pages/projects/ProjectSettings'
import Register from './pages/Register'
import ResendVerification from './pages/ResendVerification'
import ResetPassword from './pages/ResetPassword'
import SDKTester from './pages/SDKTester'
import Settings from './pages/Settings'
import VerifyEmail from './pages/VerifyEmail'
import { useAuthStore } from './store/authStore'

function App() {
  const { token } = useAuthStore()

  return (
    <ErrorBoundary>
      <Routes>
      {/* Public Routes */}
      <Route
        path="/"
        element={token ? <Navigate to="/dashboard" /> : <LandingPage />}
      />
      <Route
        path="/login"
        element={!token ? <Login /> : <Navigate to="/dashboard" />}
      />
      <Route
        path="/register"
        element={!token ? <Register /> : <Navigate to="/dashboard" />}
      />
      <Route
        path="/forgot-password"
        element={!token ? <ForgotPassword /> : <Navigate to="/dashboard" />}
      />
      <Route
        path="/reset-password"
        element={!token ? <ResetPassword /> : <Navigate to="/dashboard" />}
      />
      <Route path="/invite/:token" element={<InviteAccept />} />
      <Route path="/verify-email/:token" element={<VerifyEmail />} />
      <Route
        path="/resend-verification"
        element={!token ? <ResendVerification /> : <Navigate to="/dashboard" />}
      />
      <Route path="/docs" element={<Docs />} />
      <Route path="/docs/*" element={<Docs />} />

      {/* Protected Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<Dashboard />} />

        {/* Organizations */}
        <Route path="organizations" element={<OrganizationList />} />
        <Route path="organizations/new" element={<CreateOrganization />} />
        <Route path="organizations/:orgId" element={<OrganizationDetail />} />
        <Route
          path="organizations/:orgId/settings"
          element={<OrganizationSettings />}
        />
        <Route
          path="organizations/:orgId/members"
          element={<OrganizationMembers />}
        />

        {/* Projects - Note: Route with orgId and projectId */}
        <Route
          path="organizations/:orgId/projects/:projectId"
          element={<ProjectDetail />}
        />
        <Route path="projects/:projectId" element={<ProjectDetail />} />
        <Route
          path="projects/:projectId/settings"
          element={<ProjectSettings />}
        />
        <Route
          path="projects/:projectId/brands/:brandId/flags"
          element={<BrandFlags />}
        />

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
    </ErrorBoundary>
  )
}

export default App
