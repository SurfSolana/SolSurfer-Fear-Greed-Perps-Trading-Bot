import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

// Parse command line arguments
const args = process.argv.slice(2);
const ASSET = args[0] || 'SOL';
const TIMEFRAME = args[1] || '4h';

console.log(chalk.cyan(`Running FGI backtest for ${ASSET} on ${TIMEFRAME} timeframe`));

// Backtest settings configuration
const SETTINGS = {
  // Test assets and timeframes
  assets: [ASSET],
  timeframes: [TIMEFRAME],
  
  // Financial settings
  initialCapitalUSD: 1000, // $1,000 starting capital
  initialCapitalSplit: 0, // Initial allocation between asset and USDC (0 = 100% USDC start)
  solReserveAmount: 0.01, // Amount of SOL to reserve for fees
  
  // Fee structure
  platformFeeRate: 0.0009, // 0.09% platform fee
  baseTxFeeSol: 0.000015, // Base transaction fee in SOL
  priorityFeeSol: 0.00001, // Priority fee in SOL
  
  // Testing settings for thresholds - TEST EVERY SINGLE COMBINATION
  // Generate all possible thresholds from 10 to 90 (every single value)
  sellThresholds: Array.from({length: 81}, (_, i) => 10 + i), // 10, 11, 12...89, 90
  buyThresholds: Array.from({length: 81}, (_, i) => 10 + i),  // 10, 11, 12...89, 90
  
  // This will test all 3,240 valid combinations where buyThreshold > sellThreshold
  // Examples:
  // Sell < 20, Buy > 80: Very conservative with wide neutral zone
  // Sell < 30, Buy > 70: Conservative 
  // Sell < 40, Buy > 60: Moderate
  // Sell < 45, Buy > 55: Aggressive with small neutral zone
  
  // Output settings
  outputBaseDir: './backtest-results',
  generateDailySummary: true,
  
  // UI settings
  progressBarLength: 30,
};

