/**
 * Shared types for backtest system (browser-safe)
 */

/** Trading parameters for backtesting */
export interface BacktestParams {
  /** Trading asset */
  asset: 'SOL' | 'ETH' | 'BTC'
  /** Candle timeframe */
  timeframe: '15m' | '1h' | '4h'
  /** Leverage multiplier (1-12) */
  leverage: number
  /** FGI buy threshold (1-99) */
  lowThreshold: number
  /** FGI sell threshold (2-100) */
  highThreshold: number
  /** Trading strategy */
  strategy: 'contrarian' | 'momentum'
  /** Optional historical period */
  dateRange?: { start: string, end: string }
}

/** Complete backtest results with performance metrics */
export interface BacktestResult {
  /** Percentage returns over period */
  returns: number
  /** Maximum drawdown percentage */
  maxDrawdown: number
  /** Win rate percentage */
  winRate: number
  /** Risk-adjusted returns */
  sharpeRatio: number
  /** Total number of trades executed */
  trades: number
  /** Total fees paid */
  fees: number
  /** Whether position was liquidated */
  liquidated: boolean
  /** Unix timestamp when computed */
  timestamp: number
  /** Parameters used for this result */
  params: BacktestParams
  /** Milliseconds taken to compute */
  executionTime: number
  /** Gross profit / gross loss (derived) */
  profitFactor?: number
  /** Average winning trade size (derived) */
  avgWin?: number
  /** Average losing trade size (derived) */
  avgLoss?: number
}

/** Request payload for backtest computation */
export interface BacktestRequest {
  /** Backtest parameters */
  params: BacktestParams
  /** Force refresh even if cached result exists */
  forceRefresh?: boolean
  /** Request priority for queue processing */
  priority?: number
}

/** Response from backtest API */
export interface BacktestResponse {
  /** Computed backtest result */
  result: BacktestResult
  /** Whether result came from cache */
  cached: boolean
  /** Age of cached result in milliseconds */
  cacheAge?: number
}

/** Cache entry for storing backtest results */
export interface CacheEntry {
  /** Unique cache key */
  key: string
  /** Stored backtest result */
  result: BacktestResult
  /** When result was computed */
  computedAt: number
  /** Number of times accessed */
  accessCount: number
  /** Last access timestamp */
  lastAccessed: number
  /** Whether entry should persist permanently */
  isPermanent: boolean
  /** Cache entry version */
  version: string
}

/** Cache performance statistics */
export interface CacheStats {
  /** Total number of cache entries */
  totalEntries: number
  /** Number of permanent entries */
  permanentEntries: number
  /** Total cache size in bytes */
  cacheSize: number
  /** Cache hit rate percentage */
  hitRate: number
  /** Average execution time for cache misses */
  avgExecutionTime: number
  /** Average response time for cache hits */
  avgCacheResponseTime: number
}