import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import Decimal from 'decimal.js';

// Configure Decimal.js for financial precision
Decimal.set({ precision: 28 }); // High precision for financial calculations

// Parse command line arguments
const args = process.argv.slice(2);

// Parse named parameters (--parameter=value format)
function parseNamedArgs(args: string[]): {[key: string]: string} {
  const namedArgs: {[key: string]: string} = {};
  
  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (value) {
        namedArgs[key] = value;
      }
    }
  });
  
  return namedArgs;
}

// Extract positional and named arguments
const namedArgs = parseNamedArgs(args);
const positionalArgs = args.filter(arg => !arg.startsWith('--'));

const ASSET = positionalArgs[0] || 'SOL';
const TIMEFRAME = positionalArgs[1] || '4h';
const TEST_MODE = positionalArgs[2] || 'quick'; // 'quick', 'medium', or 'exhaustive'

// Parse leverage parameter from named args
function parseLeverage(leverageArg: string | undefined): number {
  if (!leverageArg) return 1;
  
  // Remove 'x' suffix if present (e.g., "3x" -> "3")
  const leverageStr = leverageArg.toLowerCase().replace('x', '');
  const leverage = parseFloat(leverageStr);
  
  // Validate allowed leverage values (1x to 12x)
  const allowedLeverages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (!allowedLeverages.includes(leverage)) {
    console.log(chalk.yellow(`Warning: Invalid leverage "${leverageArg}". Using 1x. Allowed: 1x-12x`));
    return 1;
  }
  
  return leverage;
}

// Parse additional parameters
const LEVERAGE = parseLeverage(namedArgs.leverage);
const SPECIFIC_SHORT_THRESHOLD = namedArgs['short-threshold'] ? parseInt(namedArgs['short-threshold']) : null;
const SPECIFIC_LONG_THRESHOLD = namedArgs['long-threshold'] ? parseInt(namedArgs['long-threshold']) : null;
const DAYS_LIMIT = namedArgs.days ? parseInt(namedArgs.days) : null;

console.log(chalk.cyan(`Running FGI LONG/SHORT backtest for ${ASSET} on ${TIMEFRAME} timeframe`));
if (SPECIFIC_SHORT_THRESHOLD !== null && SPECIFIC_LONG_THRESHOLD !== null) {
  console.log(chalk.yellow(`Mode: SPECIFIC THRESHOLD TEST`));
  console.log(chalk.yellow(`Short Threshold: ${SPECIFIC_SHORT_THRESHOLD} | Long Threshold: ${SPECIFIC_LONG_THRESHOLD}`));
} else {
  console.log(chalk.yellow(`Test mode: ${TEST_MODE.toUpperCase()}`));
}
console.log(chalk.magenta(`Leverage: ${LEVERAGE}x${LEVERAGE > 1 ? ' (with liquidation risk)' : ''}`));
if (DAYS_LIMIT) {
  console.log(chalk.blue(`Data Limit: Last ${DAYS_LIMIT} days`));
}

// Helper function to generate range with +1 increments (EXHAUSTIVE TESTING)
function generateRange(start: number, end: number): number[] {
  const range: number[] = [];
  for (let i = start; i <= end; i++) {
    range.push(i);
  }
  return range;
}

// Backtest settings configuration
const SETTINGS = {
  // Test assets and timeframes
  assets: [ASSET],
  timeframes: [TIMEFRAME],
  
  // Financial settings
  initialCapitalUSD: 1000, // $1,000 starting capital
  solReserveAmount: 0.01, // Amount of SOL to reserve for fees
  
  // Fee structure (simplified for long/short)
  platformFeeRate: 0.0009, // 0.09% platform fee per trade
  baseTxFeeSol: 0.000015, // Base transaction fee in SOL
  priorityFeeSol: 0.00001, // Priority fee in SOL
  
  // Testing settings based on mode (quick, medium, or exhaustive)
  // Quick mode: Strategic sampling for fast results (~196 combinations)
  // Medium mode: Comprehensive coverage (~900 combinations)  
  // Exhaustive mode: ALL possible values (~4,950 combinations)
  longThresholds: TEST_MODE === 'exhaustive' ? generateRange(1, 99) :
                  TEST_MODE === 'medium' ? generateRange(5, 95).filter((_, i) => i % 3 === 0) :
                  generateRange(10, 50).filter((_, i) => i % 3 === 0), // Quick: every 3rd value from 10-50
  shortThresholds: TEST_MODE === 'exhaustive' ? generateRange(2, 100) :
                   TEST_MODE === 'medium' ? generateRange(10, 100).filter((_, i) => i % 3 === 0) :
                   generateRange(50, 90).filter((_, i) => i % 3 === 0), // Quick: every 3rd value from 50-90
  
  // Output settings
  outputBaseDir: './backtest-results',
  progressBarLength: 30,
};

