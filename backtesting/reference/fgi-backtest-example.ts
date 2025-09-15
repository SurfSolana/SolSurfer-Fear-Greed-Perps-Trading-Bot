import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { program } from 'commander';

// Backtest settings configuration
const SETTINGS = {
  // Test assets and timeframes
  assets: [
  'SOL', 
  // 'BTC', 
  // 'ETH'
  ],
  timeframes: [
    // '15min', 
    // '1h', 
    '4h', 
    // '24h'
  ],
  
  // FGI settings
  fgiChangeThreshold: 0, // Minimum change in FGI to trigger a trade
  
  // Financial settings
  initialCapitalUSD: 1000, // $1,000 starting capital
  initialCapitalSplit: 1, // Initial allocation between asset and USDC (0.5 = 50/50 split)
  solReserveAmount: 0.01, // Amount of SOL to reserve for fees
  
  // Fee structure
  platformFeeRate: 0.0009, // 0.09% platform fee

  baseTxFeeSol: 0.000015, // Base transaction fee in SOL
  priorityFeeSol: 0.00001, // Priority fee in SOL
  
  // Testing settings
  testAllMidpoints: true, // Whether to test every possible FGI midpoint value
  // Only used if testAllMidpoints is false
  fgiMidpointsToTest: [42,43,44,45,46,47,48,49,50,51,52], // Specific midpoints to test if not testing all
  testInvertedStrategies: false, // Whether to test inverted strategies alongside standard ones
    
  // Output settings
  outputBaseDir: './backtest-results', // Base directory for output files
  generateDailySummary: true, // Whether to generate daily summary JSON for app display
  
  // UI settings
  progressBarLength: 30, // Length of progress bar

};

// Constants from the original algorithm (only keeping used constants)
const SOL_RESERVE_AMOUNT = SETTINGS.solReserveAmount;

// Enum for swap direction based on FGI score (from original algorithm)
enum SwapDirection {
  SOL_TO_USDC = 'sol_to_usdc',
  USDC_TO_SOL = 'usdc_to_sol'
}

// Time period options for backtesting
enum TimePeriod {
  THREE_MONTHS = '3m',
  SIX_MONTHS = '6m',
  ONE_YEAR = '1y',
  ALL_DATA = 'all'
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
    // ... other properties
  };
}

interface BacktestState {
  solBalance: number;
  usdcBalance: number;
  lastFgiScore: number;
  lastAction: string;
  lastSwapDirection: SwapDirection | null;
  lastProcessedTimestamp: string;
}

interface BacktestResult {
  asset: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  startingPrice: number;
  endingPrice: number;
  baselineReturn: number; // Buy and hold
  strategyReturn: number; // FGI strategy
  numTrades: number;
  winningTrades: number;
  winRate: number;
  fgiMidpoint: number;
  fgiChangeThreshold: number;
  fgiAverage: number;
  endingSolBalance: number;
  endingUsdcBalance: number;
  totalPortfolioValueUSD: number;
  platformFeesCollected: number; // Platform fees tracking
  priorityFeesCollected: number; // Add priority fees tracking
  inverted: boolean; // Whether this used inverted strategy logic
}

// Helper function to get and create output directories
function getOutputDirs() {
  const baseDir = SETTINGS.outputBaseDir;
  
  // Create base directory if it doesn't exist
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  
  // Get current date in YYYY-MM-DD format for folder structure
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format
  
  // Create daily directory path
  const dailyDir = path.join(baseDir, dateStr);
  if (!fs.existsSync(dailyDir)) {
    fs.mkdirSync(dailyDir, { recursive: true });
  }
  
  return {
    baseDir,
    dailyDir,
    dateStr
  };
}

// Load data from the SurfSolana API endpoint
async function loadHistoricalData(asset: string, timeframe: string): Promise<{
  data: FgiDataPoint[], 
  minFgi: number, 
  maxFgi: number
}> {
  try {
    const apiUrl = `https://api.surfsolana.com/${asset}/${timeframe}/1_year.json`;
    
    console.log(chalk.blue(`Fetching data from ${apiUrl}...`));
    
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
    }
    
    const data: FgiDataPoint[] = await response.json();
    
    // Find min and max FGI values in this dataset
    const fgiValues = data.map(d => d.fgi);
    const minFgi = Math.min(...fgiValues);
    const maxFgi = Math.max(...fgiValues);
    
    console.log(chalk.green(`✅ Fetched ${data.length} data points for ${asset} ${timeframe}`));
    console.log(chalk.blue(`   FGI range: ${minFgi} to ${maxFgi}`));
    
    return { data, minFgi, maxFgi };
  } catch (error) {
    console.error(chalk.red(`Error fetching data for ${asset} ${timeframe}:`), error);
    return { data: [], minFgi: 0, maxFgi: 0 };
  }
}

