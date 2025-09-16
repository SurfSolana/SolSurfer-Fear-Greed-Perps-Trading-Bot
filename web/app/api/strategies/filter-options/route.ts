import { NextResponse } from 'next/server'
import Database from 'better-sqlite3'
import path from 'path'

export async function GET() {
  try {
    const dbPath = path.join(process.cwd(), '..', 'backtesting', 'backtest-results', 'all-backtests.db')
    const db = new Database(dbPath, { readonly: true })

    // Get all unique values for each filterable field
    const assets = db.prepare('SELECT DISTINCT asset FROM backtests ORDER BY asset').all()
    const strategies = db.prepare('SELECT DISTINCT strategy FROM backtests ORDER BY strategy').all()
    const leverages = db.prepare('SELECT DISTINCT leverage FROM backtests ORDER BY leverage').all()
    
    // Get distinct threshold combinations
    const thresholdRanges = db.prepare('SELECT DISTINCT short_threshold, long_threshold FROM backtests ORDER BY short_threshold, long_threshold').all()

    // Get min/max values for range filters
    const ranges = db.prepare(`
      SELECT
        MIN(sharpe_ratio) as minSharpe,
        MAX(sharpe_ratio) as maxSharpe,
        MIN(max_drawdown) as minDrawdown,
        MAX(max_drawdown) as maxDrawdown,
        MIN(win_rate) as minWinRate,
        MAX(win_rate) as maxWinRate,
        MIN(time_in_market) as minTimeInMarket,
        MAX(time_in_market) as maxTimeInMarket,
        MIN(num_trades) as minTrades,
        MAX(num_trades) as maxTrades,
        MIN(fees) as minFees,
        MAX(fees) as maxFees,
        MIN(funding) as minFunding,
        MAX(funding) as maxFunding,
        MIN(total_return) as minReturn,
        MAX(total_return) as maxReturn
      FROM backtests
    `).get()

    db.close()

    return NextResponse.json({
      success: true,
      options: {
        assets: assets.map((r: any) => r.asset),
        strategies: strategies.map((r: any) => r.strategy),
        leverages: leverages.map((r: any) => r.leverage).sort((a: number, b: number) => a - b),
        thresholdRanges: thresholdRanges.map((r: any) => ({
          short: r.short_threshold,
          long: r.long_threshold
        })),
        ranges: {
          sharpeRatio: { min: ranges.minSharpe, max: ranges.maxSharpe },
          drawdown: { min: Math.abs(ranges.maxDrawdown), max: Math.abs(ranges.minDrawdown) },
          winRate: { min: ranges.minWinRate, max: ranges.maxWinRate },
          timeInMarket: { min: ranges.minTimeInMarket, max: ranges.maxTimeInMarket },
          trades: { min: ranges.minTrades, max: ranges.maxTrades },
          fees: { min: ranges.minFees, max: ranges.maxFees },
          funding: { min: ranges.minFunding, max: ranges.maxFunding },
          totalReturn: { min: ranges.minReturn, max: ranges.maxReturn }
        }
      }
    })
  } catch (error) {
    console.error('Failed to fetch filter options:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch filter options',
      options: {
        assets: ['ETH', 'BTC', 'SOL'],
        strategies: ['momentum', 'contrarian'],
        leverages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        ranges: {
          sharpeRatio: { min: -2, max: 5 },
          drawdown: { min: 0, max: 100 },
          winRate: { min: 0, max: 100 },
          timeInMarket: { min: 0, max: 100 },
          trades: { min: 0, max: 1000 },
          fees: { min: -10000, max: 0 },
          funding: { min: -10000, max: 10000 },
          totalReturn: { min: -100, max: 5000 }
        }
      }
    }, { status: 200 })
  }
}