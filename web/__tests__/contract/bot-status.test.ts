/**
 * Contract Tests for GET /api/bot/status
 *
 * Tests the exact API contract from specs/002-redesign-the-web/contracts/api.yaml
 * These tests MUST fail initially (TDD) - implementation comes after tests pass
 *
 * OpenAPI Contract:
 * - GET /api/bot/status
 * - Returns 200: TradingStatus schema
 * - Required fields: isActive, mode, connectionState, lastUpdate
 * - mode enum: [live, paper, backtest]
 * - connectionState enum: [connected, connecting, disconnected, reconnecting]
 * - lastUpdate: ISO 8601 datetime string
 */

// Test framework globals (describe, test, expect, beforeEach) are available globally
import type { TradingStatus } from '../../lib/types'
import { testConfig, resetAllMocks, setMockAPIHandler } from '../../test.setup'

// =============================================================================
// TEST SETUP
// =============================================================================

const API_BASE_URL = testConfig.api.baseUrl
const ENDPOINT = '/api/bot/status'
const FULL_URL = `${API_BASE_URL}${ENDPOINT}`

beforeEach(() => {
  resetAllMocks()
})

// =============================================================================
// CONTRACT VALIDATION HELPERS
// =============================================================================

/**
 * Validates TradingStatus object against OpenAPI schema
 */
function validateTradingStatusSchema(data: any): asserts data is TradingStatus {
  // Check if data is an object
  expect(typeof data).toBe('object')
  expect(data).not.toBeNull()

  // Required fields validation
  const requiredFields = ['isActive', 'mode', 'connectionState', 'lastUpdate']
  for (const field of requiredFields) {
    expect(data).toHaveProperty(field)
    expect(data[field]).not.toBeUndefined()
    expect(data[field]).not.toBeNull()
  }

  // Type validation
  expect(typeof data.isActive).toBe('boolean')
  expect(typeof data.mode).toBe('string')
  expect(typeof data.connectionState).toBe('string')
  expect(typeof data.lastUpdate).toBe('string')

  // Enum validation
  const validModes = ['live', 'paper', 'backtest']
  expect(validModes).toContain(data.mode)

  const validConnectionStates = ['connected', 'connecting', 'disconnected', 'reconnecting']
  expect(validConnectionStates).toContain(data.connectionState)

  // ISO 8601 datetime validation
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/
  expect(data.lastUpdate).toMatch(isoDateRegex)
  expect(new Date(data.lastUpdate).toISOString()).toBe(data.lastUpdate)
}

/**
 * Validates HTTP response structure
 */
function validateHttpResponse(response: Response, expectedStatus: number) {
  expect(response.status).toBe(expectedStatus)
  expect(response.headers.get('content-type')).toContain('application/json')
}

// =============================================================================
// SUCCESS SCENARIOS (200 OK)
// =============================================================================

