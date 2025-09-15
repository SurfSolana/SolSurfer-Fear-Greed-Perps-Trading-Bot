#!/usr/bin/env bun

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import Decimal from 'decimal.js';
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
  rollingAvg30d?: number;
}

interface CombinedData {
  timestamp: string;
  price: number;
  fgi: number;
  fgi30d: number; // 30-day rolling average
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
}

interface BacktestResult {
  // Configuration
  leverage: number;
  shortThreshold: number;
  longThreshold: number;
  
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

interface TradeLog {
  timestamp: string;
  action: 'OPEN_LONG' | 'OPEN_SHORT' | 'CLOSE';
  price: number;
  fgi: number;
  fgi30d: number;
  size: number;
  pnl?: number;
  fees: number;
  balance: number;
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

// Calculate 30-day rolling FGI average
function calculate30DayRollingFGI(fgiData: FGIData[]): FGIData[] {
  const result: FGIData[] = [];
  const windowHours = CONFIG.ROLLING_DAYS * 24; // Convert days to hours for 1h timeframe
  
  for (let i = 0; i < fgiData.length; i++) {
    // Calculate the start index for the 30-day window
    const startIdx = Math.max(0, i - windowHours + 1);
    
    // Calculate rolling average
    const windowData = fgiData.slice(startIdx, i + 1);
    const sum = windowData.reduce((acc, d) => acc + d.fgi, 0);
    const avg = sum / windowData.length;
    
    result.push({
      ...fgiData[i],
      rollingAvg30d: avg
    });
  }
  
  return result;
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
        fgi30d: fgiPoint.rollingAvg30d || fgiPoint.fgi,
        volume: pricePoint.volume
      });
    }
  }
  
  return combined;
}

