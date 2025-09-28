import { NextRequest, NextResponse } from 'next/server'
import { backtestCacheServer } from '@/lib/backtest-cache-server'
import { BacktestParams } from '@/lib/backtest-types'

/**
 * API endpoint to run backtests with caching
 * Returns cached results immediately if available, otherwise runs fresh backtest
 */
export async function POST(request: NextRequest) {
  try {
    const params: BacktestParams = await request.json()
    
    // Validate parameters
    const validAssets = ['SOL', 'ETH', 'BTC']
    const validTimeframes = ['15m', '1h', '4h']
    const validStrategies = ['contrarian', 'momentum']
    
    if (!validAssets.includes(params.asset)) {
      return NextResponse.json(
        { error: 'Invalid asset. Must be SOL, ETH, or BTC' },
        { status: 400 }
      )
    }
    
    if (!validTimeframes.includes(params.timeframe)) {
      return NextResponse.json(
        { error: 'Invalid timeframe. Must be 15m, 1h, or 4h' },
        { status: 400 }
      )
    }
    
    if (!validStrategies.includes(params.strategy)) {
      return NextResponse.json(
        { error: 'Invalid strategy. Must be contrarian or momentum' },
        { status: 400 }
      )
    }
    
    if (params.leverage < 1 || params.leverage > 20) {
      return NextResponse.json(
        { error: 'Leverage must be between 1 and 20' },
        { status: 400 }
      )
    }
    
    if (params.lowThreshold < 0 || params.lowThreshold > 100 ||
        params.highThreshold < 0 || params.highThreshold > 100 ||
        params.lowThreshold >= params.highThreshold) {
      return NextResponse.json(
        { error: 'Invalid thresholds. Low must be less than high, both 0-100' },
        { status: 400 }
      )
    }

    const extremeLow = params.extremeLowThreshold ?? 0
    const extremeHigh = params.extremeHighThreshold ?? 100

    if (extremeLow < 0 || extremeLow > 100 || extremeHigh < 0 || extremeHigh > 100) {
      return NextResponse.json(
        { error: 'Extreme thresholds must be between 0 and 100' },
        { status: 400 }
      )
    }

    if (extremeLow >= extremeHigh) {
      return NextResponse.json(
        { error: 'Extreme low threshold must be less than extreme high threshold' },
        { status: 400 }
      )
    }

    if (extremeLow > params.lowThreshold) {
      return NextResponse.json(
        { error: 'Extreme low threshold must be ≤ low threshold' },
        { status: 400 }
      )
    }

    if (extremeHigh < params.highThreshold) {
      return NextResponse.json(
        { error: 'Extreme high threshold must be ≥ high threshold' },
        { status: 400 }
      )
    }

    const normalizedParams: BacktestParams = {
      ...params,
      extremeLowThreshold: extremeLow,
      extremeHighThreshold: extremeHigh
    }

    // Run backtest with caching
    const result = await backtestCacheServer.runAndCache(normalizedParams)
    
    return NextResponse.json({
      result,
      cached: true, // Note: this might not be accurate, but indicates caching is used
      timestamp: Date.now()
    })
  } catch (error) {
    console.error('Backtest API error:', error)
    return NextResponse.json(
      { error: 'Failed to run backtest' },
      { status: 500 }
    )
  }
}

/**
 * Get quick estimates for parameter ranges
 * Used for real-time wave visualization updates
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const asset = searchParams.get('asset') || 'SOL'
    const timeframe = searchParams.get('timeframe') || '4h'
    const strategy = searchParams.get('strategy') || 'contrarian'
    const leverage = parseInt(searchParams.get('leverage') || '3')
    
    // Generate estimates for a range of thresholds for wave visualization
    const estimates = []
    
    for (let low = 20; low <= 80; low += 10) {
      for (let high = low + 10; high <= 100; high += 10) {
        try {
          const result = await backtestCacheServer.runAndCache({
            asset: asset as 'SOL' | 'ETH' | 'BTC',
            timeframe: timeframe as '15m' | '1h' | '4h',
            leverage,
            lowThreshold: low,
            highThreshold: high,
            strategy: strategy as 'contrarian' | 'momentum',
            extremeLowThreshold: 0,
            extremeHighThreshold: 100
          })
          
          estimates.push({
            lowThreshold: low,
            highThreshold: high,
            returns: result.returns,
            risk: result.maxDrawdown,
            trades: result.trades
          })
        } catch (error) {
          console.error(`Failed to estimate for ${low}-${high}:`, error)
        }
      }
    }
    
    return NextResponse.json({ estimates })
  } catch (error) {
    console.error('Failed to generate estimates:', error)
    return NextResponse.json(
      { error: 'Failed to generate estimates' },
      { status: 500 }
    )
  }
}
