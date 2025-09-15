#!/usr/bin/env bun

import Decimal from 'decimal.js';

interface CommandArgs {
  asset: string;
  timeframe: string;
  fgi: number;
  leverage: number;
  strategy: 'momentum' | 'contrarian';
  days: number;
  json: boolean;
}

function parseArgs(): CommandArgs {
  const args = process.argv.slice(2);
  const params: Partial<CommandArgs> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = args[i + 1];

    switch (arg) {
      case '--asset':
        params.asset = value;
        i++;
        break;
      case '--timeframe':
        params.timeframe = value;
        i++;
        break;
      case '--fgi':
        params.fgi = parseInt(value);
        i++;
        break;
      case '--leverage':
        params.leverage = parseInt(value);
        i++;
        break;
      case '--strategy':
        params.strategy = value as 'momentum' | 'contrarian';
        i++;
        break;
      case '--days':
        params.days = parseInt(value);
        i++;
        break;
      case '--json':
        params.json = true;
        break;
    }
  }

  return {
    asset: params.asset || 'ETH',
    timeframe: params.timeframe || '4h',
    fgi: params.fgi || 50,
    leverage: params.leverage || 1,
    strategy: params.strategy || 'momentum',
    days: params.days || 365,
    json: params.json || false
  };
}

async function fetchHistoricalData(asset: string, timeframe: string) {
  const url = `https://api.surfsolana.com/${asset}/${timeframe}/1_year.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch data: ${response.statusText}`);
  }
  const data = await response.json();
  return data;
}

function calculateRollingFGI(data: any[], windowDays: number = 30): any[] {
  const result = [];
  const windowSize = windowDays * (24 / (timeframe === '1h' ? 1 : 4)); // Adjust for timeframe

  for (let i = 0; i < data.length; i++) {
    if (i < windowSize - 1) {
      result.push({
        ...data[i],
        rollingFGI: data[i].fgi
      });
    } else {
      const window = data.slice(i - windowSize + 1, i + 1);
      const avgFGI = window.reduce((sum, d) => sum + d.fgi, 0) / window.length;
      result.push({
        ...data[i],
        rollingFGI: avgFGI
      });
    }
  }

  return result;
}

function runBacktest(
  data: any[],
  fgiThreshold: number,
  leverage: number,
  strategy: 'momentum' | 'contrarian'
) {
  let capital = new Decimal(10000);
  let position = new Decimal(0);
  let entryPrice = new Decimal(0);
  let trades = [];
  let inPosition = false;

  for (let i = 0; i < data.length; i++) {
    const candle = data[i];
    if (!candle.close || candle.rollingFGI === undefined) continue;
    const price = new Decimal(candle.close);
    const fgi = candle.rollingFGI;

    const shouldLong = strategy === 'momentum' ? fgi >= fgiThreshold : fgi <= fgiThreshold;
    const shouldShort = strategy === 'momentum' ? fgi < fgiThreshold : fgi > fgiThreshold;

    if (!inPosition) {
      if (shouldLong || shouldShort) {
        position = capital.mul(leverage);
        entryPrice = price;
        inPosition = true;
        trades.push({
          type: shouldLong ? 'LONG' : 'SHORT',
          entryPrice: price.toNumber(),
          entryFGI: fgi,
          timestamp: candle.timestamp
        });
      }
    } else {
      const currentTrade = trades[trades.length - 1];
      const isLong = currentTrade.type === 'LONG';

      if ((isLong && shouldShort) || (!isLong && shouldLong) || i === data.length - 1) {
        const pnl = isLong
          ? position.mul(price.sub(entryPrice)).div(entryPrice)
          : position.mul(entryPrice.sub(price)).div(entryPrice);

        capital = capital.add(pnl);
        currentTrade.exitPrice = price.toNumber();
        currentTrade.exitFGI = fgi;
        currentTrade.pnl = pnl.toNumber();
        currentTrade.returnPct = pnl.div(capital.sub(pnl)).mul(100).toNumber();

        inPosition = false;
        position = new Decimal(0);

        if (capital.lte(0)) {
          break; // Liquidated
        }
      }
    }
  }

  const totalReturn = capital.sub(10000).div(100).toNumber();
  const winningTrades = trades.filter(t => t.pnl && t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl && t.pnl < 0);
  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;

  // Calculate Sharpe ratio (simplified)
  const returns = trades.map(t => t.returnPct || 0);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const stdDev = Math.sqrt(
    returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length || 1)
  );
  const sharpeRatio = stdDev !== 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  // Calculate max drawdown
  let peak = 10000;
  let maxDrawdown = 0;
  let runningCapital = 10000;

  for (const trade of trades) {
    runningCapital += trade.pnl;
    if (runningCapital > peak) {
      peak = runningCapital;
    }
    const drawdown = ((peak - runningCapital) / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return {
    fgiThreshold,
    leverage,
    totalReturn,
    sharpeRatio,
    maxDrawdown,
    winRate,
    totalTrades: trades.length,
    avgWin: winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + t.returnPct, 0) / winningTrades.length
      : 0,
    avgLoss: losingTrades.length > 0
      ? losingTrades.reduce((sum, t) => sum + t.returnPct, 0) / losingTrades.length
      : 0,
    profitFactor: losingTrades.length > 0
      ? Math.abs(winningTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.reduce((sum, t) => sum + t.pnl, 0))
      : winningTrades.length > 0 ? Infinity : 0,
    monthlyReturns: [], // Simplified - not calculating monthly
    dateRange: {
      start: data[0].timestamp,
      end: data[data.length - 1].timestamp
    }
  };
}

async function main() {
  const args = parseArgs();

  if (!args.json) {
    console.log(`Running backtest: ${args.asset} ${args.strategy} FGI=${args.fgi} Lev=${args.leverage}x`);
  }

  try {
    // Fetch historical data
    const data = await fetchHistoricalData(args.asset, args.timeframe);

    // Filter to requested days
    const cutoffDate = Date.now() - (args.days * 24 * 60 * 60 * 1000);
    const filteredData = data.filter((d: any) => new Date(d.timestamp).getTime() >= cutoffDate);

    // Calculate rolling FGI
    const dataWithRolling = calculateRollingFGI(filteredData, 30);

    // Run backtest
    const result = runBacktest(dataWithRolling, args.fgi, args.leverage, args.strategy);

    if (args.json) {
      console.log(JSON.stringify(result));
    } else {
      console.log('\nResults:');
      console.log(`Total Return: ${result.totalReturn.toFixed(2)}%`);
      console.log(`Sharpe Ratio: ${result.sharpeRatio.toFixed(2)}`);
      console.log(`Max Drawdown: ${result.maxDrawdown.toFixed(2)}%`);
      console.log(`Win Rate: ${result.winRate.toFixed(2)}%`);
      console.log(`Total Trades: ${result.totalTrades}`);
    }
  } catch (error) {
    if (!args.json) {
      console.error('Error:', error);
    }
    process.exit(1);
  }
}

const timeframe = parseArgs().timeframe;
main();