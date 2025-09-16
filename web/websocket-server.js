/**
 * Standalone WebSocket server for real-time updates
 * Runs on port 3001 to provide real-time data to the dashboard
 */

const WebSocket = require('ws')
const fs = require('fs')
const path = require('path')

// Store active WebSocket connections
const connections = new Set()

// WebSocket server instance
let wss = null

// Broadcast interval for sending updates
let broadcastInterval = null

/**
 * Initialize WebSocket server
 */
function initializeWebSocketServer() {
  if (wss) return

  // Create WebSocket server on port 3003
  wss = new WebSocket.Server({
    port: 3003,
    verifyClient: (info) => {
      // Basic verification - in production, add proper authentication
      return true
    }
  })

  wss.on('connection', (ws, request) => {
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
        const message = JSON.parse(data.toString())
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

  console.log('WebSocket server initialized on port 3003')
}

/**
 * Handle messages from clients
 */
function handleClientMessage(ws, message) {
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
async function sendInitialData(ws) {
  try {
    // Get current bot status
    const botStatus = await getCurrentBotStatus()
    sendMessage(ws, {
      type: 'bot_status',
      data: botStatus,
      timestamp: Date.now()
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
  }, 3000) // Broadcast every 3 seconds
}

/**
 * Broadcast message to all connected clients
 */
function broadcast(message) {
  const deadConnections = []

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
function sendMessage(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(message))
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }
}

/**
 * Get current bot status
 */
async function getCurrentBotStatus() {
  try {
    const statePath = path.join(process.cwd(), '..', 'fgi-drift-state-v2.json')

    let state = {
      hasOpenPosition: false,
      direction: 'NEUTRAL',
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

    // Check if bot is running using PM2
    let isRunning = false
    try {
      const { execSync } = require('child_process')
      const result = execSync('pm2 jlist', { encoding: 'utf-8' })
      const processes = JSON.parse(result)
      const botProcess = processes.find(p => p.name === 'fgi-drift-trader-v2')
      isRunning = botProcess && botProcess.pm2_env.status === 'online'
    } catch (error) {
      console.error('Failed to check PM2 status:', error)
    }

    // Get current FGI and price
    let currentFGI = 50
    let currentPrice = 0

    try {
      const fetch = (await import('node-fetch')).default
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

    // Get balance from daily performance
    const today = new Date().toISOString().split('T')[0]
    const perfPath = path.join(process.cwd(), '..', 'daily-performance.json')
    let balance = 10000
    let currentPnL = 0

    if (fs.existsSync(perfPath)) {
      const perfContent = fs.readFileSync(perfPath, 'utf-8')
      const performance = JSON.parse(perfContent)
      balance = performance.currentBalance || balance
      currentPnL = performance.currentPnL || 0
    }

    return {
      isActive: isRunning,
      mode: 'paper',
      connectionState: 'connected',
      lastUpdate: new Date().toISOString(),
      currentPnL,
      balance
    }
  } catch (error) {
    console.error('Failed to get bot status:', error)
    return {
      isActive: false,
      mode: 'paper',
      connectionState: 'disconnected',
      lastUpdate: new Date().toISOString(),
      currentPnL: 0,
      balance: 10000
    }
  }
}

/**
 * Get current FGI data
 */
async function getCurrentFGI() {
  try {
    const fetch = (await import('node-fetch')).default
    const response = await fetch('https://api.surfsolana.com/ETH/4h/latest.json')
    if (response.ok) {
      const data = await response.json()
      const latest = Array.isArray(data) ? data[data.length - 1] : data
      if (latest && typeof latest.fgi !== 'undefined') {
        const fgi = parseInt(latest.fgi) || 50
        let classification

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
function cleanup() {
  if (broadcastInterval) {
    clearInterval(broadcastInterval)
    broadcastInterval = null
  }

  if (wss) {
    wss.close()
    wss = null
  }

  connections.clear()
  console.log('WebSocket server shut down')
}

// Handle process termination
process.on('SIGTERM', cleanup)
process.on('SIGINT', cleanup)

// Start the server
initializeWebSocketServer()

// Export for testing
module.exports = { initializeWebSocketServer, cleanup }