/**
 * Test Environment Configuration for Lifeguard Token Vault
 *
 * This file sets up the complete test environment for TDD:
 * - React component testing with providers
 * - API contract testing utilities
 * - WebSocket mocking
 * - Performance testing helpers
 * - Test data factories
 *
 * Following TDD principles - tests fail first, then implementation
 */

// Test framework globals (beforeAll, afterAll, beforeEach, afterEach) are available globally
import React, { type ReactElement, type ReactNode } from 'react'
import type {
  TradingParameters,
  BacktestResult,
  BotStatus,
  Transaction,
  WebSocketMessage,
  PriceUpdate,
  FGIUpdate,
  ChartDataPoint,
  PerformanceMetrics
} from './lib/types'

// =============================================================================
// GLOBAL TEST ENVIRONMENT SETUP
// =============================================================================

declare global {
  interface Window {
    __TEST_ENV__: boolean
    __MOCKS__: {
      websocket?: MockWebSocket
      performance?: MockPerformance
      api?: MockAPIHandlers
    }
  }

  namespace NodeJS {
    interface Global {
      fetch: typeof fetch
    }
  }
}

// Ensure test environment is properly identified
beforeAll(() => {
  if (typeof window !== 'undefined') {
    window.__TEST_ENV__ = true
    window.__MOCKS__ = {}
  }

  // Set up global fetch mock for API testing
  if (!globalThis.fetch) {
    globalThis.fetch = mockFetch
  }
})

afterAll(() => {
  // Clean up global state
  if (typeof window !== 'undefined') {
    delete window.__TEST_ENV__
    delete window.__MOCKS__
  }
})

// =============================================================================
// REACT TESTING UTILITIES
// =============================================================================

/**
 * Test wrapper that provides all necessary React contexts
 */
export interface TestWrapperProps {
  children: ReactNode
  initialTradingParams?: TradingParameters
  mockWebSocket?: boolean
  queryClientOptions?: any
}

/**
 * Custom render function that includes all providers
 * Usage: render(<Component />, { wrapper: createTestWrapper() })
 */
export function createTestWrapper(options: Omit<TestWrapperProps, 'children'> = {}) {
  return function TestWrapper({ children }: { children: ReactNode }) {
    const {
      initialTradingParams = mockTradingParameters(),
      mockWebSocket = true,
      queryClientOptions = {}
    } = options

    // Mock providers would be imported here in real implementation
    // For now, we return children directly (TDD - fail first)
    return React.createElement('div', {
      'data-test-wrapper': 'true',
      'data-mock-websocket': mockWebSocket
    }, children)
  }
}

/**
 * Enhanced render function for React components
 */
export async function renderComponent(
  component: ReactElement,
  options: TestWrapperProps = {}
) {
  const { children, ...wrapperOptions } = options

  // This will fail initially - TDD approach
  // Implementation needed:
  // - Import @testing-library/react
  // - Set up QueryClient
  // - Set up theme providers
  // - Set up WebSocket context

  throw new Error('renderComponent not implemented yet - TDD: implement after test fails')
}

/**
 * Wait for component to be ready (animations, async operations)
 */
export async function waitForComponentReady(timeout: number = 1000): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout)
  })
}

/**
 * Assert 60fps performance for animations
 */
export function assertSmoothAnimation(element: Element, duration: number = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const startTime = performance.now()
    const frames: number[] = []

    function measureFrame() {
      const currentTime = performance.now()
      frames.push(currentTime)

      if (currentTime - startTime < duration) {
        requestAnimationFrame(measureFrame)
      } else {
        // Calculate FPS
        const fps = frames.length / (duration / 1000)
        resolve(fps >= 55) // Allow 5fps tolerance for 60fps target
      }
    }

    requestAnimationFrame(measureFrame)
  })
}

// =============================================================================
// API MOCKING UTILITIES
// =============================================================================

export interface MockAPIResponse<T = any> {
  status: number
  data?: T
  error?: string
  delay?: number
}

