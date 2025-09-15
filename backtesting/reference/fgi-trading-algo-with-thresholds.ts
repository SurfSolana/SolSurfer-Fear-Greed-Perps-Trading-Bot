// Enhanced FGI Trading Algorithm with Threshold Buffers
// This is a key excerpt showing how to implement threshold buffers in your main algorithm

/**
 * Configuration for threshold-based trading
 * Instead of a single midpoint, use a buffer zone to avoid whipsaws
 */
interface ThresholdConfig {
  midpoint: number;      // Central FGI value (e.g., 50)
  buffer: number;        // Buffer zone size (e.g., 10)
  buyThreshold: number;  // Calculated: midpoint - buffer
  sellThreshold: number; // Calculated: midpoint + buffer
}

/**
 * Calculate optimal thresholds based on backtest results
 * This would typically come from your backtest API endpoint
 */
async function fetchOptimalThresholds(): Promise<ThresholdConfig> {
  console.log(chalk.blue(`Fetching optimal thresholds from backtest results...`));
  
  try {
    // First try to get the enhanced threshold configuration
    const response = await fetch('http://localhost:3003/api/backtest/threshold-summary');
    
    if (response.ok) {
      const data = await response.json();
      
      if (data?.optimal) {
        const config: ThresholdConfig = {
          midpoint: data.optimal.midpoint,
          buffer: data.optimal.buffer,
          buyThreshold: data.optimal.buyThreshold,
          sellThreshold: data.optimal.sellThreshold
        };
        
        console.log(chalk.green(`✅ Found optimal thresholds:`));
        console.log(chalk.green(`   Midpoint: ${config.midpoint}`));
        console.log(chalk.green(`   Buffer: ±${config.buffer}`));
        console.log(chalk.green(`   Buy when FGI < ${config.buyThreshold}`));
        console.log(chalk.green(`   Sell when FGI > ${config.sellThreshold}`));
        
        return config;
      }
    }
  } catch (error) {
    console.error(chalk.yellow('Could not fetch enhanced thresholds, falling back to simple midpoint'));
  }
  
  // Fallback to simple midpoint (backward compatibility)
  const midpoint = await fetchOptimalFgiMidpoint(); // Your existing function
  return {
    midpoint: midpoint,
    buffer: 0, // No buffer for backward compatibility
    buyThreshold: midpoint,
    sellThreshold: midpoint
  };
}

/**
 * Determine trading action based on FGI score and thresholds
 * This replaces the simple >= midpoint logic
 */
function determineTradeAction(
  fgiScore: number,
  thresholds: ThresholdConfig,
  currentPosition: 'SOL' | 'USDC' | 'MIXED'
): SwapDirection {
  
  // Buy zone: FGI is below the buy threshold
  if (fgiScore <= thresholds.buyThreshold) {
    // Strong fear signal - convert to SOL if we have USDC
    if (currentPosition !== 'SOL') {
      console.log(chalk.blue(`FGI ${fgiScore} <= ${thresholds.buyThreshold} (buy threshold) - BUY SIGNAL`));
      return SwapDirection.USDC_TO_SOL;
    }
  }
  
  // Sell zone: FGI is above the sell threshold
  else if (fgiScore >= thresholds.sellThreshold) {
    // Strong greed signal - convert to USDC if we have SOL
    if (currentPosition !== 'USDC') {
      console.log(chalk.blue(`FGI ${fgiScore} >= ${thresholds.sellThreshold} (sell threshold) - SELL SIGNAL`));
      return SwapDirection.SOL_TO_USDC;
    }
  }
  
  // Neutral zone: FGI is between thresholds
  else {
    console.log(chalk.gray(`FGI ${fgiScore} in neutral zone (${thresholds.buyThreshold}-${thresholds.sellThreshold}) - HOLD`));
    // In the neutral zone, we maintain current position
    // This prevents whipsaws when FGI fluctuates around the midpoint
  }
  
  // If we reach here, no action needed
  return null;
}

/**
 * Enhanced bulk swap function with threshold logic
 */
