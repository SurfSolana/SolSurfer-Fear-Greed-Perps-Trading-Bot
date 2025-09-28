import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

// Open the consolidated database (same as other APIs)
const dbPath = path.join(process.cwd(), '..', 'backtesting', 'backtest-results', 'all-backtests.db');
const db = new Database(dbPath, { readonly: true });

// Type for backtest results
interface BacktestResult {
  asset: string;
  strategy: string;
  short_threshold: number;
  long_threshold: number;
  extreme_low_threshold: number;
  extreme_high_threshold: number;
  override_count: number;
  leverage: number;
  total_return: number;
  sharpe_ratio: number;
  max_drawdown: number;
  num_trades: number;
  win_rate: number;
  liquidations: number;
  time_in_market: number;
  fees: number;
  funding: number;
  timestamp: string;
  run_id: string;
}

// Prepared queries
const getByParams = db.prepare(`
  SELECT * FROM backtests
  WHERE asset = ? AND strategy = ?
    AND short_threshold = ? AND long_threshold = ?
    AND leverage = ?
    AND extreme_low_threshold = ? AND extreme_high_threshold = ?
  ORDER BY timestamp DESC
  LIMIT 1
`);

const getBestForAsset = db.prepare(`
  SELECT * FROM backtests
  WHERE asset = ? AND strategy = ?
    AND extreme_low_threshold = ? AND extreme_high_threshold = ?
  ORDER BY total_return DESC
  LIMIT 10
`);

const getAllForAssetStrategy = db.prepare(`
  SELECT * FROM backtests
  WHERE asset = ? AND strategy = ?
    AND extreme_low_threshold = ? AND extreme_high_threshold = ?
  ORDER BY short_threshold, long_threshold, leverage
`);

const getStats = db.prepare(`
  SELECT
    COUNT(*) as total_runs,
    AVG(total_return) as avg_return,
    MAX(total_return) as max_return,
    MIN(total_return) as min_return,
    AVG(sharpe_ratio) as avg_sharpe,
    AVG(max_drawdown) as avg_drawdown
  FROM backtests
  WHERE asset = ? AND strategy = ?
    AND extreme_low_threshold = ? AND extreme_high_threshold = ?
`);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const asset = searchParams.get('asset') || 'ETH';
    const strategy = searchParams.get('strategy') || 'momentum';
    const fgiThreshold = searchParams.get('fgi');
    const leverage = searchParams.get('leverage');
    const extremeLowParam = searchParams.get('extremeLow');
    const extremeHighParam = searchParams.get('extremeHigh');

    const extremeLow = extremeLowParam !== null ? parseInt(extremeLowParam, 10) : 0;
    const extremeHigh = extremeHighParam !== null ? parseInt(extremeHighParam, 10) : 100;

    if (
      Number.isNaN(extremeLow) || Number.isNaN(extremeHigh) ||
      extremeLow < 0 || extremeLow > 100 ||
      extremeHigh < 0 || extremeHigh > 100 ||
      extremeLow > extremeHigh
    ) {
      return NextResponse.json(
        { success: false, error: 'Invalid extreme thresholds. Provide values between 0-100 with extremeLow ≤ extremeHigh.' },
        { status: 400 }
      );
    }

    // For momentum strategy, fgi is the long threshold
    // For contrarian, it's the short threshold
    const shortThreshold = strategy === 'contrarian' ? parseInt(fgiThreshold || '30') : 100 - parseInt(fgiThreshold || '50');
    const longThreshold = strategy === 'momentum' ? parseInt(fgiThreshold || '50') : 100 - parseInt(fgiThreshold || '70');

    // If specific parameters requested, return just that result
    if (fgiThreshold && leverage) {
      const result = getByParams.get(
        asset.toUpperCase(),
        strategy,
        shortThreshold,
        longThreshold,
        parseInt(leverage),
        extremeLow,
        extremeHigh
      ) as BacktestResult | undefined;

      if (result) {
        return NextResponse.json({
          success: true,
          data: {
            totalReturn: result.total_return,
            monthlyReturn: result.total_return / 12, // Assuming annual return
            sharpeRatio: result.sharpe_ratio,
            maxDrawdown: result.max_drawdown,
            numTrades: result.num_trades,
            winRate: result.win_rate,
            liquidations: result.liquidations,
            timeInMarket: result.time_in_market,
            fees: result.fees,
            funding: result.funding,
            overrideCount: result.override_count,
            extremeLowThreshold: result.extreme_low_threshold,
            extremeHighThreshold: result.extreme_high_threshold
          },
          metadata: {
            asset,
            strategy,
            fgiThreshold: parseInt(fgiThreshold),
            leverage: parseInt(leverage),
            timestamp: result.timestamp,
            runId: result.run_id,
            extremeLowThreshold: result.extreme_low_threshold,
            extremeHighThreshold: result.extreme_high_threshold
          }
        });
      } else {
        return NextResponse.json(
          { success: false, error: 'No data for specified parameters' },
          { status: 404 }
        );
      }
    }

    // Get all results for asset/strategy combination
    const allResults = getAllForAssetStrategy.all(asset.toUpperCase(), strategy, extremeLow, extremeHigh) as BacktestResult[];

    // Transform to nested structure for compatibility
    const resultsMap: any = {};
    for (const result of allResults) {
      // Calculate FGI threshold based on strategy
      const fgi = strategy === 'momentum'
        ? result.long_threshold
        : result.short_threshold;

      if (!resultsMap[fgi]) {
        resultsMap[fgi] = {};
      }

      resultsMap[fgi][result.leverage] = {
        totalReturn: result.total_return,
        monthlyReturn: result.total_return / 12,
        sharpeRatio: result.sharpe_ratio,
        maxDrawdown: result.max_drawdown,
        numTrades: result.num_trades,
        winRate: result.win_rate,
        liquidations: result.liquidations,
        timeInMarket: result.time_in_market,
        fees: result.fees,
        funding: result.funding,
        overrideCount: result.override_count,
        extremeLowThreshold: result.extreme_low_threshold,
        extremeHighThreshold: result.extreme_high_threshold
      };
    }

    // Get best performers
    const bestPerformers = getBestForAsset.all(asset.toUpperCase(), strategy, extremeLow, extremeHigh) as BacktestResult[];

    // Get statistics
    const stats = getStats.get(asset.toUpperCase(), strategy, extremeLow, extremeHigh) as any;

    return NextResponse.json({
      success: true,
      data: resultsMap,
      bestPerformers: bestPerformers.map(p => ({
        fgiThreshold: strategy === 'momentum' ? p.long_threshold : p.short_threshold,
        leverage: p.leverage,
        totalReturn: p.total_return,
        monthlyReturn: p.total_return / 12,
        sharpeRatio: p.sharpe_ratio,
        overrideCount: p.override_count,
        extremeLowThreshold: p.extreme_low_threshold,
        extremeHighThreshold: p.extreme_high_threshold
      })),
      metadata: {
        asset,
        strategy,
        totalBacktests: stats.total_runs,
        avgReturn: stats.avg_return,
        maxReturn: stats.max_return,
        minReturn: stats.min_return,
        avgSharpe: stats.avg_sharpe,
        avgDrawdown: stats.avg_drawdown,
        extremeLowThreshold: extremeLow,
        extremeHighThreshold: extremeHigh,
        source: 'sqlite-consolidated',
        dbPath: 'backtesting/backtest-results/all-backtests.db'
      }
    });

  } catch (error) {
    console.error('SQLite backtest API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to query backtest database' },
      { status: 500 }
    );
  }
}
