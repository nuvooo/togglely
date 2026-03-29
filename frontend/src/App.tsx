import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import ErrorBoundary from './components/ErrorBoundary'
import MainLayout from './components/layout/MainLayout'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuthStore } from './store/authStore'

const ApiKeys = lazy(() => import('./pages/ApiKeys'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Docs = lazy(() => import('./pages/Docs'))
const FeatureFlagDetail = lazy(() => import('./pages/FeatureFlagDetail'))
const FeatureFlags = lazy(() => import('./pages/flags'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const InviteAccept = lazy(() => import('./pages/InviteAccept'))
const LandingPage = lazy(() => import('./pages/LandingPage'))
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

        {/* Experiments */}
        <Route path="experiments" element={<ExperimentsList />} />
        <Route path="experiments/new" element={<CreateExperiment />} />
        <Route path="experiments/:id" element={<ExperimentDetail />} />

        <Route path="sdk-tester" element={<SDKTester />} />

        {/* API Keys */}
        <Route path="api-keys" element={<ApiKeys />} />

        {/* Settings */}
        <Route path="settings" element={<Settings />} />

        {/* Catch all - redirect to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Route>
      </Routes>
      </Suspense>
      <Toaster richColors position="top-right" />
    </ErrorBoundary>
  )
}

export default App
