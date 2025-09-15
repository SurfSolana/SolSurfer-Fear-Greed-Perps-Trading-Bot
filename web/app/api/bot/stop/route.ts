import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'

const execAsync = promisify(exec)

export async function POST(request: NextRequest) {
  try {
    const pidPath = path.join(process.cwd(), '..', 'bot.pid')
    let wasRunning = false
    let positionsClosed = false
    
    // Check if bot is running and stop it
    if (fs.existsSync(pidPath)) {
      try {
        const pid = parseInt(fs.readFileSync(pidPath, 'utf-8').trim())
        
        // Check if process is actually running
        try {
          process.kill(pid, 0) // Check if process exists
          wasRunning = true
          
          // Try graceful shutdown first with SIGTERM
          process.kill(pid, 'SIGTERM')
          
          // Wait a moment for graceful shutdown
          await new Promise(resolve => setTimeout(resolve, 2000))
          
          // Check if process is still running
          try {
            process.kill(pid, 0)
            // Still running, force kill
            console.log('Process still running, force killing...')
            process.kill(pid, 'SIGKILL')
          } catch (error) {
            // Process has stopped gracefully
            console.log('Bot stopped gracefully')
          }
          
        } catch (error) {
          console.log('Process was not running')
        }
        
        // Remove PID file
        fs.unlinkSync(pidPath)
        
      } catch (error) {
        console.error('Error reading PID file:', error)
        // Clean up invalid PID file
        try {
          fs.unlinkSync(pidPath)
        } catch (cleanupError) {
          console.error('Failed to clean up PID file:', cleanupError)
        }
      }
    }

    // Try to close any positions using the bot's close command
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

    if (!wasRunning && !fs.existsSync(pidPath)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Trading bot was not running',
          positionsClosed 
        },
        { status: 404 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      message: wasRunning 
        ? 'Trading bot stopped successfully' 
        : 'Bot was not running, but cleanup completed',
      positionsClosed,
      wasRunning
    })
    
  } catch (error) {
    console.error('Failed to stop bot:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to stop trading bot' },
      { status: 500 }
    )
  }
}