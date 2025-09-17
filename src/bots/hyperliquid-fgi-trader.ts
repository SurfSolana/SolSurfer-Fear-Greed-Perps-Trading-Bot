#!/usr/bin/env bun

import chalk from 'chalk';
import dotenv from 'dotenv';
import { Database } from 'bun:sqlite';

// Import Hyperliquid services
import { getBalance, getPosition, getAvailableBalance } from '../services/hyperliquid-account';
import {
    placeLongOrder,
    placeShortOrder,
    closePosition,
    cancelAllOrders,
    setLeverage
} from '../services/hyperliquid-trade';
import { getCurrentPrice, isMarketOpen } from '../services/hyperliquid-market';

// Load environment variables
dotenv.config();

// Configuration from environment
const CONFIG = {
    asset: process.env.HYPERLIQUID_ASSET || 'ETH',
    leverage: parseInt(process.env.HYPERLIQUID_LEVERAGE || '3'),
    fgiCheckInterval: parseInt(process.env.FGI_CHECK_INTERVAL_MS || '300000'), // 5 minutes
    longThreshold: 30,  // FGI < 30 = Long
    shortThreshold: 70, // FGI > 70 = Short
    dataInterval: '4h'
};

// Bot state
interface BotState {
    isRunning: boolean;
    lastCheck: Date | null;
    currentPosition: 'LONG' | 'SHORT' | 'NONE';
    entryPrice: number;
    entryFGI: number;
}

class HyperliquidFGITrader {
    private state: BotState;
    private db: Database;

    constructor() {
        this.state = {
            isRunning: false,
            lastCheck: null,
            currentPosition: 'NONE',
            entryPrice: 0,
            entryFGI: 0
        };

        // Initialize database for logging
        this.db = new Database('trading.db');
        this.initDatabase();
    }

    private initDatabase() {
        // Ensure trades table exists
        this.db.run(`
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                exchange TEXT NOT NULL,
                asset TEXT NOT NULL,
                action TEXT NOT NULL,
                price REAL,
                size REAL,
                fgi_score REAL,
                details TEXT
            )
        `);
    }

    private logTrade(action: string, price: number, size: number, fgiScore: number, details: any) {
        const query = `
            INSERT INTO trades (timestamp, exchange, asset, action, price, size, fgi_score, details)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        this.db.run(query,
            new Date().toISOString(),
            'hyperliquid',
            CONFIG.asset,
            action,
            price,
            size,
            fgiScore,
            JSON.stringify(details)
        );
    }

    private async fetchFGIScore(): Promise<number | null> {
        const apiUrl = `https://api.surfsolana.com/${CONFIG.asset}/${CONFIG.dataInterval}/latest.json`;

        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                console.error(chalk.red(`FGI API error: ${response.status}`));
                return null;
            }

            const data = await response.json();
            const fgiScore = parseFloat(data.fgi || data.raw?.cfgi || 0);

            if (isNaN(fgiScore) || fgiScore === 0) {
                console.error(chalk.red('Invalid FGI score received'));
                return null;
            }

