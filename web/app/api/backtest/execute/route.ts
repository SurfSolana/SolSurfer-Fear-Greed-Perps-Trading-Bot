import { NextRequest, NextResponse } from 'next/server'
import { backtestCacheServer } from '@/lib/backtest-cache-server'
import { BacktestRequest, BacktestResponse, BacktestParams } from '@/lib/backtest-types'

/**
 * Execute backtest with force refresh and caching support
 * POST /api/backtest/execute
 */
export async function POST(request: NextRequest) {
  try {
    const body: BacktestRequest = await request.json()
    const { params, forceRefresh = false, priority = 'normal' } = body

    // Validate required params field
    if (!params) {
      return NextResponse.json(
        { error: 'Missing required field: params' },
        { status: 400 }
      )
    }

    // Validate asset
    const validAssets = ['SOL', 'ETH', 'BTC']
    if (!validAssets.includes(params.asset)) {
      return NextResponse.json(
        { error: 'Invalid asset. Must be SOL, ETH, or BTC' },
        { status: 400 }
      )
    }

    // Validate timeframe
    const validTimeframes = ['15m', '1h', '4h']
    if (!validTimeframes.includes(params.timeframe)) {
      return NextResponse.json(
        { error: 'Invalid timeframe. Must be 15m, 1h, or 4h' },
        { status: 400 }
      )
    }

    // Validate strategy
    const validStrategies = ['contrarian', 'momentum']
    if (!validStrategies.includes(params.strategy)) {
      return NextResponse.json(
        { error: 'Invalid strategy. Must be contrarian or momentum' },
        { status: 400 }
      )
    }

    // Validate leverage bounds
    if (params.leverage < 1 || params.leverage > 12) {
      return NextResponse.json(
        { error: 'Leverage must be between 1 and 12' },
        { status: 400 }
      )
    }

    // Validate threshold bounds and relationship
    if (params.lowThreshold < 1 || params.lowThreshold > 99) {
      return NextResponse.json(
        { error: 'Low threshold must be between 1 and 99' },
        { status: 400 }
      )
    }

    if (params.highThreshold < 2 || params.highThreshold > 100) {
      return NextResponse.json(
        { error: 'High threshold must be between 2 and 100' },
        { status: 400 }
      )
    }

    if (params.lowThreshold >= params.highThreshold) {
      return NextResponse.json(
        { error: 'Low threshold must be less than high threshold' },
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

    // Execute backtest with force refresh logic
    let result
    let cached = false
    let cacheAge: number | undefined

    if (forceRefresh) {
      // Force fresh execution, skip cache check
      result = await backtestCacheServer.runAndCache(normalizedParams)
      cached = false
    } else {
      // Check cache first
      const cachedResult = await backtestCacheServer.get(normalizedParams)
      if (cachedResult) {
        result = cachedResult
        cached = true
        cacheAge = Date.now() - cachedResult.timestamp
      } else {
        // Cache miss, run fresh
        result = await backtestCacheServer.runAndCache(normalizedParams)
        cached = false
      }
    }

    const response: BacktestResponse = {
      result,
      cached,
      ...(cacheAge !== undefined && { cacheAge })
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Backtest execution failed:', error)
    return NextResponse.json(
      { error: 'Backtest execution failed' },
      { status: 500 }
    )
  }
}