// Position types for long/short trading
enum Position {
  LONG = 'long',   // Long the asset (profits when price goes up)
  SHORT = 'short', // Short the asset (profits when price goes down) 
  NEUTRAL = 'neutral' // No position (only used initially or when no clear signal)
}

// Types
interface FgiDataPoint {
  timestamp: string;
  price: number;
  fgi: number;
  raw: {
    date: string;
    price: number;
    cfgi: number;
  };
}

interface TradeLog {
  timestamp: string;
  action: 'OPEN_LONG' | 'OPEN_SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT' | 'LIQUIDATION';
  position: Position;
  price: Decimal;
  fgi: number;
  positionSize: Decimal;
  pnl: Decimal;
  fees: Decimal;
  cashBalance: Decimal;
  accountEquity: Decimal;
  details: string;
}

interface LongShortState {
  position: Position;
  positionSize: Decimal; // Size in USD (using Decimal for precision)
  entryPrice: Decimal;
  lastFgiScore: number;
  lastAction: string;
  lastProcessedTimestamp: string;
  cashBalance: Decimal; // Available cash (using Decimal for precision)
  unrealizedPnL: Decimal; // Using Decimal for precision
  realizedPnL: Decimal; // Using Decimal for precision
  leverage: number; // Leverage multiplier (1x, 2x, 3x, 5x, 10x)
  isLiquidated: boolean; // Whether account has been liquidated
  liquidationTimestamp?: string; // When liquidation occurred
  liquidationDetails?: string; // Details about the liquidation
  tradesBeforeLiquidation: number; // Number of trades before liquidation
  tradeLog: TradeLog[]; // Detailed trade history
}

interface LongShortResult {
  asset: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  startingPrice: number;
  endingPrice: number;
  baselineReturn: number; // Buy and hold
  strategyReturn: number; // Long/Short strategy
  numTrades: number;
  winningTrades: number;
  winRate: number;
  buyThreshold: number;
  sellThreshold: number;
  neutralZoneSize: number;
  fgiAverage: number;
  finalCashBalance: number;
  finalUnrealizedPnL: number;
  finalRealizedPnL: number;
  totalReturn: number;
  platformFeesCollected: number;
  timeInLong: number;
  timeInShort: number;
  timeInNeutral: number;
  maxDrawdown: number;
  leverage: number; // Leverage used
  isLiquidated: boolean; // Whether strategy got liquidated
  liquidationTimestamp?: string; // When liquidation occurred
  liquidationDetails?: string; // Details about liquidation
  tradesBeforeLiquidation: number; // Number of trades before liquidation
  maxDrawdownBeforeLiquidation: number; // Max drawdown before liquidation
  tradeLog: TradeLog[]; // Detailed trade history
}