// Enum for swap direction
enum SwapDirection {
  SOL_TO_USDC = 'sol_to_usdc',
  USDC_TO_SOL = 'usdc_to_sol',
  HOLD = 'hold' // NEW: Adding hold state
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

interface BacktestState {
  solBalance: number;
  usdcBalance: number;
  lastFgiScore: number;
  lastAction: string;
  lastSwapDirection: SwapDirection | null;
  lastProcessedTimestamp: string;
  currentPosition: 'SOL' | 'USDC' | 'MIXED'; // Track current position
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
  buyThreshold: number; // FGI level above which we buy SOL
  sellThreshold: number; // FGI level below which we sell SOL
  neutralZoneSize: number; // Size of the neutral zone (buyThreshold - sellThreshold)
  fgiAverage: number;
  endingSolBalance: number;
  endingUsdcBalance: number;
  totalPortfolioValueUSD: number;
  platformFeesCollected: number;
  priorityFeesCollected: number;
  timeInMarket: number; // Percentage of time holding SOL
  timeInNeutralZone: number; // Percentage of time FGI was in neutral zone
}

// Helper function to get and create output directories
function getOutputDirs() {
  const baseDir = SETTINGS.outputBaseDir;
  
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  
  const dailyDir = path.join(baseDir, dateStr);
  if (!fs.existsSync(dailyDir)) {
    fs.mkdirSync(dailyDir, { recursive: true });
  }
  
  return { baseDir, dailyDir, dateStr };
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

// Enhanced backtest with separate buy/sell thresholds
function backtestWithThresholds(
  data: FgiDataPoint[], 
  asset: string, 
  timeframe: string, 
  sellThreshold: number = 30, // Sell when FGI falls below this (fear)
  buyThreshold: number = 70   // Buy when FGI rises above this (greed)
): BacktestResult {
  if (data.length === 0) {
    throw new Error('No data to backtest');
  }

  // Sort data chronologically
  data.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Initial state
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
    lastProcessedTimestamp: data[0].timestamp,
    currentPosition: initialSolAmount > 0 ? 'SOL' : 'USDC'
  };

  // Trading stats
  let numTrades = 0;
  let winningTrades = 0;
  let lastTradePrice = initialPrice;
  let platformFeesCollected = 0;
  let priorityFeesCollected = 0;
  let periodsInSol = 0;
  let lastDirection: SwapDirection | null = null;

  // FGI values
  const fgiValues = data.map(d => d.fgi);
  const fgiAverage = fgiValues.reduce((sum, val) => sum + val, 0) / fgiValues.length;

  // Track baseline
  const initialAssetAmount = INITIAL_CAPITAL_USD / initialPrice;

  // Process each data point
  for (let i = 1; i < data.length; i++) {
    const { price, fgi, timestamp } = data[i];
    
    // Track time in market
    if (state.solBalance > SETTINGS.solReserveAmount) {
      periodsInSol++;
    }

    // Determine target direction with threshold logic
    // IMPORTANT: Lifeguard momentum strategy:
    // HIGH FGI (greed/good markets) = Stay in SOL (ride the wave)
    // LOW FGI (fear/bad markets) = Get out to USDC (lifeguard gets you out of dangerous water)
    let targetDirection: SwapDirection;
    
    if (fgi >= buyThreshold) {
      // High FGI (greed/good markets) - Buy/Stay in SOL (ride the momentum)
      targetDirection = SwapDirection.USDC_TO_SOL;
    } else if (fgi <= sellThreshold) {
      // Low FGI (fear/bad markets) - Sell/Move to USDC (get out of the water)
      targetDirection = SwapDirection.SOL_TO_USDC;
    } else {
      // In neutral zone - hold current position
      targetDirection = SwapDirection.HOLD;
    }

    // Track if we're in the neutral zone (no whipsaw counting needed with explicit thresholds)

    // Execute trades based on threshold logic
    const BASE_TX_FEE_SOL = SETTINGS.baseTxFeeSol;
    const PRIORITY_FEE_SOL = SETTINGS.priorityFeeSol;
    const PLATFORM_FEE_RATE = SETTINGS.platformFeeRate;

    if (targetDirection === SwapDirection.USDC_TO_SOL && state.usdcBalance > 0) {
      // Buy SOL with all USDC
      const platformFee = state.usdcBalance * PLATFORM_FEE_RATE;
      platformFeesCollected += platformFee;

      const solBought = (state.usdcBalance - platformFee) / price;
      state.solBalance += solBought - BASE_TX_FEE_SOL - PRIORITY_FEE_SOL;
      state.usdcBalance = 0;

      priorityFeesCollected += PRIORITY_FEE_SOL * price;

      numTrades++;
      if (price < lastTradePrice) {
        winningTrades++;
      }
      lastTradePrice = price;
      
      state.lastAction = 'swap_usdc_to_sol';
      state.lastSwapDirection = targetDirection;
      state.currentPosition = 'SOL';
      lastDirection = targetDirection;

    } else if (targetDirection === SwapDirection.SOL_TO_USDC && state.solBalance > SETTINGS.solReserveAmount) {
      // Sell SOL for USDC
      const txFees = BASE_TX_FEE_SOL + PRIORITY_FEE_SOL;
      const availableSol = state.solBalance - SETTINGS.solReserveAmount - txFees;

      if (availableSol > 0) {
        const usdcBought = availableSol * price;
        const platformFee = usdcBought * PLATFORM_FEE_RATE;
        platformFeesCollected += platformFee;
        
        state.usdcBalance += (usdcBought - platformFee);
        state.solBalance = SETTINGS.solReserveAmount;

        priorityFeesCollected += PRIORITY_FEE_SOL * price;
        
        numTrades++;
        if (price > lastTradePrice) {
          winningTrades++;
        }
        lastTradePrice = price;
        
        state.lastAction = 'swap_sol_to_usdc';
        state.lastSwapDirection = targetDirection;
        state.currentPosition = 'USDC';
        lastDirection = targetDirection;
      }
    }

    // Update state
    state.lastFgiScore = fgi;
    state.lastProcessedTimestamp = timestamp;
  }

  // Calculate final values
  const finalPrice = data[data.length - 1].price;
  const finalPortfolioValue = state.solBalance * finalPrice + state.usdcBalance;
  const strategyReturn = (finalPortfolioValue - INITIAL_CAPITAL_USD) / INITIAL_CAPITAL_USD * 100;

  // Baseline return
  const finalBaselineValue = initialAssetAmount * finalPrice;
  const baselineReturn = (finalBaselineValue - INITIAL_CAPITAL_USD) / INITIAL_CAPITAL_USD * 100;

  // Calculate time in market percentage
  const timeInMarket = (periodsInSol / (data.length - 1)) * 100;
  
  // Calculate time in neutral zone
  let periodsInNeutralZone = 0;
  for (const point of data) {
    if (point.fgi > sellThreshold && point.fgi < buyThreshold) {
      periodsInNeutralZone++;
    }
  }
  const timeInNeutralZone = (periodsInNeutralZone / data.length) * 100;

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
    buyThreshold,
    sellThreshold,
    neutralZoneSize: buyThreshold - sellThreshold,
    fgiAverage,
    endingSolBalance: state.solBalance,
    endingUsdcBalance: state.usdcBalance,
    totalPortfolioValueUSD: finalPortfolioValue,
    platformFeesCollected,
    priorityFeesCollected,
    timeInMarket,
    timeInNeutralZone
  };
}