export interface MockAPIHandlers {
  backtest: (params: any) => MockAPIResponse<BacktestResult>
  botStatus: () => MockAPIResponse<BotStatus>
  botStart: (params: TradingParameters) => MockAPIResponse<{ success: boolean }>
  botStop: () => MockAPIResponse<{ success: boolean }>
  trades: () => MockAPIResponse<Transaction[]>
  fgi: () => MockAPIResponse<FGIUpdate>
  prices: (asset: string) => MockAPIResponse<PriceUpdate>
}

/**
 * Mock fetch implementation for API contract testing
 */
export async function mockFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const urlString = url.toString()
  const method = init?.method || 'GET'
  const body = init?.body ? JSON.parse(init.body as string) : undefined

  // Extract endpoint from URL
  const endpoint = urlString.replace(/^.*\/api\//, '')

  let mockResponse: MockAPIResponse

  // Route to appropriate mock handler
  if (endpoint.startsWith('backtest/execute') && method === 'POST') {
    mockResponse = mockAPIHandlers.backtest(body)
  } else if (endpoint.startsWith('bot/status')) {
    mockResponse = mockAPIHandlers.botStatus()
  } else if (endpoint.startsWith('bot/start') && method === 'POST') {
    mockResponse = mockAPIHandlers.botStart(body)
  } else if (endpoint.startsWith('bot/stop') && method === 'POST') {
    mockResponse = mockAPIHandlers.botStop()
  } else if (endpoint.startsWith('trades')) {
    mockResponse = mockAPIHandlers.trades()
  } else if (endpoint.startsWith('fgi')) {
    mockResponse = mockAPIHandlers.fgi()
  } else if (endpoint.startsWith('prices/')) {
    const asset = endpoint.split('/')[1]
    mockResponse = mockAPIHandlers.prices(asset)
  } else {
    // 404 for unhandled endpoints
    mockResponse = { status: 404, error: 'Endpoint not found' }
  }

  // Simulate network delay
  if (mockResponse.delay) {
    await new Promise(resolve => setTimeout(resolve, mockResponse.delay))
  }

  // Create Response object
  const response = new Response(
    JSON.stringify(mockResponse.data || { error: mockResponse.error }),
    {
      status: mockResponse.status,
      headers: { 'Content-Type': 'application/json' }
    }
  )

  return response
}

/**
 * Default mock API handlers - can be overridden in individual tests
 */
export const mockAPIHandlers: MockAPIHandlers = {
  backtest: (params) => ({
    status: 200,
    data: mockBacktestResult(params),
    delay: 50
  }),

  botStatus: () => ({
    status: 200,
    data: mockBotStatus()
  }),

  botStart: (params) => ({
    status: 200,
    data: { success: true }
  }),

  botStop: () => ({
    status: 200,
    data: { success: true }
  }),

  trades: () => ({
    status: 200,
    data: mockTransactionHistory(),
    delay: 30
  }),

  fgi: () => ({
    status: 200,
    data: mockFGIUpdate()
  }),

  prices: (asset) => ({
    status: 200,
    data: mockPriceUpdate(asset as any)
  })
}

/**
 * Override API handlers for specific tests
 */
export function setMockAPIHandler<K extends keyof MockAPIHandlers>(
  endpoint: K,
  handler: MockAPIHandlers[K]
): void {
  mockAPIHandlers[endpoint] = handler
}

/**
 * Reset all API handlers to defaults
 */
export function resetMockAPIHandlers(): void {
  Object.keys(mockAPIHandlers).forEach(key => {
    delete mockAPIHandlers[key as keyof MockAPIHandlers]
  })
  Object.assign(mockAPIHandlers, {
    backtest: mockAPIHandlers.backtest,
    botStatus: mockAPIHandlers.botStatus,
    botStart: mockAPIHandlers.botStart,
    botStop: mockAPIHandlers.botStop,
    trades: mockAPIHandlers.trades,
    fgi: mockAPIHandlers.fgi,
    prices: mockAPIHandlers.prices
  })
}

// =============================================================================
// WEBSOCKET MOCKING UTILITIES
// =============================================================================

export interface MockWebSocketOptions {
  autoConnect?: boolean
  connectionDelay?: number
  messageDelay?: number
  simulateReconnect?: boolean
}