// Fetch FGI data
async function fetchFgiData(asset: string, timeframe: string, daysLimit?: number | null): Promise<{data: FgiDataPoint[], minFgi: number, maxFgi: number}> {
  try {
    const url = `https://api.surfsolana.com/${asset}/${timeframe}/1_year.json`;
    console.log(`Fetching data from ${url}...`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const rawData = await response.json() as any[];
    
    let data: FgiDataPoint[] = rawData.map(item => ({
      timestamp: item.timestamp || item.date,
      price: parseFloat(item.price),
      fgi: parseFloat(item.fgi || item.cfgi),
      raw: item
    }));

    // Filter data to last N days if specified
    if (daysLimit && daysLimit > 0) {
      // Sort by timestamp to ensure chronological order
      data.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      // Calculate cutoff date (N days ago from the most recent data point)
      const mostRecentDate = new Date(data[data.length - 1].timestamp);
      const cutoffDate = new Date(mostRecentDate.getTime() - (daysLimit * 24 * 60 * 60 * 1000));
      
      // Filter to only include data from the last N days
      const originalLength = data.length;
      data = data.filter(item => new Date(item.timestamp) >= cutoffDate);
      
      console.log(`📅 Filtered to last ${daysLimit} days: ${originalLength} -> ${data.length} data points`);
    }

    const fgiValues = data.map(d => d.fgi).filter(fgi => fgi !== undefined && !isNaN(fgi) && isFinite(fgi));
    const minFgi = fgiValues.length > 0 ? Math.min(...fgiValues) : 0;
    const maxFgi = fgiValues.length > 0 ? Math.max(...fgiValues) : 0;
    
    console.log(`✅ Fetched ${data.length} data points for ${asset} ${timeframe}`);
    console.log(`   FGI range: ${minFgi} to ${maxFgi}`);
    if (daysLimit) {
      console.log(`   Period: ${data[0]?.timestamp} to ${data[data.length - 1]?.timestamp}`);
    }
    
    return { data, minFgi, maxFgi };
  } catch (error) {
    console.error(`❌ Error fetching data for ${asset} ${timeframe}:`, error);
    return { data: [], minFgi: 0, maxFgi: 0 };
  }
}

// Long/Short backtest with FGI thresholds (MOMENTUM STRATEGY)
// NOTE: This implements a leveraged long/short strategy where:
// - LONG = Hold the asset with leverage (profits amplified when price rises)
// - SHORT = Simulate shorting the asset with leverage (profits amplified when price falls)
// - NEUTRAL = Hold cash (no market exposure)
// - LIQUIDATION = Account equity goes to zero or below (game over)
function backtestLongShort(
  data: FgiDataPoint[], 
  asset: string, 
  timeframe: string, 
  shortThreshold: number = 30,  // Go SHORT when FGI <= this (sell with the fear)
  longThreshold: number = 70,   // Go LONG when FGI >= this (buy with the greed)
  leverage: number = 1,         // Leverage multiplier (1x, 2x, 3x, 5x, 10x)
  enableTradeLogging: boolean = false  // Enable detailed trade-by-trade logging
): LongShortResult {
  if (data.length === 0) {
    throw new Error('No data to backtest');
  }

  // Sort data chronologically
  data.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const initialPrice = data[0].price;
  const INITIAL_CAPITAL_USD = SETTINGS.initialCapitalUSD;

  const state: LongShortState = {
    position: Position.NEUTRAL,
    positionSize: new Decimal(0),
    entryPrice: new Decimal(0),
    lastFgiScore: data[0].fgi,
    lastAction: 'initialize',
    lastProcessedTimestamp: data[0].timestamp,
    cashBalance: new Decimal(INITIAL_CAPITAL_USD),
    unrealizedPnL: new Decimal(0),
    realizedPnL: new Decimal(0),
    leverage: leverage,
    isLiquidated: false,
    tradesBeforeLiquidation: 0,
    tradeLog: []
  };

  // Helper function to log trades
  function logTrade(
    timestamp: string,
    action: TradeLog['action'],
    position: Position,
    price: number,
    fgi: number,
    positionSize: Decimal,
    pnl: Decimal,
    fees: Decimal,
    details: string
  ) {
    if (enableTradeLogging) {
      const accountEquity = state.cashBalance.plus(state.realizedPnL).plus(state.unrealizedPnL);
      state.tradeLog.push({
        timestamp,
        action,
        position,
        price: new Decimal(price),
        fgi,
        positionSize,
        pnl,
        fees,
        cashBalance: state.cashBalance,
        accountEquity,
        details
      });
    }
  }

  // Trading stats
  let numTrades = 0;
  let winningTrades = 0;
  let platformFeesCollected = 0;
  let periodsInLong = 0;
  let periodsInShort = 0;
  let periodsInNeutral = 0;
  let maxDrawdown = 0;
  let peakValue = INITIAL_CAPITAL_USD;
  let maxDrawdownBeforeLiquidation = 0;

  // FGI values
  const fgiValues = data.map(d => d.fgi);
  const fgiAverage = fgiValues.reduce((sum, val) => sum + val, 0) / fgiValues.length;

  // Track baseline (buy and hold)
  const baselineShares = INITIAL_CAPITAL_USD / initialPrice;

  // Process each data point
  for (let i = 1; i < data.length; i++) {
    const { price, fgi, timestamp } = data[i];
    
    // Update unrealized PnL based on current price
    if (state.position === Position.LONG && state.positionSize.gt(0)) {
      // LONG position: Profit when price rises, lose when price falls
      // With leverage: Position size already includes leverage multiplier
      const priceDecimal = new Decimal(price);
      const priceDiff = priceDecimal.minus(state.entryPrice);
      const priceChangeRatio = priceDiff.div(state.entryPrice);
      state.unrealizedPnL = state.positionSize.mul(priceChangeRatio);
    } else if (state.position === Position.SHORT && state.positionSize.gt(0)) {
      // SHORT position: Profit when price falls, lose when price rises
      // With leverage: Position size already includes leverage multiplier
      const priceDecimal = new Decimal(price);
      const priceDiff = state.entryPrice.minus(priceDecimal);
      const priceChangeRatio = priceDiff.div(state.entryPrice);
      state.unrealizedPnL = state.positionSize.mul(priceChangeRatio);
    } else {
      state.unrealizedPnL = new Decimal(0);
    }

    // Calculate account equity (cash + realized P&L + unrealized P&L)
    const accountEquity = state.cashBalance.plus(state.realizedPnL).plus(state.unrealizedPnL);
    
    // LIQUIDATION CHECK: If equity goes to zero or below, liquidate position
    if (accountEquity.lte(0) && !state.isLiquidated) {
      state.isLiquidated = true;
      state.liquidationTimestamp = timestamp;
      state.liquidationDetails = `Account liquidated at ${price.toFixed(4)} with ${state.position} position. ` +
        `Equity: $${accountEquity.toFixed(2)}, Unrealized P&L: $${state.unrealizedPnL.toFixed(2)}`;
      
      // Force close position and realize all losses
      if (state.position !== Position.NEUTRAL && state.positionSize.gt(0)) {
        // Log liquidation
        logTrade(
          timestamp,
          'LIQUIDATION',
          state.position,
          price,
          fgi,
          state.positionSize,
          state.unrealizedPnL,
          new Decimal(0),
          `LIQUIDATION: ${state.liquidationDetails}`
        );
        
        state.realizedPnL = state.realizedPnL.plus(state.unrealizedPnL);
        state.unrealizedPnL = new Decimal(0);
        state.positionSize = new Decimal(0);
        state.position = Position.NEUTRAL;
        state.tradesBeforeLiquidation = numTrades;
      }
      
      // Set cash balance to zero (liquidated)
      state.cashBalance = new Decimal(0);
      maxDrawdownBeforeLiquidation = maxDrawdown;
    }

    // Skip all trading if liquidated (game over)
    if (state.isLiquidated) {
      continue;
    }

    // Calculate current total value for drawdown tracking
    const currentValue = state.cashBalance.plus(state.realizedPnL).plus(state.unrealizedPnL).toNumber();
    if (currentValue > peakValue) {
      peakValue = currentValue;
    }
    const drawdown = (peakValue - currentValue) / peakValue;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }

    // Determine target position based on FGI thresholds (MOMENTUM LOGIC)
    let targetPosition: Position;
    
    if (fgi <= shortThreshold) {
      // Low FGI (fear) = Go SHORT (momentum - sell with the fear)
      targetPosition = Position.SHORT;
    } else if (fgi >= longThreshold) {
      // High FGI (greed) = Go LONG (momentum - buy with the greed)
      targetPosition = Position.LONG;
    } else {
      // In neutral zone = Keep current position (don't close positions in neutral zone)
      targetPosition = state.position;
    }

    // Track time in each position
    if (state.position === Position.LONG) periodsInLong++;
    else if (state.position === Position.SHORT) periodsInShort++;
    else periodsInNeutral++;

    // Execute position changes
    if (targetPosition !== state.position) {
      const PLATFORM_FEE_RATE = SETTINGS.platformFeeRate;
      
      // Close existing position if any
      if (state.position !== Position.NEUTRAL && state.positionSize.gt(0)) {
        // Store P&L before zeroing for win rate calculation
        const tradePnL = state.unrealizedPnL;
        
        // Pay platform fee on position size
        const closingFee = state.positionSize.mul(new Decimal(PLATFORM_FEE_RATE));
        platformFeesCollected += closingFee.toNumber();
        
        // Log position close
        const closeAction = state.position === Position.LONG ? 'CLOSE_LONG' : 'CLOSE_SHORT';
        const netPnL = tradePnL.minus(closingFee);
        logTrade(
          timestamp,
          closeAction,
          state.position,
          price,
          fgi,
          state.positionSize,
          netPnL,
          closingFee,
          `Close ${state.position} position. Entry: $${state.entryPrice.toFixed(4)}, Exit: $${price.toFixed(4)}, Net P&L: $${netPnL.toFixed(2)}`
        );
        
        // Realize P&L
        state.realizedPnL = state.realizedPnL.plus(state.unrealizedPnL);
        state.unrealizedPnL = new Decimal(0);
        state.realizedPnL = state.realizedPnL.minus(closingFee);
        
        // Track winning trades (using stored P&L before it was zeroed)
        if (tradePnL.gt(closingFee)) {  // Trade is winning if P&L exceeds fees
          winningTrades++;
        }
        
        // Update cash balance with realized P&L
        state.cashBalance = new Decimal(INITIAL_CAPITAL_USD).plus(state.realizedPnL);
        
        numTrades++;
        state.positionSize = new Decimal(0);
      }

      // Open new position
      if (targetPosition !== Position.NEUTRAL) {
        // Use current cash balance for new position
        const availableCash = state.cashBalance;
        const openingFee = availableCash.mul(new Decimal(PLATFORM_FEE_RATE));
        
        // Apply leverage to position size
        // Position size = (available cash - fees) * leverage
        state.positionSize = availableCash.minus(openingFee).mul(leverage);
        state.entryPrice = new Decimal(price);
        platformFeesCollected += openingFee.toNumber();
        
        // Log position open
        const openAction = targetPosition === Position.LONG ? 'OPEN_LONG' : 'OPEN_SHORT';
        logTrade(
          timestamp,
          openAction,
          targetPosition,
          price,
          fgi,
          state.positionSize,
          new Decimal(0), // No P&L yet
          openingFee,
          `Open ${targetPosition} position. Entry: $${price.toFixed(4)}, Size: $${state.positionSize.toFixed(2)}, Leverage: ${leverage}x`
        );
        
        numTrades++;
      }

      state.position = targetPosition;
      state.lastAction = `Changed to ${targetPosition} at FGI ${fgi}`;
    }

    state.lastFgiScore = fgi;
    state.lastProcessedTimestamp = timestamp;
  }

  // Final calculations
  const finalPrice = data[data.length - 1].price;
  
  // Close final position
  if (state.position !== Position.NEUTRAL && state.positionSize.gt(0)) {
    // Store P&L before zeroing for win rate calculation
    const tradePnL = state.unrealizedPnL;
    
    const closingFee = state.positionSize.mul(new Decimal(SETTINGS.platformFeeRate));
    platformFeesCollected += closingFee.toNumber();
    
    // Log final position close
    const closeAction = state.position === Position.LONG ? 'CLOSE_LONG' : 'CLOSE_SHORT';
    const netPnL = tradePnL.minus(closingFee);
    logTrade(
      data[data.length - 1].timestamp,
      closeAction,
      state.position,
      finalPrice,
      data[data.length - 1].fgi,
      state.positionSize,
      netPnL,
      closingFee,
      `Final close ${state.position} position. Entry: $${state.entryPrice.toFixed(4)}, Exit: $${finalPrice.toFixed(4)}, Net P&L: $${netPnL.toFixed(2)}`
    );
    
    state.realizedPnL = state.realizedPnL.plus(state.unrealizedPnL);
    state.realizedPnL = state.realizedPnL.minus(closingFee);
    
    // Track winning trades (using stored P&L before it was zeroed)
    if (tradePnL.gt(closingFee)) {  // Trade is winning if P&L exceeds fees
      winningTrades++;
    }
    
    // Update final cash balance
    state.cashBalance = new Decimal(INITIAL_CAPITAL_USD).plus(state.realizedPnL);
    
    numTrades++;
  }

  // Total return is the final cash balance minus initial capital
  const totalReturn = state.cashBalance.minus(INITIAL_CAPITAL_USD);
  const strategyReturnPercent = totalReturn.div(INITIAL_CAPITAL_USD).mul(100).toNumber();
  
  // Baseline calculation
  const baselineValue = baselineShares * finalPrice;
  const baselineReturnPercent = ((baselineValue - INITIAL_CAPITAL_USD) / INITIAL_CAPITAL_USD) * 100;

  const totalPeriods = data.length - 1;

  return {
    asset,
    timeframe,
    startDate: data[0].timestamp,
    endDate: data[data.length - 1].timestamp,
    startingPrice: initialPrice,
    endingPrice: finalPrice,
    baselineReturn: baselineReturnPercent,
    strategyReturn: strategyReturnPercent,
    numTrades,
    winningTrades,
    winRate: numTrades > 0 ? (winningTrades / numTrades) * 100 : 0,
    buyThreshold: longThreshold,   // LONG threshold (high FGI)
    sellThreshold: shortThreshold, // SHORT threshold (low FGI)  
    neutralZoneSize: longThreshold - shortThreshold,
    fgiAverage,
    finalCashBalance: state.cashBalance.toNumber(),
    finalUnrealizedPnL: 0, // Closed out
    finalRealizedPnL: state.realizedPnL.toNumber(),
    totalReturn: strategyReturnPercent,
    platformFeesCollected,
    timeInLong: (periodsInLong / totalPeriods) * 100,
    timeInShort: (periodsInShort / totalPeriods) * 100,
    timeInNeutral: (periodsInNeutral / totalPeriods) * 100,
    maxDrawdown: maxDrawdown * 100,
    leverage: leverage,
    isLiquidated: state.isLiquidated,
    liquidationTimestamp: state.liquidationTimestamp,
    liquidationDetails: state.liquidationDetails,
    tradesBeforeLiquidation: state.tradesBeforeLiquidation,
    maxDrawdownBeforeLiquidation: maxDrawdownBeforeLiquidation * 100,
    tradeLog: state.tradeLog
  };
}

