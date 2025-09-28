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
import Database from 'better-sqlite3'
import { BacktestParams, BacktestResult, CacheEntry } from './backtest-types'

const execAsync = promisify(exec)

// Types are now imported from backtest-types.ts

interface BacktestTableRow {
  total_return: number
  sharpe_ratio: number
  max_drawdown: number
  num_trades: number
  win_rate: number
  liquidations: number
  fees: number
  funding: number
  time_in_market: number
  override_count: number
  extreme_low_threshold: number
  extreme_high_threshold: number
}

export class BacktestCacheServer {
  private projectRoot = path.basename(process.cwd()) === 'web'
    ? path.resolve(process.cwd(), '..')
    : process.cwd()
  private cacheDir = path.join(this.projectRoot, 'web', '.cache', 'backtests')
  private permanentCacheDir = path.join(this.cacheDir, 'permanent')
  private backtestScriptPath = path.join(this.projectRoot, 'backtesting', 'fgi-leverage-backtest.ts')
  private databasePath = path.join(this.projectRoot, 'backtesting', 'backtest-results', 'all-backtests.db')
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
    const extremeLow = params.extremeLowThreshold ?? 0
    const extremeHigh = params.extremeHighThreshold ?? 100
    const baseKey = `${params.asset}-${params.timeframe}-${params.leverage}x-${params.lowThreshold}-${params.highThreshold}-${extremeLow}-${extremeHigh}-${params.strategy}`
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

    const extremeLow = Math.round(params.extremeLowThreshold ?? 0)
    const extremeHigh = Math.round(params.extremeHighThreshold ?? 100)
    const scriptRelativePath = path.relative(this.projectRoot, this.backtestScriptPath)

    const args = [
      `--asset=${params.asset}`,
      `--timeframe=${params.timeframe}`,
      `--leverage=${params.leverage}`,
      `--short-start=${params.lowThreshold}`,
      `--short-end=${params.lowThreshold}`,
      `--long-start=${params.highThreshold}`,
      `--long-end=${params.highThreshold}`,
      `--extreme-low=${extremeLow}`,
      `--extreme-high=${extremeHigh}`,
      `--strategy=${params.strategy}`,
      `--days=90`,
      `--detailed=false`
    ].join(' ')

    const command = `cd ${this.projectRoot} && bun run ${scriptRelativePath} ${args}`

    try {
      const { stdout, stderr } = await execAsync(command)
      if (stderr) {
        console.warn(`[BACKTEST EXEC] stderr for ${key}:`, stderr)
      }

      const runIdMatch = stdout.match(/Run ID:\s*([^\s]+)/)
      if (!runIdMatch) {
        console.error(`[BACKTEST EXEC] Unable to parse run ID from output for ${key}. Output:\n${stdout}`)
        throw new Error('Could not parse run ID from backtest output')
      }

      const runId = runIdMatch[1]

      const db = new Database(this.databasePath, { readonly: true })
      try {
        const row = db.prepare(`
          SELECT
            total_return,
            sharpe_ratio,
            max_drawdown,
            num_trades,
            win_rate,
            liquidations,
            fees,
            funding,
            time_in_market,
            override_count,
            extreme_low_threshold,
            extreme_high_threshold
          FROM backtests
          WHERE run_id = ?
            AND asset = ?
            AND timeframe = ?
            AND strategy = ?
            AND short_threshold = ?
            AND long_threshold = ?
            AND extreme_low_threshold = ?
            AND extreme_high_threshold = ?
            AND leverage = ?
          ORDER BY timestamp DESC
          LIMIT 1
        `).get(
          runId,
          params.asset.toUpperCase(),
          params.timeframe,
          params.strategy,
          params.lowThreshold,
          params.highThreshold,
          extremeLow,
          extremeHigh,
          params.leverage
        ) as BacktestTableRow | undefined

        if (!row) {
          throw new Error('No matching result found in backtest database output')
        }

        const executionTime = Date.now() - startTime
        console.log(`[BACKTEST EXEC] Backtest execution completed for ${key} in ${executionTime}ms`)

        const normalizedParams: BacktestParams = {
          ...params,
          extremeLowThreshold: row.extreme_low_threshold,
          extremeHighThreshold: row.extreme_high_threshold
        }

        return this.transformRowToBacktestResult(row, normalizedParams, executionTime)
      } finally {
        db.close()
      }
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
  private transformRowToBacktestResult(row: BacktestTableRow, params: BacktestParams, executionTime: number): BacktestResult {
    const totalReturn = row.total_return
    const maxDrawdown = row.max_drawdown
    const winRate = row.win_rate
    const numTrades = row.num_trades
    const normalizedTrades = Math.max(numTrades, 1)

    const avgWin = winRate > 0 ? (totalReturn * (winRate / 100)) / normalizedTrades : 0
    const avgLoss = winRate < 100 ? (totalReturn * ((100 - winRate) / 100)) / normalizedTrades : 0
    const profitFactor = Math.abs(maxDrawdown) > 0 ? totalReturn / Math.abs(maxDrawdown) : 0

    return {
      returns: totalReturn,
      maxDrawdown,
      winRate,
      sharpeRatio: row.sharpe_ratio,
      trades: numTrades,
      fees: row.fees,
      liquidated: row.liquidations > 0,
      timestamp: Date.now(),
      params,
      executionTime,
      profitFactor,
      avgWin,
      avgLoss,
      overrides: row.override_count
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