// Simulate the algorithm on historical data
function backtest(
  data: FgiDataPoint[], 
  asset: string, 
  timeframe: string, 
  fgiMidpoint: number = 60,
  fgiChangeThreshold: number = 0,
  inverted: boolean = false
): BacktestResult {
  if (data.length === 0) {
    throw new Error('No data to backtest');
  }

  // Sort data chronologically if needed
  data.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Initial state (using configurable split instead of hardcoded 50/50)
  const initialPrice = data[0].price;
  const INITIAL_CAPITAL_USD = SETTINGS.initialCapitalUSD;
  const initialSolAmount = (INITIAL_CAPITAL_USD * SETTINGS.initialCapitalSplit) / initialPrice;
  const initialUsdcAmount = INITIAL_CAPITAL_USD * (1 - SETTINGS.initialCapitalSplit);

  const state: BacktestState = {
    solBalance: initialSolAmount,
    usdcBalance: initialUsdcAmount,
    lastFgiScore: data[0].fgi,
    lastAction: 'initialize',
    lastSwapDirection: null,
    lastProcessedTimestamp: data[0].timestamp
  };

  // Trading stats
  let numTrades = 0;
  let winningTrades = 0;
  let lastTradePrice = initialPrice;
  let previousFgiScore = data[0].fgi;
  let platformFeesCollected = 0; // Track platform fees
  let priorityFeesCollected = 0; // Track priority fees

  // FGI values
  const fgiValues = data.map(d => d.fgi);
  const fgiAverage = fgiValues.reduce((sum, val) => sum + val, 0) / fgiValues.length;

  // Track portfolio value over time
  const portfolioValues = [];
  const baselineValues = [];
  // Use configurable split for baseline calculation too
  const initialAssetAmount = INITIAL_CAPITAL_USD / initialPrice;

  // Process each data point
  for (let i = 1; i < data.length; i++) {
    const { price, fgi, timestamp } = data[i];

    // Calculate baseline value (buy and hold)
    const baselineValue = initialAssetAmount * price;
    baselineValues.push(baselineValue);

    // Calculate absolute FGI change
    const fgiChange = Math.abs(fgi - previousFgiScore);

    // Determine target direction based on FGI score and midpoint (with inverted option)
    const targetDirection = inverted 
      ? (fgi < fgiMidpoint ? SwapDirection.USDC_TO_SOL : SwapDirection.SOL_TO_USDC)  // Inverted logic
      : (fgi >= fgiMidpoint ? SwapDirection.USDC_TO_SOL : SwapDirection.SOL_TO_USDC); // Normal logic

    // Check if we need to swap (only if FGI change exceeds threshold)
    let swapped = false;
    
    // Fixed Solana transaction fees instead of percentage-based trading fee
    const BASE_TX_FEE_SOL = SETTINGS.baseTxFeeSol;
    const PRIORITY_FEE_SOL = SETTINGS.priorityFeeSol;
    const PLATFORM_FEE_RATE = SETTINGS.platformFeeRate;

    if (fgiChange >= fgiChangeThreshold) { // Only trade if FGI change exceeds threshold
      if (targetDirection === SwapDirection.USDC_TO_SOL && state.usdcBalance > 0) {
        // Calculate platform fee (percentage of USDC amount)
        const platformFee = state.usdcBalance * PLATFORM_FEE_RATE;
        platformFeesCollected += platformFee;

        // Swap USDC to SOL (after platform fee deduction)
        const solBought = (state.usdcBalance - platformFee) / price;
        
        // Deduct Solana transaction fees from SOL balance
        state.solBalance += solBought - BASE_TX_FEE_SOL - PRIORITY_FEE_SOL;
        state.usdcBalance = 0;

        // Track priority fee AFTER confirming trade executed
        priorityFeesCollected += PRIORITY_FEE_SOL * price;

        // Track trade stats
        numTrades++;
        if (price < lastTradePrice) {
          winningTrades++; // Bought at a lower price than last trade
        }
        lastTradePrice = price;
        swapped = true;

        state.lastAction = 'swap_usdc_to_sol';
        state.lastSwapDirection = targetDirection;
      } else if (targetDirection === SwapDirection.SOL_TO_USDC && state.solBalance > SOL_RESERVE_AMOUNT) {
        // Calculate available SOL (minus reserve and transaction fees)
        const txFees = BASE_TX_FEE_SOL + PRIORITY_FEE_SOL;
        const availableSol = state.solBalance - SOL_RESERVE_AMOUNT - txFees;

        if (availableSol > 0) {  // Only proceed if we have enough SOL after fees
          // Swap SOL to USDC
          const usdcBought = availableSol * price;
          
          // Calculate platform fee in USDC
          const platformFee = usdcBought * PLATFORM_FEE_RATE;
          platformFeesCollected += platformFee;
          
          // Update balances
          state.usdcBalance += (usdcBought - platformFee);
          state.solBalance = SOL_RESERVE_AMOUNT;  // Keep reserve

          // Track priority fee AFTER confirming trade executed
          priorityFeesCollected += PRIORITY_FEE_SOL * price;
          
          // Track trade stats
          numTrades++;
          if (price > lastTradePrice) {
            winningTrades++; // Sold at a higher price than last trade
          }
          lastTradePrice = price;
          swapped = true;

          state.lastAction = 'swap_sol_to_usdc';
          state.lastSwapDirection = targetDirection;
        }
      }
    }

    // Update state
    state.lastFgiScore = fgi;
    state.lastProcessedTimestamp = timestamp;
    previousFgiScore = fgi; // Update previous FGI score for next iteration

    // Calculate portfolio value
    const portfolioValue = state.solBalance * price + state.usdcBalance;
    portfolioValues.push(portfolioValue);
  }

  // Final portfolio value
  const finalPrice = data[data.length - 1].price;
  const finalPortfolioValue = state.solBalance * finalPrice + state.usdcBalance;
  const strategyReturn = (finalPortfolioValue - INITIAL_CAPITAL_USD) / INITIAL_CAPITAL_USD * 100;

  // Baseline return
  const finalBaselineValue = initialAssetAmount * finalPrice;
  const baselineReturn = (finalBaselineValue - INITIAL_CAPITAL_USD) / INITIAL_CAPITAL_USD * 100;

  return {
    asset,
    timeframe,
    startDate: data[0].timestamp,
    endDate: data[data.length - 1].timestamp,
    startingPrice: data[0].price,
    endingPrice: finalPrice,
    baselineReturn,
    strategyReturn,
    numTrades,
    winningTrades,
    winRate: numTrades > 0 ? (winningTrades / numTrades) * 100 : 0,
    fgiMidpoint,
    fgiChangeThreshold,
    fgiAverage,
    endingSolBalance: state.solBalance,
    endingUsdcBalance: state.usdcBalance,
    totalPortfolioValueUSD: finalPortfolioValue,
    platformFeesCollected: platformFeesCollected,
    priorityFeesCollected: priorityFeesCollected,
    inverted: inverted
  };
}