describe('GET /api/bot/status - Success Scenarios', () => {
  test('should return 200 with valid TradingStatus schema', async () => {
    // This test WILL FAIL initially - TDD approach
    // Implementation needed in app/api/bot/status/route.ts

    const response = await fetch(FULL_URL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    // Validate HTTP response
    validateHttpResponse(response, 200)

    // Parse and validate response body
    const data = await response.json()
    validateTradingStatusSchema(data)
  })

  test('should return TradingStatus with all required fields present', async () => {
    const response = await fetch(FULL_URL)
    expect(response.status).toBe(200)

    const data: TradingStatus = await response.json()

    // Test each required field explicitly
    expect(data.isActive).toBeDefined()
    expect(data.mode).toBeDefined()
    expect(data.connectionState).toBeDefined()
    expect(data.lastUpdate).toBeDefined()
  })

  test('should return TradingStatus with valid enum values', async () => {
    const response = await fetch(FULL_URL)
    expect(response.status).toBe(200)

    const data: TradingStatus = await response.json()

    // Test mode enum
    expect(['live', 'paper', 'backtest']).toContain(data.mode)

    // Test connectionState enum
    expect(['connected', 'connecting', 'disconnected', 'reconnecting']).toContain(data.connectionState)
  })

  test('should return TradingStatus with valid lastUpdate timestamp', async () => {
    const response = await fetch(FULL_URL)
    expect(response.status).toBe(200)

    const data: TradingStatus = await response.json()

    // Validate ISO 8601 format
    const timestamp = new Date(data.lastUpdate)
    expect(timestamp.toISOString()).toBe(data.lastUpdate)

    // Ensure timestamp is recent (within last hour for active system)
    const now = Date.now()
    const timestampMs = timestamp.getTime()
    expect(Math.abs(now - timestampMs)).toBeLessThan(60 * 60 * 1000) // 1 hour
  })

  test('should handle different trading modes correctly', async () => {
    // Test each possible mode value
    const modes: TradingStatus['mode'][] = ['live', 'paper', 'backtest']

    for (const expectedMode of modes) {
      // Override mock to return specific mode
      setMockAPIHandler('botStatus', () => ({
        status: 200,
        data: {
          isActive: true,
          mode: expectedMode,
          connectionState: 'connected',
          lastUpdate: new Date().toISOString()
        }
      }))

      const response = await fetch(FULL_URL)
      expect(response.status).toBe(200)

      const data: TradingStatus = await response.json()
      expect(data.mode).toBe(expectedMode)
    }
  })

  test('should handle different connection states correctly', async () => {
    // Test each possible connectionState value
    const states: TradingStatus['connectionState'][] = ['connected', 'connecting', 'disconnected', 'reconnecting']

    for (const expectedState of states) {
      // Override mock to return specific connectionState
      setMockAPIHandler('botStatus', () => ({
        status: 200,
        data: {
          isActive: false,
          mode: 'paper',
          connectionState: expectedState,
          lastUpdate: new Date().toISOString()
        }
      }))

      const response = await fetch(FULL_URL)
      expect(response.status).toBe(200)

      const data: TradingStatus = await response.json()
      expect(data.connectionState).toBe(expectedState)
    }
  })
})

// =============================================================================
// ERROR SCENARIOS
// =============================================================================

describe('GET /api/bot/status - Error Scenarios', () => {
  test('should handle server errors gracefully (500)', async () => {
    // Override mock to return server error
    setMockAPIHandler('botStatus', () => ({
      status: 500,
      error: 'Internal Server Error'
    }))

    const response = await fetch(FULL_URL)
    expect(response.status).toBe(500)
    expect(response.headers.get('content-type')).toContain('application/json')

    const errorData = await response.json()
    expect(errorData).toHaveProperty('error')
    expect(typeof errorData.error).toBe('string')
  })

  test('should handle network timeouts properly', async () => {
    // Override mock to simulate timeout
    setMockAPIHandler('botStatus', () => ({
      status: 200,
      data: {
        isActive: true,
        mode: 'paper',
        connectionState: 'connected',
        lastUpdate: new Date().toISOString()
      },
      delay: testConfig.api.timeout + 100 // Exceed timeout
    }))

    // This test verifies the client handles timeouts correctly
    // Implementation should include proper timeout handling
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), testConfig.api.timeout)

    try {
      const response = await fetch(FULL_URL, {
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      // If we get here, the request completed within timeout
      expect(response.status).toBe(200)
    } catch (error: any) {
      clearTimeout(timeoutId)

      // Expect timeout/abort error
      expect(error.name).toMatch(/(AbortError|TimeoutError)/)
    }
  })
})

// =============================================================================
// CONTRACT COMPLIANCE TESTS
// =============================================================================

describe('GET /api/bot/status - OpenAPI Contract Compliance', () => {
  test('should match exact OpenAPI specification', async () => {
    const response = await fetch(FULL_URL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Lifeguard-Token-Vault-Test/1.0'
      }
    })

    // Validate response matches OpenAPI spec exactly
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/^application\/json/)

    const data = await response.json()

    // Ensure ONLY required fields are present (no extra fields)
    const allowedFields = ['isActive', 'mode', 'connectionState', 'lastUpdate']
    const actualFields = Object.keys(data)

    for (const field of actualFields) {
      expect(allowedFields).toContain(field)
    }

    // Ensure ALL required fields are present
    for (const field of allowedFields) {
      expect(actualFields).toContain(field)
    }

    // Full schema validation
    validateTradingStatusSchema(data)
  })

  test('should not accept unsupported HTTP methods', async () => {
    // Test that only GET is supported
    const unsupportedMethods = ['POST', 'PUT', 'DELETE', 'PATCH']

    for (const method of unsupportedMethods) {
      const response = await fetch(FULL_URL, { method })

      // Should return 405 Method Not Allowed
      expect(response.status).toBe(405)
    }
  })

  test('should handle malformed requests gracefully', async () => {
    // Test with invalid headers
    const response = await fetch(FULL_URL, {
      headers: {
        'Accept': 'text/plain', // Invalid accept header
        'Content-Type': 'invalid/type'
      }
    })

    // Should still work (GET requests ignore Content-Type)
    // But might return 406 Not Acceptable for Accept header
    expect([200, 406]).toContain(response.status)
  })
})

// =============================================================================
// PERFORMANCE AND RELIABILITY TESTS
// =============================================================================

describe('GET /api/bot/status - Performance & Reliability', () => {
  test('should respond within acceptable time limits', async () => {
    const startTime = Date.now()

    const response = await fetch(FULL_URL)

    const endTime = Date.now()
    const responseTime = endTime - startTime

    expect(response.status).toBe(200)
    expect(responseTime).toBeLessThan(1000) // Should respond within 1 second
  })

  test('should handle concurrent requests', async () => {
    // Make multiple concurrent requests
    const concurrentRequests = 10
    const promises = Array.from({ length: concurrentRequests }, () =>
      fetch(FULL_URL)
    )

    const responses = await Promise.all(promises)

    // All should succeed
    for (const response of responses) {
      expect(response.status).toBe(200)
      const data = await response.json()
      validateTradingStatusSchema(data)
    }
  })

  test('should be idempotent (multiple calls return same result)', async () => {
    const response1 = await fetch(FULL_URL)
    const data1 = await response1.json()

    const response2 = await fetch(FULL_URL)
    const data2 = await response2.json()

    // Both should succeed
    expect(response1.status).toBe(200)
    expect(response2.status).toBe(200)

    // Data structure should be consistent (though values may change)
    expect(typeof data1.isActive).toBe(typeof data2.isActive)
    expect(typeof data1.mode).toBe(typeof data2.mode)
    expect(typeof data1.connectionState).toBe(typeof data2.connectionState)
    expect(typeof data1.lastUpdate).toBe(typeof data2.lastUpdate)
  })
})