import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import ErrorBoundary from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'
import {
  LegacyExperimentRedirect,
  LegacyExperimentsRedirect,
  LegacyFlagRedirect,
  ParamRedirect,
} from './components/routing/LegacyRedirects'
import { ProjectQueryBridge } from './components/routing/ProjectQueryBridge'
import {
  FullPageSpinner,
  GuestOnly,
  RequireMail,
  RequireSetupDone,
  SetupRoute,
} from './components/routing/SetupGate'
import AppShell from './components/shell/AppShell'
import { ROUTES } from './lib/routes'
import { fetchSetupStatus } from './lib/setup'

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
const ProjectPicker = lazy(() => import('./pages/ProjectPicker'))
const BrandFlags = lazy(() => import('./pages/projects/BrandFlags'))
const ProjectSettings = lazy(() => import('./pages/projects/ProjectSettings'))
const ResendVerification = lazy(() => import('./pages/ResendVerification'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const ExperimentsList = lazy(() => import('./pages/experiments/ExperimentsList'))
const CreateExperiment = lazy(() => import('./pages/experiments/CreateExperiment'))
const ExperimentDetail = lazy(() => import('./pages/experiments/ExperimentDetail'))
const SDKTester = lazy(() => import('./pages/SDKTester'))
const Settings = lazy(() => import('./pages/Settings'))
const Setup = lazy(() => import('./pages/Setup'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))

// Start loading the setup status in parallel with the first route chunk.
fetchSetupStatus()

function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<FullPageSpinner />}>
      <Routes>
      {/* Public Routes. `/` itself is handled by the protected index route below:
          logged-out users are sent to /login by ProtectedRoute. While the
          instance is not set up, /login and / lead to /setup. */}
      <Route
        path="/setup"
        element={
          <SetupRoute>
            <Setup />
          </SetupRoute>
        }
      />
      <Route
        path="/login"
        element={
          <RequireSetupDone>
            <GuestOnly>
              <Login />
            </GuestOnly>
          </RequireSetupDone>
        }
      />
      {/* Registration is invite-only: new users join via /invite/:token */}
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route
        path="/forgot-password"
        element={
          <GuestOnly>
            <ForgotPassword />
          </GuestOnly>
        }
      />
      {/* Reset links come from mails, owners or the CLI: always reachable,
          also while logged in (the reset ends that session). */}
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/invite/:token" element={<InviteAccept />} />
      <Route path="/verify-email/:token" element={<VerifyEmail />} />
      <Route
        path="/resend-verification"
        element={
          <RequireMail>
            <GuestOnly>
              <ResendVerification />
            </GuestOnly>
          </RequireMail>
        }
      />
      {/* Protected Routes */}
      <Route
        path="/"
        element={
          <RequireSetupDone>
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          </RequireSetupDone>
        }
      >
        <Route index element={<Navigate to={ROUTES.overview} replace />} />
        <Route path="overview" element={<Dashboard />} />
        <Route path="projects" element={<ProjectPicker />} />

        {/* Project area */}
        <Route path="projects/:projectId">
          <Route index element={<ParamRedirect to="/projects/:projectId/flags" />} />
          <Route path="flags" element={<ProjectDetail />} />
          <Route path="flags/:flagId" element={<FeatureFlagDetail />} />
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
        <Route path="dashboard" element={<Navigate to={ROUTES.overview} replace />} />
        <Route path="organizations" element={<Navigate to={ROUTES.orgs} replace />} />
        <Route path="organizations/new" element={<Navigate to={ROUTES.newOrg} replace />} />
        <Route path="organizations/:orgId" element={<ParamRedirect to="/orgs/:orgId/projects" />} />
        <Route path="organizations/:orgId/settings" element={<ParamRedirect to="/orgs/:orgId/settings" />} />
        <Route path="organizations/:orgId/members" element={<ParamRedirect to="/orgs/:orgId/members" />} />
        <Route path="organizations/:orgId/projects/:projectId" element={<ParamRedirect to="/projects/:projectId/flags" />} />
        <Route path="projects/:projectId/brands/:brandId/flags" element={<ParamRedirect to="/projects/:projectId/brands/:brandId" />} />
        <Route path="feature-flags" element={<Navigate to={ROUTES.overview} replace />} />
        <Route path="feature-flags/:id" element={<LegacyFlagRedirect />} />
        <Route path="experiments" element={<LegacyExperimentsRedirect />} />
        <Route path="experiments/new" element={<LegacyExperimentsRedirect create />} />
        <Route path="experiments/:id" element={<LegacyExperimentRedirect />} />
        <Route path="api-keys" element={<Navigate to={ROUTES.orgs} replace />} />
        <Route path="sdk-tester" element={<Navigate to={ROUTES.overview} replace />} />
        <Route path="settings" element={<Navigate to={ROUTES.account} replace />} />

        <Route path="*" element={<Navigate to={ROUTES.overview} replace />} />
      </Route>
      </Routes>
      </Suspense>
      <Toaster richColors position="top-right" />
    </ErrorBoundary>
  )
}

export default App
