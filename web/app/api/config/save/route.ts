import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync } from 'fs'
import path from 'path'
import { TradingConfig } from '@/lib/types'

// Path to the trading config file in the parent directory
const CONFIG_FILE_PATH = path.join(process.cwd(), '..', 'trading-config.json')

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate the config structure
    const config: TradingConfig = {
      asset: body.asset || 'ETH',
      leverage: Number(body.leverage) || 4,
      lowThreshold: Number(body.lowThreshold) || 49,
      highThreshold: Number(body.highThreshold) || 50,
      maxPositionRatio: Number(body.maxPositionRatio) || 0.7,
      strategy: body.strategy || 'momentum',
      enabled: body.enabled !== undefined ? body.enabled : true,
      timeframe: body.timeframe || '4h'
    }

    // Validate ranges
    if (config.leverage < 1 || config.leverage > 20) {
      return NextResponse.json(
        { error: 'Leverage must be between 1 and 20' },
        { status: 400 }
      )
    }

    if (config.lowThreshold < 0 || config.lowThreshold > 100) {
      return NextResponse.json(
        { error: 'Low threshold must be between 0 and 100' },
        { status: 400 }
      )
    }

    if (config.highThreshold < 0 || config.highThreshold > 100) {
      return NextResponse.json(
        { error: 'High threshold must be between 0 and 100' },
        { status: 400 }
      )
    }

    if (config.maxPositionRatio < 0.1 || config.maxPositionRatio > 1) {
      return NextResponse.json(
        { error: 'Max position ratio must be between 0.1 and 1' },
        { status: 400 }
      )
    }

    // Write the config to file
    writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2))

    return NextResponse.json({
      success: true,
      message: 'Configuration saved successfully',
      config
    })
  } catch (error) {
    console.error('Error saving config:', error)
    return NextResponse.json(
      { error: 'Failed to save configuration' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const fs = await import('fs')
    const configData = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8')
    const config = JSON.parse(configData)

    return NextResponse.json({
      success: true,
      config
    })
  } catch (error) {
    // Return default config if file doesn't exist
    return NextResponse.json({
      success: true,
      config: {
        asset: 'ETH',
        leverage: 4,
        lowThreshold: 49,
        highThreshold: 50,
        maxPositionRatio: 0.7,
        strategy: 'momentum',
        enabled: true,
        timeframe: '4h'
      }
    })
  }
}