// Save results to file
function saveResults(results: BacktestResult[]) {
  const { baseDir, dailyDir } = getOutputDirs();
  
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const fileName = `threshold-backtest-results-${timestamp}`;
  
  // Save full results
  const jsonFilePath = path.join(dailyDir, `${fileName}.json`);
  fs.writeFileSync(jsonFilePath, JSON.stringify(results, null, 2));
  console.log(chalk.green(`✅ Results saved to ${jsonFilePath}`));
  
  // Save CSV version
  const csvPath = path.join(dailyDir, `${fileName}.csv`);
  const csvHeader = "Asset,Timeframe,FGIMidpoint,Buffer,BuyAt,SellAt,BaselineReturn,StrategyReturn,Outperformance,NumTrades,WinRate,WhipsawsAvoided,TimeInMarket%,TotalValueUSD\n";
  let csvContent = csvHeader;
  
  for (const result of results) {
    const outperformance = result.strategyReturn - result.baselineReturn;
    csvContent += `${result.asset},${result.timeframe},${result.fgiMidpoint},${result.thresholdBuffer},` +
                  `${result.buyThreshold},${result.sellThreshold},${result.baselineReturn.toFixed(2)},` +
                  `${result.strategyReturn.toFixed(2)},${outperformance.toFixed(2)},${result.numTrades},` +
                  `${result.winRate.toFixed(2)},${result.whipsawCount},${result.timeInMarket.toFixed(2)},` +
                  `${result.totalPortfolioValueUSD.toFixed(2)}\n`;
  }
  
  fs.writeFileSync(csvPath, csvContent);
  console.log(chalk.green(`✅ CSV results saved to ${csvPath}`));
}