// Save results to file
function saveResults(results: BacktestResult[]) {
  const { baseDir, dailyDir, dateStr } = getOutputDirs();
  
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const fileName = `backtest-results-${timestamp}`;
  
  // Save full results to daily directory
  const jsonFilePath = path.join(dailyDir, `${fileName}.json`);
  fs.writeFileSync(jsonFilePath, JSON.stringify(results, null, 2));
  console.log(chalk.green(`✅ Results saved to ${jsonFilePath}`));
  
  // Also save a CSV version for easy import into spreadsheets
  const csvPath = path.join(dailyDir, `${fileName}.csv`);
  const csvHeader = "Asset,Timeframe,StartDate,EndDate,StartPrice,EndPrice,BaselineReturn,StrategyReturn,NumTrades,WinRate,FGIMidpoint,FGIChangeThreshold,FGIAverage,EndingSolBalance,EndingUsdcBalance,TotalValueUSD,PlatformFeesCollected,PriorityFeesCollected,Inverted\n";
  let csvContent = csvHeader;
  for (const result of results) {
    csvContent += `${result.asset},${result.timeframe},${result.startDate},${result.endDate},${result.startingPrice},${result.endingPrice},${result.baselineReturn.toFixed(2)},${result.strategyReturn.toFixed(2)},${result.numTrades},${result.winRate.toFixed(2)},${result.fgiMidpoint},${result.fgiChangeThreshold},${result.fgiAverage.toFixed(2)},${result.endingSolBalance.toFixed(6)},${result.endingUsdcBalance.toFixed(2)},${result.totalPortfolioValueUSD.toFixed(2)},${result.platformFeesCollected.toFixed(2)},${result.priorityFeesCollected.toFixed(4)},${result.inverted}\n`;
  }
  fs.writeFileSync(csvPath, csvContent);
  console.log(chalk.green(`✅ CSV results saved to ${csvPath}`));
}

