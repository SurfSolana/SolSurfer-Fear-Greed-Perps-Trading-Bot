#!/usr/bin/env bun

import { DriftTradingClient, DRIFT_CONFIG } from './src/drift-client';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import chalk from 'chalk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

// Configuration
const CONFIG = {
  // FGI Trading Parameters (DO NOT CHANGE - Optimal from backtesting)
  FGI_SHORT_THRESHOLD: 49,  // SHORT when FGI ≤ 49
  FGI_LONG_THRESHOLD: 50,   // LONG when FGI ≥ 50
  
  // Leverage and Risk
  LEVERAGE: parseFloat(process.env.LEVERAGE || '4'),
  MAX_POSITION_RATIO: parseFloat(process.env.MAX_POSITION_RATIO || '0.7'),
  
  // API Configuration
  MARKET_SYMBOL: 'ETH',
  TIMEFRAME: '4h',
  FGI_API_URL: 'https://api.surfsolana.com/ETH/4h/latest.json',
  
  // Operational
  STATE_FILE: './fgi-drift-state-v2.json',
  CHECK_INTERVAL_MS: parseInt(process.env.FGI_CHECK_INTERVAL_MS || '300000'),
  USE_DRIFT_SDK: process.env.USE_DRIFT_SDK === 'true'
};

// Position state tracking
interface PositionState {
  hasOpenPosition: boolean;
  direction?: 'LONG' | 'SHORT';
  size?: number;
  entryPrice?: number;
  entryFGI?: number;
  timestamp?: number;
  lastCheckedFGI?: number;
  lastCheckTime?: number;
  lastProcessedTimestamp?: string;  // Track last processed 4h candle
}

// Daily performance tracking
interface DailyPerformance {
  date: string;
  startBalance: number;
  currentBalance: number;
  trades: number;
  pnl: number;
  pnlPercent: number;
}

// FGI data structure
interface FGIData {
  price: number;
  fgi: number;
  timestamp: string;  // Added timestamp from API
}

class DriftFGITrader {
  private driftClient?: DriftTradingClient;
  private positionState: PositionState;
  private dailyPerformance: DailyPerformance;
  private isRunning: boolean = false;

  constructor() {
    this.positionState = this.loadState();
    this.dailyPerformance = this.loadDailyPerformance();
  }
  