// Generate enhanced summary report
function generateSummaryReport(results: BacktestResult[]) {
  console.log(chalk.bold.blue('\n📊 FGI Threshold Backtest Results 📊'));
  console.log('='.repeat(180));

  // Sort all results by return
  const sortedResults = [...results].sort((a, b) => b.strategyReturn - a.strategyReturn);
  
  // Show top 10 best configurations
  console.log(chalk.cyan('\n🏆 TOP 10 BEST CONFIGURATIONS:'));
  console.log('-'.repeat(180));
  console.log(chalk.cyan(
    'RANK | SELL<->BUY | NEUTRAL ZONE | RETURN % | vs B&H % | TRADES | WIN RATE | TIME IN SOL %'
  ));
  console.log('-'.repeat(180));

  for (let i = 0; i < Math.min(10, sortedResults.length); i++) {
    const result = sortedResults[i];
    const vsHold = result.strategyReturn - result.baselineReturn;
    const vsHoldText = vsHold >= 0 
      ? chalk.green(`+${vsHold.toFixed(2)}%`) 
      : chalk.red(`${vsHold.toFixed(2)}%`);
    
    const returnText = result.strategyReturn >= 0
      ? chalk.green(`+${result.strategyReturn.toFixed(2)}%`)
      : chalk.red(`${result.strategyReturn.toFixed(2)}%`);
    
    console.log(
      `#${(i + 1).toString().padEnd(4)} | ` +
      `${result.sellThreshold}<->${result.buyThreshold}`.padEnd(11) + ' | ' +
      `${result.neutralZoneSize}`.padEnd(13) + ' | ' +
      `${returnText.padEnd(9)} | ` +
      `${vsHoldText.padEnd(9)} | ` +
      `${result.numTrades.toString().padEnd(7)} | ` +
      `${result.winRate.toFixed(1)}%`.padEnd(9) + ' | ' +
      `${result.timeInMarket.toFixed(1)}%`
    );
  }

  // Overall best configuration
  const overallBest = sortedResults[0];
  
  console.log(chalk.bold.yellow('\n🥇 OPTIMAL CONFIGURATION:'));
  console.log('='.repeat(180));
  console.log(chalk.green(`Sell Threshold: ${overallBest.sellThreshold} (Sell SOL when FGI < ${overallBest.sellThreshold})`));
  console.log(chalk.green(`Buy Threshold: ${overallBest.buyThreshold} (Buy SOL when FGI > ${overallBest.buyThreshold})`));
  console.log(chalk.green(`Neutral Zone: ${overallBest.sellThreshold}-${overallBest.buyThreshold} (${overallBest.neutralZoneSize} points wide)`));
  console.log(chalk.green(`Strategy Return: ${overallBest.strategyReturn.toFixed(2)}%`));
  console.log(chalk.green(`Baseline (Buy & Hold): ${overallBest.baselineReturn.toFixed(2)}%`));
  console.log(chalk.green(`Outperformance: ${(overallBest.strategyReturn - overallBest.baselineReturn).toFixed(2)}%`));
  console.log(chalk.green(`Number of Trades: ${overallBest.numTrades}`));
  console.log(chalk.green(`Win Rate: ${overallBest.winRate.toFixed(2)}%`));
  console.log(chalk.green(`Time in SOL: ${overallBest.timeInMarket.toFixed(2)}%`));
  console.log(chalk.green(`Time in Neutral Zone: ${overallBest.timeInNeutralZone.toFixed(2)}%`));

  console.log('\n' + '='.repeat(180));
}