// Generate summary reports
function generateSummaryReport(results: BacktestResult[]) {
  console.log(chalk.bold.blue('\n📊 FGI Backtest Summary Report 📊'));
  console.log('='.repeat(160)); // Increased width to accommodate all columns

  // Sort results by % gain (strategy return) in descending order and filter out negative returns
  const sortedResults = [...results]
    .sort((a, b) => b.strategyReturn - a.strategyReturn)
    .filter(r => r.strategyReturn > 0);
  
  // Table headers with strategy type
  console.log(chalk.cyan(
    'TOKEN | PERIOD | FGI MID | TYPE | START AMT | END AMT | % GAIN/LOSS | BUY & HOLD AMT | vs B&H % | TRADES | PLATFORM FEES | PRIORITY FEES ($)'
  ));
  console.log('-'.repeat(160));

  const INITIAL_CAPITAL_USD = SETTINGS.initialCapitalUSD;
  
  // Print results in the requested format, sorted by performance
  for (const result of sortedResults) {
    // Calculate buy & hold ending amount
    const buyHoldAmount = INITIAL_CAPITAL_USD * (1 + (result.baselineReturn / 100));
    
    // Performance comparison
    const vsHoldPercent = result.strategyReturn - result.baselineReturn;
    const vsHoldText = vsHoldPercent >= 0 
      ? chalk.green(`+${vsHoldPercent.toFixed(2)}%`) 
      : chalk.red(`${vsHoldPercent.toFixed(2)}%`);
    
    // Format gain/loss with color (all should be positive due to filter)
    const gainLossText = chalk.green(`+${result.strategyReturn.toFixed(2)}%`);
    
    // Format priority fees with color for better visibility
    const priorityFeesText = chalk.yellow(`$${result.priorityFeesCollected.toFixed(4)}`);
    
    // Add inverted flag to display
    const strategyType = result.inverted ? 'INVERTED' : 'STANDARD';
    
    console.log(
      `${result.asset.padEnd(6)} | ` +
      `${result.timeframe.padEnd(7)} | ` +
      `${result.fgiMidpoint.toString().padEnd(8)} | ` +
      `${strategyType.padEnd(9)} | ` +
      `$${INITIAL_CAPITAL_USD.toFixed(2).padEnd(9)} | ` +
      `$${result.totalPortfolioValueUSD.toFixed(2).padEnd(8)} | ` +
      `${gainLossText.padEnd(12)} | ` +
      `$${buyHoldAmount.toFixed(2).padEnd(13)} | ` +
      `${vsHoldText.padEnd(10)} | ` +
      `${result.numTrades.toString().padEnd(6)} | ` +
      `$${result.platformFeesCollected.toFixed(2).padEnd(12)} | ` +
      `${priorityFeesText}`
    );
  }

  // Overall summary
  console.log('\n' + '='.repeat(160));
  console.log(chalk.bold.yellow('📈 Top 5 Performing Strategies:'));
  
  // Get top 5 results (already sorted and filtered)
  const top5 = sortedResults.slice(0, 5);
  
  console.log(chalk.cyan(
    'TOKEN | PERIOD | FGI MID | TYPE | START AMT | END AMT | % GAIN/LOSS | BUY & HOLD AMT | vs B&H % | TRADES | PLATFORM FEES | PRIORITY FEES ($)'
  ));
  console.log('-'.repeat(160));
  
  for (const result of top5) {
    // Calculate buy & hold ending amount
    const buyHoldAmount = INITIAL_CAPITAL_USD * (1 + (result.baselineReturn / 100));
    
    // Performance comparison
    const vsHoldPercent = result.strategyReturn - result.baselineReturn;
    const vsHoldText = vsHoldPercent >= 0 
      ? chalk.green(`+${vsHoldPercent.toFixed(2)}%`) 
      : chalk.red(`${vsHoldPercent.toFixed(2)}%`);
    
    // Format priority fees with color for better visibility
    const priorityFeesText = chalk.yellow(`$${result.priorityFeesCollected.toFixed(4)}`);
    
    // Add inverted flag to display
    const strategyType = result.inverted ? 'INVERTED' : 'STANDARD';
    
    console.log(
      `${result.asset.padEnd(6)} | ` +
      `${result.timeframe.padEnd(7)} | ` +
      `${result.fgiMidpoint.toString().padEnd(8)} | ` +
      `${strategyType.padEnd(9)} | ` +
      `$${INITIAL_CAPITAL_USD.toFixed(2).padEnd(9)} | ` +
      `$${result.totalPortfolioValueUSD.toFixed(2).padEnd(8)} | ` +
      `${chalk.green(`+${result.strategyReturn.toFixed(2)}%`).padEnd(12)} | ` +
      `$${buyHoldAmount.toFixed(2).padEnd(13)} | ` +
      `${vsHoldText.padEnd(10)} | ` +
      `${result.numTrades.toString().padEnd(6)} | ` +
      `$${result.platformFeesCollected.toFixed(2).padEnd(12)} | ` +
      `${priorityFeesText}`
    );
  }

  console.log('\n' + '='.repeat(160));
}