// Progress bar function
function updateProgress(current: number, total: number, barLength: number = 30): string {
  const progress = current / total;
  const progressBarLength = Math.round(barLength * progress);
  const progressBar = '█'.repeat(progressBarLength) + '░'.repeat(barLength - progressBarLength);
  const percentage = Math.round(progress * 100);
  return `[${progressBar}] ${percentage}% (${current}/${total})`;
}

// Function to display detailed trade logs
function displayTradeLog(result: LongShortResult) {
  if (!result.tradeLog || result.tradeLog.length === 0) {
    console.log(chalk.yellow('No trades to display'));
    return;
  }

  console.log(chalk.cyan(`\n📈 DETAILED TRADE LOG (${result.tradeLog.length} trades)`));
  console.log(chalk.cyan('================================================================\n'));

  result.tradeLog.forEach((trade, index) => {
    const actionColor = {
      'OPEN_LONG': chalk.green,
      'OPEN_SHORT': chalk.red,
      'CLOSE_LONG': chalk.greenBright,
      'CLOSE_SHORT': chalk.redBright,
      'LIQUIDATION': chalk.bgRed.white
    }[trade.action] || chalk.white;

    const pnlColor = trade.pnl.gte(0) ? chalk.green : chalk.red;
    const pnlSymbol = trade.pnl.gte(0) ? '+' : '';

    console.log(`${index + 1}. ${actionColor(trade.action)} - ${trade.timestamp}`);
    console.log(`   Price: $${trade.price.toFixed(4)} | FGI: ${trade.fgi} | Position: ${trade.position.toUpperCase()}`);
    console.log(`   Size: $${trade.positionSize.toFixed(2)} | P&L: ${pnlColor(pnlSymbol + '$' + trade.pnl.toFixed(2))} | Fees: $${trade.fees.toFixed(2)}`);
    console.log(`   Balance: $${trade.cashBalance.toFixed(2)} | Equity: $${trade.accountEquity.toFixed(2)}`);
    console.log(`   ${chalk.dim(trade.details)}\n`);
  });

  // Summary stats
  const totalPnL = result.tradeLog.reduce((sum, trade) => sum.plus(trade.pnl), new Decimal(0));
  const totalFees = result.tradeLog.reduce((sum, trade) => sum.plus(trade.fees), new Decimal(0));
  const winningTrades = result.tradeLog.filter(trade => trade.pnl.gt(0)).length;
  
  console.log(chalk.cyan('TRADE SUMMARY:'));
  console.log(`Total Trades: ${result.tradeLog.length}`);
  console.log(`Winning Trades: ${winningTrades} (${((winningTrades / result.tradeLog.length) * 100).toFixed(1)}%)`);
  console.log(`Total P&L: ${totalPnL.gte(0) ? chalk.green('+') : chalk.red('')}$${totalPnL.toFixed(2)}`);
  console.log(`Total Fees: $${totalFees.toFixed(2)}`);
  console.log(`Final Balance: $${result.finalCashBalance.toFixed(2)}`);
  console.log(`Strategy Return: ${result.strategyReturn >= 0 ? chalk.green('+') : chalk.red('')}${result.strategyReturn.toFixed(2)}%`);
}

