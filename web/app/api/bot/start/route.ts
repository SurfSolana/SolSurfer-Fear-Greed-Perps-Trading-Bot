import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

export async function POST(request: NextRequest) {
  try {
    // Check if bot is already running
    const pidPath = path.join(process.cwd(), '..', 'bot.pid')
    if (fs.existsSync(pidPath)) {
      try {
        const pid = parseInt(fs.readFileSync(pidPath, 'utf-8').trim())
        process.kill(pid, 0) // Check if process exists
        return NextResponse.json(
          { success: false, error: 'Trading bot is already running' },
          { status: 409 }
        )
      } catch (error) {
        // Process not running, clean up stale PID file
        fs.unlinkSync(pidPath)
      }
    }

    const body = await request.json().catch(() => ({}))
    const { asset = 'ETH', lowThreshold = 49, highThreshold = 50, leverage = 4, strategy = 'fgi' } = body

    // Validate input parameters
    if (leverage < 1 || leverage > 10) {
      return NextResponse.json(
        { success: false, error: 'Leverage must be between 1 and 10' },
        { status: 400 }
      )
    }

    if (lowThreshold < 0 || lowThreshold > 100 || highThreshold < 0 || highThreshold > 100) {
      return NextResponse.json(
        { success: false, error: 'Thresholds must be between 0 and 100' },
        { status: 400 }
      )
    }

    // Update configuration file
    const configPath = path.join(process.cwd(), '..', '.env')
    if (!fs.existsSync(configPath)) {
      return NextResponse.json(
        { success: false, error: 'Configuration file not found' },
        { status: 500 }
      )
    }

    const envContent = fs.readFileSync(configPath, 'utf-8')
    
    // Update relevant environment variables - the bot uses hardcoded thresholds
    // so we mainly need to update leverage for now
    let updatedEnv = envContent
      .replace(/^LEVERAGE=.*/m, `LEVERAGE=${leverage}`)
    
    // If the leverage line doesn't exist, add it
    if (!envContent.includes('LEVERAGE=')) {
      updatedEnv += `\nLEVERAGE=${leverage}\n`
    }
    
    fs.writeFileSync(configPath, updatedEnv)

    // Start the bot process with 'service' command
    const botPath = path.join(process.cwd(), '..', 'drift-fgi-trader-v2.ts')
    const child = spawn('bun', ['run', botPath, 'service'], {
      cwd: path.join(process.cwd(), '..'),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'] // Capture output for debugging
    })

    child.unref()

    // Save process ID for later management
    fs.writeFileSync(pidPath, child.pid!.toString())

    // Log startup in the background
    if (child.stdout) {
      child.stdout.on('data', (data) => {
        console.log(`Bot output: ${data}`)
      })
    }
    
    if (child.stderr) {
      child.stderr.on('data', (data) => {
        console.error(`Bot error: ${data}`)
      })
    }

    child.on('exit', (code) => {
      console.log(`Bot process exited with code ${code}`)
      // Clean up PID file if process exits
      try {
        if (fs.existsSync(pidPath)) {
          fs.unlinkSync(pidPath)
        }
      } catch (error) {
        console.error('Failed to clean up PID file:', error)
      }
    })

    return NextResponse.json({ 
      success: true, 
      pid: child.pid,
      message: 'Trading bot started successfully in service mode',
      config: {
        asset,
        leverage,
        strategy: 'FGI (Fear & Greed Index)'
      }
    })
  } catch (error) {
    console.error('Failed to start bot:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to start trading bot' },
      { status: 500 }
    )
  }
}