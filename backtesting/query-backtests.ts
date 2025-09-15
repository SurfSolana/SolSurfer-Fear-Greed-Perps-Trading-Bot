#!/usr/bin/env bun

import { Database } from 'bun:sqlite';
import path from 'path';
import chalk from 'chalk';

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0] || 'help';

// Database path (consolidated)
const dbPath = path.join(__dirname, 'backtest-results', 'all-backtests.db');

// Open database
const db = new Database(dbPath);

// Query functions
const queries = {
  // Get top performers
  top: (limit = 10) => {
    console.time('Query time');
    const results = db.prepare(`
      SELECT asset, strategy, short_threshold, long_threshold, leverage,
             total_return, sharpe_ratio, max_drawdown, num_trades, win_rate
      FROM backtests
      ORDER BY total_return DESC
      LIMIT ?
    `).all(limit);
    console.timeEnd('Query time');
    return results;
  },

  // Get best by Sharpe ratio
  sharpe: (limit = 10) => {
    console.time('Query time');
    const results = db.prepare(`
      SELECT asset, strategy, short_threshold, long_threshold, leverage,
             total_return, sharpe_ratio, max_drawdown, num_trades, win_rate
      FROM backtests
      ORDER BY sharpe_ratio DESC
      LIMIT ?
    `).all(limit);
    console.timeEnd('Query time');
    return results;
  },

  // Get specific parameters
  params: (asset: string, shortThreshold: number, longThreshold: number, leverage: number) => {
    console.time('Query time');
    const result = db.prepare(`
      SELECT * FROM backtests
      WHERE asset = ? AND short_threshold = ?
        AND long_threshold = ? AND leverage = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).get(asset, shortThreshold, longThreshold, leverage);
    console.timeEnd('Query time');
    return result;
  },

  // Get summary statistics
  stats: () => {
    console.time('Query time');
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_records,
        COUNT(DISTINCT run_id) as total_runs,
        AVG(total_return) as avg_return,
        MAX(total_return) as max_return,
        MIN(total_return) as min_return,
        AVG(sharpe_ratio) as avg_sharpe,
        MAX(sharpe_ratio) as max_sharpe,
        AVG(max_drawdown) as avg_drawdown,
        SUM(CASE WHEN total_return > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as profitable_pct
      FROM backtests
    `).get();
    console.timeEnd('Query time');
    return stats;
  },

  // Find best for each asset
  best: () => {
    console.time('Query time');
    const results = db.prepare(`
      SELECT asset,
             MAX(total_return) as best_return,
             short_threshold, long_threshold, leverage
      FROM backtests
      GROUP BY asset
      ORDER BY best_return DESC
    `).all();
    console.timeEnd('Query time');
    return results;
  }
};

// Execute command
console.log(chalk.cyan.bold('\n📊 Backtest Query Tool\n'));

switch (command) {
  case 'top':
    const topResults = queries.top(parseInt(args[1]) || 10);
    console.log(chalk.green('Top Performers by Return:\n'));
    console.table(topResults);
    break;

  case 'sharpe':
    const sharpeResults = queries.sharpe(parseInt(args[1]) || 10);
    console.log(chalk.green('Top Performers by Sharpe Ratio:\n'));
    console.table(sharpeResults);
    break;

  case 'params':
    if (args.length < 5) {
      console.log(chalk.red('Usage: bun query-backtests.ts params <asset> <short> <long> <leverage>'));
      break;
    }
    const paramResult = queries.params(args[1], parseInt(args[2]), parseInt(args[3]), parseInt(args[4]));
    console.log(chalk.green('Specific Parameter Result:\n'));
    console.table(paramResult ? [paramResult] : []);
    break;

  case 'stats':
    const stats = queries.stats();
    console.log(chalk.green('Database Statistics:\n'));
    console.table([stats]);
    break;

  case 'best':
    const bestResults = queries.best();
    console.log(chalk.green('Best Configuration per Asset:\n'));
    console.table(bestResults);
    break;

  default:
    console.log(chalk.yellow('Available commands:\n'));
    console.log('  top [limit]     - Show top performers by return');
    console.log('  sharpe [limit]  - Show top performers by Sharpe ratio');
    console.log('  params <asset> <short> <long> <leverage> - Query specific parameters');
    console.log('  stats           - Show database statistics');
    console.log('  best            - Show best config for each asset');
    console.log('\nExample: bun query-backtests.ts top 20');
}

// Close database
db.close();

console.log('');