// Main backtest function
async function runComprehensiveBacktest() {
  // Check if specific thresholds are provided
  const isSpecificThresholdTest = SPECIFIC_SHORT_THRESHOLD !== null && SPECIFIC_LONG_THRESHOLD !== null;
  
  if (isSpecificThresholdTest) {
    console.log(chalk.cyan(`🎯 Running SPECIFIC THRESHOLD Test`));
    console.log(`Asset: ${ASSET} | Timeframe: ${TIMEFRAME} | Leverage: ${LEVERAGE}x`);
    console.log(`Short Threshold: FGI <= ${SPECIFIC_SHORT_THRESHOLD}`);
    console.log(`Long Threshold: FGI >= ${SPECIFIC_LONG_THRESHOLD}`);
    if (DAYS_LIMIT) {
      console.log(`Data Period: Last ${DAYS_LIMIT} days`);
    }
    console.log();

    // Fetch data
    const { data } = await fetchFgiData(ASSET, TIMEFRAME, DAYS_LIMIT);
    
    if (data.length === 0) {
      console.log(chalk.red(`❌ No data for ${ASSET} ${TIMEFRAME}, exiting...`));
      return;
    }

    // Run single backtest with detailed logging
    try {
      const result = backtestLongShort(
        data, 
        ASSET, 
        TIMEFRAME, 
        SPECIFIC_SHORT_THRESHOLD, 
        SPECIFIC_LONG_THRESHOLD, 
        LEVERAGE,
        true // Enable detailed trade logging
      );

      // Display results
      const outperformance = result.strategyReturn - result.baselineReturn;
      
      console.log(chalk.green(`📊 BACKTEST RESULTS`));
      console.log(chalk.green(`==================`));
      console.log(`Period: ${result.startDate} to ${result.endDate}`);
      console.log(`Starting Price: $${result.startingPrice.toFixed(4)}`);
      console.log(`Ending Price: $${result.endingPrice.toFixed(4)}`);
      console.log(`Strategy Return: ${result.strategyReturn >= 0 ? chalk.green('+') : chalk.red('')}${result.strategyReturn.toFixed(2)}%`);
      console.log(`Baseline (Buy & Hold): ${result.baselineReturn >= 0 ? chalk.green('+') : chalk.red('')}${result.baselineReturn.toFixed(2)}%`);
      console.log(`Outperformance: ${outperformance >= 0 ? chalk.green('+') : chalk.red('')}${outperformance.toFixed(2)}%`);
      console.log(`Number of Trades: ${result.numTrades}`);
      console.log(`Win Rate: ${result.winRate.toFixed(2)}%`);
      console.log(`Max Drawdown: ${result.maxDrawdown.toFixed(2)}%`);
      
      if (result.isLiquidated) {
        console.log(chalk.red(`\n⚠️ LIQUIDATION WARNING:`));
        console.log(chalk.red(`Account was liquidated at ${result.liquidationTimestamp}`));
        console.log(chalk.red(`${result.liquidationDetails}`));
      }

      // Display detailed trade log
      displayTradeLog(result);

    } catch (error) {
      console.error(chalk.red(`❌ Error running backtest:`), error);
    }

    return;
  }

  // Original grid search mode
  const modeDescriptions = {
    quick: 'Quick strategic sampling for fast results',
    medium: 'Comprehensive coverage with moderate runtime',
    exhaustive: 'TRULY EXHAUSTIVE testing of ALL possible FGI values (1-100)'
  };
  
  console.log(chalk.cyan(`🔍 Starting ${TEST_MODE.toUpperCase()} FGI LONG/SHORT Threshold Backtest 🔍`));
  console.log(`${modeDescriptions[TEST_MODE as keyof typeof modeDescriptions]}\n`);

  const { assets, timeframes, longThresholds, shortThresholds } = SETTINGS;
  
  console.log(`Assets: ${assets.join(', ')}`);
  console.log(`Timeframes: ${timeframes.join(', ')}`);
  console.log(`Long thresholds (buy fear): ${Math.min(...longThresholds)} to ${Math.max(...longThresholds)} (ALL values tested)`);
  console.log(`Short thresholds (sell greed): ${Math.min(...shortThresholds)} to ${Math.max(...shortThresholds)} (ALL values tested)`);
  console.log(`Starting capital: $${SETTINGS.initialCapitalUSD}`);
  if (DAYS_LIMIT) {
    console.log(`Data Period: Last ${DAYS_LIMIT} days`);
  }
  console.log();

  // Calculate total combinations (longThreshold < shortThreshold for proper neutral zone)
  const validCombinations = longThresholds.flatMap(long => 
    shortThresholds.filter(short => short > long).map(short => ({ long, short }))
  );
  
  const timeEstimates = {
    quick: 'about 1 minute',
    medium: '3-5 minutes',
    exhaustive: '10-15 minutes'
  };
  
  console.log(chalk.yellow(`⚡ Total combinations to test: ${validCombinations.length.toLocaleString()}`));
  console.log(chalk.yellow(`Estimated time: ${timeEstimates[TEST_MODE as keyof typeof timeEstimates]}...\n`));
  
  if (TEST_MODE !== 'exhaustive' && validCombinations.length < 1000) {
    console.log(chalk.dim(`💡 Tip: Use 'bun run ${path.basename(__filename)} ${ASSET} ${TIMEFRAME} exhaustive' for truly comprehensive testing\n`));
  }

  for (const asset of assets) {
    for (const timeframe of timeframes) {
      // Fetch data
      const { data } = await fetchFgiData(asset, timeframe, DAYS_LIMIT);
      
      if (data.length === 0) {
        console.log(chalk.red(`❌ No data for ${asset} ${timeframe}, skipping...`));
        continue;
      }

      const results: LongShortResult[] = [];
      let combinationIndex = 0;

      // Test all threshold combinations
      for (const { long: longThreshold, short: shortThreshold } of validCombinations) {
        combinationIndex++;
        
        // Update progress
        const progressBar = updateProgress(combinationIndex, validCombinations.length, SETTINGS.progressBarLength);
        process.stdout.write(`\rTesting configurations: ${progressBar}`);

        try {
          const result = backtestLongShort(data, asset, timeframe, longThreshold, shortThreshold, LEVERAGE, false);
          results.push(result);
        } catch (error) {
          console.error(`\n❌ Error testing ${longThreshold}/${shortThreshold}:`, error);
        }
      }

      console.log('\n'); // New line after progress

      // Sort results by strategy return (descending)
      results.sort((a, b) => b.strategyReturn - a.strategyReturn);

      // Get the best result
      const bestResult = results[0];
      const outperformance = bestResult.strategyReturn - bestResult.baselineReturn;

      // Generate summary report
      const outputDir = path.join(SETTINGS.outputBaseDir, new Date().toISOString().split('T')[0]);
      
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Save detailed results
      const csvPath = path.join(outputDir, `${asset}_${timeframe}_long_short_fgi_${LEVERAGE}x${DAYS_LIMIT ? `_${DAYS_LIMIT}d` : ''}.csv`);
      const csvHeader = 'LongThreshold,ShortThreshold,NeutralZone,StrategyReturn,BaselineReturn,Outperformance,NumTrades,WinRate,TimeInLong,TimeInShort,TimeInNeutral,MaxDrawdown,Leverage,IsLiquidated,TradesBeforeLiquidation\n';
      const csvRows = results.map(r => 
        `${r.buyThreshold},${r.sellThreshold},${r.neutralZoneSize},${r.strategyReturn.toFixed(2)},${r.baselineReturn.toFixed(2)},${(r.strategyReturn - r.baselineReturn).toFixed(2)},${r.numTrades},${r.winRate.toFixed(1)},${r.timeInLong.toFixed(1)},${r.timeInShort.toFixed(1)},${r.timeInNeutral.toFixed(1)},${r.maxDrawdown.toFixed(2)},${r.leverage},${r.isLiquidated},${r.tradesBeforeLiquidation}`
      ).join('\n');
      
      fs.writeFileSync(csvPath, csvHeader + csvRows);

      // Create summary report
      const liquidationInfo = bestResult.isLiquidated ? [
        ``,
        `⚠️ LIQUIDATION WARNING:`,
        `Strategy was LIQUIDATED at ${bestResult.liquidationTimestamp}`,
        `Liquidation Details: ${bestResult.liquidationDetails}`,
        `Trades Before Liquidation: ${bestResult.tradesBeforeLiquidation}`,
        `Max Drawdown Before Liquidation: ${bestResult.maxDrawdownBeforeLiquidation.toFixed(2)}%`,
        `❌ RESULT: Total loss of capital due to leverage`
      ] : [
        `✅ No liquidation occurred - strategy completed successfully`
      ];

      const summaryLines = [
        `FGI LONG/SHORT BACKTEST RESULTS (${LEVERAGE}x LEVERAGE)`,
        `=====================================`,
        `Test Mode: ${TEST_MODE.toUpperCase()}`,
        `Asset: ${asset}`,
        `Timeframe: ${timeframe}`,
        `Leverage: ${LEVERAGE}x${LEVERAGE > 1 ? ' (amplified gains/losses)' : ' (no leverage)'}`,
        DAYS_LIMIT ? `Data Period: Last ${DAYS_LIMIT} days` : 'Data Period: Full year',
        `Combinations Tested: ${results.length.toLocaleString()}`,
        `Period: ${bestResult.startDate} to ${bestResult.endDate}`,
        `Starting Price: $${bestResult.startingPrice.toFixed(2)}`,
        `Ending Price: $${bestResult.endingPrice.toFixed(2)}`,
        ...liquidationInfo,
        ``,
        `OPTIMAL CONFIGURATION (MOMENTUM STRATEGY):`,
        `Short Threshold (Go SHORT): FGI <= ${bestResult.sellThreshold} (sell with the fear)`,
        `Long Threshold (Go LONG): FGI >= ${bestResult.buyThreshold} (buy with the greed)`,   
        `Neutral Zone: ${bestResult.buyThreshold}-${bestResult.sellThreshold} (${bestResult.neutralZoneSize} points wide)`,
        ``,
        `PERFORMANCE METRICS:`,
        `Strategy Return: ${bestResult.strategyReturn.toFixed(2)}%`,
        `Baseline (Buy & Hold): ${bestResult.baselineReturn.toFixed(2)}%`,
        `Outperformance: ${outperformance > 0 ? '+' : ''}${outperformance.toFixed(2)}%`,
        `Number of Trades: ${bestResult.numTrades}`,
        `Win Rate: ${bestResult.winRate.toFixed(2)}%`,
        `Max Drawdown: ${bestResult.maxDrawdown.toFixed(2)}%`,
        ``,
        `TIME ALLOCATION:`,
        `Time in LONG: ${bestResult.timeInLong.toFixed(2)}%`,
        `Time in SHORT: ${bestResult.timeInShort.toFixed(2)}%`,
        `Time in NEUTRAL: ${bestResult.timeInNeutral.toFixed(2)}%`,
        ``,
        `====================================================================================================================================================================================`,
        ``,
        `🎯 RECOMMENDED CONFIGURATION FOR PRODUCTION:`,
        `Leverage: ${LEVERAGE}x`,
        `Go SHORT when FGI <= ${bestResult.sellThreshold} (sell with the fear)`,
        `Go LONG when FGI >= ${bestResult.buyThreshold} (buy with the greed)`,
        `Hold current position when FGI between ${bestResult.sellThreshold}-${bestResult.buyThreshold}`,
        `Expected return: ${bestResult.strategyReturn.toFixed(2)}%`,
        `Outperformance vs buy & hold: ${outperformance > 0 ? '+' : ''}${outperformance.toFixed(2)}%`,
        `${bestResult.isLiquidated ? '⚠️ WARNING: This configuration resulted in liquidation!' : ''}`,
        ``,
        `🎉 Long/Short Threshold Backtest Complete 🎉`
      ];

      const summaryPath = path.join(outputDir, `${asset}_${timeframe}_long_short_fgi_${LEVERAGE}x${DAYS_LIMIT ? `_${DAYS_LIMIT}d` : ''}.txt`);
      fs.writeFileSync(summaryPath, summaryLines.join('\n'));

      console.log(chalk.green('\n✅ Backtest Complete!'));
      console.log(`📊 Results saved to: ${summaryPath}`);
      console.log(`📈 Best configuration: SHORT <= ${bestResult.sellThreshold}, LONG >= ${bestResult.buyThreshold} (${LEVERAGE}x leverage)`);
      if (bestResult.isLiquidated) {
        console.log(chalk.red(`⚠️ WARNING: Best strategy was liquidated! Consider lower leverage.`));
      } else {
        console.log(`🎯 Outperformance: ${outperformance > 0 ? '+' : ''}${outperformance.toFixed(2)}%`);
      }
      console.log();
    }
  }
}

// Run the backtest
runComprehensiveBacktest().catch(console.error);