// Helper function to sort timeframes properly
function timeframeSortValue(timeframe: string): number {
  switch (timeframe) {
    case '15min': return 1;
    case '1h': return 2;
    case '4h': return 3;
    case '24h': return 4;
    default: return 99;
  }
}

// Generate a CSV file with detailed trade history
function generateDetailedHistory(
  data: FgiDataPoint[], 
  asset: string, 
  timeframe: string, 
  result: BacktestResult,
  fgiMidpoint: number = 60,
  fgiChangeThreshold: number = 0,
  inverted: boolean = false
) {
  const { dailyDir } = getOutputDirs();
  
  const historyPath = path.join(
    dailyDir, 
    `history_${asset}_${timeframe}_mid${fgiMidpoint}_${inverted ? 'inv' : 'std'}.csv`
  );
  let csvContent = "Timestamp,FGI,SOL_Balance,USDC_Balance,Portfolio_Value_USD,Action\n";
  
  // Initial state (using configurable split instead of hardcoded 50/50)
  const initialPrice = data[0].price;
  const INITIAL_CAPITAL_USD = SETTINGS.initialCapitalUSD;
  const initialSolAmount = (INITIAL_CAPITAL_USD * SETTINGS.initialCapitalSplit) / initialPrice;
  const initialUsdcAmount = INITIAL_CAPITAL_USD * (1 - SETTINGS.initialCapitalSplit);
  
  let state = {
    solBalance: initialSolAmount,
    usdcBalance: initialUsdcAmount,
    lastFgiScore: data[0].fgi,
    lastAction: 'INITIALIZE',
    lastSwapDirection: null as SwapDirection | null,
    lastProcessedTimestamp: data[0].timestamp
  };
  
  // Process each data point for the history
  for (let i = 0; i < data.length; i++) {
    const { timestamp, price, fgi } = data[i];
    let action = 'HOLD';
    
    // Determine target direction based on FGI score and midpoint (with inverted option)
    const targetDirection = inverted 
      ? (fgi < fgiMidpoint ? SwapDirection.USDC_TO_SOL : SwapDirection.SOL_TO_USDC)  // Inverted logic
      : (fgi >= fgiMidpoint ? SwapDirection.USDC_TO_SOL : SwapDirection.SOL_TO_USDC); // Normal logic
    
    // Similar logic to backtest function but simplified for history tracking
    if (i > 0) {
      const fgiChange = Math.abs(fgi - state.lastFgiScore);
      
      // Fixed Solana transaction fees instead of percentage-based trading fee
      const BASE_TX_FEE_SOL = SETTINGS.baseTxFeeSol;
      const PRIORITY_FEE_SOL = SETTINGS.priorityFeeSol;
      const PLATFORM_FEE_RATE = SETTINGS.platformFeeRate;
      
      if (fgiChange >= fgiChangeThreshold) {
        if (targetDirection === SwapDirection.USDC_TO_SOL && state.usdcBalance > 0) {
          // Calculate platform fee (percentage of USDC amount)
          const platformFee = state.usdcBalance * PLATFORM_FEE_RATE;
          
          // Swap USDC to SOL (after platform fee deduction)
          const solBought = (state.usdcBalance - platformFee) / price;
          
          // Deduct Solana transaction fees from SOL balance
          state.solBalance += solBought - BASE_TX_FEE_SOL - PRIORITY_FEE_SOL;
          state.usdcBalance = 0;
          action = 'BUY_SOL';
        } else if (targetDirection === SwapDirection.SOL_TO_USDC && state.solBalance > SOL_RESERVE_AMOUNT) {
          // Calculate available SOL (minus reserve and transaction fees)
          const txFees = BASE_TX_FEE_SOL + PRIORITY_FEE_SOL;
          const availableSol = state.solBalance - SOL_RESERVE_AMOUNT - txFees;
          
          if (availableSol > 0) {  // Only proceed if we have enough SOL after fees
            // Swap SOL to USDC
            const usdcBought = availableSol * price;
            
            // Calculate platform fee in USDC
            const platformFee = usdcBought * PLATFORM_FEE_RATE;
            
            // Update balances
            state.usdcBalance += (usdcBought - platformFee);
            state.solBalance = SOL_RESERVE_AMOUNT;  // Keep reserve
            action = 'SELL_SOL';
          }
        }
      }
    }
    
    // Calculate portfolio value
    const portfolioValue = state.solBalance * price + state.usdcBalance;
    
    // Add to CSV
    csvContent += `${timestamp},${fgi},${state.solBalance.toFixed(6)},${state.usdcBalance.toFixed(2)},${portfolioValue.toFixed(2)},${action}\n`;
    
    // Update state for next iteration
    state.lastFgiScore = fgi;
    state.lastProcessedTimestamp = timestamp;
  }
  
  fs.writeFileSync(historyPath, csvContent);
  console.log(chalk.green(`✅ Detailed trade history saved to ${historyPath}`));
}

