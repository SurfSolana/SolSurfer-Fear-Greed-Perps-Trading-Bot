import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import { handleApiError } from '../../lib/error-handler'

const execAsync = promisify(exec)

// Helper function to check PM2 process status using CLI
async function checkPM2Process(name: string): Promise<any | null> {
  try {
    const { stdout, stderr } = await execAsync('pm2 jlist')
    if (stderr) {
      console.error('PM2 jlist stderr:', stderr)
    }
    const processes = JSON.parse(stdout)
    console.log(`Found ${processes.length} PM2 processes`)
    const process = processes.find((p: any) => p.name === name)
    if (process) {
      console.log(`Found process ${name}:`, { pid: process.pid, status: process.pm2_env?.status })
    } else {
      console.log(`Process ${name} not found in:`, processes.map((p: any) => p.name))
    }
    return process || null
  } catch (error: any) {
    console.error('Failed to check PM2 process:', error.message, error.stack)
    return null
  }
}

export async function GET(request: NextRequest) {
  const requestContext = { method: 'GET', endpoint: '/api/bot/status' }

  try {
    // Read state file
    const statePath = path.join(process.cwd(), '..', 'data', 'current-state', 'fgi-drift-state-v2.json')
    const configPath = path.join(process.cwd(), '..', 'data', 'trading-config.json')
    
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

    // Check if bot is running via PM2
    const botProcess = await checkPM2Process('drift-fgi-trader')
    console.log('Bot process check:', { found: botProcess !== null, status: botProcess?.pm2_env?.status })

    const isRunning = botProcess !== null && botProcess.pm2_env?.status === 'online'
    const botUptime = botProcess?.pm2_env?.pm_uptime || 0
    const botRestarts = botProcess?.pm2_env?.restart_time || 0
    const botCpu = botProcess?.monit?.cpu || 0
    const botMemory = botProcess?.monit?.memory ? (botProcess.monit.memory / 1024 / 1024).toFixed(1) : 0

    // Get current FGI
    let currentFGI = 50
    let currentPrice = 0
    
    try {
      // Try to fetch latest FGI from API (ETH 4h timeframe)
      const response = await fetch('https://api.surfsolana.com/ETH/4h/latest.json')
      if (response.ok) {
        const data = await response.json()
        // Handle both array and single object responses
        const latest = Array.isArray(data) ? data[data.length - 1] : data
        if (latest && typeof latest.fgi !== 'undefined') {
          currentFGI = parseInt(latest.fgi) || 50
          currentPrice = parseFloat(latest.price) || 0
        }
      }
    } catch (error) {
      console.error('Failed to fetch FGI:', error)
    }

    // Calculate P&L if position is open
    let currentPnL = 0
    let currentPnLPercent = 0
    
    if (state.hasOpenPosition && state.entryPrice && currentPrice && state.size) {
      const priceDiff = state.direction === 'LONG' 
        ? currentPrice - state.entryPrice
        : state.entryPrice - currentPrice
      
      // Apply leverage to P&L calculation (default 4x from bot config)
      const leverage = 4
      currentPnL = (priceDiff / state.entryPrice) * state.size
      currentPnLPercent = (priceDiff / state.entryPrice) * 100 * leverage
    }

    // Read daily performance
    const today = new Date().toISOString().split('T')[0]
    const perfPath = path.join(process.cwd(), '..', 'data', 'performance', `daily-performance-${today}.json`)
    let balance = 10000 // Default starting balance
    
    if (fs.existsSync(perfPath)) {
      const perfContent = fs.readFileSync(perfPath, 'utf-8')
      const performance = JSON.parse(perfContent)
      balance = performance.currentBalance || balance
    }

    // Read current configuration
    let config = {
      leverage: 4,
      lowThreshold: 25,
      highThreshold: 75,
      strategy: 'momentum',
      timeframe: '4h',
      asset: 'ETH'
    }

    if (fs.existsSync(configPath)) {
      try {
        const configContent = fs.readFileSync(configPath, 'utf-8')
        const savedConfig = JSON.parse(configContent)
        config = { ...config, ...savedConfig }
      } catch (error) {
        console.error('Failed to read trading config:', error)
      }
    }

    return NextResponse.json({
      isRunning,
      position: state.hasOpenPosition ? state.direction : 'NEUTRAL',
      currentPnL,
      currentPnLPercent,
      entryPrice: state.entryPrice,
      currentPrice,
      currentFGI,
      lastUpdate: new Date().toISOString(),
      balance,
      // PM2 specific metrics
      uptime: botUptime,
      restarts: botRestarts,
      cpu: botCpu,
      memory: `${botMemory} MB`,
      // Current configuration
      config
    })
  } catch (error: any) {
    // For status endpoint, we want to return a degraded response rather than error
    // This ensures the UI continues to work even if there are issues
    console.error('[/api/bot/status] Error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })

    // Return default status response for UI stability
    return NextResponse.json({
      isRunning: false,
      position: 'NEUTRAL',
      currentPnL: 0,
      currentPnLPercent: 0,
      currentFGI: 50,
      lastUpdate: new Date().toISOString(),
      balance: 10000,
      error: 'Unable to fetch complete status',
      degraded: true
    })
  }
}