// Run backtest for a specific configuration
function runBacktest(
  data: CombinedData[],
  leverage: number,
  shortThreshold: number,
  longThreshold: number
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
            fgi30d: point.fgi30d,
            size: position.size.toNumber(),
            pnl: loss.neg().toNumber(),
            fees: 0,
            balance: balance.toNumber()
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
    
    // Determine target position based on 30-day rolling FGI
    let targetPosition: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
    
    if (point.fgi30d <= shortThreshold) {
      targetPosition = 'SHORT';
    } else if (point.fgi30d >= longThreshold) {
      targetPosition = 'LONG';
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
      
      if (CONFIG.DETAILED_LOGS) {
        trades.push({
          timestamp: point.timestamp,
          action: 'CLOSE',
          price: point.price,
          fgi: point.fgi,
          fgi30d: point.fgi30d,
          size: position.size.toNumber(),
          pnl: totalPnL.toNumber(),
          fees: closeFee.toNumber(),
          balance: balance.toNumber()
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
        fundingPaid: new Decimal(0)
      };
      
      if (CONFIG.DETAILED_LOGS) {
        trades.push({
          timestamp: point.timestamp,
          action: targetPosition === 'LONG' ? 'OPEN_LONG' : 'OPEN_SHORT',
          price: point.price,
          fgi: point.fgi,
          fgi30d: point.fgi30d,
          size: position.size.toNumber(),
          fees: openFee.toNumber(),
          balance: balance.toNumber()
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
function generateParameterCombinations(): Array<{leverage: number, short: number, long: number}> {
  const combinations: Array<{leverage: number, short: number, long: number}> = [];
  
  for (const leverage of CONFIG.LEVERAGE_LEVELS) {
    for (let short = CONFIG.FGI_SHORT_RANGE.start; 
         short <= CONFIG.FGI_SHORT_RANGE.end; 
         short += CONFIG.FGI_SHORT_RANGE.step) {
      for (let long = CONFIG.FGI_LONG_RANGE.start; 
           long <= CONFIG.FGI_LONG_RANGE.end; 
           long += CONFIG.FGI_LONG_RANGE.step) {
        // Only valid if short < long (proper neutral zone)
        if (short < long) {
          combinations.push({ leverage, short, long });
        }
      }
    }
  }
  
  return combinations;
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
  console.log(`  Rolling Window: ${CONFIG.ROLLING_DAYS} days`);
  console.log(`  Leverage Levels: ${CONFIG.LEVERAGE_LEVELS.join('x, ')}x`);
  console.log(`  FGI Short Range: ${CONFIG.FGI_SHORT_RANGE.start}-${CONFIG.FGI_SHORT_RANGE.end}`);
  console.log(`  FGI Long Range: ${CONFIG.FGI_LONG_RANGE.start}-${CONFIG.FGI_LONG_RANGE.end}`);
  console.log(`  Initial Capital: $${CONFIG.INITIAL_CAPITAL.toLocaleString()}`);
  console.log(`  Test Period: ${CONFIG.DAYS_TO_TEST} days\n`);
  
  // Fetch data
  console.log(chalk.cyan('Fetching market data...'));
  const [priceData, fgiData] = await Promise.all([
    fetchPriceData(),
    fetchFGIData()
  ]);
  
  // Calculate rolling FGI
  console.log(chalk.cyan('Calculating 30-day rolling FGI...'));
  const fgiWithRolling = calculate30DayRollingFGI(fgiData);
  
  // Combine data
  const combinedData = combineData(priceData, fgiWithRolling);
  console.log(chalk.green(`✓ Prepared ${combinedData.length} data points for backtesting\n`));
  
  // Generate parameter combinations
  const combinations = generateParameterCombinations();
  console.log(chalk.yellow(`Testing ${combinations.length} parameter combinations...\n`));
  
  // Run backtests
  const results: BacktestResult[] = [];
  const startTime = Date.now();
  
  for (let i = 0; i < combinations.length; i++) {
    const combo = combinations[i];
    
    // Progress indicator
    if (i % 10 === 0) {
      const progress = ((i / combinations.length) * 100).toFixed(1);
      process.stdout.write(`\rProgress: ${progress}% (${i}/${combinations.length})`);
    }
    
    const result = runBacktest(
      combinedData,
      combo.leverage,
      combo.short,
      combo.long
    );
    
    results.push(result);
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(chalk.green(`\n✓ Completed ${combinations.length} backtests in ${elapsed}s\n`));
  
  // Sort results by total return
  results.sort((a, b) => b.totalReturnPercent - a.totalReturnPercent);
  
  // Display top results
  console.log(chalk.cyan.bold('Top 10 Configurations by Total Return:\n'));
  
  const top10 = results.slice(0, 10);
  console.log(chalk.white('Rank | Leverage | Short≤ | Long≥ | Return% | Sharpe | MaxDD% | Trades | WinRate | Liquid.'));
  console.log(chalk.white('-----|----------|--------|-------|---------|--------|--------|--------|---------|--------'));
  
  top10.forEach((result, idx) => {
    const color = result.liquidations > 0 ? chalk.red : 
                   result.totalReturnPercent > 100 ? chalk.green :
                   result.totalReturnPercent > 0 ? chalk.yellow : chalk.red;
    
    console.log(color(
      `${String(idx + 1).padStart(4)} | ` +
      `${String(result.leverage + 'x').padStart(8)} | ` +
      `${String(result.shortThreshold).padStart(6)} | ` +
      `${String(result.longThreshold).padStart(5)} | ` +
      `${result.totalReturnPercent.toFixed(1).padStart(7)} | ` +
      `${result.sharpeRatio.toFixed(2).padStart(6)} | ` +
      `${result.maxDrawdown.toFixed(1).padStart(6)} | ` +
      `${String(result.numTrades).padStart(6)} | ` +
      `${result.winRate.toFixed(1).padStart(7)} | ` +
      `${String(result.liquidations).padStart(7)}`
    ));
  });
  
  // Best risk-adjusted return (Sharpe ratio)
  const bestSharpe = results.reduce((best, current) => 
    current.sharpeRatio > best.sharpeRatio ? current : best
  );
  
  // Best conservative (no liquidations, lowest drawdown)
  const conservative = results
    .filter(r => r.liquidations === 0)
    .sort((a, b) => a.maxDrawdown - b.maxDrawdown)[0];
  
  console.log(chalk.cyan.bold('\n📊 Optimization Summary:\n'));
  
  console.log(chalk.green('Best Overall Return:'));
  console.log(`  Configuration: ${top10[0].leverage}x leverage, Short ≤ ${top10[0].shortThreshold}, Long ≥ ${top10[0].longThreshold}`);
  console.log(`  Total Return: ${top10[0].totalReturnPercent.toFixed(2)}%`);
  console.log(`  Sharpe Ratio: ${top10[0].sharpeRatio.toFixed(2)}`);
  console.log(`  Max Drawdown: ${top10[0].maxDrawdown.toFixed(2)}%`);
  console.log(`  Liquidations: ${top10[0].liquidations}`);
  
  console.log(chalk.yellow('\nBest Risk-Adjusted (Sharpe):'));
  console.log(`  Configuration: ${bestSharpe.leverage}x leverage, Short ≤ ${bestSharpe.shortThreshold}, Long ≥ ${bestSharpe.longThreshold}`);
  console.log(`  Total Return: ${bestSharpe.totalReturnPercent.toFixed(2)}%`);
  console.log(`  Sharpe Ratio: ${bestSharpe.sharpeRatio.toFixed(2)}`);
  console.log(`  Max Drawdown: ${bestSharpe.maxDrawdown.toFixed(2)}%`);
  
  if (conservative) {
    console.log(chalk.blue('\nMost Conservative (No Liquidations):'));
    console.log(`  Configuration: ${conservative.leverage}x leverage, Short ≤ ${conservative.shortThreshold}, Long ≥ ${conservative.longThreshold}`);
    console.log(`  Total Return: ${conservative.totalReturnPercent.toFixed(2)}%`);
    console.log(`  Sharpe Ratio: ${conservative.sharpeRatio.toFixed(2)}`);
    console.log(`  Max Drawdown: ${conservative.maxDrawdown.toFixed(2)}%`);
  }
  
  // Save results to SQLite database
  if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
    fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
  }

  // Create a run ID based on timestamp for tracking
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const timestamp = new Date().toISOString();

  // Open SQLite database (consolidated)
  const dbPath = path.join(__dirname, 'backtest-results', 'all-backtests.db');
  const db = new Database(dbPath);

  // Create table if it doesn't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS backtests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      asset TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      strategy TEXT DEFAULT 'momentum',
      short_threshold INTEGER NOT NULL,
      long_threshold INTEGER NOT NULL,
      leverage INTEGER NOT NULL,
      total_return REAL NOT NULL,
      sharpe_ratio REAL NOT NULL,
      max_drawdown REAL NOT NULL,
      num_trades INTEGER NOT NULL,
      win_rate REAL NOT NULL,
      liquidations INTEGER NOT NULL,
      time_in_market REAL NOT NULL,
      fees REAL NOT NULL,
      funding REAL NOT NULL
    )
  `);

  // Create indexes for fast lookups
  db.run(`CREATE INDEX IF NOT EXISTS idx_asset_strategy ON backtests (asset, strategy)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_params ON backtests (short_threshold, long_threshold, leverage)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_returns ON backtests (total_return DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sharpe ON backtests (sharpe_ratio DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_run ON backtests (run_id)`);

  // Prepare insert statement
  const insertStmt = db.prepare(`
    INSERT INTO backtests (
      run_id, timestamp, asset, timeframe, strategy,
      short_threshold, long_threshold, leverage,
      total_return, sharpe_ratio, max_drawdown,
      num_trades, win_rate, liquidations,
      time_in_market, fees, funding
    ) VALUES (
      $run_id, $timestamp, $asset, $timeframe, $strategy,
      $short_threshold, $long_threshold, $leverage,
      $total_return, $sharpe_ratio, $max_drawdown,
      $num_trades, $win_rate, $liquidations,
      $time_in_market, $fees, $funding
    )
  `);

  // Use transaction for fast batch insert
  const insertMany = db.transaction((results) => {
    for (const r of results) {
      insertStmt.run({
        $run_id: runId,
        $timestamp: timestamp,
        $asset: CONFIG.ASSET,
        $timeframe: CONFIG.TIMEFRAME,
        $strategy: 'momentum',
        $short_threshold: r.shortThreshold,
        $long_threshold: r.longThreshold,
        $leverage: r.leverage,
        $total_return: r.totalReturnPercent,
        $sharpe_ratio: r.sharpeRatio,
        $max_drawdown: r.maxDrawdown,
        $num_trades: r.numTrades,
        $win_rate: r.winRate,
        $liquidations: r.liquidations,
        $time_in_market: r.timeInMarket,
        $fees: r.totalFeesPaid,
        $funding: r.totalFundingPaid
      });
    }
  });

  // Insert all results in one transaction
  insertMany(results);

  console.log(chalk.green(`\n✓ Results saved to SQLite: ${dbPath}`));
  console.log(chalk.yellow(`  Run ID: ${runId}`));
  console.log(chalk.cyan(`  Records inserted: ${results.length}`));

  // Query and display some stats
  const stats = db.prepare(`
    SELECT COUNT(*) as total_records,
           COUNT(DISTINCT run_id) as total_runs
    FROM backtests
  `).get();

  console.log(chalk.blue(`  Total records in DB: ${stats.total_records}`));
  console.log(chalk.blue(`  Total runs: ${stats.total_runs}`));

  // Close database
  db.close();
  
  console.log(chalk.cyan.bold('\n✨ Backtest complete!\n'));
}

// Run the backtest
main().catch(console.error);