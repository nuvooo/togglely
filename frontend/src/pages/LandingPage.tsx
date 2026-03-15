import { Link } from 'react-router-dom';
import { 
  FlagIcon, 
  BoltIcon, 
  UsersIcon, 
  GlobeAltIcon, 
  KeyIcon, 
  ChartBarIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  PlayIcon
} from '@heroicons/react/24/outline';
import { ThemeToggle } from '@/components/ThemeToggle';

const features = [
  {
    name: 'Real-time Updates',
    description: 'Toggle features instantly across all your platforms without waiting for a new deployment.',
    icon: BoltIcon,
  },
  {
    name: 'Multi-Environment',
    description: 'Manage flags separately for Development, Staging, and Production environments.',
    icon: GlobeAltIcon,
  },
  {
    name: 'Advanced Targeting',
    description: 'Deliver the right features to the right users with flexible targeting rules and segments.',
    icon: UsersIcon,
  },
  {
    name: 'API Key Management',
    description: 'Securely connect your applications with dedicated Server, Client, and SDK keys.',
    icon: KeyIcon,
  },
  {
    name: 'Audit Logs',
    description: 'Track every change and maintain full visibility of who modified what and when.',
    icon: ChartBarIcon,
  },
  {
    name: 'Multi-Tenant Ready',
    description: 'Built-in support for Organizations and Brands. Perfect for SaaS and Enterprise.',
    icon: ShieldCheckIcon,
  },
];

const codeExample = `import { Togglely } from '@togglely/sdk';

const togglely = new Togglely({ apiKey: 'your-api-key' });

// Check if feature is enabled
const isEnabled = await togglely.getBooleanFlag('new-dashboard');

if (isEnabled) {
  // Show new feature
} else {
  // Show old feature
}`;

