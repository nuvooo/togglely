import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  FlagIcon,
  BookOpenIcon,
  CodeBracketIcon,
  ServerIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PlayIcon
} from '@heroicons/react/24/outline';

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
      { name: 'Targeting', href: '#targeting' },
      { name: 'Multi-Tenancy', href: '#multitenancy' },
    ],
  },
  {
    title: 'SDKs',
    items: [
      { name: 'JavaScript/TypeScript', href: '#sdk-js' },
      { name: 'REST API', href: '#sdk-rest' },
    ],
  },
  {
    title: 'Deployment',
    items: [
      { name: 'Docker', href: '#docker' },
      { name: 'Coolify', href: '#coolify' },
      { name: 'Environment Variables', href: '#env' },
    ],
  },
];

const codeSnippets = {
  docker: `version: '3.8'

services:
  flagify:
    image: ghcr.io/nuvooo/flagify:latest
    ports:
      - "3000:80"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=mongodb://mongo:27017/flagify
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=your-secret-key`,

  js: `import { Flagify } from '@flagify/sdk';

const flagify = new Flagify({
  apiKey: 'your-sdk-key'
});

// Check boolean flag
const isEnabled = await flagify.getBooleanFlag('new-feature');

// Get string value
const theme = await flagify.getStringFlag('theme-color');

// Get number value  
const maxItems = await flagify.getNumberFlag('max-items');

// Get JSON value
const config = await flagify.getJSONFlag('ui-config');`,

  rest: `curl -X POST https://your-flagify.com/api/flags/evaluate \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "flagKey": "new-feature",
    "context": {
      "userId": "user-123",
      "email": "user@example.com"
    }
  }'`
};

