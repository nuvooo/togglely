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

const AccountPage = lazy(() => import('./pages/account/AccountPage'))
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPasswordPage'))
const InviteAccept = lazy(() => import('./pages/auth/InviteAcceptPage'))
const Login = lazy(() => import('./pages/auth/LoginPage'))
const OverviewPage = lazy(() => import('./pages/overview/OverviewPage'))
const ApiKeysPage = lazy(() => import('./pages/orgs/api-keys/ApiKeysPage'))
const AuditLogPage = lazy(() => import('./pages/orgs/audit-log/AuditLogPage'))
const CreateOrgPage = lazy(() => import('./pages/orgs/new/CreateOrgPage'))
const OrgListPage = lazy(() => import('./pages/orgs/list/OrgListPage'))
const OrgMembersPage = lazy(() => import('./pages/orgs/members/OrgMembersPage'))
const OrgProjectsPage = lazy(() => import('./pages/orgs/projects/OrgProjectsPage'))
const OrgSettingsPage = lazy(() => import('./pages/orgs/settings/OrgSettingsPage'))
const ProjectPicker = lazy(() => import('./pages/ProjectPicker'))
const FlagsPage = lazy(() => import('./pages/projects/flags/FlagsPage'))
const FlagDetailPage = lazy(() => import('./pages/projects/flags/detail/FlagDetailPage'))
const EnvironmentsPage = lazy(() => import('./pages/projects/environments/EnvironmentsPage'))
const BrandsPage = lazy(() => import('./pages/projects/brands/BrandsPage'))
const BrandDetailPage = lazy(() => import('./pages/projects/brands/BrandDetailPage'))
const SdkTesterPage = lazy(() => import('./pages/projects/sdk/SdkTesterPage'))
const ProjectSettingsPage = lazy(() => import('./pages/projects/settings/ProjectSettingsPage'))
const Webhooks = lazy(() => import('./pages/projects/Webhooks'))
const WebhookDetail = lazy(() => import('./pages/projects/WebhookDetail'))
const ResendVerification = lazy(() => import('./pages/auth/ResendVerificationPage'))
const ResetPassword = lazy(() => import('./pages/auth/ResetPasswordPage'))
const ExperimentsList = lazy(() => import('./pages/experiments/ExperimentsList'))
const CreateExperiment = lazy(() => import('./pages/experiments/CreateExperiment'))
const ExperimentDetail = lazy(() => import('./pages/experiments/ExperimentDetail'))
const Setup = lazy(() => import('./pages/auth/SetupPage'))
const VerifyEmail = lazy(() => import('./pages/auth/VerifyEmailPage'))

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
        <Route path="overview" element={<OverviewPage />} />
        <Route path="projects" element={<ProjectPicker />} />

        {/* Project area */}
        <Route path="projects/:projectId">
          <Route index element={<ParamRedirect to="/projects/:projectId/flags" />} />
          <Route path="flags" element={<FlagsPage />} />
          <Route path="flags/:flagId" element={<FlagDetailPage />} />
          <Route path="experiments" element={<ExperimentsList />} />
          <Route path="experiments/new" element={<CreateExperiment />} />
          <Route path="experiments/:id" element={<ExperimentDetail />} />
          <Route path="environments" element={<EnvironmentsPage />} />
          <Route path="brands" element={<BrandsPage />} />
          <Route path="brands/:brandId" element={<BrandDetailPage />} />
          <Route path="sdk" element={<SdkTesterPage />} />
          <Route path="webhooks" element={<Webhooks />} />
          <Route path="webhooks/:webhookId" element={<WebhookDetail />} />
          <Route path="settings" element={<ProjectSettingsPage />} />
        </Route>

        {/* Organization area */}
        <Route path="orgs" element={<OrgListPage />} />
        <Route path="orgs/new" element={<CreateOrgPage />} />
        <Route path="orgs/:orgId">
          <Route index element={<ParamRedirect to="/orgs/:orgId/projects" />} />
          <Route path="projects" element={<OrgProjectsPage />} />
          <Route path="members" element={<OrgMembersPage />} />
          <Route path="api-keys" element={<ApiKeysPage />} />
          <Route path="audit-log" element={<AuditLogPage />} />
          <Route path="settings" element={<OrgSettingsPage />} />
        </Route>

        <Route path="account" element={<AccountPage />} />

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
