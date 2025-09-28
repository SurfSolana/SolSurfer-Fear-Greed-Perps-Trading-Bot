import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import { handleApiError, createSuccessResponse } from '../../lib/error-handler'

const execAsync = promisify(exec)

// Helper function to check PM2 process status using CLI
async function checkPM2Process(name: string): Promise<any | null> {
  try {
    const { stdout } = await execAsync('pm2 jlist')
    const processes = JSON.parse(stdout)
    const process = processes.find((p: any) => p.name === name)
    return process || null
  } catch (error) {
    console.error('Failed to check PM2 process:', error)
    return null
  }
}

export async function POST(request: NextRequest) {
  let requestContext: any = {}

  try {
    // Parse request body
    const body = await request.json().catch(() => ({}))
    requestContext = { body, method: 'POST', endpoint: '/api/bot/start' }

    // Check if bot is already running via PM2
    const existingProcess = await checkPM2Process('drift-fgi-trader')
    if (existingProcess && existingProcess.pm2_env?.status === 'online') {
      const error = new Error('Trading bot is already running')
      ;(error as any).status = 409
      throw error
    }
    const {
      asset = 'ETH',
      lowThreshold = 25,
      highThreshold = 75,
      extremeLowThreshold = 0,
      extremeHighThreshold = 100,
      leverage = 4,
      strategy = 'momentum',
      timeframe = '4h',
      maxPositionRatio = 1.0
    } = body

    requestContext.params = { asset, lowThreshold, highThreshold, extremeLowThreshold, extremeHighThreshold, leverage, strategy, timeframe, maxPositionRatio }

    // Validate input parameters
    if (leverage < 1 || leverage > 10) {
      throw new Error('Leverage must be between 1 and 10')
    }

    if (lowThreshold < 0 || lowThreshold > 100 || highThreshold < 0 || highThreshold > 100) {
      throw new Error('Thresholds must be between 0 and 100')
    }

    if (lowThreshold >= highThreshold) {
      throw new Error('Low threshold must be less than high threshold')
    }

    if (extremeLowThreshold < 0 || extremeLowThreshold > 100 || extremeHighThreshold < 0 || extremeHighThreshold > 100) {
      throw new Error('Extreme thresholds must be between 0 and 100')
    }

    if (extremeLowThreshold > lowThreshold) {
      throw new Error('Extreme low threshold must be less than or equal to low threshold')
    }

    if (extremeHighThreshold < highThreshold) {
      throw new Error('Extreme high threshold must be greater than or equal to high threshold')
    }

    // Write complete configuration to shared JSON file for hot-reload
    const configPath = path.join(process.cwd(), '..', 'data', 'trading-config.json')
    const config = {
      asset,
      leverage,
      lowThreshold,
      highThreshold,
      extremeLowThreshold,
      extremeHighThreshold,
      strategy,
      enabled: true,
      timeframe,
      maxPositionRatio,
      updatedAt: new Date().toISOString()
    }

    // Ensure data directory exists
    const dataDir = path.join(process.cwd(), '..', 'data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    // Write configuration with proper formatting
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    console.log('Configuration written to:', configPath, config)

    // Start or restart bot via PM2 CLI
    const scriptPath = path.join(process.cwd(), '..', 'drift-fgi-trader-v2.ts')

    try {
      if (existingProcess) {
        // Restart the existing process
        await execAsync('pm2 restart drift-fgi-trader')
        console.log('Bot restarted successfully via PM2')
        return createSuccessResponse(
          { config, restarted: true },
          'Trading bot restarted successfully'
        )
      } else {
        // Start new process
        const startCommand = `pm2 start ${scriptPath} --name drift-fgi-trader --interpreter bun -- service`
        await execAsync(startCommand, { cwd: path.join(process.cwd(), '..') })
        console.log('Bot started successfully via PM2')
        return createSuccessResponse(
          { config, started: true },
          'Trading bot started successfully'
        )
      }
    } catch (startError: any) {
      throw new Error(`Failed to start/restart bot: ${startError.message}`)
    }

  } catch (error: any) {
    return handleApiError('/api/bot/start', error, requestContext)
  }
}
