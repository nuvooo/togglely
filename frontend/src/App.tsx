import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import ErrorBoundary from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'
import { LegacyFlagRedirect, ParamRedirect } from './components/routing/LegacyRedirects'
import { ProjectQueryBridge } from './components/routing/ProjectQueryBridge'
import AppShell from './components/shell/AppShell'
import { useAuthStore } from './store/authStore'

const ApiKeys = lazy(() => import('./pages/ApiKeys'))
const AuditLogs = lazy(() => import('./pages/AuditLogs'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const FeatureFlagDetail = lazy(() => import('./pages/FeatureFlagDetail'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const InviteAccept = lazy(() => import('./pages/InviteAccept'))
const Login = lazy(() => import('./pages/Login'))
const CreateOrganization = lazy(() => import('./pages/organizations/CreateOrganization'))
const OrganizationDetail = lazy(() => import('./pages/organizations/OrganizationDetail'))
const OrganizationList = lazy(() => import('./pages/organizations/OrganizationList'))
const OrganizationMembers = lazy(() => import('./pages/organizations/OrganizationMembers'))
const OrganizationSettings = lazy(() => import('./pages/organizations/OrganizationSettings'))
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'))
const BrandFlags = lazy(() => import('./pages/projects/BrandFlags'))
const ProjectSettings = lazy(() => import('./pages/projects/ProjectSettings'))
const Register = lazy(() => import('./pages/Register'))
const ResendVerification = lazy(() => import('./pages/ResendVerification'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const ExperimentsList = lazy(() => import('./pages/experiments/ExperimentsList'))
const CreateExperiment = lazy(() => import('./pages/experiments/CreateExperiment'))
const ExperimentDetail = lazy(() => import('./pages/experiments/ExperimentDetail'))
const SDKTester = lazy(() => import('./pages/SDKTester'))
const Settings = lazy(() => import('./pages/Settings'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))

function App() {
  const { token } = useAuthStore()

  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
      <Routes>
      {/* Public Routes */}
      <Route
        path="/"
        element={token ? <Navigate to="/overview" /> : <Navigate to="/login" />}
      />
      <Route
        path="/login"
        element={!token ? <Login /> : <Navigate to="/overview" />}
      />
      <Route
        path="/register"
        element={!token ? <Register /> : <Navigate to="/overview" />}
      />
      <Route
        path="/forgot-password"
        element={!token ? <ForgotPassword /> : <Navigate to="/overview" />}
      />
      <Route
        path="/reset-password"
        element={!token ? <ResetPassword /> : <Navigate to="/overview" />}
      />
      <Route path="/invite/:token" element={<InviteAccept />} />
      <Route path="/verify-email/:token" element={<VerifyEmail />} />
      <Route
        path="/resend-verification"
        element={!token ? <ResendVerification /> : <Navigate to="/overview" />}
      />
      {/* Protected Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="overview" element={<Dashboard />} />

        {/* Project area */}
        <Route path="projects/:projectId">
          <Route index element={<ParamRedirect to="/projects/:projectId/flags" />} />
          <Route path="flags" element={<ProjectDetail />} />
          <Route path="flags/:id" element={<FeatureFlagDetail />} />
          <Route path="experiments" element={<ProjectQueryBridge><ExperimentsList /></ProjectQueryBridge>} />
          <Route path="experiments/new" element={<ProjectQueryBridge><CreateExperiment /></ProjectQueryBridge>} />
          <Route path="experiments/:id" element={<ExperimentDetail />} />
          <Route path="environments" element={<ProjectSettings />} />
          <Route path="brands" element={<ProjectSettings />} />
          <Route path="brands/:brandId" element={<BrandFlags />} />
          <Route path="sdk" element={<SDKTester />} />
          <Route path="settings" element={<ProjectSettings />} />
        </Route>

        {/* Organization area */}
        <Route path="orgs" element={<OrganizationList />} />
        <Route path="orgs/new" element={<CreateOrganization />} />
        <Route path="orgs/:orgId">
          <Route index element={<ParamRedirect to="/orgs/:orgId/projects" />} />
          <Route path="projects" element={<OrganizationDetail />} />
          <Route path="members" element={<OrganizationMembers />} />
          <Route path="api-keys" element={<ApiKeys />} />
          <Route path="audit-log" element={<AuditLogs />} />
          <Route path="settings" element={<OrganizationSettings />} />
        </Route>

        <Route path="account" element={<Settings />} />

        {/* Legacy URLs (bookmarks, emails) */}
        <Route path="dashboard" element={<Navigate to="/overview" replace />} />
        <Route path="organizations" element={<Navigate to="/orgs" replace />} />
        <Route path="organizations/new" element={<Navigate to="/orgs/new" replace />} />
        <Route path="organizations/:orgId" element={<ParamRedirect to="/orgs/:orgId/projects" />} />
        <Route path="organizations/:orgId/settings" element={<ParamRedirect to="/orgs/:orgId/settings" />} />
        <Route path="organizations/:orgId/members" element={<ParamRedirect to="/orgs/:orgId/members" />} />
        <Route path="organizations/:orgId/projects/:projectId" element={<ParamRedirect to="/projects/:projectId/flags" />} />
        <Route path="projects/:projectId/brands/:brandId/flags" element={<ParamRedirect to="/projects/:projectId/brands/:brandId" />} />
        <Route path="feature-flags" element={<Navigate to="/overview" replace />} />
        <Route path="feature-flags/:id" element={<LegacyFlagRedirect />} />
        <Route path="experiments" element={<Navigate to="/overview" replace />} />
        <Route path="api-keys" element={<Navigate to="/orgs" replace />} />
        <Route path="sdk-tester" element={<Navigate to="/overview" replace />} />
        <Route path="settings" element={<Navigate to="/account" replace />} />

        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Route>
      </Routes>
      </Suspense>
      <Toaster richColors position="top-right" />
    </ErrorBoundary>
  )
}

export default App
