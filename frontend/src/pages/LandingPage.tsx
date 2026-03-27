import {
  ArrowRightIcon,
  BarChart3Icon,
  CheckCircleIcon,
  Code2Icon,
  FileTextIcon,
  FlagIcon,
  Github,
  GlobeIcon,
  LayersIcon,
  LockIcon,
  PlayIcon,
  RocketIcon,
  ServerIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
  ZapIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '@/components/ThemeToggle'

const features = [
  {
    name: 'Real-time Feature Toggles',
    description:
      'Enable or disable features instantly across all your applications without redeploying. Reduce risk and ship faster.',
    icon: ZapIcon,
  },
  {
    name: 'Multi-Environment Support',
    description:
      'Seamlessly manage Dev, Staging, and Production environments. Sync flags or keep them isolated per environment.',
    icon: LayersIcon,
  },
  {
    name: 'Granular Targeting',
    description:
      'Target specific users, groups, or segments. Support for percentages, user attributes, and custom rules.',
    icon: UsersIcon,
  },
  {
    name: 'Enterprise Security',
    description:
      'Role-based access control with Owner, Admin, Member, and Viewer roles. Secure API keys for every use case.',
    icon: LockIcon,
  },
  {
    name: 'Complete Audit Trail',
    description:
      'Track every change with detailed audit logs. Know who changed what, when, and why.',
    icon: BarChart3Icon,
  },
  {
    name: 'Multi-Tenant Architecture',
    description:
      'Built-in Organizations and Brands support. Perfect for SaaS companies and enterprise deployments.',
    icon: ShieldCheckIcon,
  },
]

const highlights = [
  { label: 'Self-Hosted', desc: 'Your data stays with you' },
  { label: 'Open Source', desc: 'MIT Licensed on GitHub' },
  { label: 'Lightning Fast', desc: '< 1ms local evaluation' },
  { label: 'Unlimited', desc: 'No usage limits' },
]

const codeExamples = {
  react: `import { 
  TogglelyProvider, 
  useToggle, 
  useStringToggle,
  useTogglelyState,
  useTogglelyContext 
} from '@togglely/sdk-react';

// Wrap your app with the provider
function App() {
  return (
    <TogglelyProvider
      apiKey={process.env.REACT_APP_TOGGLELY_KEY}
      environment="production"
      baseUrl="https://api.togglely.de"
    >
      <Dashboard />
    </TogglelyProvider>
  );
}

// Use hooks in your components
function Dashboard() {
  // Boolean toggle with default fallback
  const newDashboard = useToggle('new-dashboard', false);
  
  // String toggle
  const theme = useStringToggle('theme', 'light');
  
  // Number and JSON toggles also available
  const limit = useNumberToggle('max-items', 10);
  const config = useJSONToggle('ui-config', {});
  
  // Access ready/offline state
  const { isReady, isOffline } = useTogglelyState();
  
  // Set user context for targeting
  const { setContext } = useTogglelyContext();
  
  useEffect(() => {
    setContext({ userId: currentUser.id, plan: currentUser.plan });
  }, []);

  if (!isReady) return <div>Loading...</div>;
  return newDashboard ? <NewDashboard theme={theme} /> : <OldDashboard />;
}

// Or use the FeatureToggle component
import { FeatureToggle } from '@togglely/sdk-react';

<FeatureToggle toggle="new-dashboard" fallback={<OldDashboard />}>
  <NewDashboard />
</FeatureToggle>`,

  vue: `// main.js - Plugin setup
import { createApp } from 'vue';
import { createTogglely } from '@togglely/sdk-vue';
import App from './App.vue';

const app = createApp(App);

app.use(createTogglely({
  apiKey: import.meta.env.VITE_TOGGLELY_KEY,
  environment: 'production',
  baseUrl: 'https://api.togglely.de'
}));

app.mount('#app');

// In your component
<script setup>
import { 
  useToggle, 
  useStringToggle,
  useToggles, 
  useTogglelyState,
  useTogglelyContext 
} from '@togglely/sdk-vue';

// Returns Ref<boolean> - access with .value in script
const newDashboard = useToggle('new-dashboard', false);
const theme = useStringToggle('theme', 'light');

// Get all toggles as readonly ref
const allToggles = useToggles();

// State is readonly ref
const state = useTogglelyState();

// Set context for targeting
const { setContext } = useTogglelyContext();
setContext({ userId: currentUser.id, plan: currentUser.plan });
</script>

<template>
  <!-- Refs auto-unwrapped in template -->
  <div v-if="!state.isReady">Loading...</div>
  <NewDashboard 
    v-else-if="newDashboard" 
    :theme="theme"
  />
  <OldDashboard v-else />
</template>`,

  svelte: `<!-- main.js -->
<script>
  import { initTogglely } from '@togglely/sdk-svelte';
  
  initTogglely({
    apiKey: import.meta.env.VITE_TOGGLELY_KEY,
    environment: 'production',
    baseUrl: 'https://api.togglely.de'
  });
</script>

<!-- Any component -->
<script>
  import { 
    toggle,           // Store for boolean
    stringToggle,     // Store for string
    toggles,          // Store for all toggles
    togglelyState,    // Store for state
    setTogglelyContext 
  } from '@togglely/sdk-svelte';
  
  // Create stores (reactive with $ prefix)
  const newDashboard = toggle('new-dashboard', false);
  const theme = stringToggle('theme', 'light');
  const state = togglelyState();
  
  // Set user context for targeting
  setTogglelyContext({ 
    userId: $user.id, 
    plan: $user.plan 
  });
</script>

{#if !$state.isReady}
  <div>Loading toggles...</div>
{:else if $newDashboard}
  <NewDashboard theme={$theme} />
{:else}
  <OldDashboard />
{/if}

<!-- Or use the featureToggle action -->
<script>
  import { featureToggle } from '@togglely/sdk-svelte';
</script>

<div use:featureToggle={'beta-banner'}>
  Beta Feature
</div>`,

  vanilla: `import { TogglelyClient } from '@togglely/sdk-core';

const client = new TogglelyClient({
  apiKey: process.env.TOGGLELY_API_KEY,
  project: 'my-app',
  environment: 'production',
  baseUrl: 'https://api.togglely.de',
  // Optional: enable offline fallback
  offlineFallback: true,
  offlineJsonPath: '/toggles.json'
});

// Initialize (fetches flags from API)
await client.init();

// Check if feature is enabled (boolean)
const isEnabled = await client.isEnabled('new-dashboard', false);

// Get typed values
const theme = await client.getString('theme', 'light');
const limit = await client.getNumber('max-items', 10);
const config = await client.getJSON('ui-config', {});

// With user context for targeting
const hasAccess = await client.isEnabled('premium-feature', false, {
  userId: 'user-123',
  email: 'user@example.com',
  plan: 'premium',
  region: 'eu'
});

// Listen for real-time updates
client.on('update', () => {
  console.log('Toggles updated at:', client.getState().lastFetch);
});`,
}

export default function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [activeFramework, setActiveFramework] = useState<
    'react' | 'vue' | 'svelte' | 'vanilla'
  >('react')

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const frameworkTabs = [
    { key: 'react' as const, label: 'React', color: 'text-blue-400' },
    { key: 'vue' as const, label: 'Vue', color: 'text-green-400' },
    { key: 'svelte' as const, label: 'Svelte', color: 'text-orange-400' },
    { key: 'vanilla' as const, label: 'Vanilla JS', color: 'text-yellow-400' },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-background/80 backdrop-blur-lg border-b border-border shadow-sm'
            : 'bg-transparent'
        }`}
      >
        <nav className="flex items-center justify-between px-6 lg:px-8 h-16 max-w-7xl mx-auto">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 group-hover:scale-105 transition-transform">
              <FlagIcon className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">Togglely</span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link
              to="#features"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Features
            </Link>
            <Link
              to="/docs"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Documentation
            </Link>
            <a
              href="https://github.com/nuvooo/togglely"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </a>
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link
              to="/login"
              className="hidden sm:block text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Get Started
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-primary/20 via-primary/5 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-gradient-to-t from-purple-500/10 to-transparent rounded-full blur-3xl" />
        </div>

        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            {/* Badge */}
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5">
              <SparklesIcon className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">
                Open Source Feature Flags
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-foreground">
              Ship features with{' '}
              <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                confidence
              </span>
            </h1>

            <p className="mt-6 text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Deploy faster and safer with Togglely. The open-source feature
              flag platform built for teams that ship. Control releases, run
              experiments, and manage complexity.
            </p>

            {/* CTA Buttons */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/register"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 text-base font-semibold text-primary-foreground hover:bg-primary/90 transition-all hover:scale-105"
              >
                <RocketIcon className="h-5 w-5" />
                Start Free — No Credit Card
              </Link>
              <Link
                to="/login?demo=true"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-muted px-8 py-4 text-base font-semibold text-foreground hover:bg-muted/80 transition-all"
              >
                <PlayIcon className="h-5 w-5" />
                Try Live Demo
              </Link>
            </div>

            {/* Highlights */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-sm">
              {highlights.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <CheckCircleIcon className="h-5 w-5 text-green-500" />
                  <span className="font-medium">{item.label}</span>
                  <span className="text-muted-foreground">· {item.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Code Preview */}
          <div className="mt-20 relative mx-auto max-w-4xl">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-purple-600 rounded-2xl blur opacity-30" />
            <div className="relative rounded-2xl bg-gray-950 border border-gray-800 shadow-2xl overflow-hidden">
              {/* Tabs */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/50">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500" />
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                </div>
                <div className="flex gap-1">
                  {frameworkTabs.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveFramework(tab.key)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        activeFramework === tab.key
                          ? 'bg-gray-800 text-white'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      <span
                        className={activeFramework === tab.key ? tab.color : ''}
                      >
                        {tab.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-6 overflow-x-auto">
                <pre className="text-sm leading-relaxed text-gray-300 font-mono">
                  <code>{codeExamples[activeFramework]}</code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Logos/Trust Section */}
      <section className="border-y border-border/50 bg-muted/30 py-12">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <p className="text-center text-sm font-medium text-muted-foreground uppercase tracking-wider mb-8">
            Built for modern development teams
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center justify-items-center opacity-60">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ServerIcon className="h-6 w-6" />
              <span className="font-semibold">Self-Hosted</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Code2Icon className="h-6 w-6" />
              <span className="font-semibold">TypeScript</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <GlobeIcon className="h-6 w-6" />
              <span className="font-semibold">REST API</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <ShieldCheckIcon className="h-6 w-6" />
              <span className="font-semibold">Enterprise Ready</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-base font-semibold leading-7 text-primary uppercase tracking-wide">
              Features
            </h2>
            <p className="mt-2 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Everything you need to ship
            </p>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              Togglely provides a complete feature flag solution with
              multi-tenancy, environments, targeting, and audit trails — all in
              one platform.
            </p>
          </div>

          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
            <div className="grid grid-cols-1 gap-x-8 gap-y-12 lg:grid-cols-3">
              {features.map((feature) => (
                <div key={feature.name} className="flex flex-col group">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mt-6 text-lg font-semibold leading-8 text-foreground">
                    {feature.name}
                  </h3>
                  <p className="mt-2 flex-1 text-base leading-7 text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-24 bg-muted/30">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Three steps to feature freedom
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Create',
                desc: 'Set up your organization and create feature flags with our intuitive dashboard.',
              },
              {
                step: '02',
                title: 'Integrate',
                desc: 'Install our lightweight SDK or use the REST API to check flags in your code.',
              },
              {
                step: '03',
                title: 'Control',
                desc: 'Toggle features instantly, target specific users, and roll out with confidence.',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="relative p-8 rounded-2xl bg-card border border-border"
              >
                <span className="text-5xl font-bold text-primary/20">
                  {item.step}
                </span>
                <h3 className="mt-4 text-xl font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-y-16 lg:grid-cols-2 lg:gap-x-16 items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Built for scale, designed for developers
              </h2>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                Whether you are a solo developer or an enterprise team, Togglely
                scales with you. Local evaluation means zero latency, and our
                architecture handles millions of requests.
              </p>

              <div className="mt-10 grid grid-cols-2 gap-8">
                <div>
                  <div className="text-4xl font-bold text-primary">
                    {'< 1ms'}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Evaluation Time
                  </div>
                </div>
                <div>
                  <div className="text-4xl font-bold text-primary">99.9%</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Uptime SLA
                  </div>
                </div>
                <div>
                  <div className="text-4xl font-bold text-primary">
                    Unlimited
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Feature Flags
                  </div>
                </div>
                <div>
                  <div className="text-4xl font-bold text-primary">0</div>
                  <div className="mt-1 text-sm text-muted-foreground">Cost</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-gray-950 p-8 text-gray-300">
              <h3 className="text-white font-semibold mb-4">
                Why developers choose Togglely
              </h3>
              <ul className="space-y-4">
                {[
                  'Self-hosted — your data never leaves your infrastructure',
                  'Open source — fully auditable and customizable',
                  'Offline support — SDK works without internet connection',
                  'Role-based access — fine-grained permissions',
                  'Audit logging — complete history of changes',
                  'No vendor lock-in — export your data anytime',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-b from-primary/80 to-primary px-6 py-16 text-center sm:px-16">
            <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to ship with confidence?
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-primary-foreground/80">
              Get started in minutes with Docker, or try our live demo to see
              Togglely in action.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/register"
                className="w-full sm:w-auto rounded-xl bg-white px-8 py-4 text-base font-semibold text-gray-900 hover:bg-gray-100 transition-colors"
              >
                Get Started Free
              </Link>
              <Link
                to="/docs"
                className="w-full sm:w-auto rounded-xl bg-white/10 px-8 py-4 text-base font-semibold text-white hover:bg-white/20 transition-colors backdrop-blur"
              >
                <FileTextIcon className="inline h-5 w-5 mr-2" />
                Read Docs
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
                  <FlagIcon className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="text-xl font-bold">Togglely</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground max-w-sm">
                The open-source feature flag management platform. Deploy with
                confidence, control with precision. Built for modern development
                teams.
              </p>
              <div className="mt-6 flex gap-4">
                <a
                  href="https://github.com/nuvooo/togglely"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Github className="h-6 w-6" />
                </a>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Product</h3>
              <ul className="mt-4 space-y-3">
                <li>
                  <Link
                    to="/docs"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Documentation
                  </Link>
                </li>
                <li>
                  <Link
                    to="/login?demo=true"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Live Demo
                  </Link>
                </li>
                <li>
                  <Link
                    to="/register"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Get Started
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Resources
              </h3>
              <ul className="mt-4 space-y-3">
                <li>
                  <a
                    href="https://github.com/nuvooo/togglely"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    GitHub
                  </a>
                </li>
                <li>
                  <Link
                    to="/docs/api"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    API Reference
                  </Link>
                </li>
                <li>
                  <Link
                    to="/docs/sdks"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    SDKs
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 border-t border-border pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} Togglely. Open source under MIT
              License.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