  // Load position state from disk
  private loadState(): PositionState {
    try {
      if (existsSync(CONFIG.STATE_FILE)) {
        const data = readFileSync(CONFIG.STATE_FILE, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error(chalk.yellow('Warning: Could not load state file'));
    }
    
    return {
      hasOpenPosition: false,
      lastCheckTime: Date.now()
    };
  }
  
  // Save position state to disk
  private saveState(): void {
    try {
      writeFileSync(CONFIG.STATE_FILE, JSON.stringify(this.positionState, null, 2));
    } catch (error) {
      console.error(chalk.red('Error saving state:'), error);
    }
  }

  // Load daily performance tracking
  private loadDailyPerformance(): DailyPerformance {
    const today = new Date().toISOString().split('T')[0];
    const logsDir = './logs';
    const perfFile = `${logsDir}/daily-performance-${today}.json`;

    // Ensure logs directory exists
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }

    try {
      if (existsSync(perfFile)) {
        const data = readFileSync(perfFile, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error(chalk.yellow('Starting new daily performance tracking'));
    }

    return {
      date: today,
      startBalance: 0,
      currentBalance: 0,
      trades: 0,
      pnl: 0,
      pnlPercent: 0
    };
  }

  // Save daily performance
  private saveDailyPerformance(): void {
    const today = new Date().toISOString().split('T')[0];
    const logsDir = './logs';
    const perfFile = `${logsDir}/daily-performance-${today}.json`;

    // Ensure logs directory exists
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }

    try {
      writeFileSync(perfFile, JSON.stringify(this.dailyPerformance, null, 2));
    } catch (error) {
      console.error(chalk.red('Error saving daily performance:'), error);
    }
  }

  // Calculate the next expected 4h update time based on current timestamp
  private calculateNextUpdateTime(currentTimestamp: string): Date {
    if (!currentTimestamp || typeof currentTimestamp !== 'string') {
      console.log(chalk.yellow(`Invalid timestamp provided: ${currentTimestamp}, using current time instead`));
      return new Date(Date.now() + 4 * 60 * 60 * 1000);
    }
    
    const parsedTime = new Date(currentTimestamp);
    if (isNaN(parsedTime.getTime())) {
      console.log(chalk.yellow(`Could not parse timestamp: ${currentTimestamp}, using current time instead`));
      return new Date(Date.now() + 4 * 60 * 60 * 1000);
    }
    
    // Normalize timestamp by subtracting 2 hours to align with UTC
    const normalizedTime = new Date(parsedTime);
    normalizedTime.setHours(parsedTime.getHours() - 2);
    
    // Calculate next update time based on the normalized time - simple +4 hours approach
    const nextUpdateTime = new Date(normalizedTime);
    nextUpdateTime.setHours(normalizedTime.getHours() + 4);
    
    console.log(chalk.blue(`Original timestamp: ${currentTimestamp}`));
    console.log(chalk.blue(`Normalized (UTC aligned) timestamp: ${normalizedTime.toISOString()}`));
    console.log(chalk.blue(`Next expected 4h update time: ${nextUpdateTime.toISOString()}`));
    
    return nextUpdateTime;
  }

  // Poll the FGI API until we get a new update - matches reference implementation
  private async pollFgiApiForNewData(lastProcessedTimestamp: string): Promise<FGIData | null> {
    console.log(chalk.blue(`Starting to poll for new 4h FGI data after timestamp: ${lastProcessedTimestamp}`));
    
    console.log(chalk.blue(`Fetching current FGI data from ${CONFIG.FGI_API_URL}`));
    const initialData = await this.fetchFGIData();
    
    if (!initialData) {
      console.error(chalk.red('Invalid FGI data received from API'));
      return null;
    }
    
    console.log(chalk.green(`Successfully fetched FGI data: Score=${initialData.fgi}, Timestamp=${initialData.timestamp}`));
    
    if (initialData.timestamp !== lastProcessedTimestamp) {
      console.log(chalk.green(`✅ New 4h FGI data already available! Timestamp: ${initialData.timestamp}, FGI: ${initialData.fgi}`));
      return initialData;
    }
    
    const nextUpdateTime = this.calculateNextUpdateTime(initialData.timestamp);
    console.log(chalk.blue(`Current data timestamp: ${initialData.timestamp}`));
    console.log(chalk.blue(`Next expected 4h data update: ${nextUpdateTime.toISOString()}`));
    
    await this.waitUntilNextUpdate(nextUpdateTime);
    
    const startTime = Date.now();
    let pollCount = 0;
    
    process.stdout.write(chalk.blue('Polling 4h FGI API '));
    
    // Poll continuously until new data arrives - no artificial timeout
    while (true) {
      process.stdout.write(chalk.blue('.'));
      pollCount++;
      
      if (pollCount % 60 === 0) {
        process.stdout.write('\n' + chalk.blue('Polling continues '));
      }
      
      let data;
      
      try {
        data = await this.fetchFGIData();
      } catch (error) {
        process.stdout.write('\n');
        console.error(chalk.red('Error polling 4h FGI API:'), error);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      
      if (!data) {
        process.stdout.write('\n');
        console.error(chalk.red('Invalid API response structure'));
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      
      if (data.timestamp !== lastProcessedTimestamp) {
        process.stdout.write('\n');
        console.log(chalk.green(`✅ New 4h FGI data detected! Timestamp: ${data.timestamp}, FGI: ${data.fgi}`));
        return data;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Wait until the next update time
  private async waitUntilNextUpdate(nextUpdateTime: Date): Promise<void> {
    const now = new Date();
    
    if (nextUpdateTime > now) {
      const waitTimeMs = nextUpdateTime.getTime() - now.getTime();
      const waitTimeMinutes = Math.floor(waitTimeMs / 60000);
      const waitTimeSeconds = Math.floor((waitTimeMs % 60000) / 1000);
      
      // Calculate percentage in 4h cycle
      const TOTAL_CYCLE_MINUTES = 240;
      const remainingPercent = (waitTimeMinutes + (waitTimeSeconds / 60)) / TOTAL_CYCLE_MINUTES;
      const percentComplete = Math.floor((1 - remainingPercent) * 100);
      
      console.log(chalk.blue(`⏳ Waiting for next 4h candle at ${nextUpdateTime.toISOString()}`));
      console.log(chalk.blue(`   ${waitTimeMinutes}m ${waitTimeSeconds}s remaining`));
      console.log(chalk.blue(`   ${percentComplete}% of 4h cycle complete`));
      
      // Show progress updates every minute while waiting
      const interval = setInterval(() => {
        const remainingMs = nextUpdateTime.getTime() - Date.now();
        if (remainingMs <= 0) {
          clearInterval(interval);
          return;
        }
        const remainingMinutes = Math.floor(remainingMs / 60000);
        const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);
        const currentPercent = Math.floor((1 - (remainingMinutes / TOTAL_CYCLE_MINUTES)) * 100);
        console.log(chalk.gray(`   ⏳ ${currentPercent}% complete, ${remainingMinutes}m ${remainingSeconds}s remaining`));
      }, 60000);
      
      await new Promise(resolve => setTimeout(resolve, waitTimeMs));
      clearInterval(interval);
      
      console.log(chalk.green('✅ 4h candle boundary reached!'));
    }
  }

  // Fetch current FGI data
  private async fetchFGIData(): Promise<FGIData | null> {
    // Check for test mode
    const testFgiIndex = process.argv.indexOf('--test-fgi');
    if (testFgiIndex !== -1 && process.argv[testFgiIndex + 1]) {
      const testFgi = parseInt(process.argv[testFgiIndex + 1]);
      console.log(chalk.yellow(`🧪 TEST MODE: Using FGI value ${testFgi}`));
      return {
        price: 100, // Price doesn't matter for testing
        fgi: testFgi,
        timestamp: new Date().toISOString()
      };
    }
    
    try {
      const response = await fetch(CONFIG.FGI_API_URL);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Handle both array and object responses
      const latest = Array.isArray(data) ? data[data.length - 1] : data;
      
      if (!latest || typeof latest.price === 'undefined' || typeof latest.fgi === 'undefined') {
        throw new Error('Invalid API response format');
      }
      
      return {
        price: parseFloat(latest.price),
        fgi: parseInt(latest.fgi),
        timestamp: latest.timestamp || latest.date || new Date().toISOString()
      };
    } catch (error) {
      console.error(chalk.red('Error fetching FGI data:'), error);
      return null;
    }
  }
  
  // Initialize Drift client
  private async initializeDriftClient(): Promise<void> {
    if (!CONFIG.USE_DRIFT_SDK) {
      console.log(chalk.yellow('🔧 Running in simulation mode (USE_DRIFT_SDK=false)'));
      return;
    }
    
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('SOLANA_PRIVATE_KEY environment variable is required');
    }
    
    this.driftClient = new DriftTradingClient(privateKey);
    await this.driftClient.initialize();

    // Update daily performance with initial balance
    if (this.dailyPerformance.startBalance === 0) {
      const collateralInfo = await this.driftClient.getCollateralInfo();
      this.dailyPerformance.startBalance = collateralInfo.total;
      this.dailyPerformance.currentBalance = collateralInfo.total;
      this.saveDailyPerformance();
    }
  }
  
  // Execute trading logic
  private async executeTrade(fgiData: FGIData): Promise<void> {
    const { fgi, price, timestamp } = fgiData;
    
    // Check if we've already processed this timestamp
    if (this.positionState.lastProcessedTimestamp === timestamp) {
      console.log(chalk.gray(`Already processed candle at ${timestamp}, skipping...`));
      return;
    }
    
    console.log(chalk.cyan(`📊 New 4h Candle - FGI: ${fgi}, ETH Price: $${price.toFixed(2)}`));
    console.log(chalk.cyan(`   Timestamp: ${timestamp}`))
    
    // Determine trading signal
    let signal: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
    
    if (fgi <= CONFIG.FGI_SHORT_THRESHOLD) {
      signal = 'SHORT';
      console.log(chalk.red(`📉 FGI ${fgi} ≤ ${CONFIG.FGI_SHORT_THRESHOLD} - SHORT signal`));
    } else if (fgi >= CONFIG.FGI_LONG_THRESHOLD) {
      signal = 'LONG';
      console.log(chalk.green(`📈 FGI ${fgi} ≥ ${CONFIG.FGI_LONG_THRESHOLD} - LONG signal`));
    } else {
      console.log(chalk.gray(`➖ FGI ${fgi} in neutral zone - no action`));
      return;
    }
    
    // Handle position management
    if (this.positionState.hasOpenPosition) {
      const currentDirection = this.positionState.direction;
      
      if (currentDirection === signal) {
        console.log(chalk.gray(`✅ Already ${signal}, maintaining position`));
      } else {
        console.log(chalk.yellow(`🔄 Flipping from ${currentDirection} to ${signal}`));
        await this.closePosition(fgi, price);
        await this.settlePNLExplicitly(fgi, price);
        await this.openPosition(signal, price, fgi);
      }
    } else {
      console.log(chalk.cyan(`🆕 Opening new ${signal} position`));
      await this.openPosition(signal, price, fgi);
    }
    
    // Update last check and processed timestamp
    this.positionState.lastCheckedFGI = fgi;
    this.positionState.lastCheckTime = Date.now();
    this.positionState.lastProcessedTimestamp = timestamp;
    this.saveState();
  }
  
  // Open a new position
  private async openPosition(direction: 'LONG' | 'SHORT', price: number, fgi: number): Promise<void> {
    if (!CONFIG.USE_DRIFT_SDK || !this.driftClient) {
      // Simulation mode
      console.log(chalk.yellow(`[SIMULATED] Opening ${direction} at $${price.toFixed(2)}`));
      
      this.positionState = {
        hasOpenPosition: true,
        direction,
        size: 1000, // Simulated size
        entryPrice: price,
        entryFGI: fgi,
        timestamp: Date.now(),
        lastCheckedFGI: fgi,
        lastCheckTime: Date.now()
      };
      
      this.saveState();
      return;
    }
    
    try {
      // Get collateral info
      const collateralInfo = await this.driftClient.getCollateralInfo();

      // Calculate position size - let Drift handle insufficient collateral naturally
      const positionSize = collateralInfo.free * CONFIG.MAX_POSITION_RATIO * CONFIG.LEVERAGE;

      console.log(chalk.cyan(`💰 Opening ${direction} position: $${positionSize.toFixed(2)} at ${CONFIG.LEVERAGE}x`));
      
      // Execute trade
      const txSig = await this.driftClient.openPosition(direction, positionSize);
      
      console.log(chalk.green(`✅ Position opened! Tx: ${txSig}`));
      
      // Update state
      this.positionState = {
        hasOpenPosition: true,
        direction,
        size: positionSize,
        entryPrice: price,
        entryFGI: fgi,
        timestamp: Date.now(),
        lastCheckedFGI: fgi,
        lastCheckTime: Date.now()
      };

      // Update daily performance
      this.dailyPerformance.trades++;

      this.saveState();
      this.saveDailyPerformance();
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to open position:'), error);
      // Don't update state if trade failed
    }
  }
  
  // Explicit PnL settlement with visibility
  private async settlePNLExplicitly(currentFGI: number, currentPrice: number): Promise<void> {
    if (!CONFIG.USE_DRIFT_SDK || !this.driftClient) {
      console.log(chalk.gray('[SIMULATED] PnL settlement (no-op)'));
      return;
    }
    
    try {
      console.log(chalk.cyan('💸 Explicitly settling PnL for compounding...'));
      const txSig = await this.driftClient.settlePNL();
      
      if (txSig) {
        console.log(chalk.green(`✅ PnL settlement successful! Tx: ${txSig}`));
      } else {
        console.log(chalk.gray('💸 No PnL to settle (already settled)'));
      }
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️ PnL settlement failed: ${error}. Continuing with new position...`));
      // Continue execution - settlement failures shouldn't block trading
    }
  }
  
  // Close existing position
  private async closePosition(currentFGI: number, currentPrice: number): Promise<void> {
    if (!this.positionState.hasOpenPosition) {
      console.log(chalk.yellow('⚠️ No position to close'));
      return;
    }
    
    const { direction, entryPrice, size } = this.positionState;
    
    if (!CONFIG.USE_DRIFT_SDK || !this.driftClient) {
      // Simulation mode
      const pnlPercent = direction === 'LONG'
        ? ((currentPrice - (entryPrice || 0)) / (entryPrice || 1)) * 100 * CONFIG.LEVERAGE
        : (((entryPrice || 0) - currentPrice) / (entryPrice || 1)) * 100 * CONFIG.LEVERAGE;
      
      console.log(chalk.yellow(`[SIMULATED] Closing ${direction} position`));
      console.log(chalk.yellow(`[SIMULATED] PnL: ${pnlPercent.toFixed(2)}%`));
      
      this.positionState = {
        hasOpenPosition: false,
        lastCheckedFGI: currentFGI,
        lastCheckTime: Date.now()
      };
      
      this.saveState();
      return;
    }
    
    try {
      // Get actual position from Drift
      const position = await this.driftClient.getPosition();
      
      if (!position.exists) {
        console.log(chalk.yellow('⚠️ No actual position found on Drift'));
        this.positionState = {
          hasOpenPosition: false,
          lastCheckedFGI: currentFGI,
          lastCheckTime: Date.now()
        };
        this.saveState();
        return;
      }
      
      console.log(chalk.cyan(`📉 Closing ${position.direction} position`));
      console.log(chalk.cyan(`💰 PnL: $${position.pnl.toFixed(2)} (${position.pnlPercent.toFixed(2)}%)`));
      
      // Execute close
      const txSig = await this.driftClient.closePosition();
      
      console.log(chalk.green(`✅ Position closed! Tx: ${txSig}`));

      // Update daily performance
      this.dailyPerformance.pnl += position.pnl;
      const collateralInfo = await this.driftClient.getCollateralInfo();
      this.dailyPerformance.currentBalance = collateralInfo.total;
      this.dailyPerformance.pnlPercent =
        ((this.dailyPerformance.currentBalance - this.dailyPerformance.startBalance) /
         this.dailyPerformance.startBalance) * 100;

      // Reset state
      this.positionState = {
        hasOpenPosition: false,
        lastCheckedFGI: currentFGI,
        lastCheckTime: Date.now()
      };

      this.saveState();
      this.saveDailyPerformance();
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to close position:'), error);
      // Don't update state if close failed
    }
  }
  
  // Run single check with smart 4h candle detection
  async runOnce(): Promise<void> {
    console.log(chalk.cyan('\n📊 Checking for new 4h candle...'));
    
    const fgiData = await this.fetchFGIData();
    if (!fgiData) {
      console.log(chalk.red('❌ Failed to fetch FGI data'));
      return;
    }
    
    // Show current candle info
    console.log(chalk.cyan(`Current candle timestamp: ${fgiData.timestamp}`));
    if (this.positionState.lastProcessedTimestamp) {
      console.log(chalk.cyan(`Last processed: ${this.positionState.lastProcessedTimestamp}`));
    }
    
    await this.executeTrade(fgiData);

    // Show daily performance
    console.log(chalk.cyan('\n📈 Daily Performance:'));
    console.log(chalk.cyan(`  Trades: ${this.dailyPerformance.trades}`));
    console.log(chalk.cyan(`  PnL: $${this.dailyPerformance.pnl.toFixed(2)} (${this.dailyPerformance.pnlPercent.toFixed(2)}%)`));

    // Show next update time
    const nextUpdateTime = this.calculateNextUpdateTime(fgiData.timestamp);
    const timeToNext = nextUpdateTime.getTime() - Date.now();
    const minutesToNext = Math.floor(timeToNext / 60000);
    console.log(chalk.blue(`\n⏰ Next 4h candle expected in ${minutesToNext} minutes at ${nextUpdateTime.toISOString()}`));
  }
  
  // Run as service with smart 4h candle synchronization
  async runService(): Promise<void> {
    console.log(chalk.green('\n🚀 Starting Drift FGI Trading Service (4h Candle Sync)'));
    console.log(chalk.cyan(`🎯 Strategy: SHORT ≤ ${CONFIG.FGI_SHORT_THRESHOLD}, LONG ≥ ${CONFIG.FGI_LONG_THRESHOLD}`));
    console.log(chalk.cyan(`💪 Leverage: ${CONFIG.LEVERAGE}x`));
    console.log(chalk.cyan(`⏰ Syncing with 4h candle boundaries`));
    
    this.isRunning = true;
    
    // Handle shutdown
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n🛑 Shutting down...'));
      this.isRunning = false;
      
      if (this.driftClient) {
        if (CONFIG.USE_DRIFT_SDK) {
          const position = await this.driftClient.getPosition();
          if (position.exists) {
            console.log(chalk.yellow('⚠️ Warning: Open position detected'));
            console.log(chalk.yellow('Consider closing manually or run with "close" command'));
          }
        }
        
        await this.driftClient.shutdown();
      }
      
      process.exit(0);
    });
    
    // Initialize with current state
    const initialData = await this.fetchFGIData();
    let lastProcessedTimestamp = this.positionState.lastProcessedTimestamp || '';
    
    if (initialData && initialData.timestamp !== lastProcessedTimestamp) {
      console.log(chalk.green('📊 Processing initial candle...'));
      await this.executeTrade(initialData);
      lastProcessedTimestamp = initialData.timestamp;
    }
    
    // Main service loop - simplified without fragmented conditionals
    while (this.isRunning) {
      console.log(chalk.blue(`\n=== Starting FGI check cycle at ${new Date().toISOString()} ===`));
      
      const newData = await this.pollFgiApiForNewData(lastProcessedTimestamp);
      
      if (newData) {
        await this.executeTrade(newData);
        lastProcessedTimestamp = newData.timestamp;

        console.log(chalk.cyan('\n📈 Daily Performance:'));
        console.log(chalk.cyan(`  Trades: ${this.dailyPerformance.trades}`));
        console.log(chalk.cyan(`  PnL: $${this.dailyPerformance.pnl.toFixed(2)} (${this.dailyPerformance.pnlPercent.toFixed(2)}%)`));

        console.log(chalk.green('✅ FGI Processing Cycle Completed'));
      } else {
        console.log(chalk.yellow('No new FGI data available. Continuing to next cycle.'));
      }
    }
  }
  
  // Close all positions
  async close(): Promise<void> {
    console.log(chalk.red('\n🚨 CLOSE ALL POSITIONS'));
    
    if (!CONFIG.USE_DRIFT_SDK || !this.driftClient) {
      console.log(chalk.yellow('Not using real SDK - nothing to close'));
      return;
    }
    
    await this.driftClient.closeAllPositions();
    
    // Reset state
    this.positionState = {
      hasOpenPosition: false,
      lastCheckTime: Date.now()
    };
    this.saveState();
  }
  
  // Force trade in specified direction (ignore FGI signal)
  async forceTrade(direction: 'LONG' | 'SHORT'): Promise<void> {
    console.log(chalk.cyan(`\n🎯 Force executing ${direction} trade at ${CONFIG.LEVERAGE}x leverage`));
    
    // Fetch current FGI data for logging (but don't use for signal)
    const fgiData = await this.fetchFGIData();
    const fgi = fgiData?.fgi || 0;
    const price = fgiData?.price || 0;
    
    console.log(chalk.gray(`📊 Current FGI: ${fgi} (ignored)`));
    console.log(chalk.gray(`💰 Current ETH Price: $${price.toFixed(2)}`));
    
    // Check current position status
    if (CONFIG.USE_DRIFT_SDK && this.driftClient) {
      const currentPosition = await this.driftClient.getPosition();
      
      if (currentPosition.exists) {
        if (currentPosition.direction === direction) {
          console.log(chalk.yellow(`⚠️ Already have ${direction} position - this will ADD to it`));
          console.log(chalk.yellow(`  Current size: ${currentPosition.size.toFixed(4)} ETH`));
          console.log(chalk.yellow(`  Current PnL: $${currentPosition.pnl.toFixed(2)} (${currentPosition.pnlPercent.toFixed(2)}%)`));
        } else {
          console.log(chalk.yellow(`🔄 Will flip from ${currentPosition.direction} to ${direction}`));
          await this.closePosition(fgi, price);
          await this.settlePNLExplicitly(fgi, price);
        }
      }
    }
    
    // Execute the forced trade
    await this.openPosition(direction, price, fgi);
    
    // Update state
    this.positionState.lastCheckTime = Date.now();
    this.positionState.lastCheckedFGI = fgi;
    this.saveState();
    
    console.log(chalk.green(`✅ Force ${direction} trade completed!`));
  }
  
  // Initialize and run
  async initialize(): Promise<void> {
    try {
      await this.initializeDriftClient();
    } catch (error) {
      console.error(chalk.red('Failed to initialize:'), error);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const command = process.argv[2];
  
  console.log(chalk.cyan(`\n🤖 Drift FGI Trader v2.0 - ${DRIFT_CONFIG.ENV.toUpperCase()}`));
  console.log(chalk.cyan('📊 Strategy: ETH 4h SHORT≤49 LONG≥50 @ 4x Leverage'));
  
  const trader = new DriftFGITrader();
  
  try {
    switch (command) {
      case 'test':
        console.log(chalk.yellow('\n🧪 Running in test mode...'));
        await trader.initialize();
        await trader.runOnce();
        if (trader['driftClient']) {
          await trader['driftClient'].shutdown();
        }
        break;
        
      case 'once':
        console.log(chalk.cyan('\n⚡ Running single check...'));
        await trader.initialize();
        await trader.runOnce();
        if (trader['driftClient']) {
          await trader['driftClient'].shutdown();
        }
        break;
        
      case 'service':
        console.log(chalk.green('\n🚀 Starting service mode...'));
        await trader.initialize();
        await trader.runService();
        break;
        
      case 'close':
        console.log(chalk.red('\n📉 Closing positions...'));
        await trader.initialize();
        await trader.close();
        if (trader['driftClient']) {
          await trader['driftClient'].shutdown();
        }
        break;
        
      case 'check-position':
        console.log(chalk.cyan('\n📊 Checking positions...'));
        await trader.initialize();
        if (CONFIG.USE_DRIFT_SDK && trader['driftClient']) {
          const position = await trader['driftClient'].getPosition();
          const collateral = await trader['driftClient'].getCollateralInfo();
          
          console.log(chalk.cyan('\n💰 Collateral Info:'));
          console.log(`  Total: $${collateral.total.toFixed(2)}`);
          console.log(`  Free: $${collateral.free.toFixed(2)}`);
          console.log(`  Used: $${collateral.used.toFixed(2)}`);
          console.log(`  Health: ${collateral.health.toFixed(2)}%`);
          
          if (position.exists) {
            console.log(chalk.cyan('\n📈 Position Info:'));
            console.log(`  Direction: ${position.direction}`);
            console.log(`  Size: ${position.size.toFixed(4)} ETH`);
            console.log(`  Entry: $${position.entryPrice.toFixed(2)}`);
            console.log(`  Mark: $${position.markPrice.toFixed(2)}`);
            console.log(`  PnL: $${position.pnl.toFixed(2)} (${position.pnlPercent.toFixed(2)}%)`);
          } else {
            console.log(chalk.gray('\nNo open positions'));
          }
          
          await trader['driftClient'].shutdown();
        } else {
          console.log(chalk.yellow('Running in simulation mode'));
        }
        break;
        
      case 'force-long':
        console.log(chalk.green('\n🎯 Forcing LONG position (ignoring FGI)...'));
        await trader.initialize();
        await trader.forceTrade('LONG');
        if (trader['driftClient']) {
          await trader['driftClient'].shutdown();
        }
        break;
        
      case 'force-short':
        console.log(chalk.red('\n🎯 Forcing SHORT position (ignoring FGI)...'));
        await trader.initialize();
        await trader.forceTrade('SHORT');
        if (trader['driftClient']) {
          await trader['driftClient'].shutdown();
        }
        break;
        
      default:
        console.log(chalk.yellow('\nUsage:'));
        console.log('  bun run drift-fgi-trader-v2.ts test            # Test connection and FGI');
        console.log('  bun run drift-fgi-trader-v2.ts once            # Run single trade check');
        console.log('  bun run drift-fgi-trader-v2.ts service         # Run as service');
        console.log('  bun run drift-fgi-trader-v2.ts check-position  # Check current positions');
        console.log('  bun run drift-fgi-trader-v2.ts close           # Close all positions');
        console.log('  bun run drift-fgi-trader-v2.ts force-long      # Force LONG position (ignore FGI)');
        console.log('  bun run drift-fgi-trader-v2.ts force-short     # Force SHORT position (ignore FGI)');
        process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('\n❌ Fatal error:'), error);
    process.exit(1);
  }
}

// Run if called directly
// This works with tsx, ts-node, and bun
main().catch(console.error);