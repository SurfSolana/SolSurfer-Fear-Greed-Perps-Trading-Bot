#!/usr/bin/env bun

/**
 * Background Cache Warming Service
 * 
 * This script runs periodically to pre-calculate backtest results
 * for common parameter combinations, ensuring fast interactive responses.
 */

import { backtestCacheServer } from '../lib/backtest-cache-server'
import { BacktestParams } from '../lib/types'
import cron from 'node-cron'

class CacheWarmingService {
  private isRunning = false
  
  constructor() {
    console.log('🌊 Cache Warming Service starting...')
  }

  /**
   * Start the cache warming service with scheduled updates
   */
  async start() {
    console.log('⚡ Starting initial cache warm-up...')
    await this.warmCache()
    
    // Schedule cache warming every 6 hours
    cron.schedule('0 */6 * * *', async () => {
      if (!this.isRunning) {
        console.log('⏰ Scheduled cache warming starting...')
        await this.warmCache()
      }
    })
    
    // Schedule stale cache cleanup daily at 2 AM
    cron.schedule('0 2 * * *', async () => {
      console.log('🧹 Cleaning stale cache entries...')
      await backtestCacheServer.cleanStale()
    })
    
    console.log('🎯 Cache Warming Service is now running')
    console.log('📅 Next warm-up: every 6 hours')
    console.log('🗑️  Cleanup: daily at 2 AM')
  }

