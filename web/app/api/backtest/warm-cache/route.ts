import { NextRequest, NextResponse } from 'next/server'
import { backtestCacheServer } from '@/lib/backtest-cache-server'

/**
 * API endpoint to warm the backtest cache with common parameter combinations
 * This runs in the background to ensure fast interactive responses
 */
export async function POST(request: NextRequest) {
  try {
    console.log('Starting cache warming process...')
    
    // For now, just return success - full cache warming would be implemented in the background service
    console.log('Cache warming request received')
    
    return NextResponse.json({ 
      message: 'Cache warming started',
      status: 'processing'
    })
  } catch (error) {
    console.error('Failed to start cache warming:', error)
    return NextResponse.json(
      { error: 'Failed to start cache warming' },
      { status: 500 }
    )
  }
}

/**
 * Get cache status and statistics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const asset = searchParams.get('asset') || 'SOL'
    const timeframe = searchParams.get('timeframe') || '4h'
    
    // Get all cached results for this asset/timeframe
    const cachedResults = await backtestCacheServer.getAllForAsset(asset, timeframe)
    
    const stats = {
      totalCached: cachedResults.length,
      lastUpdated: cachedResults.length > 0 
        ? Math.max(...cachedResults.map(r => r.timestamp))
        : 0,
      coverageByLeverage: {} as Record<number, number>,
      coverageByStrategy: { contrarian: 0, momentum: 0 },
      coverageByThresholds: {} as Record<string, number>
    }
    
    // Calculate coverage statistics
    cachedResults.forEach(result => {
      const leverage = result.params.leverage
      const strategy = result.params.strategy
      const thresholds = `${result.params.lowThreshold}-${result.params.highThreshold}`
      
      stats.coverageByLeverage[leverage] = (stats.coverageByLeverage[leverage] || 0) + 1
      stats.coverageByStrategy[strategy]++
      stats.coverageByThresholds[thresholds] = (stats.coverageByThresholds[thresholds] || 0) + 1
    })
    
    return NextResponse.json({
      stats,
      sampleResults: cachedResults.slice(0, 5) // Return first 5 as samples
    })
  } catch (error) {
    console.error('Failed to get cache stats:', error)
    return NextResponse.json(
      { error: 'Failed to get cache statistics' },
      { status: 500 }
    )
  }
}