/**
 * WebSocket server endpoint for Next.js 15
 * Handles WebSocket connections for real-time bot status, trade, and FGI updates
 */

import { NextRequest } from 'next/server'
import { WebSocketServer, WebSocket } from 'ws'
import { WebSocketMessage, TradingStatus, Transaction } from '@/lib/types'
import * as path from 'path'
import * as fs from 'fs'

// Store active WebSocket connections
const connections = new Set<WebSocket>()

// WebSocket server instance
let wss: WebSocketServer | null = null

// Broadcast interval for sending updates
let broadcastInterval: NodeJS.Timeout | null = null

export async function GET(request: NextRequest) {
  // Handle WebSocket upgrade
  const upgrade = request.headers.get('upgrade')
  
  if (upgrade !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 })
  }

  try {
    // Initialize WebSocket server if not already done
    if (!wss) {
      initializeWebSocketServer()
    }

    // For Next.js, we need to handle the upgrade manually
    // This is a limitation of Next.js 15 - WebSocket upgrade needs special handling
    return new Response('WebSocket upgrade not directly supported in Next.js route handlers', {
      status: 426,
      headers: {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
        'Sec-WebSocket-Version': '13'
      }
    })
  } catch (error) {
    console.error('WebSocket upgrade error:', error)
    return new Response('WebSocket upgrade failed', { status: 500 })
  }
}

/**
 * Initialize WebSocket server on a separate port for Next.js compatibility
 */
function initializeWebSocketServer() {
  if (wss) return

  // Create WebSocket server on port 3001 (separate from Next.js)
  wss = new WebSocketServer({ 
    port: 3001,
    verifyClient: (info: { origin: string; secure: boolean; req: any }) => {
      // Basic verification - in production, add proper authentication
      return true
    }
  })

  wss.on('connection', (ws: WebSocket, request) => {
    console.log('New WebSocket connection established')
    connections.add(ws)

    // Send connection confirmation
    sendMessage(ws, {
      type: 'connection_status',
      data: { connected: true },
      timestamp: Date.now()
    })

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage
        handleClientMessage(ws, message)
      } catch (error) {
        console.error('Failed to parse client message:', error)
        sendMessage(ws, {
          type: 'error',
          data: { message: 'Invalid message format' },
          timestamp: Date.now()
        })
      }
    })

    // Handle connection close
    ws.on('close', () => {
      console.log('WebSocket connection closed')
      connections.delete(ws)
    })

    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error)
      connections.delete(ws)
    })

    // Send initial data
    sendInitialData(ws)
  })

  // Start broadcasting updates
  startBroadcasting()

  console.log('WebSocket server initialized on port 3001')
}

/**
 * Handle messages from clients
 */
function handleClientMessage(ws: WebSocket, message: WebSocketMessage) {
  switch (message.type) {
    case 'ping':
      sendMessage(ws, {
        type: 'pong',
        data: {},
        timestamp: Date.now()
      })
      break
    
    case 'pong':
      // Client responded to ping - connection is alive
      break
    
    default:
      console.log('Received unknown message type:', message.type)
  }
}

/**
 * Send initial data to newly connected client
 */
async function sendInitialData(ws: WebSocket) {
  try {
    // Get current bot status
    const botStatus = await getCurrentBotStatus()
    sendMessage(ws, {
      type: 'bot_status',
      data: botStatus,
      timestamp: Date.now()
    })

    // Get recent trades
    const trades = await getRecentTrades()
    trades.forEach(trade => {
      sendMessage(ws, {
        type: 'trade_update',
        data: trade,
        timestamp: Date.now()
      })
    })

    // Get current FGI
    const fgiData = await getCurrentFGI()
    if (fgiData) {
      sendMessage(ws, {
        type: 'fgi_update',
        data: fgiData,
        timestamp: Date.now()
      })
    }
  } catch (error) {
    console.error('Failed to send initial data:', error)
  }
}

/**
 * Start broadcasting updates to all connected clients
 */
function startBroadcasting() {
  if (broadcastInterval) return

  broadcastInterval = setInterval(async () => {
    if (connections.size === 0) return

    try {
      // Get current bot status and broadcast
      const botStatus = await getCurrentBotStatus()
      broadcast({
        type: 'bot_status',
        data: botStatus,
        timestamp: Date.now()
      })

      // Get and broadcast FGI updates
      const fgiData = await getCurrentFGI()
      if (fgiData) {
        broadcast({
          type: 'fgi_update',
          data: fgiData,
          timestamp: Date.now()
        })
      }
    } catch (error) {
      console.error('Error during broadcast:', error)
    }
  }, 3000) // Broadcast every 3 seconds (better than 5s polling)
}

/**
 * Broadcast message to all connected clients
 */
function broadcast(message: WebSocketMessage) {
  const deadConnections: WebSocket[] = []
  
  connections.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      sendMessage(ws, message)
    } else {
      deadConnections.push(ws)
    }
  })

  // Clean up dead connections
  deadConnections.forEach(ws => connections.delete(ws))
}