// Generate daily summary JSON for app use
function generateSummaryJSON(results: BacktestResult[]) {
  const { baseDir, dailyDir, dateStr } = getOutputDirs();
  
  // Sort results by strategy return (performance)
  const sortedResults = [...results].sort((a, b) => b.strategyReturn - a.strategyReturn);
  
  // Extract top 5 performing strategies
  const topStrategies = sortedResults.slice(0, 5).map(result => ({
    asset: result.asset,
    timeframe: result.timeframe,
    fgiMidpoint: result.fgiMidpoint,
    strategyReturn: result.strategyReturn,
    baselineReturn: result.baselineReturn,
    outperformance: result.strategyReturn - result.baselineReturn,
    numTrades: result.numTrades,
    winRate: result.winRate,
    inverted: result.inverted
  }));

  // Calculate average FGI and strategy performance
  const avgFgi = results.reduce((sum, result) => sum + result.fgiAverage, 0) / results.length;
  const avgReturn = results.reduce((sum, result) => sum + result.strategyReturn, 0) / results.length;
  const avgBaselineReturn = results.reduce((sum, result) => sum + result.baselineReturn, 0) / results.length;
  
  // Find optimal FGI midpoints (those that appear most in top 20%)
  const topResultsCount = Math.max(5, Math.floor(results.length * 0.2));
  const topMidpoints = sortedResults.slice(0, topResultsCount)
    .map(result => result.fgiMidpoint);
  
  // Count frequency of each midpoint
  const midpointFrequency: Record<number, number> = {};
  topMidpoints.forEach(midpoint => {
    midpointFrequency[midpoint] = (midpointFrequency[midpoint] || 0) + 1;
  });
  
  // Get most frequent midpoints (could be multiple with same frequency)
  const maxFrequency = Math.max(...Object.values(midpointFrequency));
  const optimalMidpoints = Object.keys(midpointFrequency)
    .filter(midpoint => midpointFrequency[Number(midpoint)] === maxFrequency)
    .map(Number);

  // Generate a timestamp for the summary
  const now = new Date();
  
  // Create the summary object
  const summary = {
    generatedAt: now.toISOString(),
    date: dateStr,
    backtestPeriod: {
      start: results.length > 0 ? results[0].startDate : null,
      end: results.length > 0 ? results[0].endDate : null
    },
    assetsAnalyzed: [...new Set(results.map(r => r.asset))],
    timeframesAnalyzed: [...new Set(results.map(r => r.timeframe))],
    totalStrategiesTested: results.length,
    fgiStats: {
      average: avgFgi,
      optimalMidpoints: optimalMidpoints,
    },
    performance: {
      averageStrategyReturn: avgReturn,
      averageBaselineReturn: avgBaselineReturn,
      averageOutperformance: avgReturn - avgBaselineReturn,
      bestReturn: sortedResults.length > 0 ? sortedResults[0].strategyReturn : null
    },
    topStrategies: topStrategies,
    projectionData: {
      recommended: topStrategies.length > 0 ? topStrategies[0] : null,
      currentFgiTrend: avgFgi > 50 ? "bullish" : "bearish",
      projectedReturn: topStrategies.length > 0 ? topStrategies[0].strategyReturn : null
    }
  };

  // Save date-specific summary in the daily folder
  const dailySummaryPath = path.join(dailyDir, `summary.json`);
  fs.writeFileSync(dailySummaryPath, JSON.stringify(summary, null, 2));
  
  // Also save to the latest-summary.json in the base directory for easy access
  const latestSummaryPath = path.join(baseDir, 'latest-summary.json');
  fs.writeFileSync(latestSummaryPath, JSON.stringify(summary, null, 2));
  
  console.log(chalk.green(`✅ Daily summary JSON saved to ${dailySummaryPath}`));
  console.log(chalk.green(`✅ Latest summary JSON updated at ${latestSummaryPath}`));
  
  return summary;
}

