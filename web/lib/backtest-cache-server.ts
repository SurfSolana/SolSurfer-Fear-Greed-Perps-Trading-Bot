/**
 * Server-side Backtest Results Caching System
 * 
 * This system manages caching of backtesting results to provide instant
 * interactive feedback in the split sea visualization.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { BacktestParams, BacktestResult, CacheEntry } from './backtest-types'
import { parseBacktestCSV, BacktestCSVRow } from './csv-parser'

const execAsync = promisify(exec)

// Types are now imported from backtest-types.ts

export class BacktestCacheServer {
  private cacheDir = '/Users/alexnewman/Scripts/lifeguard-token-vault/web/.cache/backtests'
  private permanentCacheDir = '/Users/alexnewman/Scripts/lifeguard-token-vault/web/.cache/backtests/permanent'
  private backtestScriptPath = '/Users/alexnewman/Scripts/lifeguard-token-vault/backtesting/fgi-leverage-backtest.ts'
  private staleThreshold = 24 * 60 * 60 * 1000 // 24 hours in ms
  
  constructor() {
    this.ensureCacheDir()
  }

  private async ensureCacheDir() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true })
      await fs.mkdir(this.permanentCacheDir, { recursive: true })
    } catch (error) {
      console.error('Failed to create cache directories:', error)
    }
  }

  /**
   * Generate cache key for parameter combination
   * Pattern: {asset}-{timeframe}-{leverage}x-{lowThreshold}-{highThreshold}-{strategy}[-{dateRange}]
   */
  private getCacheKey(params: BacktestParams): string {
    const baseKey = `${params.asset}-${params.timeframe}-${params.leverage}x-${params.lowThreshold}-${params.highThreshold}-${params.strategy}`
    if (params.dateRange) {
      return `${baseKey}-${params.dateRange.start}-${params.dateRange.end}`
    }
    return baseKey
  }

  /**
   * Get cached result from permanent cache first, then temporary cache
   */
  async get(params: BacktestParams): Promise<BacktestResult | null> {
    const startTime = Date.now()
    const key = this.getCacheKey(params)

    // Check permanent cache first
    const permanentFilePath = path.join(this.permanentCacheDir, `${key}.json`)
    try {
      const data = await fs.readFile(permanentFilePath, 'utf-8')
      const entry: CacheEntry = JSON.parse(data)
      const responseTime = Date.now() - startTime
      console.log(`[CACHE HIT] Permanent cache hit for ${key} in ${responseTime}ms`)
      return entry.result
    } catch {
      // Permanent cache miss, check temporary cache
    }

    // Check temporary cache
    const tempFilePath = path.join(this.cacheDir, `${key}.json`)
    try {
      const data = await fs.readFile(tempFilePath, 'utf-8')
      const entry: CacheEntry = JSON.parse(data)

      // Check if stale
      const isStale = Date.now() - entry.computedAt > this.staleThreshold
      if (isStale) {
        console.log(`[CACHE MISS] Stale cache entry for ${key} (age: ${((Date.now() - entry.computedAt) / 1000 / 60 / 60).toFixed(1)}h)`)
        return null
      }

      const responseTime = Date.now() - startTime
      console.log(`[CACHE HIT] Temporary cache hit for ${key} in ${responseTime}ms`)
      return entry.result
    } catch {
      console.log(`[CACHE MISS] No cache entry found for ${key}`)
      return null
    }
  }

  /**
   * Store result in cache with permanent flag support
   */
  async set(params: BacktestParams, result: BacktestResult, permanent = false): Promise<void> {
    const key = this.getCacheKey(params)
    const targetDir = permanent ? this.permanentCacheDir : this.cacheDir
    const filePath = path.join(targetDir, `${key}.json`)

    const entry: CacheEntry = {
      key,
      result,
      computedAt: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now(),
      isPermanent: permanent,
      version: '1.0'
    }

    try {
      await fs.writeFile(filePath, JSON.stringify(entry, null, 2))
    } catch (error) {
      console.error('Failed to cache result:', error)
    }
  }

  /**
   * Run backtest and cache result with permanent flag for historical data
   */
  async runAndCache(params: BacktestParams, permanent = false): Promise<BacktestResult> {
    const flowStartTime = Date.now()
    const key = this.getCacheKey(params)

    console.log(`[BACKTEST FLOW] Starting runAndCache for ${key}`)

    const cached = await this.get(params)
    if (cached) {
      const flowTime = Date.now() - flowStartTime
      console.log(`[BACKTEST FLOW] Cache hit flow completed for ${key} in ${flowTime}ms`)
      return cached
    }

    console.log(`[BACKTEST FLOW] Cache miss, executing backtest for ${key}`)

    // Run the actual backtest
    const result = await this.runBacktest(params)

    // Cache the result - use permanent flag for historical data
    const isPermanent = permanent || (params.dateRange !== undefined)
    await this.set(params, result, isPermanent)

    const flowTime = Date.now() - flowStartTime
    console.log(`[BACKTEST FLOW] Complete flow (miss + execution + cache) for ${key} in ${flowTime}ms`)

    return result
  }

  /**
   * Execute the backtest script with given parameters
   */
  private async runBacktest(params: BacktestParams): Promise<BacktestResult> {
    const startTime = Date.now()
    const key = this.getCacheKey(params)

    console.log(`[BACKTEST EXEC] Starting backtest execution for ${key}`)

    // Build command arguments
    const args = [
      `--asset=${params.asset}`,
      `--timeframe=${params.timeframe}`,
      `--leverage=${params.leverage}`,
      `--short-start=${params.lowThreshold}`,
      `--short-end=${params.lowThreshold}`, // Single point, not a range
      `--long-start=${params.highThreshold}`,
      `--long-end=${params.highThreshold}`, // Single point, not a range
      `--days=90`,
      `--detailed=true`
    ].join(' ')

    const command = `cd /Users/alexnewman/Scripts/lifeguard-token-vault && bun run ${this.backtestScriptPath} ${args}`

    try {
      const { stdout, stderr } = await execAsync(command)

      // Extract the CSV filename from the output
      const csvMatch = stdout.match(/CSV exported to: (.+\.csv)/)
      if (!csvMatch) {
        throw new Error('Could not find CSV output file')
      }

      // The CSV path is relative to the project root, not the web directory
      const csvFilePath = path.join('/Users/alexnewman/Scripts/lifeguard-token-vault', csvMatch[1])
      const csvContent = await fs.readFile(csvFilePath, 'utf-8')
      const csvData = parseBacktestCSV(csvContent)

      // Find the result that matches our exact parameters
      const matchingResult = csvData.find(row =>
        row.leverage === params.leverage &&
        row.shortThreshold === params.lowThreshold &&
        row.longThreshold === params.highThreshold
      )

      if (!matchingResult) {
        throw new Error('No matching result found in backtest output')
      }

      const executionTime = Date.now() - startTime
      console.log(`[BACKTEST EXEC] Backtest execution completed for ${key} in ${executionTime}ms`)
      return this.transformCSVToBacktestResult(matchingResult, params, executionTime)

    } catch (error) {
      const executionTime = Date.now() - startTime
      console.error(`[BACKTEST EXEC] Backtest execution failed for ${key} after ${executionTime}ms:`, error)
      // Let the error propagate naturally - no fake estimates
      throw new Error(`Backtest execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Transform CSV row to BacktestResult format
   */
  private transformCSVToBacktestResult(csvRow: BacktestCSVRow, params: BacktestParams, executionTime: number): BacktestResult {
    return {
      returns: csvRow.totalReturn,
      maxDrawdown: csvRow.maxDrawdown,
      winRate: csvRow.winRate,
      sharpeRatio: csvRow.sharpeRatio,
      trades: csvRow.numTrades,
      fees: params.leverage * 0.5, // Estimate based on leverage
      liquidated: csvRow.liquidations > 0,
      timestamp: Date.now(),
      params,
      executionTime,
      profitFactor: csvRow.winRate > 0 ? csvRow.totalReturn / Math.abs(csvRow.maxDrawdown) : 0,
      avgWin: csvRow.winRate > 0 ? (csvRow.totalReturn * csvRow.winRate / 100) / csvRow.numTrades : 0,
      avgLoss: csvRow.winRate < 100 ? (csvRow.totalReturn * (100 - csvRow.winRate) / 100) / csvRow.numTrades : 0
    }
  }

  /**
   * Clear stale cache entries
   */
  async cleanStale(): Promise<void> {
    try {
      const files = await fs.readdir(this.cacheDir)
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        
        const filePath = path.join(this.cacheDir, file)
        const data = await fs.readFile(filePath, 'utf-8')
        const entry: CacheEntry = JSON.parse(data)
        
        if (Date.now() - entry.computedAt > this.staleThreshold) {
          await fs.unlink(filePath)
        }
      }
    } catch (error) {
      console.error('Failed to clean stale cache:', error)
    }
  }

  /**
   * Get all cached results for a given asset/timeframe combination
   */
  async getAllForAsset(asset: string, timeframe: string): Promise<BacktestResult[]> {
    try {
      const files = await fs.readdir(this.cacheDir)
      const results: BacktestResult[] = []
      
      for (const file of files) {
        if (!file.startsWith(`${asset}-${timeframe}-`) || !file.endsWith('.json')) {
          continue
        }
        
        const filePath = path.join(this.cacheDir, file)
        const data = await fs.readFile(filePath, 'utf-8')
        const entry: CacheEntry = JSON.parse(data)
        
        if (Date.now() - entry.computedAt <= this.staleThreshold) {
          results.push(entry.result)
        }
      }
      
      return results
    } catch (error) {
      console.error('Failed to get cached results:', error)
      return []
    }
  }
}

// Export singleton instance
export const backtestCacheServer = new BacktestCacheServer()