/**
 * Send message to a specific client
 */
function sendMessage(ws: WebSocket, message: WebSocketMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(message))
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }
}

/**
 * Get current bot status (reusing logic from status route)
 */
async function getCurrentBotStatus(): Promise<TradingStatus> {
  try {
    const statePath = path.join(process.cwd(), '..', 'data', 'current-state', 'fgi-drift-state-v2.json')
    const pidPath = path.join(process.cwd(), '..', 'bot.pid')
    
    let state = {
      hasOpenPosition: false,
      direction: 'NEUTRAL' as 'LONG' | 'SHORT' | 'NEUTRAL',
      size: 0,
      entryPrice: 0,
      entryFGI: 0,
      timestamp: Date.now(),
      lastCheckedFGI: 50,
      lastCheckTime: Date.now()
    }

    if (fs.existsSync(statePath)) {
      const stateContent = fs.readFileSync(statePath, 'utf-8')
      const savedState = JSON.parse(stateContent)
      state = { ...state, ...savedState }
    }

    // Check if bot is running
    let isRunning = false
    if (fs.existsSync(pidPath)) {
      try {
        const pid = parseInt(fs.readFileSync(pidPath, 'utf-8').trim())
        process.kill(pid, 0)
        isRunning = true
      } catch (error) {
        isRunning = false
      }
    }

    // Get current FGI and price
    let currentFGI = 50
    let currentPrice = 0
    
    try {
      const response = await fetch('https://api.surfsolana.com/ETH/4h/latest.json')
      if (response.ok) {
        const data = await response.json()
        const latest = Array.isArray(data) ? data[data.length - 1] : data
        if (latest && typeof latest.fgi !== 'undefined') {
          currentFGI = parseInt(latest.fgi) || 50
          currentPrice = parseFloat(latest.price) || 0
        }
      }
    } catch (error) {
      console.error('Failed to fetch FGI:', error)
    }

    // Get balance
    const today = new Date().toISOString().split('T')[0]
    const perfPath = path.join(process.cwd(), '..', 'data', 'performance', `daily-performance-${today}.json`)
    let balance = 10000
    
    if (fs.existsSync(perfPath)) {
      const perfContent = fs.readFileSync(perfPath, 'utf-8')
      const performance = JSON.parse(perfContent)
      balance = performance.currentBalance || balance
    }

    // Determine connection state based on API access
    let connectionState: 'connected' | 'connecting' | 'disconnected' | 'reconnecting' = 'connected'
    try {
      const testResponse = await fetch('https://api.surfsolana.com/ETH/4h/latest.json')
      connectionState = testResponse.ok ? 'connected' : 'disconnected'
    } catch (error) {
      connectionState = 'disconnected'
    }

    return {
      isActive: isRunning,
      mode: 'paper' as const,
      connectionState,
      lastUpdate: new Date().toISOString()
    }
  } catch (error) {
    console.error('Failed to get bot status:', error)
    return {
      isActive: false,
      mode: 'paper' as const,
      connectionState: 'disconnected' as const,
      lastUpdate: new Date().toISOString()
    }
  }
}

/**
 * Get recent trades
 */
async function getRecentTrades(): Promise<Transaction[]> {
  try {
    // This would typically read from a trades database or file
    // For now, return empty array - the actual trades API handles this
    return []
  } catch (error) {
    console.error('Failed to get recent trades:', error)
    return []
  }
}

/**
 * Get current FGI data
 */
async function getCurrentFGI() {
  try {
    const response = await fetch('https://api.surfsolana.com/ETH/4h/latest.json')
    if (response.ok) {
      const data = await response.json()
      const latest = Array.isArray(data) ? data[data.length - 1] : data
      if (latest && typeof latest.fgi !== 'undefined') {
        const fgi = parseInt(latest.fgi) || 50
        let classification: 'extreme-fear' | 'fear' | 'neutral' | 'greed' | 'extreme-greed'
        
        if (fgi <= 20) classification = 'extreme-fear'
        else if (fgi <= 40) classification = 'fear'
        else if (fgi <= 60) classification = 'neutral'
        else if (fgi <= 80) classification = 'greed'
        else classification = 'extreme-greed'

        return {
          value: fgi,
          classification,
          timestamp: Date.now()
        }
      }
    }
    return null
  } catch (error) {
    console.error('Failed to get FGI data:', error)
    return null
  }
}

/**
 * Cleanup function for graceful shutdown
 */
export function cleanup() {
  if (broadcastInterval) {
    clearInterval(broadcastInterval)
    broadcastInterval = null
  }
  
  if (wss) {
    wss.close()
    wss = null
  }
  
  connections.clear()
}

// Handle process termination
if (typeof process !== 'undefined') {
  process.on('SIGTERM', cleanup)
  process.on('SIGINT', cleanup)
}