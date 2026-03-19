import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  FlagIcon,
  BookOpenIcon,
  CodeBracketIcon,
  ServerIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PlayIcon,
  CopyIcon,
  CheckIcon,
  ShieldIcon,
  UsersIcon,
  SettingsIcon,
  GlobeIcon
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';

const sidebarNavigation = [
  {
    title: 'Getting Started',
    items: [
      { name: 'Introduction', href: '#introduction' },
      { name: 'Quick Start', href: '#quickstart' },
      { name: 'Installation', href: '#installation' },
    ],
  },
  {
    title: 'Core Concepts',
    items: [
      { name: 'Feature Flags', href: '#flags' },
      { name: 'Environments', href: '#environments' },
      { name: 'Organizations', href: '#organizations' },
      { name: 'Roles & Permissions', href: '#roles' },
    ],
  },
  {
    title: 'SDKs & Integration',
    items: [
      { name: 'JavaScript/TypeScript SDK', href: '#sdk-js' },
      { name: 'SDK Configuration', href: '#sdk-config' },
      { name: 'REST API', href: '#sdk-rest' },
    ],
  },
  {
    title: 'Deployment',
    items: [
      { name: 'Docker Compose', href: '#docker' },
      { name: 'Environment Variables', href: '#env' },
      { name: 'Coolify', href: '#coolify' },
    ],
  },
];

