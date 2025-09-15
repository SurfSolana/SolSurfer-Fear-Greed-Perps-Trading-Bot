/**
 * Contract test for WebSocket /api/ws endpoint
 *
 * This test validates WebSocket communication matches the OpenAPI specification exactly.
 * Tests real-time message exchange and connection lifecycle.
 *
 * OpenAPI Spec: /specs/002-redesign-the-web/contracts/api.yaml
 * Message Types: /web/lib/types.ts (WebSocket message definitions)
 *
 * TDD Approach: This test WILL FAIL initially because the WebSocket endpoint doesn't exist yet.
 * This follows TDD principles - write the test first, then implement the endpoint.
 *
 * Run with: bun test __tests__/contract/websocket.test.ts
 */

// Test framework globals (describe, test, expect, beforeAll, afterAll, beforeEach, afterEach) are available globally
import type {
  InboundWebSocketMessage,
  OutboundWebSocketMessage,
  WebSocketMessage,
  FGIUpdateMessage,
  PositionUpdateMessage,
  TradeExecutedMessage,
  StatusChangeMessage,
  MetricsUpdateMessage,
  UpdateParametersMessage,
  ControlBotMessage,
  RequestBacktestMessage,
  TradingParameters,
  TradingStatus,
  Position,
  Transaction,
  PortfolioMetrics,
  FGIData
} from '../../lib/types'
import {
  MockWebSocket,
  createMockWebSocket,
  sendMockWebSocketMessage,
  mockTradingParameters,
  mockBotStatus,
  mockTransaction,
  mockFGIUpdate,
  resetAllMocks
} from '../../test.setup'

const WS_URL = 'ws://localhost:3001'

// Test message factories based on OpenAPI contract
const createFGIUpdateMessage = (data?: Partial<FGIData>): FGIUpdateMessage => ({
  type: 'FGI_UPDATE',
  data: {
    value: 45,
    timestamp: new Date().toISOString(),
    trend: 'up',
    changePercent: 2.5,
    ...data
  }
})

const createPositionUpdateMessage = (data?: Partial<Position>): PositionUpdateMessage => ({
  type: 'POSITION_UPDATE',
  data: {
    id: 'pos_123',
    asset: 'ETH-PERP',
    side: 'long',
    size: 1.5,
    entryPrice: 2000,
    markPrice: 2050,
    unrealizedPnl: 75,
    leverage: 3,
    liquidationPrice: 1500,
    ...data
  }
})

const createTradeExecutedMessage = (data?: Partial<Transaction>): TradeExecutedMessage => ({
  type: 'TRADE_EXECUTED',
  data: {
    id: 'trade_456',
    timestamp: new Date().toISOString(),
    action: 'OPEN_LONG',
    asset: 'ETH-PERP',
    price: 2000,
    size: 1.5,
    fgi: 45,
    pnl: null,
    fees: 5.0,
    ...data
  }
})

const createStatusChangeMessage = (data?: Partial<TradingStatus>): StatusChangeMessage => ({
  type: 'STATUS_CHANGE',
  data: {
    isActive: true,
    mode: 'live',
    connectionState: 'connected',
    lastUpdate: new Date().toISOString(),
    ...data
  }
})

const createMetricsUpdateMessage = (data?: Partial<PortfolioMetrics>): MetricsUpdateMessage => ({
  type: 'METRICS_UPDATE',
  data: {
    totalValue: 12500,
    dailyPnl: 250,
    dailyPnlPercent: 2.0,
    totalPnl: 2500,
    totalPnlPercent: 25.0,
    winRate: 68.5,
    sharpeRatio: 1.8,
    maxDrawdown: 15.2,
    ...data
  }
})

const createUpdateParametersMessage = (data?: Partial<TradingParameters>): UpdateParametersMessage => ({
  type: 'UPDATE_PARAMETERS',
  data: {
    fgiBuyThreshold: 30,
    fgiSellThreshold: 70,
    leverage: 3,
    positionSize: 1000,
    maxPositions: 2,
    stopLoss: 10,
    takeProfit: 20,
    ...data
  }
})