  /**
   * Warm the cache with prioritized parameter combinations
   */
  private async warmCache() {
    if (this.isRunning) {
      console.log('⚠️  Cache warming already in progress, skipping...')
      return
    }

    this.isRunning = true
    const startTime = Date.now()
    
    try {
      console.log('🔥 Starting cache warming process...')
      
      // High-priority combinations (most commonly used)
      const highPriority = this.getHighPriorityCombinations()
      console.log(`📊 Warming ${highPriority.length} high-priority combinations...`)
      
      await this.processBatch(highPriority, 'High Priority')
      
      // Medium-priority combinations
      const mediumPriority = this.getMediumPriorityCombinations()
      console.log(`📈 Warming ${mediumPriority.length} medium-priority combinations...`)
      
      await this.processBatch(mediumPriority, 'Medium Priority')
      
      // Low-priority combinations (edge cases)
      const lowPriority = this.getLowPriorityCombinations()
      console.log(`📉 Warming ${lowPriority.length} low-priority combinations...`)
      
      await this.processBatch(lowPriority, 'Low Priority')
      
      const duration = (Date.now() - startTime) / 1000
      console.log(`✅ Cache warming completed in ${duration.toFixed(1)}s`)
      
    } catch (error) {
      console.error('❌ Cache warming failed:', error)
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Process a batch of parameter combinations
   */
  private async processBatch(combinations: BacktestParams[], label: string) {
    const batchSize = 3 // Process 3 at a time to avoid overwhelming
    let completed = 0
    
    for (let i = 0; i < combinations.length; i += batchSize) {
      const batch = combinations.slice(i, i + batchSize)
      
      await Promise.allSettled(
        batch.map(async (params) => {
          try {
            await backtestCacheServer.runAndCache(params)
            completed++
            
            if (completed % 10 === 0) {
              console.log(`   ${label}: ${completed}/${combinations.length} completed`)
            }
          } catch (error) {
            console.error(`   Failed ${params.asset}-${params.leverage}x:`, error instanceof Error ? error.message : error)
          }
        })
      )
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    console.log(`   ${label}: ${completed}/${combinations.length} completed`)
  }

  /**
   * High-priority: Most common user configurations
   */
  private getHighPriorityCombinations(): BacktestParams[] {
    const combinations: BacktestParams[] = []
    
    // Most popular assets and settings
    const assets = ['SOL', 'ETH'] as const // Skip BTC for high priority (poor performance)
    const timeframes = ['4h'] as const // Most commonly used
    const leverages = [2, 3, 5] // Common risk levels
    const strategies = ['contrarian', 'momentum'] as const
    
    // Common threshold combinations
    const thresholds = [
      { low: 25, high: 75 }, // Wide range (beginner friendly)
      { low: 35, high: 65 }, // Medium range (balanced)
      { low: 45, high: 55 }, // Narrow range (active trading)
      { low: 30, high: 70 }, // Slightly wide
      { low: 40, high: 60 }, // Slightly narrow
    ]
    
    for (const asset of assets) {
      for (const timeframe of timeframes) {
        for (const leverage of leverages) {
          for (const strategy of strategies) {
            for (const { low, high } of thresholds) {
              combinations.push({
                asset,
                timeframe,
                leverage,
                lowThreshold: low,
                highThreshold: high,
                strategy
              })
            }
          }
        }
      }
    }
    
    return combinations
  }

  /**
   * Medium-priority: Additional useful configurations
   */
  private getMediumPriorityCombinations(): BacktestParams[] {
    const combinations: BacktestParams[] = []
    
    const assets = ['SOL', 'ETH', 'BTC'] as const
    const timeframes = ['1h', '4h'] as const // Alternative timeframes
    const leverages = [1, 4] // Conservative and aggressive
    const strategies = ['contrarian', 'momentum'] as const
    
    const thresholds = [
      { low: 20, high: 80 }, // Very wide
      { low: 50, high: 50 }, // Neutral line
    ]
    
    for (const asset of assets) {
      for (const timeframe of timeframes) {
        for (const leverage of leverages) {
          for (const strategy of strategies) {
            for (const { low, high } of thresholds) {
              if (low < high) { // Skip invalid combinations
                combinations.push({
                  asset,
                  timeframe,
                  leverage,
                  lowThreshold: low,
                  highThreshold: high,
                  strategy
                })
              }
            }
          }
        }
      }
    }
    
    return combinations
  }

  /**
   * Low-priority: Edge cases and extreme configurations
   */
  private getLowPriorityCombinations(): BacktestParams[] {
    const combinations: BacktestParams[] = []
    
    const assets = ['BTC'] as const // Focus on BTC edge cases
    const timeframes = ['4h'] as const
    const leverages = [6, 8, 10] // High leverage scenarios
    const strategies = ['contrarian'] as const
    
    const thresholds = [
      { low: 15, high: 85 }, // Extreme wide
      { low: 48, high: 52 }, // Very narrow
    ]
    
    for (const asset of assets) {
      for (const timeframe of timeframes) {
        for (const leverage of leverages) {
          for (const strategy of strategies) {
            for (const { low, high } of thresholds) {
              combinations.push({
                asset,
                timeframe,
                leverage,
                lowThreshold: low,
                highThreshold: high,
                strategy
              })
            }
          }
        }
      }
    }
    
    return combinations
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      const allSOL = await backtestCacheServer.getAllForAsset('SOL', '4h')
      const allETH = await backtestCacheServer.getAllForAsset('ETH', '4h')
      const allBTC = await backtestCacheServer.getAllForAsset('BTC', '4h')
      
      return {
        total: allSOL.length + allETH.length + allBTC.length,
        byAsset: {
          SOL: allSOL.length,
          ETH: allETH.length,
          BTC: allBTC.length
        },
        lastUpdate: Math.max(
          ...allSOL.map(r => r.timestamp),
          ...allETH.map(r => r.timestamp),
          ...allBTC.map(r => r.timestamp)
        )
      }
    } catch (error) {
      console.error('Failed to get cache stats:', error)
      return null
    }
  }
}

// Create and start the service
const cacheService = new CacheWarmingService()

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Cache Warming Service shutting down...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n🛑 Cache Warming Service terminated')
  process.exit(0)
})

// Start the service
cacheService.start().then(async () => {
  // Display initial stats
  const stats = await cacheService.getStats()
  if (stats) {
    console.log('📊 Cache Statistics:')
    console.log(`   Total cached results: ${stats.total}`)
    console.log(`   SOL: ${stats.byAsset.SOL}, ETH: ${stats.byAsset.ETH}, BTC: ${stats.byAsset.BTC}`)
    if (stats.lastUpdate) {
      console.log(`   Last update: ${new Date(stats.lastUpdate).toLocaleString()}`)
    }
  }
}).catch(console.error)

export { CacheWarmingService }