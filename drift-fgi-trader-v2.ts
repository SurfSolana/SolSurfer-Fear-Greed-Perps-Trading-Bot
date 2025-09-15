#!/usr/bin/env bun

import { DriftTradingClient, DRIFT_CONFIG } from './src/drift-client';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { mkdirSync, existsSync } from 'fs';
import { BN } from '@coral-xyz/anchor';
import { PositionDirection, BASE_PRECISION, PRICE_PRECISION, convertToNumber } from '@drift-labs/sdk';

// Import all refactored modules
import { ConfigurationManager } from './lib/configuration-manager';
import { getPerpMarket } from './lib/get-perp-market';
import { DriftClientWrapper } from './lib/drift-client-wrapper';
import { PerformanceTracker } from './lib/performance-tracker';
import { StrategyExecutor, FGIData } from './lib/strategy-executor';
import {
  PositionState,
  createPositionState,
  updatePositionState,
  resetPositionState,
  shouldClosePosition,
  formatPositionState
} from './lib/position-state';
import { readJsonFile, writeJsonFile, ensureFile } from './lib/file-operations';
import { formatTimestamp, formatTime, formatShortDate } from './lib/date-formatter';
import { getIntervalMs, getIntervalHours, getProgressIntervalMs, DataInterval } from './lib/data-interval-utils';

// Load environment variables
dotenv.config({ path: '.env' });

// State file paths
const STATE_FILE = './fgi-drift-state-v2.json';
const DAILY_PERFORMANCE_FILE = './daily-performance.json';

class DriftFGITrader {
  private driftClient?: DriftTradingClient;
  private driftWrapper?: DriftClientWrapper;
  private configManager: ConfigurationManager;
  private performanceTracker: PerformanceTracker;
  private strategyExecutor: StrategyExecutor;
  private positionState: PositionState;
  private dailyPerformance: any;
  private isRunning: boolean = false;

  constructor() {
    // Initialize managers
    this.configManager = new ConfigurationManager();
    this.performanceTracker = new PerformanceTracker('./data/performance.json');
    this.strategyExecutor = new StrategyExecutor(this.configManager.getConfig());

    // Load state
    this.positionState = this.loadState();
    this.dailyPerformance = this.loadDailyPerformance();

    // Watch for config changes
    this.configManager.watchConfig((config) => {
      console.log(chalk.gray(`♻️ Config reloaded: ${config.asset} ${config.dataInterval} L:${config.leverage}x`));
      this.strategyExecutor.updateConfig(config);
    });
  }

  private loadState(): PositionState {
    const saved = readJsonFile<any>(STATE_FILE);
    if (!saved) {
      return createPositionState();
    }

    // Convert saved state to PositionState
    return createPositionState({
      hasPosition: saved.hasOpenPosition || false,
      direction: saved.direction === 'LONG' ? PositionDirection.LONG :
                saved.direction === 'SHORT' ? PositionDirection.SHORT : null,
      entryPrice: saved.entryPrice || 0,
      size: saved.size || 0,
      timestamp: saved.timestamp ? new Date(saved.timestamp) : null,
      lastFGI: saved.lastCheckedFGI || 0
    });
  }

  private saveState(): void {
    const stateToSave = {
      hasOpenPosition: this.positionState.hasPosition,
      direction: this.positionState.direction === PositionDirection.LONG ? 'LONG' :
                this.positionState.direction === PositionDirection.SHORT ? 'SHORT' : undefined,
      size: this.positionState.size,
      entryPrice: this.positionState.entryPrice,
      entryFGI: this.positionState.lastFGI,
      timestamp: this.positionState.timestamp?.getTime(),
      lastCheckedFGI: this.positionState.lastFGI,
      lastCheckTime: Date.now()
    };
    writeJsonFile(STATE_FILE, stateToSave);
  }

  private loadDailyPerformance(): any {
    return ensureFile(DAILY_PERFORMANCE_FILE, {
      date: formatShortDate(new Date()),
      startBalance: 0,
      currentBalance: 0,
      trades: 0,
      pnl: 0,
      pnlPercent: 0
    });
  }

  private saveDailyPerformance(): void {
    writeJsonFile(DAILY_PERFORMANCE_FILE, this.dailyPerformance);
  }

  private async initializeDrift(): Promise<void> {
    const config = this.configManager.getConfig();
    console.log(chalk.cyan(`\n🚀 Initializing Drift client for ${config.asset}...`));

    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('SOLANA_PRIVATE_KEY environment variable is required');
    }

