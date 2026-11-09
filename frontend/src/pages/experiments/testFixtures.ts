/** Shared fixtures for the experiments page tests (not shipped: only imported by *.test.tsx). */
import type { Experiment, ExperimentResults } from './components/api'

export const PROJECT = 'p1'

export const experiment = (overrides: Partial<Experiment> = {}): Experiment => ({
  id: 'e1',
  name: 'Checkout CTA',
  key: 'checkout-cta',
  description: 'Green vs. blue button',
  hypothesis: 'A green button converts better',
  status: 'DRAFT',
  trafficPercent: 80,
  startedAt: null,
  endedAt: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  flag: { id: 'f1', name: 'Checkout button', key: 'checkout-button', flagType: 'STRING' },
  environment: { id: 'env-prod', name: 'Production', key: 'production' },
  variants: [
    { id: 'v1', key: 'control', name: 'Control', value: 'blue', weight: 50, isControl: true },
    { id: 'v2', key: 'green', name: 'Green', value: 'green', weight: 50, isControl: false },
  ],
  createdBy: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
  _count: { events: 0 },
  ...overrides,
})

export const results = (overrides: Partial<ExperimentResults> = {}): ExperimentResults => ({
  variants: [
    { key: 'control', name: 'Control', impressions: 1000, conversions: 100, conversionRate: 0.1, isControl: true },
    { key: 'green', name: 'Green', impressions: 1000, conversions: 150, conversionRate: 0.15, isControl: false },
  ],
  totalImpressions: 2000,
  totalConversions: 250,
  isSignificant: true,
  confidence: 0.999,
  winner: 'green',
  ...overrides,
})

export const axiosError = (status: number, message = 'Request failed') => ({
  isAxiosError: true,
  message: `Request failed with status code ${status}`,
  response: { status, data: { statusCode: status, message } },
})