async function bulkSwapAllWithThresholds(
  thresholds: ThresholdConfig,
  fgiScore: number
) {
  console.log(chalk.blue(`🚀 Processing wallets with threshold logic 🚀`));
  console.log(chalk.blue(`FGI Score: ${fgiScore}`));
  console.log(chalk.blue(`Thresholds: Buy < ${thresholds.buyThreshold}, Sell > ${thresholds.sellThreshold}`));
  
  const walletsWithBalances = await getAllDelegatedWallets();
  
  if (walletsWithBalances.length === 0) {
    console.log(chalk.yellow('No wallets to process.'));
    return {
      totalWallets: 0,
      successCount: 0,
      failureCount: 0,
      skippedCount: 0,
      heldCount: 0 // NEW: Track holds
    };
  }
  
  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;
  let heldCount = 0; // NEW: Track positions held due to neutral zone
  
  for (const walletInfo of walletsWithBalances) {
    const walletAddress = walletInfo.wallet.address;
    const userEmail = walletInfo.email || 'No email';
    
    // Determine current position
    let currentPosition: 'SOL' | 'USDC' | 'MIXED';
    if (walletInfo.solBalance > SOL_RESERVE_AMOUNT && walletInfo.usdcBalance > 0) {
      currentPosition = 'MIXED';
    } else if (walletInfo.solBalance > SOL_RESERVE_AMOUNT) {
      currentPosition = 'SOL';
    } else if (walletInfo.usdcBalance > 0) {
      currentPosition = 'USDC';
    } else {
      console.log(chalk.yellow(`Skipping empty wallet ${walletAddress}`));
      skippedCount++;
      continue;
    }
    
    // Determine action based on thresholds
    const action = determineTradeAction(fgiScore, thresholds, currentPosition);
    
    if (!action) {
      console.log(chalk.gray(`Wallet ${walletAddress} - Holding position in neutral zone`));
      heldCount++;
      continue;
    }
    
    // Execute the trade based on determined action
    if (action === SwapDirection.USDC_TO_SOL && walletInfo.usdcBalance > 0) {
      // Buy SOL with USDC
      console.log(chalk.blue(`Wallet ${walletAddress} - Converting USDC to SOL (Fear zone)`));
      // ... execute swap logic ...
      successCount++;
      
    } else if (action === SwapDirection.SOL_TO_USDC && walletInfo.solBalance > SOL_RESERVE_AMOUNT) {
      // Sell SOL for USDC
      console.log(chalk.blue(`Wallet ${walletAddress} - Converting SOL to USDC (Greed zone)`));
      // ... execute swap logic ...
      successCount++;
      
    } else {
      console.log(chalk.gray(`Wallet ${walletAddress} - Already in correct position`));
      skippedCount++;
    }
  }
  
  console.log(chalk.blue('\n📊 Threshold-Based Swap Summary:'));
  console.log(chalk.green(`✅ Successful swaps: ${successCount}`));
  console.log(chalk.red(`❌ Failed swaps: ${failureCount}`));
  console.log(chalk.gray(`⏸️ Held (neutral zone): ${heldCount}`));
  console.log(chalk.yellow(`⏭️ Skipped: ${skippedCount}`));
  
  return {
    totalWallets: walletsWithBalances.length,
    successCount,
    failureCount,
    skippedCount,
    heldCount
  };
}

/**
 * Modified main processing logic to use thresholds
 */
async function processWithThresholds(newFgiData: FgiApiResponse) {
  // Fetch optimal thresholds from backtest
  const thresholds = await fetchOptimalThresholds();
  
  // Log the decision logic clearly
  console.log(chalk.green(`📊 FGI Score: ${newFgiData.fgi}`));
  console.log(chalk.blue(`📐 Using Thresholds:`));
  console.log(chalk.blue(`   Buy Zone: FGI < ${thresholds.buyThreshold}`));
  console.log(chalk.blue(`   Neutral Zone: FGI ${thresholds.buyThreshold}-${thresholds.sellThreshold}`));
  console.log(chalk.blue(`   Sell Zone: FGI > ${thresholds.sellThreshold}`));
  
  // Determine market zone
  let marketZone: string;
  let expectedAction: string;
  
  if (newFgiData.fgi <= thresholds.buyThreshold) {
    marketZone = 'FEAR ZONE';
    expectedAction = 'Converting USDC to SOL';
    console.log(chalk.red(`🔴 Market in ${marketZone} - ${expectedAction}`));
  } else if (newFgiData.fgi >= thresholds.sellThreshold) {
    marketZone = 'GREED ZONE';
    expectedAction = 'Converting SOL to USDC';
    console.log(chalk.green(`🟢 Market in ${marketZone} - ${expectedAction}`));
  } else {
    marketZone = 'NEUTRAL ZONE';
    expectedAction = 'Holding current positions';
    console.log(chalk.yellow(`🟡 Market in ${marketZone} - ${expectedAction}`));
  }
  
  // Process wallets with threshold logic
  const result = await bulkSwapAllWithThresholds(thresholds, newFgiData.fgi);
  
  // Save state with threshold information
  const newState: FgiState = {
    lastProcessedTimestamp: newFgiData.timestamp,
    lastFgiScore: newFgiData.fgi,
    lastAction: `zone_${marketZone.toLowerCase().replace(' ', '_')}_${result.successCount}_swapped_${result.heldCount}_held`,
    lastSwapDirection: null, // Could track last actual swap
    thresholds: thresholds // Store for reference
  };
  
  saveFgiState(newState);
  
  return result;
}

/**
 * Example of how to integrate into your existing service loop
 */
async function enhancedServiceLoop() {
  // ... initialization code ...
  
  while (!isShuttingDown) {
    const currentState = await initializeFgiState();
    const newFgiData = await pollFgiApiForNewData(currentState.lastProcessedTimestamp);
    
    if (newFgiData) {
      // Use threshold-based processing instead of simple midpoint
      const result = await processWithThresholds(newFgiData);
      
      console.log(chalk.green('✅ Threshold-Based Processing Complete'));
      console.log(`Results: ${result.successCount} traded, ${result.heldCount} held, ${result.skippedCount} skipped`);
      
      // The key improvement: positions are only changed when FGI strongly signals
      // This reduces unnecessary trades during neutral market conditions
    }
    
    // ... rest of service loop ...
  }
}

// Export for use in main algorithm
export {
  ThresholdConfig,
  fetchOptimalThresholds,
  determineTradeAction,
  bulkSwapAllWithThresholds,
  processWithThresholds
};