    try {
      this.driftClient = new DriftTradingClient(privateKey);
      await this.driftClient.initialize();
      this.driftWrapper = new DriftClientWrapper(this.driftClient.getClient());

      console.log(chalk.green('✅ Drift client initialized successfully'));

      // Update daily performance starting balance
      const currentDate = formatShortDate(new Date());
      if (this.dailyPerformance.date !== currentDate) {
        const balance = await this.driftWrapper.getCollateral();
        this.dailyPerformance = {
          date: currentDate,
          startBalance: balance,
          currentBalance: balance,
          trades: 0,
          pnl: 0,
          pnlPercent: 0
        };
        this.saveDailyPerformance();
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to initialize Drift client:'), error);
      throw error;
    }
  }

  private async fetchFGIData(): Promise<FGIData | null> {
    const config = this.configManager.getConfig();
    const apiUrl = `https://api.surfsolana.com/${config.asset}/${config.dataInterval}/latest.json`;

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!data || typeof data.fgi !== 'number') {
        console.error(chalk.red('❌ Invalid FGI data received'));
        return null;
      }

      return {
        value: data.fgi,
        timestamp: data.timestamp || new Date().toISOString(),
        classification: this.classifyFGI(data.fgi)
      };
    } catch (error) {
      console.error(chalk.red(`❌ Failed to fetch FGI from ${apiUrl}:`), error);
      return null;
    }
  }

  private classifyFGI(value: number): string {
    if (value <= 25) return 'Extreme Fear';
    if (value <= 45) return 'Fear';
    if (value <= 55) return 'Neutral';
    if (value <= 75) return 'Greed';
    return 'Extreme Greed';
  }

  private async getCurrentPosition(): Promise<void> {
    if (!this.driftWrapper) return;

    const config = this.configManager.getConfig();
    const marketIndex = getPerpMarket('ETH').marketIndex;

    const position = await this.driftWrapper.getPosition(marketIndex);

    if (!position) {
      this.positionState = resetPositionState(this.positionState);
    } else {
      const currentPrice = await this.getCurrentPrice();
      const size = convertToNumber(position.baseAssetAmount.abs(), BASE_PRECISION);
      const entryPrice = Math.abs(convertToNumber(position.quoteAssetAmount, PRICE_PRECISION) / size);

      this.positionState = updatePositionState(this.positionState, {
        hasPosition: true,
        direction: position.direction,
        size,
        entryPrice,
        timestamp: this.positionState.timestamp || new Date()
      });

      // Update PnL
      const pnl = await this.driftWrapper.calculatePnL(marketIndex);
      this.positionState = updatePositionState(this.positionState, {
        unrealizedPnL: pnl
      });
    }
  }

  private async getCurrentPrice(): Promise<number> {
    const config = this.configManager.getConfig();
    const apiUrl = `https://api.surfsolana.com/${config.asset}/${config.dataInterval}/latest.json`;

    try {
      const response = await fetch(apiUrl);
      const data = await response.json();
      return data.price || 0;
    } catch {
      return 0;
    }
  }

  private async executeStrategy(fgiData: FGIData): Promise<void> {
    if (!this.driftWrapper || !this.driftClient) return;

    const config = this.configManager.getConfig();
    const decision = this.strategyExecutor.makeDecision(fgiData.value);

    console.log(chalk.cyan(this.strategyExecutor.formatDecision(decision)));

    // Update last FGI
    this.positionState = updatePositionState(this.positionState, {
      lastFGI: fgiData.value,
      targetDirection: decision.targetDirection
    });

    // ALWAYS check on-chain position status before any trading action
    const marketIndex = config.asset === 'ETH' ? 2 : 0;
    const currentPosition = await this.driftClient.getPosition(marketIndex);

    if (currentPosition.exists) {
      console.log(chalk.cyan(`📊 On-chain position: ${currentPosition.direction} ${currentPosition.size.toFixed(4)} ${config.asset}`));
      console.log(chalk.cyan(`   Entry: $${currentPosition.entryPrice.toFixed(2)} | Mark: $${currentPosition.markPrice.toFixed(2)}`));
      console.log(chalk.cyan(`   PnL: $${currentPosition.pnl.toFixed(2)} (${currentPosition.pnlPercent.toFixed(2)}%)`));

      // Update local state to match chain
      this.positionState = updatePositionState(this.positionState, {
        hasPosition: true,
        direction: currentPosition.direction,
        size: currentPosition.size,
        entryPrice: currentPosition.entryPrice,
        unrealizedPnL: currentPosition.pnl
      });

      // Check if we should close the existing position
      const shouldClose = currentPosition.direction === 'LONG' && decision.targetDirection === PositionDirection.SHORT ||
                         currentPosition.direction === 'SHORT' && decision.targetDirection === PositionDirection.LONG;

      if (shouldClose && decision.shouldTrade) {
        console.log(chalk.yellow(`🔄 Closing ${currentPosition.direction} to open ${decision.targetDirection === PositionDirection.LONG ? 'LONG' : 'SHORT'}`));
        await this.closePosition();

        // Wait for close to settle
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Re-check position status before opening new one
        const afterClose = await this.driftClient.getPosition(marketIndex);
        if (!afterClose.exists) {
          await this.openPosition(decision.targetDirection!);
        } else {
          console.log(chalk.red('⚠️ Position still exists after close attempt, skipping open'));
        }
      } else {
        console.log(chalk.gray('📊 Keeping existing position'));
      }
    } else {
      // No position exists on-chain
      this.positionState = updatePositionState(this.positionState, {
        hasPosition: false,
        direction: 'NONE',
        size: 0,
        entryPrice: 0
      });

      // Open new position if strategy says so
      if (decision.shouldTrade) {
        await this.openPosition(decision.targetDirection!);
      } else {
        console.log(chalk.gray('📊 No position, no trade signal'));
      }
    }

    this.saveState();
  }

  private async openPosition(direction: PositionDirection): Promise<void> {
    if (!this.driftWrapper || !this.driftClient) return;

    const config = this.configManager.getConfig();
    const marketIndex = getPerpMarket('ETH').marketIndex;

    try {
      // Calculate position size
      const collateral = await this.driftWrapper.getCollateral();
      const price = await this.getCurrentPrice();
      const positionSize = (collateral * config.leverage * config.maxPositionRatio) / price;
      const baseAssetAmount = new BN(positionSize * 1e9); // Convert to base precision

      console.log(chalk.yellow(`📊 Opening ${direction === PositionDirection.LONG ? 'LONG' : 'SHORT'} position: ${positionSize.toFixed(4)} ${config.asset}`));

      const tx = await this.driftWrapper.openPosition({
        direction,
        baseAssetAmount,
        marketIndex
      });

      if (tx) {
        console.log(chalk.green(`✅ Position opened: ${tx}`));
        this.dailyPerformance.trades++;

        // Update position state
        this.positionState = updatePositionState(this.positionState, {
          hasPosition: true,
          direction,
          size: positionSize,
          entryPrice: price,
          timestamp: new Date()
        });

        // Track the trade
        this.performanceTracker.trackTrade(
          direction === PositionDirection.LONG ? 'LONG' : 'SHORT',
          positionSize,
          0, // PnL will be updated when position closes
          new Date()
        );
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to open position:'), error);
    }
  }

  private async closePosition(): Promise<void> {
    if (!this.driftWrapper || !this.positionState.hasPosition) return;

    const config = this.configManager.getConfig();
    const marketIndex = getPerpMarket('ETH').marketIndex;

    try {
      console.log(chalk.yellow(`📊 Closing ${this.positionState.direction === PositionDirection.LONG ? 'LONG' : 'SHORT'} position`));

      const pnl = await this.driftWrapper.calculatePnL(marketIndex);
      const tx = await this.driftWrapper.closePosition(marketIndex);

      if (tx) {
        console.log(chalk.green(`✅ Position closed: ${tx}`));
        console.log(chalk[pnl >= 0 ? 'green' : 'red'](`💰 Realized PnL: $${pnl.toFixed(2)}`));

        // Update performance
        this.dailyPerformance.pnl += pnl;
        this.performanceTracker.trackTrade(
          this.positionState.direction === PositionDirection.LONG ? 'LONG' : 'SHORT',
          this.positionState.size,
          pnl,
          new Date()
        );

        // Reset position state
        this.positionState = resetPositionState(this.positionState);
        this.positionState.realizedPnL += pnl;
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to close position:'), error);
    }
  }

  private calculateNextUpdateTime(): Date {
    const config = this.configManager.getConfig();
    const now = new Date();
    const intervalHours = getIntervalHours(config.dataInterval);
    const intervalMs = intervalHours * 60 * 60 * 1000;

    // Calculate next candle boundary
    const currentCandle = Math.floor(now.getTime() / intervalMs) * intervalMs;
    const nextCandle = currentCandle + intervalMs;

    return new Date(nextCandle);
  }

  private async waitUntilNextUpdate(): Promise<void> {
    const config = this.configManager.getConfig();
    const nextUpdate = this.calculateNextUpdateTime();
    const now = new Date();
    const msUntilNext = nextUpdate.getTime() - now.getTime();

    console.log(chalk.gray(`⏰ Next ${config.dataInterval} candle at ${formatTime(nextUpdate)} (in ${Math.round(msUntilNext / 60000)} minutes)`));

    // Progress updates
    const progressInterval = getProgressIntervalMs(config.dataInterval);
    let elapsed = 0;

    while (elapsed < msUntilNext && this.isRunning) {
      await new Promise(resolve => setTimeout(resolve, progressInterval));
      elapsed += progressInterval;

      if (this.isRunning) {
        const remaining = Math.max(0, msUntilNext - elapsed);
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);

        process.stdout.write(`\r${chalk.gray(`⏳ Waiting for next ${config.dataInterval} candle: ${minutes}m ${seconds}s remaining...`)}`);
      }
    }

    console.log(''); // New line after progress
  }

  private printStatus(): void {
    const config = this.configManager.getConfig();
    console.log(chalk.blue('\n' + '='.repeat(60)));
    console.log(chalk.cyan(formatTimestamp()));
    console.log(chalk.blue('='.repeat(60)));

    console.log(chalk.white(this.strategyExecutor.getStrategyDescription()));
    console.log(chalk.white(`Data Interval: ${config.dataInterval}`));
    console.log(chalk.white(`Max Position: ${(config.maxPositionRatio * 100).toFixed(0)}%`));

    if (this.positionState.hasPosition) {
      console.log(chalk.yellow('\n📊 Current Position:'));
      console.log(chalk.white(formatPositionState(this.positionState)));
    } else {
      console.log(chalk.gray('\n📊 No open position'));
    }

    // Show daily performance
    if (this.dailyPerformance.trades > 0) {
      const pnlColor = this.dailyPerformance.pnl >= 0 ? 'green' : 'red';
      console.log(chalk[pnlColor](`\n📈 Daily: ${this.dailyPerformance.trades} trades, PnL: $${this.dailyPerformance.pnl.toFixed(2)}`));
    }

    // Show performance summary
    const summary = this.performanceTracker.getPerformanceSummary();
    if (summary.totalTrades > 0) {
      const totalColor = summary.totalPnL >= 0 ? 'green' : 'red';
      console.log(chalk[totalColor](`📊 Total: ${summary.totalTrades} trades, Win Rate: ${summary.winRate.toFixed(1)}%, PnL: $${summary.totalPnL.toFixed(2)}`));
    }

    console.log(chalk.blue('='.repeat(60)));
  }

  async start(): Promise<void> {
    console.log(chalk.cyan('\n🤖 Drift FGI Trading Bot Starting...'));
    console.log(chalk.gray('Version: 2.0 (Refactored)'));

    if (!this.configManager.isEnabled()) {
      console.log(chalk.yellow('⏸️ Trading is DISABLED in config. Bot will monitor only.'));
    }

    try {
      await this.initializeDrift();
      this.isRunning = true;

      // Ensure data directory exists
      if (!existsSync('./data')) {
        mkdirSync('./data', { recursive: true });
      }

      console.log(chalk.green('✅ Bot started successfully'));

      while (this.isRunning) {
        try {
          // Reload config for hot-reload support
          this.configManager.loadConfig();
          const config = this.configManager.getConfig();

          if (!config.enabled) {
            console.log(chalk.yellow(`\n⏸️ [${formatTime()}] Trading PAUSED - Waiting for next cycle...`));
            await this.waitUntilNextUpdate();
            continue;
          }

          this.printStatus();

          // Fetch FGI data
          const fgiData = await this.fetchFGIData();
          if (!fgiData) {
            console.log(chalk.yellow('⚠️ Could not fetch FGI data, retrying next cycle'));
            await this.waitUntilNextUpdate();
            continue;
          }

          console.log(chalk.cyan(`\n📊 FGI: ${fgiData.value} (${fgiData.classification})`));

          // Get current position
          await this.getCurrentPosition();

          // Execute strategy
          await this.executeStrategy(fgiData);

          // Update daily performance
          if (this.driftWrapper) {
            const balance = await this.driftWrapper.getCollateral();
            this.dailyPerformance.currentBalance = balance;
            this.dailyPerformance.pnl = balance - this.dailyPerformance.startBalance;
            this.dailyPerformance.pnlPercent = (this.dailyPerformance.pnl / this.dailyPerformance.startBalance) * 100;
            this.saveDailyPerformance();
          }

          // Wait for next update
          await this.waitUntilNextUpdate();

        } catch (error) {
          console.error(chalk.red('❌ Error in main loop:'), error);
          await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute on error
        }
      }
    } catch (error) {
      console.error(chalk.red('❌ Fatal error:'), error);
    } finally {
      await this.cleanup();
    }
  }

  async stop(): Promise<void> {
    console.log(chalk.yellow('\n🛑 Stopping bot...'));
    this.isRunning = false;
  }

  private async cleanup(): Promise<void> {
    if (this.driftClient) {
      console.log(chalk.gray('Closing Drift connection...'));
      await this.driftClient.cleanup();
    }
    console.log(chalk.green('✅ Bot stopped'));
  }
}

// Signal handlers
const trader = new DriftFGITrader();

process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n⚠️ Received SIGINT'));
  await trader.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(chalk.yellow('\n⚠️ Received SIGTERM'));
  await trader.stop();
  process.exit(0);
});

// Start the bot
trader.start().catch((error) => {
  console.error(chalk.red('❌ Unhandled error:'), error);
  process.exit(1);
});