// Add a simple progress bar function with screen clearing
function updateProgressBar(current: number, total: number, label: string = 'Progress') {
  // Clear the console
  process.stdout.write('\x1Bc'); // ANSI escape sequence to clear the terminal
  
  const barLength = SETTINGS.progressBarLength;
  const progress = Math.round((current / total) * barLength);
  const percentage = Math.round((current / total) * 100);
  const bar = '█'.repeat(progress) + '░'.repeat(barLength - progress);
  
  // Print the header again
  console.log(chalk.bold.blue('🔍 FGI Backtest in Progress 🔍\n'));
  
  // Display the progress bar
  console.log(`${label}: [${bar}] ${percentage}% (${current}/${total})`);
  
  // Add more information about what's happening
  if (current < total) {
    console.log('\nPlease wait while backtests are running...');
  } else {
    console.log('\nAll tests complete! Generating reports...');
  }
}

// Main function
async function main() {
  console.log(chalk.bold.blue('🔍 Starting FGI Backtest with Local Data 🔍'));
  
  // Use settings from the central configuration
  const assets = SETTINGS.assets;
  const timeframes = SETTINGS.timeframes;
  const fgiChangeThreshold = SETTINGS.fgiChangeThreshold;
  
  console.log(chalk.blue(`Testing assets: ${assets.join(', ')}`));
  console.log(chalk.blue(`Testing timeframes: ${timeframes.join(', ')}`));
  console.log(chalk.blue(`Using FGI change threshold: ${fgiChangeThreshold}`));
  console.log(chalk.blue(`Testing ${SETTINGS.testInvertedStrategies ? 'both standard and inverted' : 'only standard'} strategies`));
  console.log(chalk.blue(`Starting capital: $${SETTINGS.initialCapitalUSD}`));
  console.log(chalk.blue(`Initial split: ${SETTINGS.initialCapitalSplit * 100}% asset / ${(1 - SETTINGS.initialCapitalSplit) * 100}% USDC`));
  console.log(chalk.blue(`Platform fee rate: ${SETTINGS.platformFeeRate * 100}%`));
  console.log(chalk.blue(`Transaction fees: ${(SETTINGS.baseTxFeeSol + SETTINGS.priorityFeeSol).toFixed(6)} SOL`));
  
  const results: BacktestResult[] = [];
  
  // Calculate total tests (we'll determine this as we go since FGI ranges vary)
  let totalTests = 0;
  let completedTests = 0;
  
  // Run all backtests
  for (const asset of assets) {
    for (const timeframe of timeframes) {
      try {
        // Try to load data for this asset/timeframe combination and get FGI range
        const { data, minFgi, maxFgi } = await loadHistoricalData(asset, timeframe);
        
        if (data.length > 0) {
          // Create midpoints based on settings
          const fgiMidpoints = [];
          
          if (SETTINGS.testAllMidpoints) {
            // Test all possible midpoints between min and max FGI
            for (let i = minFgi; i <= maxFgi; i++) {
              fgiMidpoints.push(i);
            }
          } else {
            // Test only specific midpoints that are within the data's FGI range
            for (const midpoint of SETTINGS.fgiMidpointsToTest) {
              if (midpoint >= minFgi && midpoint <= maxFgi) {
                fgiMidpoints.push(midpoint);
              }
            }
          }
          
          // Update total test count based on whether we're testing inverted strategies
          totalTests += SETTINGS.testInvertedStrategies ? fgiMidpoints.length * 2 : fgiMidpoints.length;
          
          // Run tests for each midpoint with both normal and inverted strategies
          for (const midpoint of fgiMidpoints) {
            // Standard strategy test
            updateProgressBar(completedTests, totalTests, 'Testing strategies');
            const standardResult = backtest(data, asset, timeframe, midpoint, fgiChangeThreshold, false);
            results.push(standardResult);
            generateDetailedHistory(data, asset, timeframe, standardResult, midpoint, fgiChangeThreshold, false);
            completedTests++;
            
            // Inverted strategy test - only run if enabled
            if (SETTINGS.testInvertedStrategies) {
              updateProgressBar(completedTests, totalTests, 'Testing strategies');
              const invertedResult = backtest(data, asset, timeframe, midpoint, fgiChangeThreshold, true);
              results.push(invertedResult);
              generateDetailedHistory(data, asset, timeframe, invertedResult, midpoint, fgiChangeThreshold, true);
              completedTests++;
            }
          }
        } else {
          console.log(chalk.yellow(`\n⚠️ No data available for ${asset} ${timeframe}, skipping...`));
        }
      } catch (error) {
        console.error(chalk.red(`\nError running backtest for ${asset} ${timeframe}:`), error);
      }
    }
  }
  
  // Ensure progress bar shows 100%
  updateProgressBar(totalTests, totalTests, 'Testing strategies');
  console.log(chalk.green(`\n✅ Completed ${completedTests} out of ${totalTests} tests`));

  // Save results and generate summary report
  if (results.length > 0) {
    saveResults(results);
    generateSummaryReport(results);
    
    // Generate summary JSON for app display if enabled
    if (SETTINGS.generateDailySummary) {
      const summary = generateSummaryJSON(results);
      console.log(chalk.bold.blue('\n📱 Daily App Summary Generated 📱'));
      console.log(chalk.blue(`Top recommended strategy: ${summary.projectionData.recommended?.asset} ${summary.projectionData.recommended?.timeframe} (FGI midpoint: ${summary.projectionData.recommended?.fgiMidpoint})`));
      console.log(chalk.blue(`Projected return: ${summary.projectionData.projectedReturn?.toFixed(2)}%`));
      console.log(chalk.blue(`Current FGI trend: ${summary.projectionData.currentFgiTrend}`));
    }
    
    // Additional summary statistics
    console.log(chalk.bold.blue('\n📊 Additional Performance Metrics 📊'));
    console.log('='.repeat(140));
    
    // Find best and worst performing combinations
    const sortedByPerformance = [...results].sort((a, b) => b.strategyReturn - a.strategyReturn);
    const bestResult = sortedByPerformance[0];
    const worstResult = sortedByPerformance[sortedByPerformance.length - 1];
    
    console.log(chalk.green(`Best Performing: ${bestResult.asset} ${bestResult.timeframe} (Midpoint: ${bestResult.fgiMidpoint}) with ${bestResult.strategyReturn.toFixed(2)}%`));
    console.log(chalk.red(`Worst Performing: ${worstResult.asset} ${worstResult.timeframe} (Midpoint: ${worstResult.fgiMidpoint}) with ${worstResult.strategyReturn.toFixed(2)}%`));
  } else {
    console.log(chalk.red('No backtest results to report.'));
  }
  
  console.log(chalk.bold.green('\n🎉 FGI Backtest Complete 🎉'));
}

// Run the backtest
main().catch(err => {
  console.error(chalk.red('Fatal error:'), err);
  process.exit(1);
});