export class MockWebSocket {
  public readyState: number = WebSocket.CONNECTING
  public url: string
  public protocol: string = ''

  private listeners: { [key: string]: Function[] } = {}
  private messageQueue: WebSocketMessage[] = []
  private options: MockWebSocketOptions

  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  constructor(url: string, protocols?: string | string[], options: MockWebSocketOptions = {}) {
    this.url = url
    this.options = {
      autoConnect: true,
      connectionDelay: 50,
      messageDelay: 10,
      simulateReconnect: false,
      ...options
    }

    if (this.options.autoConnect) {
      setTimeout(() => {
        this.readyState = WebSocket.OPEN
        this.dispatchEvent('open')
      }, this.options.connectionDelay)
    }

    // Store reference for test access
    if (typeof window !== 'undefined') {
      window.__MOCKS__.websocket = this
    }
  }

  send(data: string | ArrayBuffer): void {
    if (this.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }

    // Echo back for testing
    setTimeout(() => {
      const message: WebSocketMessage = {
        type: 'pong',
        data: {},
        timestamp: Date.now()
      }
      this.receiveMessage(message)
    }, this.options.messageDelay)
  }

  close(code?: number, reason?: string): void {
    this.readyState = WebSocket.CLOSING
    setTimeout(() => {
      this.readyState = WebSocket.CLOSED
      this.dispatchEvent('close', { code, reason })
    }, 50)
  }

  addEventListener(type: string, listener: Function): void {
    if (!this.listeners[type]) {
      this.listeners[type] = []
    }
    this.listeners[type].push(listener)
  }

  removeEventListener(type: string, listener: Function): void {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter(l => l !== listener)
    }
  }

  dispatchEvent(type: string, data?: any): void {
    if (this.listeners[type]) {
      this.listeners[type].forEach(listener => {
        listener({ type, data })
      })
    }
  }

  // Test utilities
  receiveMessage(message: WebSocketMessage): void {
    setTimeout(() => {
      this.dispatchEvent('message', { data: JSON.stringify(message) })
    }, this.options.messageDelay)
  }

  simulateDisconnect(): void {
    this.readyState = WebSocket.CLOSED
    this.dispatchEvent('close', { code: 1006, reason: 'Connection lost' })
  }

  simulateError(error: string): void {
    this.dispatchEvent('error', { message: error })
  }

  simulateReconnect(): void {
    this.readyState = WebSocket.CONNECTING
    setTimeout(() => {
      this.readyState = WebSocket.OPEN
      this.dispatchEvent('open')
    }, this.options.connectionDelay)
  }
}

// Replace global WebSocket in test environment
if (typeof window !== 'undefined') {
  ;(window as any).WebSocket = MockWebSocket
}

/**
 * Create a mock WebSocket for testing
 */
export function createMockWebSocket(options?: MockWebSocketOptions): MockWebSocket {
  return new MockWebSocket('ws://localhost:3001', undefined, options)
}

/**
 * Send mock WebSocket messages for testing
 */
export function sendMockWebSocketMessage(message: WebSocketMessage): void {
  if (typeof window !== 'undefined' && window.__MOCKS__.websocket) {
    window.__MOCKS__.websocket.receiveMessage(message)
  }
}

// =============================================================================
// PERFORMANCE TESTING UTILITIES
// =============================================================================

export interface PerformanceMetrics {
  renderTime: number
  layoutTime: number
  animationFrames: number
  memoryUsage?: number
}

export class MockPerformance {
  private marks: Map<string, number> = new Map()
  private measures: Map<string, number> = new Map()

  now(): number {
    return Date.now()
  }

  mark(name: string): void {
    this.marks.set(name, this.now())
  }

  measure(name: string, startMark: string, endMark?: string): number {
    const start = this.marks.get(startMark)
    const end = endMark ? this.marks.get(endMark) : this.now()

    if (!start) throw new Error(`Mark ${startMark} not found`)

    const duration = (end || this.now()) - start
    this.measures.set(name, duration)
    return duration
  }