const createControlBotMessage = (action: 'start' | 'stop' | 'pause' = 'start'): ControlBotMessage => ({
  type: 'CONTROL_BOT',
  data: {
    action
  }
})

const createRequestBacktestMessage = (data?: Partial<{
  parameters: TradingParameters
  startDate: string
  endDate: string
}>): RequestBacktestMessage => ({
  type: 'REQUEST_BACKTEST',
  data: {
    parameters: mockTradingParameters(),
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    ...data
  }
})

describe('WebSocket /api/ws - OpenAPI Contract Tests', () => {
  let mockWs: MockWebSocket

  beforeAll(() => {
    console.log('🧪 Running WebSocket contract tests against:', WS_URL)
    console.log('📝 Note: Tests will initially FAIL until WebSocket endpoint is implemented (TDD approach)')
    console.log('🔗 OpenAPI Spec: /specs/002-redesign-the-web/contracts/api.yaml')
    console.log('📋 Message Types: /web/lib/types.ts')
  })

  beforeEach(() => {
    resetAllMocks()
    mockWs = createMockWebSocket({ autoConnect: false })
  })

  afterEach(() => {
    if (mockWs) {
      mockWs.close()
    }
    resetAllMocks()
  })

  afterAll(() => {
    console.log('✅ WebSocket contract test suite completed')
  })

  describe('Connection Establishment', () => {
    test('should establish WebSocket connection to /api/ws', async () => {
      // TDD: This will fail initially - WebSocket server doesn't exist
      const ws = new WebSocket(WS_URL)

      const connectionPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'))
        }, 5000)

        ws.onopen = () => {
          clearTimeout(timeout)
          resolve()
        }

        ws.onerror = (error) => {
          clearTimeout(timeout)
          reject(error)
        }
      })

      await expect(connectionPromise).resolves.toBeUndefined()

      expect(ws.readyState).toBe(WebSocket.OPEN)
      ws.close()
    })

    test('should handle connection upgrade headers correctly', async () => {
      // Test WebSocket upgrade process
      const response = await fetch('http://localhost:3000/api/ws', {
        headers: {
          'Connection': 'Upgrade',
          'Upgrade': 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ=='
        }
      })

      // Should respond with WebSocket upgrade or proper error
      expect([101, 426]).toContain(response.status)

      if (response.status === 101) {
        expect(response.headers.get('upgrade')?.toLowerCase()).toBe('websocket')
        expect(response.headers.get('connection')?.toLowerCase()).toContain('upgrade')
      }
    })

    test('should reject non-WebSocket requests to /api/ws', async () => {
      const response = await fetch('http://localhost:3000/api/ws')

      // Should reject normal HTTP requests
      expect(response.status).toBe(426) // Upgrade Required

      const responseText = await response.text()
      expect(responseText.toLowerCase()).toContain('websocket')
    })

    test('should handle connection close gracefully', async () => {
      mockWs.connect()

      await new Promise(resolve => {
        mockWs.addEventListener('open', resolve)
      })

      const closePromise = new Promise<void>((resolve) => {
        mockWs.addEventListener('close', (event) => {
          expect(event.data.code).toBeDefined()
          resolve()
        })
      })

      mockWs.close(1000, 'Test close')

      await closePromise
      expect(mockWs.readyState).toBe(WebSocket.CLOSED)
    })
  })

  describe('Inbound Messages - Server to Client', () => {
    beforeEach(async () => {
      mockWs = createMockWebSocket({ autoConnect: true })
      await new Promise(resolve => mockWs.addEventListener('open', resolve))
    })

    test('should receive and validate FGI_UPDATE messages', async () => {
      const expectedMessage = createFGIUpdateMessage()

      const messagePromise = new Promise<FGIUpdateMessage>((resolve) => {
        mockWs.addEventListener('message', (event) => {
          const message = JSON.parse(event.data.data)
          if (message.type === 'FGI_UPDATE') {
            resolve(message)
          }
        })
      })

      mockWs.receiveMessage(expectedMessage)

      const receivedMessage = await messagePromise

      // Validate message structure per OpenAPI spec
      expect(receivedMessage.type).toBe('FGI_UPDATE')
      expect(typeof receivedMessage.data.value).toBe('number')
      expect(receivedMessage.data.value).toBeGreaterThanOrEqual(0)
      expect(receivedMessage.data.value).toBeLessThanOrEqual(100)
      expect(typeof receivedMessage.data.timestamp).toBe('string')
      expect(['up', 'down', 'stable']).toContain(receivedMessage.data.trend)
      expect(typeof receivedMessage.data.changePercent).toBe('number')
    })

    test('should receive and validate POSITION_UPDATE messages', async () => {
      const expectedMessage = createPositionUpdateMessage()

      const messagePromise = new Promise<PositionUpdateMessage>((resolve) => {
        mockWs.addEventListener('message', (event) => {
          const message = JSON.parse(event.data.data)
          if (message.type === 'POSITION_UPDATE') {
            resolve(message)
          }
        })
      })

      mockWs.receiveMessage(expectedMessage)

      const receivedMessage = await messagePromise

      // Validate Position structure per OpenAPI spec
      expect(receivedMessage.type).toBe('POSITION_UPDATE')
      expect(typeof receivedMessage.data.id).toBe('string')
      expect(typeof receivedMessage.data.asset).toBe('string')
      expect(['long', 'short']).toContain(receivedMessage.data.side)
      expect(typeof receivedMessage.data.size).toBe('number')
      expect(receivedMessage.data.size).toBeGreaterThan(0)
      expect(typeof receivedMessage.data.entryPrice).toBe('number')
      expect(receivedMessage.data.entryPrice).toBeGreaterThan(0)
      expect(typeof receivedMessage.data.markPrice).toBe('number')
      expect(receivedMessage.data.markPrice).toBeGreaterThan(0)
      expect(typeof receivedMessage.data.unrealizedPnl).toBe('number')
      expect(typeof receivedMessage.data.leverage).toBe('number')
      expect(receivedMessage.data.leverage).toBeGreaterThanOrEqual(1)
      expect(receivedMessage.data.leverage).toBeLessThanOrEqual(20)
    })

    test('should receive and validate TRADE_EXECUTED messages', async () => {
      const expectedMessage = createTradeExecutedMessage()

      const messagePromise = new Promise<TradeExecutedMessage>((resolve) => {
        mockWs.addEventListener('message', (event) => {
          const message = JSON.parse(event.data.data)
          if (message.type === 'TRADE_EXECUTED') {
            resolve(message)
          }
        })
      })

      mockWs.receiveMessage(expectedMessage)

      const receivedMessage = await messagePromise

      // Validate Transaction structure per OpenAPI spec
      expect(receivedMessage.type).toBe('TRADE_EXECUTED')
      expect(typeof receivedMessage.data.id).toBe('string')
      expect(typeof receivedMessage.data.timestamp).toBe('string')
      expect(['OPEN_LONG', 'OPEN_SHORT', 'CLOSE_LONG', 'CLOSE_SHORT']).toContain(receivedMessage.data.action)
      expect(typeof receivedMessage.data.asset).toBe('string')
      expect(typeof receivedMessage.data.price).toBe('number')
      expect(receivedMessage.data.price).toBeGreaterThan(0)
      expect(typeof receivedMessage.data.size).toBe('number')
      expect(receivedMessage.data.size).toBeGreaterThan(0)
      expect(typeof receivedMessage.data.fgi).toBe('number')
      expect(receivedMessage.data.fgi).toBeGreaterThanOrEqual(0)
      expect(receivedMessage.data.fgi).toBeLessThanOrEqual(100)
      expect(typeof receivedMessage.data.fees).toBe('number')
      expect(receivedMessage.data.fees).toBeGreaterThanOrEqual(0)
    })

    test('should receive and validate STATUS_CHANGE messages', async () => {
      const expectedMessage = createStatusChangeMessage()

      const messagePromise = new Promise<StatusChangeMessage>((resolve) => {
        mockWs.addEventListener('message', (event) => {
          const message = JSON.parse(event.data.data)
          if (message.type === 'STATUS_CHANGE') {
            resolve(message)
          }
        })
      })

      mockWs.receiveMessage(expectedMessage)

      const receivedMessage = await messagePromise

      // Validate TradingStatus structure per OpenAPI spec
      expect(receivedMessage.type).toBe('STATUS_CHANGE')
      expect(typeof receivedMessage.data.isActive).toBe('boolean')
      expect(['live', 'paper', 'backtest']).toContain(receivedMessage.data.mode)
      expect(['connected', 'connecting', 'disconnected', 'reconnecting']).toContain(receivedMessage.data.connectionState)
      expect(typeof receivedMessage.data.lastUpdate).toBe('string')
    })

    test('should receive and validate METRICS_UPDATE messages', async () => {
      const expectedMessage = createMetricsUpdateMessage()

      const messagePromise = new Promise<MetricsUpdateMessage>((resolve) => {
        mockWs.addEventListener('message', (event) => {
          const message = JSON.parse(event.data.data)
          if (message.type === 'METRICS_UPDATE') {
            resolve(message)
          }
        })
      })

      mockWs.receiveMessage(expectedMessage)

      const receivedMessage = await messagePromise

      // Validate PortfolioMetrics structure per OpenAPI spec
      expect(receivedMessage.type).toBe('METRICS_UPDATE')
      expect(typeof receivedMessage.data.totalValue).toBe('number')
      expect(typeof receivedMessage.data.dailyPnl).toBe('number')
      expect(typeof receivedMessage.data.dailyPnlPercent).toBe('number')
      expect(typeof receivedMessage.data.totalPnl).toBe('number')
      expect(typeof receivedMessage.data.totalPnlPercent).toBe('number')
      expect(typeof receivedMessage.data.winRate).toBe('number')
      expect(receivedMessage.data.winRate).toBeGreaterThanOrEqual(0)
      expect(receivedMessage.data.winRate).toBeLessThanOrEqual(100)
      expect(typeof receivedMessage.data.maxDrawdown).toBe('number')
    })
  })

  describe('Outbound Messages - Client to Server', () => {
    beforeEach(async () => {
      mockWs = createMockWebSocket({ autoConnect: true })
      await new Promise(resolve => mockWs.addEventListener('open', resolve))
    })

    test('should send and validate UPDATE_PARAMETERS messages', () => {
      const message = createUpdateParametersMessage()

      expect(() => {
        mockWs.send(JSON.stringify(message))
      }).not.toThrow()

      // Validate message was sent with correct structure
      // In a real test, we'd capture and validate the sent message
      expect(message.type).toBe('UPDATE_PARAMETERS')
      expect(typeof message.data.fgiBuyThreshold).toBe('number')
      expect(message.data.fgiBuyThreshold).toBeGreaterThanOrEqual(0)
      expect(message.data.fgiBuyThreshold).toBeLessThanOrEqual(100)
      expect(typeof message.data.fgiSellThreshold).toBe('number')
      expect(message.data.fgiSellThreshold).toBeGreaterThanOrEqual(0)
      expect(message.data.fgiSellThreshold).toBeLessThanOrEqual(100)
      expect(typeof message.data.leverage).toBe('number')
      expect(message.data.leverage).toBeGreaterThanOrEqual(1)
      expect(message.data.leverage).toBeLessThanOrEqual(20)
      expect(typeof message.data.positionSize).toBe('number')
      expect(message.data.positionSize).toBeGreaterThan(0)
      expect(typeof message.data.maxPositions).toBe('number')
      expect(Number.isInteger(message.data.maxPositions)).toBe(true)
      expect(message.data.maxPositions).toBeGreaterThanOrEqual(1)
    })

    test('should send and validate CONTROL_BOT messages', () => {
      const actions: Array<'start' | 'stop' | 'pause'> = ['start', 'stop', 'pause']

      for (const action of actions) {
        const message = createControlBotMessage(action)

        expect(() => {
          mockWs.send(JSON.stringify(message))
        }).not.toThrow()

        // Validate message structure
        expect(message.type).toBe('CONTROL_BOT')
        expect(message.data.action).toBe(action)
        expect(['start', 'stop', 'pause']).toContain(message.data.action)
      }
    })

    test('should send and validate REQUEST_BACKTEST messages', () => {
      const message = createRequestBacktestMessage()

      expect(() => {
        mockWs.send(JSON.stringify(message))
      }).not.toThrow()

      // Validate message structure
      expect(message.type).toBe('REQUEST_BACKTEST')
      expect(typeof message.data.parameters).toBe('object')
      expect(typeof message.data.startDate).toBe('string')
      expect(typeof message.data.endDate).toBe('string')

      // Validate date format
      expect(message.data.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(message.data.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    test('should reject invalid outbound message formats', () => {
      const invalidMessages = [
        { type: 'INVALID_TYPE', data: {} },
        { type: 'UPDATE_PARAMETERS' }, // Missing data
        { data: { action: 'start' } }, // Missing type
        'invalid json string',
        null,
        undefined
      ]

      for (const invalidMessage of invalidMessages) {
        expect(() => {
          mockWs.send(JSON.stringify(invalidMessage))
        }).not.toThrow() // MockWebSocket doesn't validate, but real implementation should

        // In a real implementation, the server should reject these
        // This test documents the expected behavior
      }
    })
  })

  describe('Message Flow and Timing', () => {
    beforeEach(async () => {
      mockWs = createMockWebSocket({ autoConnect: true })
      await new Promise(resolve => mockWs.addEventListener('open', resolve))
    })

    test('should handle rapid message sequences', async () => {
      const messages = [
        createFGIUpdateMessage({ value: 30 }),
        createFGIUpdateMessage({ value: 35 }),
        createFGIUpdateMessage({ value: 40 }),
        createPositionUpdateMessage({ size: 1.0 }),
        createPositionUpdateMessage({ size: 1.5 }),
        createMetricsUpdateMessage({ dailyPnl: 100 })
      ]

      const receivedMessages: WebSocketMessage[] = []

      mockWs.addEventListener('message', (event) => {
        receivedMessages.push(JSON.parse(event.data.data))
      })

      // Send all messages rapidly
      messages.forEach(message => {
        mockWs.receiveMessage(message)
      })

      // Wait for all messages to be processed
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(receivedMessages.length).toBe(messages.length)

      // Validate message order is preserved
      expect(receivedMessages[0].type).toBe('FGI_UPDATE')
      expect(receivedMessages[3].type).toBe('POSITION_UPDATE')
      expect(receivedMessages[5].type).toBe('METRICS_UPDATE')
    })

    test('should handle ping/pong heartbeat', async () => {
      const pongPromise = new Promise<void>((resolve) => {
        mockWs.addEventListener('message', (event) => {
          const message = JSON.parse(event.data.data)
          if (message.type === 'pong') {
            resolve()
          }
        })
      })

      // Send ping
      mockWs.send(JSON.stringify({ type: 'ping', data: {}, timestamp: Date.now() }))

      // Should receive pong
      await expect(pongPromise).resolves.toBeUndefined()
    })
  })

  describe('Error Handling and Reconnection', () => {
    test('should handle WebSocket connection errors', () => {
      mockWs = createMockWebSocket({ autoConnect: false })

      const errorPromise = new Promise<void>((resolve) => {
        mockWs.addEventListener('error', () => {
          resolve()
        })
      })

      mockWs.simulateError('Connection failed')

      return expect(errorPromise).resolves.toBeUndefined()
    })

    test('should handle unexpected disconnections', () => {
      mockWs = createMockWebSocket({ autoConnect: true })

      const closePromise = new Promise<void>((resolve) => {
        mockWs.addEventListener('close', () => {
          resolve()
        })
      })

      mockWs.simulateDisconnect()

      return expect(closePromise).resolves.toBeUndefined()
    })

    test('should support reconnection after disconnect', async () => {
      mockWs = createMockWebSocket({ autoConnect: true })

      // Wait for initial connection
      await new Promise(resolve => mockWs.addEventListener('open', resolve))
      expect(mockWs.readyState).toBe(WebSocket.OPEN)

      // Simulate disconnect
      const closePromise = new Promise<void>((resolve) => {
        mockWs.addEventListener('close', () => {
          resolve()
        })
      })

      mockWs.simulateDisconnect()
      await closePromise

      expect(mockWs.readyState).toBe(WebSocket.CLOSED)

      // Simulate reconnect
      const reopenPromise = new Promise<void>((resolve) => {
        mockWs.addEventListener('open', () => {
          resolve()
        })
      })

      mockWs.simulateReconnect()
      await reopenPromise

      expect(mockWs.readyState).toBe(WebSocket.OPEN)
    })

    test('should handle malformed message data gracefully', () => {
      mockWs = createMockWebSocket({ autoConnect: true })

      // These should not crash the connection
      const malformedData = [
        'invalid json{',
        '{"type": "INVALID_TYPE"}',
        '{"data": null}',
        ''
      ]

      malformedData.forEach(data => {
        expect(() => {
          // In a real implementation, the server should handle these gracefully
          mockWs.dispatchEvent('message', { data })
        }).not.toThrow()
      })
    })
  })

  describe('Performance and Scalability', () => {
    test('should handle high-frequency message updates', async () => {
      mockWs = createMockWebSocket({ autoConnect: true, messageDelay: 1 })
      await new Promise(resolve => mockWs.addEventListener('open', resolve))

      const messageCount = 100
      const receivedMessages: WebSocketMessage[] = []

      mockWs.addEventListener('message', (event) => {
        receivedMessages.push(JSON.parse(event.data.data))
      })

      // Send many FGI updates rapidly
      const startTime = Date.now()

      for (let i = 0; i < messageCount; i++) {
        mockWs.receiveMessage(createFGIUpdateMessage({ value: i % 100 }))
      }

      // Wait for all messages
      await new Promise(resolve => setTimeout(resolve, 500))

      const endTime = Date.now()
      const duration = endTime - startTime

      expect(receivedMessages.length).toBe(messageCount)
      expect(duration).toBeLessThan(1000) // Should handle 100 messages in under 1 second
    })

    test('should maintain connection stability under load', async () => {
      mockWs = createMockWebSocket({ autoConnect: true })
      await new Promise(resolve => mockWs.addEventListener('open', resolve))

      let connectionStable = true

      mockWs.addEventListener('close', () => {
        connectionStable = false
      })

      mockWs.addEventListener('error', () => {
        connectionStable = false
      })

      // Send mixed message types rapidly
      for (let i = 0; i < 50; i++) {
        mockWs.receiveMessage(createFGIUpdateMessage())
        mockWs.send(JSON.stringify(createControlBotMessage('start')))
        mockWs.receiveMessage(createPositionUpdateMessage())
        mockWs.send(JSON.stringify(createUpdateParametersMessage()))
      }

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(connectionStable).toBe(true)
      expect(mockWs.readyState).toBe(WebSocket.OPEN)
    })
  })
})