            return fgiScore;
        } catch (error) {
            console.error(chalk.red('Failed to fetch FGI:'), error);
            return null;
        }
    }

    private async checkAndTrade() {
        try {
            // Check if market is open
            if (!await isMarketOpen()) {
                console.log(chalk.yellow('⚠️ Market is closed'));
                return;
            }

            // Get current FGI score
            const fgiScore = await this.fetchFGIScore();
            if (fgiScore === null) return;

            console.log(chalk.blue(`📊 FGI Score: ${fgiScore.toFixed(2)}`));

            // Get current position
            const position = await getPosition(CONFIG.asset);
            const currentPrice = await getCurrentPrice(CONFIG.asset);

            // Determine current position state
            if (position && position.size !== 0) {
                this.state.currentPosition = position.size > 0 ? 'LONG' : 'SHORT';
            } else {
                this.state.currentPosition = 'NONE';
            }

            // Trading logic based on FGI thresholds
            if (fgiScore < CONFIG.longThreshold) {
                // FGI < 30: Extreme Fear - Go Long
                if (this.state.currentPosition === 'SHORT') {
                    console.log(chalk.yellow('📉 Closing SHORT position (FGI < long threshold)'));
                    await closePosition(CONFIG.asset);
                    this.logTrade('CLOSE_SHORT', currentPrice, Math.abs(position?.size || 0), fgiScore, {});
                    this.state.currentPosition = 'NONE';
                }

                if (this.state.currentPosition === 'NONE') {
                    const balance = await getAvailableBalance();
                    const positionSize = (balance * 0.95) / currentPrice * CONFIG.leverage; // Use 95% of available

                    console.log(chalk.green(`📈 Opening LONG position: ${positionSize.toFixed(4)} ${CONFIG.asset}`));
                    await setLeverage(CONFIG.leverage, CONFIG.asset);
                    await placeLongOrder(positionSize, undefined, CONFIG.asset);

                    this.state.currentPosition = 'LONG';
                    this.state.entryPrice = currentPrice;
                    this.state.entryFGI = fgiScore;

                    this.logTrade('OPEN_LONG', currentPrice, positionSize, fgiScore, {
                        leverage: CONFIG.leverage,
                        balance: balance
                    });
                }
            }
            else if (fgiScore > CONFIG.shortThreshold) {
                // FGI > 70: Extreme Greed - Go Short
                if (this.state.currentPosition === 'LONG') {
                    console.log(chalk.yellow('📈 Closing LONG position (FGI > short threshold)'));
                    await closePosition(CONFIG.asset);
                    this.logTrade('CLOSE_LONG', currentPrice, Math.abs(position?.size || 0), fgiScore, {});
                    this.state.currentPosition = 'NONE';
                }

                if (this.state.currentPosition === 'NONE') {
                    const balance = await getAvailableBalance();
                    const positionSize = (balance * 0.95) / currentPrice * CONFIG.leverage; // Use 95% of available

                    console.log(chalk.red(`📉 Opening SHORT position: ${positionSize.toFixed(4)} ${CONFIG.asset}`));
                    await setLeverage(CONFIG.leverage, CONFIG.asset);
                    await placeShortOrder(positionSize, undefined, CONFIG.asset);

                    this.state.currentPosition = 'SHORT';
                    this.state.entryPrice = currentPrice;
                    this.state.entryFGI = fgiScore;

                    this.logTrade('OPEN_SHORT', currentPrice, positionSize, fgiScore, {
                        leverage: CONFIG.leverage,
                        balance: balance
                    });
                }
            }
            else {
                // FGI between 30-70: Neutral zone
                console.log(chalk.gray(`⏸️ Neutral zone (${CONFIG.longThreshold}-${CONFIG.shortThreshold}), holding position`));
            }

            // Display current status
            if (this.state.currentPosition !== 'NONE' && position) {
                const pnl = position.unrealizedPnl;
                const pnlColor = pnl >= 0 ? chalk.green : chalk.red;
                console.log(pnlColor(`💰 Position PnL: $${pnl.toFixed(2)}`));
            }

        } catch (error) {
            console.error(chalk.red('❌ Trading error:'), error);
            // Log error but keep running
            this.logTrade('ERROR', 0, 0, 0, { error: error.message });
        }
    }

    async start() {
        console.log(chalk.cyan('\n🚀 Starting Hyperliquid FGI Trading Bot'));
        console.log(chalk.gray(`Asset: ${CONFIG.asset}`));
        console.log(chalk.gray(`Leverage: ${CONFIG.leverage}x`));
        console.log(chalk.gray(`Check Interval: ${CONFIG.fgiCheckInterval / 1000}s`));
        console.log(chalk.gray(`Long Threshold: < ${CONFIG.longThreshold}`));
        console.log(chalk.gray(`Short Threshold: > ${CONFIG.shortThreshold}`));

        this.state.isRunning = true;

        // Initial check
        await this.checkAndTrade();

        // Set up interval
        const interval = setInterval(async () => {
            if (!this.state.isRunning) {
                clearInterval(interval);
                return;
            }

            console.log(chalk.gray(`\n⏰ ${new Date().toLocaleTimeString()} - Checking FGI...`));
            await this.checkAndTrade();
        }, CONFIG.fgiCheckInterval);

        // Handle shutdown
        process.on('SIGINT', async () => {
            console.log(chalk.yellow('\n⏹️ Shutting down...'));
            this.state.isRunning = false;

            // Cancel pending orders on shutdown
            try {
                await cancelAllOrders();
                console.log(chalk.green('✅ Cancelled all pending orders'));
            } catch (error) {
                console.error(chalk.red('Failed to cancel orders:'), error);
            }

            this.db.close();
            process.exit(0);
        });
    }
}

// Run the bot
if (require.main === module) {
    const bot = new HyperliquidFGITrader();
    bot.start().catch(error => {
        console.error(chalk.red('Fatal error:'), error);
        process.exit(1);
    });
}