  getEntriesByName(name: string): Array<{ name: string, duration: number }> {
    const duration = this.measures.get(name)
    return duration !== undefined ? [{ name, duration }] : []
  }

  clearMarks(): void {
    this.marks.clear()
  }

  clearMeasures(): void {
    this.measures.clear()
  }
}

/**
 * Measure component render performance
 */
export async function measureRenderPerformance(
  renderFn: () => Promise<void> | void
): Promise<PerformanceMetrics> {
  const perf = new MockPerformance()

  perf.mark('render-start')
  await renderFn()
  perf.mark('render-end')

  const renderTime = perf.measure('render', 'render-start', 'render-end')

  return {
    renderTime,
    layoutTime: 0, // Would be measured in real implementation
    animationFrames: 0, // Would be measured in real implementation
    memoryUsage: typeof process !== 'undefined' ? process.memoryUsage().heapUsed : undefined
  }
}

/**
 * Assert performance meets 60fps requirement
 */
export function assertPerformance60fps(metrics: PerformanceMetrics): boolean {
  const targetFrameTime = 16.67 // 60fps = 16.67ms per frame
  return metrics.renderTime <= targetFrameTime
}

// =============================================================================
// TEST DATA FACTORIES
// =============================================================================

/**
 * Generate mock trading parameters
 */
export function mockTradingParameters(overrides: Partial<TradingParameters> = {}): TradingParameters {
  return {
    asset: 'SOL',
    lowThreshold: 20,
    highThreshold: 80,
    leverage: 2,
    strategy: 'contrarian',
    ...overrides
  }
}

/**
 * Generate mock backtest result
 */
export function mockBacktestResult(params?: any): BacktestResult {
  const timestamp = Date.now()
  return {
    returns: Math.random() * 200 - 100, // -100% to +100%
    maxDrawdown: Math.random() * 50, // 0% to 50%
    winRate: Math.random() * 100, // 0% to 100%
    sharpeRatio: Math.random() * 3 - 1, // -1 to 2
    trades: Math.floor(Math.random() * 100) + 10, // 10 to 110
    fees: Math.random() * 50, // 0 to 50
    liquidated: Math.random() < 0.1, // 10% chance
    timestamp,
    executionTime: Math.random() * 1000, // 0 to 1000ms
    params: params || mockTradingParameters()
  }
}

/**
 * Generate mock bot status
 */
export function mockBotStatus(overrides: Partial<BotStatus> = {}): BotStatus {
  return {
    isRunning: false,
    lastUpdate: new Date().toISOString(),
    currentParameters: mockTradingParameters(),
    balance: Math.random() * 10000 + 1000, // $1k to $11k
    openPositions: [],
    ...overrides
  }
}

/**
 * Generate mock transaction
 */
export function mockTransaction(overrides: Partial<Transaction> = {}): Transaction {
  const actions: Transaction['action'][] = ['OPEN_LONG', 'OPEN_SHORT', 'CLOSE_LONG', 'CLOSE_SHORT']
  const assets = ['SOL', 'ETH', 'BTC']

  return {
    id: Math.random().toString(36).substring(7),
    timestamp: new Date().toISOString(),
    action: actions[Math.floor(Math.random() * actions.length)],
    asset: assets[Math.floor(Math.random() * assets.length)],
    price: Math.random() * 100 + 10,
    size: Math.random() * 10 + 0.1,
    fgi: Math.floor(Math.random() * 100),
    pnl: Math.random() * 200 - 100,
    fees: Math.random() * 10,
    balance: Math.random() * 10000 + 1000,
    ...overrides
  }
}

/**
 * Generate mock transaction history
 */
export function mockTransactionHistory(count: number = 20): Transaction[] {
  return Array.from({ length: count }, (_, i) =>
    mockTransaction({
      timestamp: new Date(Date.now() - i * 3600000).toISOString() // 1 hour intervals
    })
  )
}

/**
 * Generate mock chart data
 */