export default function LandingPage() {
  return (
    <div className="bg-background transition-colors">
      {/* Navigation */}
      <header className="relative z-50 bg-background border-b border-border">
        <nav className="flex items-center justify-between p-6 lg:px-8" aria-label="Global">
          <div className="flex lg:flex-1">
            <Link to="/" className="-m-1.5 p-1.5 flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <FlagIcon className="h-6 w-6 text-primary-foreground" />
              </span>
              <span className="text-xl font-bold tracking-tight text-foreground">Togglely</span>
            </Link>
          </div>
          <div className="hidden md:flex md:gap-x-8">
            <Link to="/login?demo=true" className="text-sm font-semibold leading-6 text-foreground hover:text-primary transition-colors">
              Live Demo
            </Link>
            <Link to="/docs" className="text-sm font-semibold leading-6 text-foreground hover:text-primary transition-colors">
              Documentation
            </Link>
            <a href="https://github.com/nuvooo/togglely/" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold leading-6 text-foreground hover:text-primary transition-colors">
              GitHub
            </a>
          </div>
          <div className="flex flex-1 justify-end items-center gap-x-4">
            <ThemeToggle />
            <Link to="/login" className="hidden sm:block text-sm font-semibold leading-6 text-foreground">
              Log in
            </Link>
            <Link
              to="/register"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      <main className="isolate">
        {/* Hero section */}
        <div className="relative">
          <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80">
            <div
              className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#ff80b5] to-[#9089fc] opacity-30 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
              style={{
                clipPath:
                  'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
              }}
            />
          </div>
          <div className="py-24 sm:py-32 lg:pb-40">
            <div className="mx-auto max-w-7xl px-6 lg:px-8">
              <div className="mx-auto max-w-2xl text-center">
                <div className="mb-8 flex justify-center">
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary ring-1 ring-inset ring-primary/20">
                    🚀 Now with Multi-Tenant Support
                  </span>
                </div>
                <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
                  Feature Flags Made{' '}
                  <span className="text-primary">Simple</span>
                </h1>
                <p className="mt-6 text-lg leading-8 text-muted-foreground">
                  Deploy faster and more reliably with Togglely. Control features in real-time, 
                  target specific users, and manage multiple environments with our powerful open-source platform.
                </p>
                <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link
                    to="/register"
                    className="w-full sm:w-auto rounded-md bg-primary px-6 py-3 text-lg font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    Start for Free
                  </Link>
                  <Link 
                    to="/login?demo=true"
                    className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-md bg-card px-6 py-3 text-lg font-semibold text-foreground shadow-sm ring-1 ring-inset ring-border hover:bg-muted"
                  >
                    <PlayIcon className="h-5 w-5" />
                    Try Live Demo
                  </Link>
                  <a 
                    href="https://github.com/nuvooo/togglely/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-md bg-gray-900 px-6 py-3 text-lg font-semibold text-white shadow-sm hover:bg-gray-800"
                  >
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                      <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                    </svg>
                    GitHub
                  </a>
                </div>
              </div>
              
              {/* Code Example */}
              <div className="mt-16 flow-root sm:mt-24">
                <div className="relative rounded-2xl bg-gray-900 px-6 pb-14 pt-8 shadow-2xl ring-1 ring-gray-900/10 sm:px-10 sm:pb-20 sm:pt-10">
                  <div className="absolute left-4 top-4 flex gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-500" />
                    <div className="h-3 w-3 rounded-full bg-yellow-500" />
                    <div className="h-3 w-3 rounded-full bg-green-500" />
                  </div>
                  <div className="mt-8 overflow-x-auto">
                    <pre className="text-sm leading-6 text-gray-300">
                      <code>{codeExample}</code>
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature section */}
        <div id="features" className="mx-auto -mt-20 max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-base font-semibold leading-7 text-primary uppercase tracking-widest">Everything you need</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Powerful features to ship with confidence
            </p>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              Stop worrying about deployment windows. Release features to specific segments, run beta programs, and kill problematic features instantly.
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-4xl">
            <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-10 lg:max-w-none lg:grid-cols-2 lg:gap-y-16">
              {features.map((feature) => (
                <div key={feature.name} className="relative pl-16">
                  <dt className="text-base font-semibold leading-7 text-foreground">
                    <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                      <feature.icon className="h-6 w-6 text-primary-foreground" aria-hidden="true" />
                    </div>
                    {feature.name}
                  </dt>
                  <dd className="mt-2 text-base leading-7 text-muted-foreground">{feature.description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Stats Section */}
        <div className="mx-auto mt-32 max-w-7xl px-6 sm:mt-56 lg:px-8">
          <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none">
            <div className="grid grid-cols-1 gap-y-16 lg:grid-cols-2 lg:gap-x-16">
              <div>
                <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Trusted by developers worldwide</h2>
                <p className="mt-6 text-lg leading-8 text-muted-foreground">
                  Togglely is designed to handle enterprise workloads while remaining simple enough for individual developers. Our architecture ensures that feature evaluation happens locally in your SDK for maximum performance.
                </p>
                <div className="mt-10 flex gap-x-8 text-base font-semibold leading-7 text-foreground border-t border-border pt-10">
                  <div className="flex flex-col gap-y-3">
                    <span className="text-4xl font-bold text-primary">10k+</span>
                    <span>Daily Evaluations</span>
                  </div>
                  <div className="flex flex-col gap-y-3">
                    <span className="text-4xl font-bold text-primary">99.9%</span>
                    <span>Uptime Guarantee</span>
                  </div>
                  <div className="flex flex-col gap-y-3">
                    <span className="text-4xl font-bold text-primary">{'< 1ms'}</span>
                    <span>Local Evaluation</span>
                  </div>
                </div>
              </div>
              <div className="bg-muted rounded-2xl p-8 flex flex-col justify-center border border-border">
                <div className="space-y-4">
                  {[
                    "Self-hosted & Private",
                    "Intuitive Web Interface",
                    "SDKs for all major languages",
                    "Granular Targeting Rules",
                    "Organization Management",
                    "Unlimited Projects & Flags"
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-x-3 text-foreground">
                      <CheckCircleIcon className="h-6 w-6 text-green-500" />
                      <span className="font-medium">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Start Section */}
        <div className="mx-auto mt-32 max-w-7xl px-6 sm:mt-56 lg:px-8">
          <div className="relative isolate overflow-hidden bg-gray-900 px-6 py-24 text-center shadow-2xl sm:rounded-3xl sm:px-16">
            <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to get started?
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-gray-300">
              Deploy Togglely in minutes with Docker or explore our live demo to see it in action.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/docs"
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <DocumentTextIcon className="h-5 w-5" />
                Read Documentation
              </Link>
              <Link
                to="/login?demo=true"
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <PlayIcon className="h-5 w-5" />
                Try Live Demo
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-32 bg-gray-900 sm:mt-56">
        <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2">
                <FlagIcon className="h-8 w-8 text-primary-500" />
                <span className="text-xl font-bold text-white uppercase tracking-tighter">Togglely</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-gray-400">
                Open-source feature flag management platform. Deploy with confidence, control with precision.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold leading-6 text-white">Product</h3>
              <ul className="mt-6 space-y-4">
                <li><Link to="/docs" className="text-sm leading-6 text-gray-400 hover:text-white">Documentation</Link></li>
                <li><Link to="/login?demo=true" className="text-sm leading-6 text-gray-400 hover:text-white">Live Demo</Link></li>
                <li><Link to="/register" className="text-sm leading-6 text-gray-400 hover:text-white">Get Started</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold leading-6 text-white">Resources</h3>
              <ul className="mt-6 space-y-4">
                <li><a href="https://github.com/nuvooo/togglely/" target="_blank" rel="noopener noreferrer" className="text-sm leading-6 text-gray-400 hover:text-white">GitHub</a></li>
                <li><Link to="/docs/api" className="text-sm leading-6 text-gray-400 hover:text-white">API Reference</Link></li>
                <li><Link to="/docs/sdks" className="text-sm leading-6 text-gray-400 hover:text-white">SDKs</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 border-t border-gray-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs leading-5 text-gray-400">
              &copy; {new Date().getFullYear()} Togglely. Open source under MIT License.
            </p>
            <div className="flex gap-4">
              <a href="https://github.com/nuvooo/togglely/" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white">
                <span className="sr-only">GitHub</span>
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
