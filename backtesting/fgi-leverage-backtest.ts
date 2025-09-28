#!/usr/bin/env bun

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import Decimal from 'decimal.js';
import cliProgress from 'cli-progress';
import { Database } from 'bun:sqlite';

// Configure Decimal.js for financial precision
Decimal.set({ precision: 28 });

// Parse command line arguments
const args = process.argv.slice(2);
const namedArgs: {[key: string]: string} = {};
args.forEach(arg => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    if (value) namedArgs[key] = value;
  }
});

// Configuration
const CONFIG = {
  // Asset and timeframe
  ASSET: namedArgs.asset || 'ETH',
  TIMEFRAME: namedArgs.timeframe || '1h', // 1 hour intervals
  STRATEGY: (namedArgs.strategy as 'momentum' | 'contrarian') || 'momentum',
  
  // Rolling window
  ROLLING_DAYS: 30, // 30-day rolling window for FGI calculations
  
  // Leverage parameters to test
  LEVERAGE_LEVELS: namedArgs.leverage 
    ? namedArgs.leverage.split(',').map(l => parseFloat(l.replace('x', '')))
    : [1, 2, 3, 4, 5, 6, 8, 10, 12],
  
  // FGI threshold parameters (will test multiple combinations)
  FGI_SHORT_RANGE: {
    start: parseInt(namedArgs['short-start'] || '20'),
    end: parseInt(namedArgs['short-end'] || '50'),
    step: parseInt(namedArgs['short-step'] || '5')
  },
  
  FGI_LONG_RANGE: {
    start: parseInt(namedArgs['long-start'] || '50'),
    end: parseInt(namedArgs['long-end'] || '80'),
    step: parseInt(namedArgs['long-step'] || '5')
  },

  FGI_EXTREME_LOW_RANGE: {
    start: parseInt(namedArgs['extreme-low-start'] ?? namedArgs['extreme-low'] ?? '0'),
    end: parseInt(namedArgs['extreme-low-end'] ?? namedArgs['extreme-low'] ?? '0'),
    step: parseInt(namedArgs['extreme-low-step'] || '5')
  },

  FGI_EXTREME_HIGH_RANGE: {
    start: parseInt(namedArgs['extreme-high-start'] ?? namedArgs['extreme-high'] ?? '100'),
    end: parseInt(namedArgs['extreme-high-end'] ?? namedArgs['extreme-high'] ?? '100'),
    step: parseInt(namedArgs['extreme-high-step'] || '5')
  },
  
  // Financial settings
  INITIAL_CAPITAL: 10000, // $10,000 starting capital
  
  // Fee structure
  PLATFORM_FEE_RATE: 0.001, // 0.1% platform fee per trade
  FUNDING_RATE_HOURLY: 0.00003, // Average funding rate per hour
  
  // Risk management
  LIQUIDATION_THRESHOLD: 0.95, // Liquidate when losses reach 95% of position
  
  // Data settings
  DAYS_TO_TEST: parseInt(namedArgs.days || '365'), // Days of data to test
  
  // Output settings
  OUTPUT_DIR: `./backtest-results/${(namedArgs.asset || 'ETH').toLowerCase()}-leverage`,
  DETAILED_LOGS: namedArgs.detailed === 'true',
  
  // Optimization
  USE_PARALLEL: namedArgs.parallel !== 'false',
  MAX_WORKERS: 4
};

// Types
interface PriceData {
  timestamp: string;
  price: number;
  volume?: number;
}

interface FGIData {
  timestamp: string;
  fgi: number;
}

interface CombinedData {
  timestamp: string;
  price: number;
  fgi: number;
  volume?: number;
}

interface Position {
  type: 'LONG' | 'SHORT' | 'NEUTRAL';
  size: Decimal;
  entryPrice: Decimal;
  leverage: number;
  entryTime: string;
  unrealizedPnL: Decimal;
  fundingPaid: Decimal;
  strategyMode: 'momentum' | 'contrarian';
}

interface BacktestResult {
  // Configuration
  leverage: number;
  shortThreshold: number;
  longThreshold: number;
  extremeLowThreshold: number;
  extremeHighThreshold: number;
  strategy: 'momentum' | 'contrarian';
  momentumOverrideActivations: number;
  
