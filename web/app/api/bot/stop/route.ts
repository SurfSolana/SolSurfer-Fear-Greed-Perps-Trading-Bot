import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
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
  const requestContext = { method: 'POST', endpoint: '/api/bot/stop' }

  try {
    let wasRunning = false
    let positionsClosed = false

    // Check if bot is running via PM2
    const existingProcess = await checkPM2Process('drift-fgi-trader')
    if (existingProcess && existingProcess.pm2_env?.status === 'online') {
      wasRunning = true

      // Try to close any positions before stopping the bot
      try {
        console.log('Attempting to close any open positions...')
        const result = await execAsync('bun run drift-fgi-trader-v2.ts close', {
          cwd: path.join(process.cwd(), '..'),
          timeout: 30000 // 30 second timeout
        })

        positionsClosed = true
        console.log('Position close command completed:', result.stdout)
      } catch (error: any) {
        console.error('Failed to close positions:', error.message)
        // Don't fail the entire operation if position closing fails
      }

      // Stop the bot via PM2 CLI
      try {
        await execAsync('pm2 stop drift-fgi-trader')
        console.log('Bot stopped successfully via PM2')
        return createSuccessResponse(
          { positionsClosed, wasRunning },
          'Trading bot stopped successfully'
        )
      } catch (stopError: any) {
        return handleApiError('/api/bot/stop', stopError, requestContext)
      }
    } else {
      // Bot was not running

      // Still try to close positions just in case
      try {
        console.log('Attempting to close any open positions...')
        const result = await execAsync('bun run drift-fgi-trader-v2.ts close', {
          cwd: path.join(process.cwd(), '..'),
          timeout: 30000
        })
        positionsClosed = true
        console.log('Position close command completed:', result.stdout)
      } catch (error: any) {
        console.error('Failed to close positions:', error.message)
      }

      const error = new Error('Trading bot was not running')
      ;(error as any).status = 404
      ;(error as any).positionsClosed = positionsClosed
      throw error
    }
    
  } catch (error: any) {
    // Include additional context if available
    if (error.positionsClosed !== undefined) {
      requestContext.positionsClosed = error.positionsClosed
    }

    return handleApiError('/api/bot/stop', error, requestContext)
  }
}