export default function Docs() {
  const [activeSection, setActiveSection] = useState('introduction');
  const [expandedSections, setExpandedSections] = useState<string[]>(['Getting Started']);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Get all section IDs from sidebar navigation
    const sectionIds = sidebarNavigation.flatMap(section => 
      section.items.map(item => item.href.replace('#', ''))
    );

    // Create IntersectionObserver
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Find the most visible section
        const visibleEntries = entries.filter(entry => entry.isIntersecting);
        if (visibleEntries.length > 0) {
          // Use the one with highest intersection ratio
          const mostVisible = visibleEntries.reduce((prev, current) =>
            prev.intersectionRatio > current.intersectionRatio ? prev : current
          );
          setActiveSection(mostVisible.target.id);
        }
      },
      {
        rootMargin: '-20% 0px -60% 0px', // Trigger when section is near top
        threshold: [0, 0.25, 0.5, 0.75, 1]
      }
    );

    // Observe all sections
    sectionIds.forEach(id => {
      const element = document.getElementById(id);
      if (element && observerRef.current) {
        observerRef.current.observe(element);
      }
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  // Auto-expand section when it becomes active
  useEffect(() => {
    sidebarNavigation.forEach(section => {
      const hasActiveItem = section.items.some(item => 
        item.href.replace('#', '') === activeSection
      );
      if (hasActiveItem && !expandedSections.includes(section.title)) {
        setExpandedSections(prev => [...prev, section.title]);
      }
    });
  }, [activeSection]);

  const toggleSection = (title: string) => {
    setExpandedSections(prev => 
      prev.includes(title) 
        ? prev.filter(t => t !== title)
        : [...prev, title]
    );
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <Link to="/" className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
                  <FlagIcon className="h-5 w-5 text-white" />
                </span>
                <span className="text-lg font-bold text-gray-900">Flagify</span>
              </Link>
              <span className="text-gray-300">|</span>
              <span className="text-sm text-gray-500">Documentation</span>
            </div>
            <div className="flex items-center gap-4">
              <a 
                href="https://flagify.examplesart.de/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-1 text-sm text-gray-600 hover:text-primary-600"
              >
                <PlayIcon className="h-4 w-4" />
                Live Demo
              </a>
              <a 
                href="https://github.com/nuvooo/flagify/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-primary-600"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                GitHub
              </a>
              <Link 
                to="/login"
                className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-500"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex gap-8 py-8">
          {/* Sidebar */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <nav className="sticky top-24 space-y-1 max-h-[calc(100vh-8rem)] overflow-y-auto">
              {sidebarNavigation.map((section) => (
                <div key={section.title} className="mb-4">
                  <button
                    onClick={() => toggleSection(section.title)}
                    className="flex w-full items-center justify-between py-2 text-sm font-semibold text-gray-900"
                  >
                    {section.title}
                    {expandedSections.includes(section.title) ? (
                      <ChevronDownIcon className="h-4 w-4" />
                    ) : (
                      <ChevronRightIcon className="h-4 w-4" />
                    )}
                  </button>
                  {expandedSections.includes(section.title) && (
                    <ul className="ml-2 space-y-1 border-l border-gray-200">
                      {section.items.map((item) => (
                        <li key={item.name}>
                          <a
                            href={item.href}
                            className={`block py-1 pl-4 text-sm transition-colors ${
                              activeSection === item.href.replace('#', '')
                                ? 'text-primary-600 font-medium border-l-2 border-primary-600 -ml-[2px]'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            {item.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            <div className="prose prose-slate max-w-none">
              <h1 id="introduction" className="text-4xl font-bold text-gray-900 mb-6">
                Flagify Documentation
              </h1>
              
              <p className="text-lg text-gray-600 mb-8">
                Welcome to Flagify! This guide will help you get started with feature flags, 
                from basic setup to advanced targeting and multi-tenant deployments.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12 not-prose">
                <a href="#quickstart" className="group block p-6 bg-gray-50 rounded-xl border border-gray-200 hover:border-primary-500 hover:shadow-md transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-primary-100 rounded-lg">
                      <BookOpenIcon className="h-5 w-5 text-primary-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 group-hover:text-primary-600">Quick Start</h3>
                  </div>
                  <p className="text-sm text-gray-600">Get up and running with Flagify in 5 minutes</p>
                </a>
                
                <a href="#sdk-js" className="group block p-6 bg-gray-50 rounded-xl border border-gray-200 hover:border-primary-500 hover:shadow-md transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-primary-100 rounded-lg">
                      <CodeBracketIcon className="h-5 w-5 text-primary-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 group-hover:text-primary-600">SDKs</h3>
                  </div>
                  <p className="text-sm text-gray-600">Integrate Flagify into your application</p>
                </a>
                
                <a href="#docker" className="group block p-6 bg-gray-50 rounded-xl border border-gray-200 hover:border-primary-500 hover:shadow-md transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-primary-100 rounded-lg">
                      <ServerIcon className="h-5 w-5 text-primary-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 group-hover:text-primary-600">Deployment</h3>
                  </div>
                  <p className="text-sm text-gray-600">Deploy with Docker or Coolify</p>
                </a>
                
                <a 
                  href="https://github.com/nuvooo/flagify/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="group block p-6 bg-gray-50 rounded-xl border border-gray-200 hover:border-primary-500 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-primary-100 rounded-lg">
                      <svg className="h-5 w-5 text-primary-600" fill="currentColor" viewBox="0 0 24 24">
                        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-gray-900 group-hover:text-primary-600">GitHub</h3>
                  </div>
                  <p className="text-sm text-gray-600">View source code and contribute</p>
                </a>
              </div>

              <h2 id="quickstart" className="text-2xl font-bold text-gray-900 mt-12 mb-4">
                Quick Start
              </h2>
              
              <p className="text-gray-600 mb-4">
                The fastest way to try Flagify is using our live demo or running it locally with Docker.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-8 mb-3">Option 1: Live Demo</h3>
              <p className="text-gray-600 mb-4">
                Try Flagify instantly without installation at{' '}
                <a href="https://flagify.examplesart.de/" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                  flagify.examplesart.de
                </a>
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-8 mb-3">Option 2: Docker Compose</h3>
              <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                <pre className="text-sm text-gray-300">
                  <code>{codeSnippets.docker}</code>
                </pre>
              </div>

              <h2 id="installation" className="text-2xl font-bold text-gray-900 mt-12 mb-4">
                Installation
              </h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mt-8 mb-3">System Requirements</h3>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Node.js 20+ (for development)</li>
                <li>MongoDB 7+ with replica set</li>
                <li>Redis 7+</li>
                <li>Docker & Docker Compose (recommended)</li>
              </ul>

              <h2 id="flags" className="text-2xl font-bold text-gray-900 mt-12 mb-4">
                Feature Flags
              </h2>
              
              <p className="text-gray-600 mb-4">
                Feature flags are the core concept of Flagify. They allow you to control feature availability 
                without deploying new code.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-8 mb-3">Flag Types</h3>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li><strong>Boolean:</strong> Simple on/off switches (true/false)</li>
                <li><strong>String:</strong> Text values like theme colors or messages</li>
                <li><strong>Number:</strong> Numeric values like limits or thresholds</li>
                <li><strong>JSON:</strong> Complex configuration objects</li>
              </ul>

              <h2 id="environments" className="text-2xl font-bold text-gray-900 mt-12 mb-4">
                Environments
              </h2>
              
              <p className="text-gray-600 mb-4">
                Environments allow you to manage flags differently across Development, Staging, and Production. 
                Each environment has its own set of flag values.
              </p>

              <h2 id="multitenancy" className="text-2xl font-bold text-gray-900 mt-12 mb-4">
                Multi-Tenancy
              </h2>
              
              <p className="text-gray-600 mb-4">
                Flagify supports multi-tenant projects through the concept of <strong>Brands</strong>. 
                This is perfect for SaaS applications where different customers need different feature configurations.
              </p>
              
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> When converting a project from Multi-Tenant to Single-Tenant, 
                  all brand-specific configurations will be deleted.
                </p>
              </div>

              <h2 id="sdk-js" className="text-2xl font-bold text-gray-900 mt-12 mb-4">
                JavaScript/TypeScript SDK
              </h2>
              
              <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                <pre className="text-sm text-gray-300">
                  <code>{codeSnippets.js}</code>
                </pre>
              </div>

              <h2 id="sdk-rest" className="text-2xl font-bold text-gray-900 mt-12 mb-4">
                REST API
              </h2>
              
              <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                <pre className="text-sm text-gray-300">
                  <code>{codeSnippets.rest}</code>
                </pre>
              </div>

              <h2 id="docker" className="text-2xl font-bold text-gray-900 mt-12 mb-4">
                Docker Deployment
              </h2>
              
              <p className="text-gray-600 mb-4">
                The recommended way to deploy Flagify is using Docker Compose. 
                This sets up the complete stack including MongoDB and Redis.
              </p>

              <h2 id="coolify" className="text-2xl font-bold text-gray-900 mt-12 mb-4">
                Coolify Deployment
              </h2>
              
              <p className="text-gray-600 mb-4">
                Flagify is ready for Coolify deployment. Use the provided <code>docker-compose.coolify.yml</code> 
                for easy self-hosting on your own infrastructure.
              </p>

              <h2 id="env" className="text-2xl font-bold text-gray-900 mt-12 mb-4">
                Environment Variables
              </h2>
              
              <table className="min-w-full divide-y divide-gray-200 mt-4">
                <thead>
                  <tr>
                    <th className="py-2 text-left text-sm font-semibold text-gray-900">Variable</th>
                    <th className="py-2 text-left text-sm font-semibold text-gray-900">Description</th>
                    <th className="py-2 text-left text-sm font-semibold text-gray-900">Required</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="py-2 text-sm font-mono text-gray-700">DATABASE_URL</td>
                    <td className="py-2 text-sm text-gray-600">MongoDB connection string</td>
                    <td className="py-2 text-sm text-gray-600">Yes</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-sm font-mono text-gray-700">REDIS_URL</td>
                    <td className="py-2 text-sm text-gray-600">Redis connection string</td>
                    <td className="py-2 text-sm text-gray-600">Yes</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-sm font-mono text-gray-700">JWT_SECRET</td>
                    <td className="py-2 text-sm text-gray-600">Secret for JWT tokens</td>
                    <td className="py-2 text-sm text-gray-600">Yes</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-sm font-mono text-gray-700">SMTP_HOST</td>
                    <td className="py-2 text-sm text-gray-600">SMTP server for emails</td>
                    <td className="py-2 text-sm text-gray-600">Optional</td>
                  </tr>
                </tbody>
              </table>

              <div className="mt-12 p-6 bg-gray-50 rounded-xl border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Need Help?</h3>
                <p className="text-gray-600 mb-4">
                  If you need assistance or want to report an issue, visit our GitHub repository.
                </p>
                <a 
                  href="https://github.com/nuvooo/flagify/issues" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
                >
                  Open an Issue on GitHub
                  <ChevronRightIcon className="h-4 w-4" />
                </a>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