export function mockChartData(points: number = 100): ChartDataPoint[] {
  const now = Date.now()
  return Array.from({ length: points }, (_, i) => ({
    timestamp: now - (points - i) * 3600000, // 1 hour intervals
    price: Math.random() * 50 + 50, // $50-$100
    fgi: Math.floor(Math.random() * 100),
    signal: Math.random() < 0.1 ? (Math.random() < 0.5 ? 'BUY' : 'SELL') : undefined
  }))
}

/**
 * Generate mock FGI update
 */
export function mockFGIUpdate(overrides: Partial<FGIUpdate> = {}): FGIUpdate {
  const value = Math.floor(Math.random() * 100)
  let classification: FGIUpdate['classification']

  if (value <= 25) classification = 'extreme-fear'
  else if (value <= 45) classification = 'fear'
  else if (value <= 55) classification = 'neutral'
  else if (value <= 75) classification = 'greed'
  else classification = 'extreme-greed'

  return {
    value,
    classification,
    timestamp: Date.now(),
    ...overrides
  }
}

/**
 * Generate mock price update
 */
export function mockPriceUpdate(asset: 'SOL' | 'ETH' | 'BTC' = 'SOL'): PriceUpdate {
  const basePrices = { SOL: 100, ETH: 2000, BTC: 40000 }
  const basePrice = basePrices[asset]

  return {
    asset,
    price: basePrice * (0.9 + Math.random() * 0.2), // ±10% variation
    change24h: Math.random() * 20 - 10, // ±10% daily change
    timestamp: Date.now()
  }
}

// =============================================================================
// TEST SETUP AND TEARDOWN HELPERS
// =============================================================================

/**
 * Reset all mocks between tests
 */
export function resetAllMocks(): void {
  resetMockAPIHandlers()

  if (typeof window !== 'undefined') {
    window.__MOCKS__ = {}
  }
}

/**
 * Set up test environment before each test
 */
beforeEach(() => {
  resetAllMocks()
})

/**
 * Clean up after each test
 */
afterEach(() => {
  // Clean up any lingering timers or intervals
  if (typeof window !== 'undefined' && window.__MOCKS__.websocket) {
    window.__MOCKS__.websocket.close()
  }
})

// =============================================================================
// ASSERTION HELPERS
// =============================================================================

/**
 * Assert that a value is within a reasonable range for financial data
 */
export function assertFinancialValue(value: number, min: number = -1000, max: number = 1000): void {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error(`Expected numeric value, got ${typeof value}: ${value}`)
  }

  if (value < min || value > max) {
    throw new Error(`Value ${value} is outside expected range ${min} to ${max}`)
  }
}

/**
 * Assert that API response matches expected structure
 */
export function assertAPIResponse<T>(response: any, expectedType: string): asserts response is T {
  if (!response || typeof response !== 'object') {
    throw new Error(`Expected object response, got ${typeof response}`)
  }

  // Add specific structure validation based on expectedType
  // This would be expanded based on actual API contracts
  if (expectedType === 'backtest' && !('returns' in response && 'winRate' in response)) {
    throw new Error('Invalid backtest response structure')
  }
}

/**
 * Assert WebSocket message format
 */
export function assertWebSocketMessage(message: any): asserts message is WebSocketMessage {
  if (!message || typeof message !== 'object') {
    throw new Error('Invalid WebSocket message format')
  }

  if (!('type' in message) || !('data' in message) || !('timestamp' in message)) {
    throw new Error('WebSocket message missing required fields')
  }
}

// =============================================================================
// EXPORT ALL TEST UTILITIES
// =============================================================================
// Note: MockWebSocket and MockPerformance are already exported via class declarations

/**
 * Main test configuration object
 */
export const testConfig = {
  api: {
    baseUrl: 'http://localhost:3000',
    timeout: 5000
  },
  websocket: {
    url: 'ws://localhost:3001',
    reconnectDelay: 1000
  },
  performance: {
    targetFps: 60,
    maxRenderTime: 16.67
  }
}

export default {
  createTestWrapper,
  renderComponent,
  mockAPIHandlers,
  createMockWebSocket,
  mockTradingParameters,
  mockBacktestResult,
  mockBotStatus,
  mockTransaction,
  resetAllMocks,
  testConfig
}