  // Performance metrics
  totalReturn: number;
  totalReturnPercent: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  
  // Trade statistics
  numTrades: number;
  avgTradeReturn: number;
  bestTrade: number;
  worstTrade: number;
  
  // Risk metrics
  liquidations: number;
  timeInMarket: number;
  volatility: number;
  
  // Fee analysis
  totalFeesPaid: number;
  totalFundingPaid: number;
  
  // Position distribution
  timeInLong: number;
  timeInShort: number;
  timeInNeutral: number;
  
  // Detailed logs
  trades?: TradeLog[];
}

interface WindowedBacktestResult extends BacktestResult {
  windowIndex: number;
  windowStart: string;
  windowEnd: string;
  sampleCount: number;
}

interface RollingRunMeta {
  runId: string;
  timestamp: string;
  asset: string;
  timeframe: string;
  strategy: 'momentum' | 'contrarian';
  windowSizeDays: number;
}

interface RollingResultsWriter {
  insert(records: WindowedBacktestResult[]): void;
  close(): void;
}

interface TradeLog {
  timestamp: string;
  action: 'OPEN_LONG' | 'OPEN_SHORT' | 'CLOSE';
  price: number;
  fgi: number;
  size: number;
  pnl?: number;
  fees: number;
  balance: number;
  strategyMode?: 'momentum' | 'contrarian';
}

// Fetch historical price data
async function fetchPriceData(): Promise<PriceData[]> {
  const url = `https://api.surfsolana.com/${CONFIG.ASSET}/${CONFIG.TIMEFRAME}/1_year.json`;
  console.log(chalk.cyan(`Fetching ${CONFIG.ASSET} price data at ${CONFIG.TIMEFRAME} intervals...`));
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json() as any[];
    const priceData: PriceData[] = data.map(item => ({
      timestamp: item.timestamp || item.date,
      price: parseFloat(item.price),
      volume: item.volume ? parseFloat(item.volume) : undefined
    }));
    
    // Sort chronologically
    priceData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    // Filter to requested days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - CONFIG.DAYS_TO_TEST);
    const filtered = priceData.filter(d => new Date(d.timestamp) >= cutoffDate);
    
    console.log(chalk.green(`✓ Fetched ${filtered.length} price points`));
    return filtered;
  } catch (error) {
    console.error(chalk.red('Error fetching price data:'), error);
    throw error;
  }
}

// Fetch FGI data
async function fetchFGIData(): Promise<FGIData[]> {
  const url = `https://api.surfsolana.com/${CONFIG.ASSET}/${CONFIG.TIMEFRAME}/1_year.json`;
  console.log(chalk.cyan(`Fetching ${CONFIG.ASSET} FGI data...`));
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json() as any[];
    const fgiData: FGIData[] = data.map(item => ({
      timestamp: item.timestamp || item.date,
      fgi: parseFloat(item.fgi || item.cfgi || 50) // Default to neutral if missing
    }));
    
    // Sort chronologically
    fgiData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    console.log(chalk.green(`✓ Fetched ${fgiData.length} FGI points`));
    return fgiData;
  } catch (error) {
    console.error(chalk.red('Error fetching FGI data:'), error);
    throw error;
  }
}

// Combine price and FGI data
function combineData(priceData: PriceData[], fgiData: FGIData[]): CombinedData[] {
  const fgiMap = new Map(fgiData.map(d => [d.timestamp, d]));
  const combined: CombinedData[] = [];
  
  for (const pricePoint of priceData) {
    const fgiPoint = fgiMap.get(pricePoint.timestamp);
    if (fgiPoint) {
      combined.push({
        timestamp: pricePoint.timestamp,
        price: pricePoint.price,
        fgi: fgiPoint.fgi,
        volume: pricePoint.volume
      });
    }
  }
  
  return combined;
}

