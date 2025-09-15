import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

export async function GET(request: NextRequest) {
  try {
    // Read state file
    const statePath = path.join(process.cwd(), '..', 'data', 'current-state', 'fgi-drift-state-v2.json')
    const fgiDataPath = path.join(process.cwd(), '..', 'current-fgi.json')
    
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
    const pidPath = path.join(process.cwd(), '..', 'bot.pid')
    let isRunning = false
    
    if (fs.existsSync(pidPath)) {
      try {
        const pid = parseInt(fs.readFileSync(pidPath, 'utf-8').trim())
        // Check if process is actually running
        process.kill(pid, 0) // This throws if process doesn't exist
        isRunning = true
      } catch (error) {
        // Process not running, clean up stale PID file
        try {
          fs.unlinkSync(pidPath)
        } catch (cleanupError) {
          console.error('Failed to clean up stale PID file:', cleanupError)
        }
        isRunning = false
      }
    }

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

    return NextResponse.json({
      isRunning,
      position: state.hasOpenPosition ? state.direction : 'NEUTRAL',
      currentPnL,
      currentPnLPercent,
      entryPrice: state.entryPrice,
      currentPrice,
      currentFGI,
      lastUpdate: new Date().toISOString(),
      balance
    })
  } catch (error) {
    console.error('Failed to get status:', error)
    return NextResponse.json(
      { 
        isRunning: false,
        position: 'NEUTRAL',
        currentPnL: 0,
        currentPnLPercent: 0,
        currentFGI: 50,
        lastUpdate: new Date().toISOString(),
        balance: 10000
      }
    )
  }
}