const codeSnippets = {
  docker: `git clone https://github.com/nuvooo/togglely.git
cd togglely

# Copy environment file
cp .env.example .env

# Edit .env with your settings
# Then start with Docker Compose
docker-compose up -d

# The app will be available at http://localhost`,

  js: `import { TogglelyClient } from '@togglely/sdk-core';

const client = new TogglelyClient({
  apiKey: 'your-sdk-key',
  project: 'my-app',
  environment: 'production',
  // Optional: Custom base URL for self-hosted
  baseUrl: 'https://api.togglely.de'
});

// Initialize the client
await client.init();

// Check if feature is enabled
const isEnabled = await client.getValue('new-dashboard');

// With user context for targeting
const theme = await client.getValue('theme', {
  userId: 'user-123',
  plan: 'premium',
  region: 'eu'
});`,

  rest: `curl -X POST https://api.togglely.de/api/sdk/flags \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "keys": ["new-feature", "theme-color"],
    "context": {
      "userId": "user-123",
      "email": "user@example.com"
    }
  }'`,

  env: `# Required
DATABASE_URL=mongodb://mongodb:27017/togglely?replicaSet=rs0
JWT_SECRET=your-super-secret-jwt-key

# Optional - for email notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@togglely.de

# Frontend URL for invite links
FRONTEND_URL=https://togglely.de`
};

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-lg overflow-hidden bg-gray-950 border border-gray-800 my-4">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900/50 border-b border-gray-800">
        <span className="text-xs font-mono text-gray-400">{language}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={copyToClipboard}
          className="h-8 text-gray-400 hover:text-white"
        >
          {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
          <span className="ml-2 text-xs">{copied ? 'Copied!' : 'Copy'}</span>
        </Button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm leading-relaxed text-gray-300 font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function Docs() {
  const [activeSection, setActiveSection] = useState('introduction');
  const [expandedSections, setExpandedSections] = useState<string[]>(['Getting Started']);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const sectionIds = sidebarNavigation.flatMap(section => 
      section.items.map(item => item.href.replace('#', ''))
    );

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-20% 0% -80% 0%' }
    );

    sectionIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element) observerRef.current?.observe(element);
    });

    return () => observerRef.current?.disconnect();
  }, []);

  const toggleSection = (title: string) => {
    setExpandedSections(prev => 
      prev.includes(title) 
        ? prev.filter(t => t !== title)
        : [...prev, title]
    );
  };

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setMobileMenuOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-16 items-center justify-between px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
                <FlagIcon className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">Togglely</span>
            </Link>
            <span className="hidden sm:block text-muted-foreground">/</span>
            <span className="hidden sm:block text-muted-foreground">Documentation</span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link to="/login?demo=true" className="hidden sm:inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              <PlayIcon className="h-4 w-4" />
              Live Demo
            </Link>
            <Link 
              to="/register" 
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex gap-8 py-8">
          {/* Sidebar */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <nav className="sticky top-24 space-y-1">
              {sidebarNavigation.map((section) => (
                <div key={section.title} className="mb-4">
                  <button
                    onClick={() => toggleSection(section.title)}
                    className="flex w-full items-center justify-between py-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
                  >
                    {section.title}
                    {expandedSections.includes(section.title) ? (
                      <ChevronDownIcon className="h-4 w-4" />
                    ) : (
                      <ChevronRightIcon className="h-4 w-4" />
                    )}
                  </button>
                  {expandedSections.includes(section.title) && (
                    <div className="ml-2 mt-1 space-y-1 border-l border-border pl-4">
                      {section.items.map((item) => (
                        <button
                          key={item.name}
                          onClick={() => scrollToSection(item.href)}
                          className={`block w-full text-left py-1.5 text-sm transition-colors ${
                            activeSection === item.href.replace('#', '')
                              ? 'text-primary font-medium'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0 max-w-3xl">
            <div className="prose prose-gray dark:prose-invert max-w-none">
              
              {/* Introduction */}
              <section id="introduction" className="mb-16">
                <h1 className="text-4xl font-bold tracking-tight mb-4">Introduction</h1>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Togglely is an open-source feature flag management platform designed for modern development teams. 
                  It allows you to deploy code more frequently and safely by decoupling feature releases from code deployments.
                </p>
                
                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 not-prose">
                  <div className="p-4 rounded-lg border border-border bg-card">
                    <ShieldIcon className="h-6 w-6 text-primary mb-2" />
                    <h3 className="font-semibold">Self-Hosted</h3>
                    <p className="text-sm text-muted-foreground">Your data stays in your infrastructure</p>
                  </div>
                  <div className="p-4 rounded-lg border border-border bg-card">
                    <CodeBracketIcon className="h-6 w-6 text-primary mb-2" />
                    <h3 className="font-semibold">Open Source</h3>
                    <p className="text-sm text-muted-foreground">MIT Licensed, fully customizable</p>
                  </div>
                  <div className="p-4 rounded-lg border border-border bg-card">
                    <UsersIcon className="h-6 w-6 text-primary mb-2" />
                    <h3 className="font-semibold">Multi-Tenant</h3>
                    <p className="text-sm text-muted-foreground">Organizations & Brands support</p>
                  </div>
                  <div className="p-4 rounded-lg border border-border bg-card">
                    <ServerIcon className="h-6 w-6 text-primary mb-2" />
                    <h3 className="font-semibold">Enterprise Ready</h3>
                    <p className="text-sm text-muted-foreground">RBAC, audit logs, API keys</p>
                  </div>
                </div>
              </section>

              {/* Quick Start */}
              <section id="quickstart" className="mb-16">
                <h2 className="text-3xl font-bold tracking-tight mb-4">Quick Start</h2>
                <p className="text-muted-foreground mb-6">
                  Get Togglely running locally in under 5 minutes using Docker Compose.
                </p>

                <h3 className="text-xl font-semibold mt-8 mb-4">1. Clone and Configure</h3>
                <CodeBlock code={codeSnippets.docker} language="bash" />

                <h3 className="text-xl font-semibold mt-8 mb-4">2. Install SDK</h3>
                <CodeBlock code={`npm install @togglely/sdk-core
# or
yarn add @togglely/sdk-core`} language="bash" />

                <h3 className="text-xl font-semibold mt-8 mb-4">3. Use in Your App</h3>
                <CodeBlock code={codeSnippets.js} language="typescript" />
              </section>

              {/* Installation */}
              <section id="installation" className="mb-16">
                <h2 className="text-3xl font-bold tracking-tight mb-4">Installation</h2>
                
                <h3 className="text-xl font-semibold mt-8 mb-4">Prerequisites</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>Docker and Docker Compose</li>
                  <li>Node.js 18+ (for SDK development)</li>
                  <li>MongoDB 5.0+ (or use the included Docker container)</li>
                  <li>Redis 6+ (optional, for caching)</li>
                </ul>

                <h3 className="text-xl font-semibold mt-8 mb-4">Configuration</h3>
                <p className="text-muted-foreground mb-4">
                  Create a <code>.env</code> file with the following variables:
                </p>
                <CodeBlock code={codeSnippets.env} language="env" />
              </section>

              {/* Feature Flags */}
              <section id="flags" className="mb-16">
                <h2 className="text-3xl font-bold tracking-tight mb-4">Feature Flags</h2>
                <p className="text-muted-foreground mb-6">
                  Feature flags (or feature toggles) allow you to enable or disable functionality without deploying new code.
                </p>

                <h3 className="text-xl font-semibold mt-8 mb-4">Flag Types</h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="font-mono text-sm bg-primary/10 text-primary px-2 py-1 rounded">BOOLEAN</span>
                    <span className="text-muted-foreground">Simple on/off toggle</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="font-mono text-sm bg-primary/10 text-primary px-2 py-1 rounded">STRING</span>
                    <span className="text-muted-foreground">Text values like themes, configs</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="font-mono text-sm bg-primary/10 text-primary px-2 py-1 rounded">NUMBER</span>
                    <span className="text-muted-foreground">Numeric values for limits, thresholds</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="font-mono text-sm bg-primary/10 text-primary px-2 py-1 rounded">JSON</span>
                    <span className="text-muted-foreground">Complex configuration objects</span>
                  </li>
                </ul>
              </section>

              {/* Environments */}
              <section id="environments" className="mb-16">
                <h2 className="text-3xl font-bold tracking-tight mb-4">Environments</h2>
                <p className="text-muted-foreground mb-6">
                  Environments allow you to manage flags separately for different stages of your deployment pipeline.
                </p>

                <h3 className="text-xl font-semibold mt-8 mb-4">Default Environments</h3>
                <p className="text-muted-foreground">
                  Each project comes with three default environments:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-4">
                  <li><strong>Development</strong> - For local development and testing</li>
                  <li><strong>Staging</strong> - For pre-production validation</li>
                  <li><strong>Production</strong> - For live users</li>
                </ul>

                <div className="mt-6 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                  <p className="text-sm text-amber-800 dark:text-amber-400">
                    <strong>Tip:</strong> Environment-specific values override the default flag value. 
                    This lets you enable a feature in development while keeping it off in production.
                  </p>
                </div>
              </section>

              {/* Organizations */}
              <section id="organizations" className="mb-16">
                <h2 className="text-3xl font-bold tracking-tight mb-4">Organizations</h2>
                <p className="text-muted-foreground mb-6">
                  Organizations are the top-level container in Togglely. They contain projects, members, and API keys.
                </p>

                <h3 className="text-xl font-semibold mt-8 mb-4">Creating an Organization</h3>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Sign up or log in to Togglely</li>
                  <li>Click "New Organization" on the organizations page</li>
                  <li>Enter a name and unique slug</li>
                  <li>Invite team members</li>
                </ol>

                <h3 className="text-xl font-semibold mt-8 mb-4">Projects</h3>
                <p className="text-muted-foreground">
                  Each organization can have multiple projects. Projects contain feature flags and environments.
                  There are two project types:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-4">
                  <li><strong>Single</strong> - Standard project with feature flags</li>
                  <li><strong>Multi</strong> - Supports multiple brands/tenants with brand-specific flags</li>
                </ul>
              </section>

              {/* Roles */}
              <section id="roles" className="mb-16">
                <h2 className="text-3xl font-bold tracking-tight mb-4">Roles & Permissions</h2>
                <p className="text-muted-foreground mb-6">
                  Togglely uses role-based access control (RBAC) to manage permissions within organizations.
                </p>

                <div className="space-y-4">
                  <div className="p-4 rounded-lg border border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold">OWNER</span>
                      <span className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 px-2 py-0.5 rounded-full">Full Access</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Can manage organization settings, delete organization, manage billing, and all other actions.
                    </p>
                  </div>
                  <div className="p-4 rounded-lg border border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold">ADMIN</span>
                      <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 px-2 py-0.5 rounded-full">Manager</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Can create projects, manage members, manage API keys, and configure settings. Cannot delete organization.
                    </p>
                  </div>
                  <div className="p-4 rounded-lg border border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold">MEMBER</span>
                      <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 px-2 py-0.5 rounded-full">Developer</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Can create and manage feature flags, toggle values. Cannot manage organization settings or members.
                    </p>
                  </div>
                  <div className="p-4 rounded-lg border border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold">VIEWER</span>
                      <span className="text-xs bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 px-2 py-0.5 rounded-full">Read Only</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Can view flags and their values. Cannot make any changes.
                    </p>
                  </div>
                </div>
              </section>

              {/* SDK */}
              <section id="sdk-js" className="mb-16">
                <h2 className="text-3xl font-bold tracking-tight mb-4">JavaScript/TypeScript SDK</h2>
                <p className="text-muted-foreground mb-6">
                  The official JavaScript SDK provides a simple interface for evaluating feature flags with built-in caching and offline support.
                </p>

                <h3 className="text-xl font-semibold mt-8 mb-4">Installation</h3>
                <CodeBlock code={`npm install @togglely/sdk-core`} language="bash" />

                <h3 className="text-xl font-semibold mt-8 mb-4">Basic Usage</h3>
                <CodeBlock code={codeSnippets.js} language="typescript" />
              </section>

              {/* SDK Config */}
              <section id="sdk-config" className="mb-16">
                <h2 className="text-3xl font-bold tracking-tight mb-4">SDK Configuration</h2>
                
                <h3 className="text-xl font-semibold mt-8 mb-4">Configuration Options</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 font-semibold">Option</th>
                      <th className="text-left py-2 font-semibold">Type</th>
                      <th className="text-left py-2 font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <td className="py-2 font-mono">apiKey</td>
                      <td className="py-2">string</td>
                      <td className="py-2">Your SDK API key</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 font-mono">project</td>
                      <td className="py-2">string</td>
                      <td className="py-2">Project identifier</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 font-mono">environment</td>
                      <td className="py-2">string</td>
                      <td className="py-2">Environment name (dev, staging, prod)</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 font-mono">baseUrl</td>
                      <td className="py-2">string</td>
                      <td className="py-2">Custom API base URL (for self-hosted)</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 font-mono">refreshInterval</td>
                      <td className="py-2">number</td>
                      <td className="py-2">Cache refresh interval in ms (default: 60000)</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              {/* REST API */}
              <section id="sdk-rest" className="mb-16">
                <h2 className="text-3xl font-bold tracking-tight mb-4">REST API</h2>
                <p className="text-muted-foreground mb-6">
                  The REST API allows you to evaluate feature flags from any language or platform.
                </p>

                <h3 className="text-xl font-semibold mt-8 mb-4">Evaluate Flags</h3>
                <CodeBlock code={codeSnippets.rest} language="bash" />

                <h3 className="text-xl font-semibold mt-8 mb-4">Response</h3>
                <CodeBlock code={`{
  "flags": {
    "new-feature": {
      "key": "new-feature",
      "enabled": true,
      "value": true,
      "type": "BOOLEAN"
    },
    "theme-color": {
      "key": "theme-color",
      "enabled": true,
      "value": "dark",
      "type": "STRING"
    }
  }
}`} language="json" />
              </section>

              {/* Docker */}
              <section id="docker" className="mb-16">
                <h2 className="text-3xl font-bold tracking-tight mb-4">Docker Compose</h2>
                <p className="text-muted-foreground mb-6">
                  The easiest way to run Togglely is with Docker Compose. This sets up the backend, frontend, MongoDB, and Redis.
                </p>

                <CodeBlock code={codeSnippets.docker} language="bash" />

                <h3 className="text-xl font-semibold mt-8 mb-4">Services</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li><strong>frontend</strong> - React app served via Nginx (port 80)</li>
                  <li><strong>backend</strong> - NestJS API (port 4000)</li>
                  <li><strong>mongodb</strong> - Database for storing flags and configs</li>
                  <li><strong>redis</strong> - Caching layer (optional)</li>
                </ul>
              </section>

              {/* Environment Variables */}
              <section id="env" className="mb-16">
                <h2 className="text-3xl font-bold tracking-tight mb-4">Environment Variables</h2>
                <CodeBlock code={codeSnippets.env} language="env" />

                <h3 className="text-xl font-semibold mt-8 mb-4">Required Variables</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li><code className="bg-muted px-1 rounded">DATABASE_URL</code> - MongoDB connection string</li>
                  <li><code className="bg-muted px-1 rounded">JWT_SECRET</code> - Secret for signing JWT tokens</li>
                </ul>

                <h3 className="text-xl font-semibold mt-8 mb-4">Email Configuration (Optional)</h3>
                <p className="text-muted-foreground">
                  Configure SMTP settings to enable email notifications for invites and password resets.
                </p>
              </section>

              {/* Coolify */}
              <section id="coolify" className="mb-16">
                <h2 className="text-3xl font-bold tracking-tight mb-4">Deploying with Coolify</h2>
                <p className="text-muted-foreground mb-6">
                  Coolify is an open-source alternative to Heroku/Netlify that makes self-hosting easy.
                </p>

                <h3 className="text-xl font-semibold mt-8 mb-4">One-Click Deploy</h3>
                <ol className="list-decimal list-inside space-y-3 text-muted-foreground">
                  <li>Install Coolify on your server</li>
                  <li>Create a new resource and select "Public Repository"</li>
                  <li>Enter <code>https://github.com/nuvooo/togglely</code></li>
                  <li>Configure environment variables</li>
                  <li>Deploy!</li>
                </ol>

                <div className="mt-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                  <p className="text-sm text-blue-800 dark:text-blue-400">
                    <strong>Note:</strong> Make sure to set up MongoDB and Redis as separate services in Coolify, 
                    or use managed services like MongoDB Atlas.
                  </p>
                </div>
              </section>

            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