// Generate summary JSON for the app
function generateSummaryJSON(results: BacktestResult[]) {
  const { baseDir, dailyDir, dateStr } = getOutputDirs();
  
  // Find the best configuration
  const sortedResults = [...results].sort((a, b) => b.strategyReturn - a.strategyReturn);
  const bestConfig = sortedResults[0];
  
  // Get top 10 configurations
  const top10 = sortedResults.slice(0, 10);

  const summary = {
    generatedAt: new Date().toISOString(),
    date: dateStr,
    backtestPeriod: {
      start: results[0]?.startDate || null,
      end: results[0]?.endDate || null
    },
    optimal: {
      buyThreshold: bestConfig.buyThreshold,
      sellThreshold: bestConfig.sellThreshold,
      neutralZoneSize: bestConfig.neutralZoneSize,
      expectedReturn: bestConfig.strategyReturn,
      baselineReturn: bestConfig.baselineReturn,
      outperformance: bestConfig.strategyReturn - bestConfig.baselineReturn,
      trades: bestConfig.numTrades,
      winRate: bestConfig.winRate,
      timeInMarket: bestConfig.timeInMarket,
      timeInNeutralZone: bestConfig.timeInNeutralZone
    },
    top10Configurations: top10.map(r => ({
      buyThreshold: r.buyThreshold,
      sellThreshold: r.sellThreshold,
      neutralZoneSize: r.neutralZoneSize,
      return: r.strategyReturn,
      outperformance: r.strategyReturn - r.baselineReturn,
      trades: r.numTrades
    })),
    totalConfigurationsTested: results.length
  };

  const summaryPath = path.join(baseDir, 'latest-threshold-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  
  console.log(chalk.green(`✅ Summary JSON saved to ${summaryPath}`));
  
  return summary;
}

// Progress bar
function updateProgressBar(current: number, total: number, label: string = 'Progress') {
  const barLength = SETTINGS.progressBarLength;
  const progress = Math.round((current / total) * barLength);
  const percentage = Math.round((current / total) * 100);
  const bar = '█'.repeat(progress) + '░'.repeat(barLength - progress);
  
  process.stdout.write(`\r${label}: [${bar}] ${percentage}% (${current}/${total})`);
  
  if (current >= total) {
    console.log('\n');
  }
}

// Main function
async function main() {
  console.log(chalk.bold.blue('🔍 Starting Comprehensive FGI Threshold Backtest 🔍'));
  console.log(chalk.blue('Testing ALL threshold combinations to find optimal configuration\n'));
  
  const assets = SETTINGS.assets;
  const timeframes = SETTINGS.timeframes;
  const sellThresholds = SETTINGS.sellThresholds;
  const buyThresholds = SETTINGS.buyThresholds;
  
  console.log(chalk.blue(`Assets: ${assets.join(', ')}`));
  console.log(chalk.blue(`Timeframes: ${timeframes.join(', ')}`));
  console.log(chalk.blue(`Sell thresholds: ${sellThresholds[0]} to ${sellThresholds[sellThresholds.length - 1]}`));
  console.log(chalk.blue(`Buy thresholds: ${buyThresholds[0]} to ${buyThresholds[buyThresholds.length - 1]}`));
  console.log(chalk.blue(`Starting capital: $${SETTINGS.initialCapitalUSD}\n`));
  
  const results: BacktestResult[] = [];
  let totalTests = 0;
  let completedTests = 0;
  
  // Calculate total tests (only valid combinations where buyThreshold > sellThreshold)
  for (const asset of assets) {
    for (const timeframe of timeframes) {
      for (const sellThresh of sellThresholds) {
        for (const buyThresh of buyThresholds) {
          if (buyThresh > sellThresh) {
            totalTests++;
          }
        }
      }
    }
  }
  
  console.log(chalk.yellow(`Total combinations to test: ${totalTests}`));
  console.log(chalk.yellow(`This will take some time...\n`));
  
  // Run backtests
  for (const asset of assets) {
    for (const timeframe of timeframes) {
      const { data, minFgi, maxFgi } = await loadHistoricalData(asset, timeframe);
      
      if (data.length === 0) {
        console.log(chalk.yellow(`No data available for ${asset} ${timeframe}, skipping...`));
        continue;
      }
      
      // Test all valid threshold combinations
      for (const sellThresh of sellThresholds) {
        for (const buyThresh of buyThresholds) {
          // Only test valid combinations where buy > sell
          if (buyThresh <= sellThresh) continue;
          
          completedTests++;
          updateProgressBar(completedTests, totalTests, 'Testing configurations');
          
          const result = backtestWithThresholds(data, asset, timeframe, sellThresh, buyThresh);
          results.push(result);
        }
      }
    }
  }
  
  updateProgressBar(totalTests, totalTests, 'Testing configurations');
  console.log(chalk.green(`✅ Completed ${completedTests} tests\n`));
  
  // Save and report results
  if (results.length > 0) {
    saveResults(results);
    generateSummaryReport(results);
    
    if (SETTINGS.generateDailySummary) {
      const summary = generateSummaryJSON(results);
      console.log(chalk.bold.green('\n🎯 RECOMMENDED CONFIGURATION FOR PRODUCTION:'));
      console.log(chalk.green(`Buy SOL when FGI > ${summary.optimal.buyThreshold}`));
      console.log(chalk.green(`Sell SOL when FGI < ${summary.optimal.sellThreshold}`));
      console.log(chalk.green(`Neutral zone: ${summary.optimal.sellThreshold}-${summary.optimal.buyThreshold} (${summary.optimal.neutralZoneSize} points)`));
      console.log(chalk.green(`Expected annual return: ${summary.optimal.expectedReturn.toFixed(2)}%`));
      console.log(chalk.green(`Outperformance vs buy & hold: +${summary.optimal.outperformance.toFixed(2)}%`));
    }
  } else {
    console.log(chalk.red('No backtest results to report.'));
  }
  
  console.log(chalk.bold.green('\n🎉 Threshold Backtest Complete 🎉'));
}

// Run the backtest
main().catch(err => {
  console.error(chalk.red('Fatal error:'), err);
  process.exit(1);
});