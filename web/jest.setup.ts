// Ensure test setup hooks and mockFetch are loaded before tests
import './test.setup'
import { mockFetch } from './test.setup'

// Force all tests to use the mock fetch implementation to avoid relying on a real server
// Bun provides a global fetch by default, so we explicitly override it here for contract tests.
// This keeps tests deterministic and aligned with the OpenAPI contract.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = mockFetch