function generateRollingWindows(data: CombinedData[], windowDays: number): Array<{
  index: number;
  start: string;
  end: string;
  data: CombinedData[];
}> {
  if (data.length === 0) {
    return [];
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const timestamps = data.map(d => new Date(d.timestamp).getTime());
  const firstTimestamp = timestamps[0];
  const lastTimestamp = timestamps[timestamps.length - 1];
  const totalSpanDays = Math.floor((lastTimestamp - firstTimestamp) / dayMs) + 1;
  const totalWindows = Math.max(0, totalSpanDays - windowDays + 1);

  const windows: Array<{ index: number; start: string; end: string; data: CombinedData[] }> = [];
  if (totalWindows === 0) {
    return windows;
  }

  let startIdx = 0;
  let endIdx = 0;

  for (let w = 0; w < totalWindows; w++) {
    const windowStartMs = firstTimestamp + w * dayMs;
    const windowEndMs = windowStartMs + windowDays * dayMs;

    while (startIdx < data.length && timestamps[startIdx] < windowStartMs) {
      startIdx++;
    }
    if (startIdx >= data.length) {
      break;
    }

    if (endIdx < startIdx) {
      endIdx = startIdx;
    }

    while (endIdx < data.length && timestamps[endIdx] < windowEndMs) {
      endIdx++;
    }

    const slice = data.slice(startIdx, endIdx);
    if (slice.length < 2) {
      continue;
    }

    windows.push({
      index: w,
      start: slice[0].timestamp,
      end: slice[slice.length - 1].timestamp,
      data: slice
    });
  }

  return windows;
}

// Run backtest for a specific configuration
function runBacktest(
  data: CombinedData[],
  leverage: number,
  shortThreshold: number,
  longThreshold: number,
  extremeLowThreshold: number,
  extremeHighThreshold: number,
  baseStrategy: 'momentum' | 'contrarian'
): BacktestResult {
  // Initialize state
  let balance = new Decimal(CONFIG.INITIAL_CAPITAL);
  let position: Position | null = null;
  const trades: TradeLog[] = [];

  // Metrics tracking
  let numTrades = 0;
  let winningTrades = 0;
  let totalFees = new Decimal(0);
  let totalFunding = new Decimal(0);
  let liquidations = 0;

  let timeInLong = 0;
  let timeInShort = 0;
  let timeInNeutral = 0;

  let peakBalance = balance;
  let maxDrawdown = 0;

  const returns: number[] = [];
  let overrideActive = false;
  let overrideActivations = 0;

  const useExtremeLow = baseStrategy === 'contrarian'
    && extremeLowThreshold > 0
    && extremeLowThreshold <= shortThreshold;
  const useExtremeHigh = baseStrategy === 'contrarian'
    && extremeHighThreshold < 100
    && extremeHighThreshold >= longThreshold;

  // Process each data point
  for (let i = 0; i < data.length; i++) {
    const point = data[i];
    const currentPrice = new Decimal(point.price);
    
    // Update position metrics
    if (position) {
      if (position.type === 'LONG') {
        timeInLong++;
        // Calculate unrealized P&L for long
        const priceDiff = currentPrice.minus(position.entryPrice);
        const returnPct = priceDiff.div(position.entryPrice);
        position.unrealizedPnL = position.size.mul(returnPct).mul(position.leverage);
        
        // Apply hourly funding
        const funding = position.size.mul(CONFIG.FUNDING_RATE_HOURLY).mul(position.leverage);
        position.fundingPaid = position.fundingPaid.plus(funding);
        totalFunding = totalFunding.plus(funding);
        
      } else if (position.type === 'SHORT') {
        timeInShort++;
        // Calculate unrealized P&L for short
        const priceDiff = position.entryPrice.minus(currentPrice);
        const returnPct = priceDiff.div(position.entryPrice);
        position.unrealizedPnL = position.size.mul(returnPct).mul(position.leverage);
        
        // Apply hourly funding (shorts typically receive funding)
        const funding = position.size.mul(CONFIG.FUNDING_RATE_HOURLY).mul(position.leverage).neg();
        position.fundingPaid = position.fundingPaid.plus(funding);
        totalFunding = totalFunding.plus(funding);
      }
      
      // Check for liquidation
      const positionValue = position.size.plus(position.unrealizedPnL).minus(position.fundingPaid);
      const lossPercent = position.size.minus(positionValue).div(position.size);
      
      if (lossPercent.gte(CONFIG.LIQUIDATION_THRESHOLD)) {
        // Liquidation occurred
        liquidations++;
        const loss = position.size.mul(0.95); // Lose 95% on liquidation
        balance = balance.minus(loss);

        if (CONFIG.DETAILED_LOGS) {
          trades.push({
            timestamp: point.timestamp,
            action: 'CLOSE',
            price: point.price,
            fgi: point.fgi,
            size: position.size.toNumber(),
            pnl: loss.neg().toNumber(),
            fees: 0,
            balance: balance.toNumber(),
            strategyMode: position.strategyMode
          });
        }

        position = null;
        
        // Check if account is blown
        if (balance.lte(0)) {
          break; // Stop trading
        }
      }
    } else {
      timeInNeutral++;
    }
    
    const shouldOverride = baseStrategy === 'contrarian' && (
      (useExtremeLow && point.fgi <= extremeLowThreshold) ||
      (useExtremeHigh && point.fgi >= extremeHighThreshold)
    );

    if (shouldOverride && !overrideActive) {
      overrideActivations++;
    }

    overrideActive = shouldOverride;
    const effectiveStrategy: 'momentum' | 'contrarian' = shouldOverride ? 'momentum' : baseStrategy;

    // Determine target position based on the FGI reading and effective strategy mode
    let targetPosition: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';

    if (effectiveStrategy === 'momentum') {
      if (point.fgi <= shortThreshold) {
        targetPosition = 'SHORT';
      } else if (point.fgi >= longThreshold) {
        targetPosition = 'LONG';
      }
    } else {
      if (point.fgi <= shortThreshold) {
        targetPosition = 'LONG';
      } else if (point.fgi >= longThreshold) {
        targetPosition = 'SHORT';
      }
    }

    // Execute position changes
    if (position && position.type !== targetPosition) {
      // Close existing position
      const closeFee = position.size.mul(CONFIG.PLATFORM_FEE_RATE);
      totalFees = totalFees.plus(closeFee);
      
      const totalPnL = position.unrealizedPnL.minus(position.fundingPaid).minus(closeFee);
      balance = balance.plus(totalPnL);
      
      if (totalPnL.gt(0)) winningTrades++;
      returns.push(totalPnL.div(position.size).toNumber());
      const closingStrategyMode = position.strategyMode;
      
      if (CONFIG.DETAILED_LOGS) {
        trades.push({
          timestamp: point.timestamp,
          action: 'CLOSE',
          price: point.price,
          fgi: point.fgi,
          size: position.size.toNumber(),
          pnl: totalPnL.toNumber(),
          fees: closeFee.toNumber(),
          balance: balance.toNumber(),
          strategyMode: closingStrategyMode
        });
      }
      
      position = null;
      numTrades++;
    }
    
    // Open new position if needed
    if (!position && targetPosition !== 'NEUTRAL' && balance.gt(100)) {
      const positionSize = balance.mul(0.95); // Use 95% of balance
      const openFee = positionSize.mul(CONFIG.PLATFORM_FEE_RATE);
      totalFees = totalFees.plus(openFee);
      
      position = {
        type: targetPosition,
        size: positionSize.minus(openFee),
        entryPrice: currentPrice,
        leverage: leverage,
        entryTime: point.timestamp,
        unrealizedPnL: new Decimal(0),
        fundingPaid: new Decimal(0),
        strategyMode: effectiveStrategy
      };

      if (CONFIG.DETAILED_LOGS) {
        trades.push({
          timestamp: point.timestamp,
          action: targetPosition === 'LONG' ? 'OPEN_LONG' : 'OPEN_SHORT',
          price: point.price,
          fgi: point.fgi,
          size: position.size.toNumber(),
          fees: openFee.toNumber(),
          balance: balance.toNumber(),
          strategyMode: effectiveStrategy
        });
      }
      
      numTrades++;
    }
    
    // Update drawdown
    const currentBalance = position 
      ? balance.plus(position.unrealizedPnL).minus(position.fundingPaid)
      : balance;
    
    if (currentBalance.gt(peakBalance)) {
      peakBalance = currentBalance;
    }
    const drawdown = peakBalance.minus(currentBalance).div(peakBalance).toNumber();
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }
  
  // Close final position if exists
  if (position) {
    const closeFee = position.size.mul(CONFIG.PLATFORM_FEE_RATE);
    const totalPnL = position.unrealizedPnL.minus(position.fundingPaid).minus(closeFee);
    balance = balance.plus(totalPnL);
    if (totalPnL.gt(0)) winningTrades++;
    numTrades++;
  }
  
  // Calculate final metrics
  const totalReturn = balance.minus(CONFIG.INITIAL_CAPITAL).toNumber();
  const totalReturnPercent = (totalReturn / CONFIG.INITIAL_CAPITAL) * 100;
  
  // Calculate Sharpe ratio (simplified)
  const avgReturn = returns.length > 0 
    ? returns.reduce((a, b) => a + b, 0) / returns.length 
    : 0;
  const variance = returns.length > 0
    ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    : 0;
  const volatility = Math.sqrt(variance);
  const sharpeRatio = volatility > 0 ? (avgReturn / volatility) * Math.sqrt(365 * 24) : 0; // Annualized
  
  const totalPeriods = data.length;
  
  return {
    leverage,
    shortThreshold,
    longThreshold,
    extremeLowThreshold,
    extremeHighThreshold,
    strategy: baseStrategy,
    momentumOverrideActivations: overrideActivations,
    totalReturn,
    totalReturnPercent,
    sharpeRatio,
    maxDrawdown: maxDrawdown * 100,
    winRate: numTrades > 0 ? (winningTrades / numTrades) * 100 : 0,
    numTrades,
    avgTradeReturn: returns.length > 0 ? avgReturn * 100 : 0,
    bestTrade: returns.length > 0 ? Math.max(...returns) * 100 : 0,
    worstTrade: returns.length > 0 ? Math.min(...returns) * 100 : 0,
    liquidations,
    timeInMarket: ((timeInLong + timeInShort) / totalPeriods) * 100,
    volatility: volatility * 100,
    totalFeesPaid: totalFees.toNumber(),
    totalFundingPaid: totalFunding.toNumber(),
    timeInLong: (timeInLong / totalPeriods) * 100,
    timeInShort: (timeInShort / totalPeriods) * 100,
    timeInNeutral: (timeInNeutral / totalPeriods) * 100,
    trades: CONFIG.DETAILED_LOGS ? trades : undefined
  };
}

// Generate parameter combinations
function expandRange(range: { start: number; end: number; step: number }, clampMin = 0, clampMax = 100): number[] {
  const min = Math.max(Math.min(range.start, range.end), clampMin);
  const max = Math.min(Math.max(range.start, range.end), clampMax);
  const step = Math.max(Math.abs(range.step) || 1, 1);

  const values = new Set<number>();
  if (min === max) {
    values.add(Math.round(min));
  } else {
    for (let value = min; value <= max; value += step) {
      values.add(Math.round(value));
    }
    values.add(Math.round(max));
  }

  return Array.from(values).sort((a, b) => a - b);
}

function generateParameterCombinations(): Array<{
  leverage: number;
  short: number;
  long: number;
  extremeLow: number;
  extremeHigh: number;
}> {
  const combinations: Array<{ leverage: number; short: number; long: number; extremeLow: number; extremeHigh: number }> = [];

  const shortValues = expandRange(CONFIG.FGI_SHORT_RANGE);
  const longValues = expandRange(CONFIG.FGI_LONG_RANGE);
  const extremeLowValues = expandRange(CONFIG.FGI_EXTREME_LOW_RANGE);
  const extremeHighValues = expandRange(CONFIG.FGI_EXTREME_HIGH_RANGE);

  for (const leverage of CONFIG.LEVERAGE_LEVELS) {
    for (const short of shortValues) {
      for (const long of longValues) {
        if (short >= long) continue;

        for (const extremeLow of extremeLowValues) {
          if (extremeLow > short) continue;
          for (const extremeHigh of extremeHighValues) {
            if (extremeHigh < long) continue;

            combinations.push({
              leverage,
              short,
              long,
              extremeLow,
              extremeHigh
            });
          }
        }
      }
    }
  }

  return combinations;
}

function ensureDirectoryExists(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function createRollingResultsWriter(dbPath: string, meta: RollingRunMeta): RollingResultsWriter {
  ensureDirectoryExists(path.dirname(dbPath));

  const db = new Database(dbPath);
  db.exec('PRAGMA busy_timeout = 5000');

  db.run(`
    CREATE TABLE IF NOT EXISTS rolling_backtests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      run_timestamp TEXT NOT NULL,
      asset TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      strategy TEXT NOT NULL,
      window_index INTEGER NOT NULL,
      window_start TEXT NOT NULL,
      window_end TEXT NOT NULL,
      window_size_days INTEGER NOT NULL,
      sample_count INTEGER NOT NULL,
      leverage REAL NOT NULL,
      short_threshold INTEGER NOT NULL,
      long_threshold INTEGER NOT NULL,
      extreme_low_threshold INTEGER,
      extreme_high_threshold INTEGER,
      override_count INTEGER,
      total_return REAL NOT NULL,
      total_return_percent REAL NOT NULL,
      sharpe_ratio REAL NOT NULL,
      max_drawdown REAL NOT NULL,
      num_trades INTEGER NOT NULL,
      win_rate REAL NOT NULL,
      liquidations INTEGER NOT NULL,
      time_in_market REAL NOT NULL,
      avg_trade_return REAL,
      best_trade REAL,
      worst_trade REAL,
      volatility REAL,
      total_fees REAL,
      total_funding REAL,
      time_in_long REAL,
      time_in_short REAL,
      time_in_neutral REAL
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_rolling_run ON rolling_backtests (run_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_rolling_window ON rolling_backtests (asset, timeframe, strategy, window_index)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_rolling_params ON rolling_backtests (short_threshold, long_threshold, leverage)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_rolling_returns ON rolling_backtests (total_return_percent DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_rolling_sharpe ON rolling_backtests (sharpe_ratio DESC)`);

  const insertStmt = db.prepare(`
    INSERT INTO rolling_backtests (
      run_id, run_timestamp, asset, timeframe, strategy,
      window_index, window_start, window_end, window_size_days, sample_count,
      leverage, short_threshold, long_threshold, extreme_low_threshold, extreme_high_threshold, override_count,
      total_return, total_return_percent, sharpe_ratio, max_drawdown,
      num_trades, win_rate, liquidations, time_in_market,
      avg_trade_return, best_trade, worst_trade, volatility,
      total_fees, total_funding, time_in_long, time_in_short, time_in_neutral
    ) VALUES (
      $run_id, $run_timestamp, $asset, $timeframe, $strategy,
      $window_index, $window_start, $window_end, $window_size_days, $sample_count,
      $leverage, $short_threshold, $long_threshold, $extreme_low_threshold, $extreme_high_threshold, $override_count,
      $total_return, $total_return_percent, $sharpe_ratio, $max_drawdown,
      $num_trades, $win_rate, $liquidations, $time_in_market,
      $avg_trade_return, $best_trade, $worst_trade, $volatility,
      $total_fees, $total_funding, $time_in_long, $time_in_short, $time_in_neutral
    )
  `);

  const insertBatch = db.transaction((records: WindowedBacktestResult[]) => {
    for (const record of records) {
      insertStmt.run({
        $run_id: meta.runId,
        $run_timestamp: meta.timestamp,
        $asset: meta.asset,
        $timeframe: meta.timeframe,
        $strategy: record.strategy,
        $window_index: record.windowIndex,
        $window_start: record.windowStart,
        $window_end: record.windowEnd,
        $window_size_days: meta.windowSizeDays,
        $sample_count: record.sampleCount,
        $leverage: record.leverage,
        $short_threshold: record.shortThreshold,
        $long_threshold: record.longThreshold,
        $extreme_low_threshold: record.extremeLowThreshold,
        $extreme_high_threshold: record.extremeHighThreshold,
        $override_count: record.momentumOverrideActivations,
        $total_return: record.totalReturn,
        $total_return_percent: record.totalReturnPercent,
        $sharpe_ratio: record.sharpeRatio,
        $max_drawdown: record.maxDrawdown,
        $num_trades: record.numTrades,
        $win_rate: record.winRate,
        $liquidations: record.liquidations,
        $time_in_market: record.timeInMarket,
        $avg_trade_return: record.avgTradeReturn,
        $best_trade: record.bestTrade,
        $worst_trade: record.worstTrade,
        $volatility: record.volatility,
        $total_fees: record.totalFeesPaid,
        $total_funding: record.totalFundingPaid,
        $time_in_long: record.timeInLong,
        $time_in_short: record.timeInShort,
        $time_in_neutral: record.timeInNeutral
      });
    }
  });

  return {
    insert(records: WindowedBacktestResult[]) {
      if (!records.length) return;
      insertBatch(records);
    },
    close() {
      db.close();
    }
  };
}

// Main execution
async function main() {
  console.log(chalk.cyan.bold(`
╔══════════════════════════════════════════════════════════════╗
║     FGI Leverage Backtest with 30-Day Rolling Window         ║
╚══════════════════════════════════════════════════════════════╝
  `));

  console.log(chalk.yellow('Configuration:'));
  console.log(`  Asset: ${CONFIG.ASSET}`);
  console.log(`  Timeframe: ${CONFIG.TIMEFRAME}`);
  console.log(`  Base Strategy: ${CONFIG.STRATEGY}`);
  console.log(`  Rolling Window: ${CONFIG.ROLLING_DAYS} days`);
  console.log(`  Leverage Levels: ${CONFIG.LEVERAGE_LEVELS.join('x, ')}x`);
  console.log(`  FGI Short Range: ${CONFIG.FGI_SHORT_RANGE.start}-${CONFIG.FGI_SHORT_RANGE.end}`);
  console.log(`  FGI Long Range: ${CONFIG.FGI_LONG_RANGE.start}-${CONFIG.FGI_LONG_RANGE.end}`);
  console.log(`  Extreme Low Range: ${CONFIG.FGI_EXTREME_LOW_RANGE.start}-${CONFIG.FGI_EXTREME_LOW_RANGE.end}`);
  console.log(`  Extreme High Range: ${CONFIG.FGI_EXTREME_HIGH_RANGE.start}-${CONFIG.FGI_EXTREME_HIGH_RANGE.end}`);
  console.log(`  Initial Capital: $${CONFIG.INITIAL_CAPITAL.toLocaleString()}`);
  console.log(`  Test Period: ${CONFIG.DAYS_TO_TEST} days\n`);

  if (!['momentum', 'contrarian'].includes(CONFIG.STRATEGY)) {
    throw new Error(`Unsupported strategy: ${CONFIG.STRATEGY}`);
  }

  console.log(chalk.cyan('Fetching market data...'));
  const [priceData, fgiData] = await Promise.all([
    fetchPriceData(),
    fetchFGIData()
  ]);

  const combinedData = combineData(priceData, fgiData);
  console.log(chalk.green(`✓ Prepared ${combinedData.length} merged data points`));

  if (combinedData.length < 2) {
    console.log(chalk.red('Not enough combined data to run backtests.'));
    return;
  }

  console.log(chalk.cyan('Building rolling windows...'));
  const windows = generateRollingWindows(combinedData, CONFIG.ROLLING_DAYS);
  const expectedWindows = Math.max(0, CONFIG.DAYS_TO_TEST - CONFIG.ROLLING_DAYS + 1);
  console.log(chalk.green(`✓ Constructed ${windows.length} windows (expected ≈ ${expectedWindows})\n`));

  if (!windows.length) {
    console.log(chalk.red('No rolling windows available. Verify data coverage or adjust configuration.'));
    return;
  }

  const combinations = generateParameterCombinations();
  console.log(chalk.yellow(`Running ${combinations.length} parameter combinations per window...\n`));

  if (!combinations.length) {
    console.log(chalk.red('No parameter combinations generated. Adjust FGI ranges or leverage levels.'));
    return;
  }

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runTimestamp = new Date().toISOString();

  const outputDir = path.resolve(CONFIG.OUTPUT_DIR);
  ensureDirectoryExists(outputDir);
  const dbPath = path.join(outputDir, 'rolling-backtests.db');

  const writer = createRollingResultsWriter(dbPath, {
    runId,
    timestamp: runTimestamp,
    asset: CONFIG.ASSET,
    timeframe: CONFIG.TIMEFRAME,
    strategy: CONFIG.STRATEGY,
    windowSizeDays: CONFIG.ROLLING_DAYS
  });

  const totalIterations = combinations.length * windows.length;
  let totalRecords = 0;
  const startTime = Date.now();

  const isTTY = typeof process.stdout.isTTY === 'boolean' ? Boolean(process.stdout.isTTY) : false;
  const enableProgress = isTTY && totalIterations > 0;
  let progressBars: cliProgress.MultiBar | null = null;
  let overallBar: cliProgress.SingleBar | null = null;
  let windowBar: cliProgress.SingleBar | null = null;
  let completedIterations = 0;
  let lastProgressLog = Date.now();
  const PROGRESS_LOG_INTERVAL_MS = 1000;

  if (enableProgress) {
    progressBars = new cliProgress.MultiBar(
      {
        format: '{name} [{bar}] {percentage}% | ETA: {eta_formatted} | {value}/{total}',
        hideCursor: true,
        clearOnComplete: false,
        stopOnComplete: true,
        autopadding: true
      },
      cliProgress.Presets.shades_classic
    );

    overallBar = progressBars.create(totalIterations, 0, { name: 'Total   ' });
    windowBar = progressBars.create(windows.length, 0, { name: 'Windows' });
  }

  const emitLog = (message: string) => {
    if (progressBars) {
      progressBars.log(message);
    } else {
      console.log(message);
    }
  };

  const maybeLogProgress = () => {
    if (enableProgress) return;
    if (!totalIterations) return;

    const now = Date.now();
    if (completedIterations === totalIterations || now - lastProgressLog >= PROGRESS_LOG_INTERVAL_MS) {
      const percent = ((completedIterations / totalIterations) * 100).toFixed(2);
      console.log(chalk.gray(`Progress ${completedIterations}/${totalIterations} (${percent}%)`));
      lastProgressLog = now;
    }
  };

  try {
    for (let w = 0; w < windows.length; w++) {
      const windowInfo = windows[w];
      emitLog(chalk.cyan(`[Window ${w + 1}/${windows.length}] ${windowInfo.start} → ${windowInfo.end} (${windowInfo.data.length} points)`));

      const windowResults: WindowedBacktestResult[] = [];
      for (const combo of combinations) {
        const backtestResult = runBacktest(
          windowInfo.data,
          combo.leverage,
          combo.short,
          combo.long,
          combo.extremeLow,
          combo.extremeHigh,
          CONFIG.STRATEGY
        );

        const windowRecord: WindowedBacktestResult = {
          ...backtestResult,
          windowIndex: windowInfo.index,
          windowStart: windowInfo.start,
          windowEnd: windowInfo.end,
          sampleCount: windowInfo.data.length
        };

        windowResults.push(windowRecord);
        overallBar?.increment();
        completedIterations++;
        maybeLogProgress();
      }

      if (!windowResults.length) {
        emitLog(chalk.yellow('    Skipping window due to insufficient data.'));
        windowBar?.increment();
        continue;
      }

      writer.insert(windowResults);
      totalRecords += windowResults.length;

      const bestByReturn = windowResults.reduce((best, current) =>
        current.totalReturnPercent > best.totalReturnPercent ? current : best
      );
      const bestBySharpe = windowResults.reduce((best, current) =>
        current.sharpeRatio > best.sharpeRatio ? current : best
      );

      const completed = (w + 1) * combinations.length;
      const progressPercent = ((completed / totalIterations) * 100).toFixed(1);

      emitLog(chalk.green(`    Best return: ${bestByReturn.totalReturnPercent.toFixed(1)}% (${bestByReturn.leverage}x, short<=${bestByReturn.shortThreshold}, long>=${bestByReturn.longThreshold})`));
      emitLog(chalk.blue(`    Best Sharpe: ${bestBySharpe.sharpeRatio.toFixed(2)} (${bestBySharpe.totalReturnPercent.toFixed(1)}% return)`));

      const progressLine = progressBars
        ? chalk.gray(`    Stored ${windowResults.length} records`)
        : chalk.gray(`    Stored ${windowResults.length} records · overall progress ${progressPercent}% (${completed}/${totalIterations})`);
      emitLog(progressLine);
      emitLog('');

      windowBar?.increment();
    }
  } finally {
    progressBars?.stop();
    writer.close();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(chalk.green(`\n✓ Completed ${windows.length} windows and ${totalRecords} backtests in ${elapsed}s`));
  console.log(chalk.green(`✓ Results saved to SQLite: ${dbPath}`));
  console.log(chalk.yellow(`  Run ID: ${runId}`));

  console.log(chalk.cyan.bold('\n✨ Rolling backtest complete!\n'));
}

// Run the backtest
main().catch(console.error);
