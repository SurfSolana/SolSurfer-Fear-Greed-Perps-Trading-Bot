import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

interface StrategyResult {
  asset: string;
  strategy: string;
  shortThreshold: number;
  longThreshold: number;
  leverage: number;
  totalReturn: number;
  monthlyReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  timeInMarket: number;
  liquidations: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const sortBy = searchParams.get('sortBy') || 'totalReturn'; // totalReturn, sharpeRatio, monthlyReturn
    const asset = searchParams.get('asset'); // optional: SOL | ETH | BTC

    // Connect to SQLite database
    const dbPath = path.join(process.cwd(), '..', 'backtesting', 'backtest-results', 'all-backtests.db');
    const db = new Database(dbPath, { readonly: true });

    // Build ORDER BY clause based on sortBy param
    let orderByColumn = 'total_return';
    switch (sortBy) {
      case 'sharpeRatio':
        orderByColumn = 'sharpe_ratio';
        break;
      case 'monthlyReturn':
        // Calculate monthly return from total_return (assuming 90 days of data)
        orderByColumn = 'total_return / 3'; // Approximation for monthly
        break;
      default:
        orderByColumn = 'total_return';
    }

    // Query top performing strategies from all assets
    const where = asset && asset !== 'all' ? 'WHERE asset = ?' : ''
    const params: any[] = []
    if (where) params.push(asset)
    params.push(limit)

    const query = `
      SELECT
        asset,
        strategy,
        short_threshold as shortThreshold,
        long_threshold as longThreshold,
        leverage,
        total_return as totalReturn,
        total_return / 3 as monthlyReturn,
        sharpe_ratio as sharpeRatio,
        max_drawdown as maxDrawdown,
        win_rate as winRate,
        num_trades as totalTrades,
        time_in_market as timeInMarket,
        liquidations
      FROM backtests
      ${where}
      ORDER BY ${orderByColumn} DESC
      LIMIT ?
    `;

    const strategies = db.prepare(query).all(...params) as StrategyResult[];

    // Get total count for metadata
  const countQuery = `SELECT COUNT(*) as count FROM backtests ${where}`
  const countResult = db.prepare(countQuery).get(where ? asset : undefined) as {count: number};

    db.close();

    // Add risk rating and recommendations
    const strategiesWithRisk = strategies.map(s => ({
      ...s,
      riskLevel: s.liquidations > 0 ? 'extreme' :
                 Math.abs(s.maxDrawdown) > 80 ? 'very-high' :
                 s.leverage >= 8 ? 'high' :
                 s.leverage >= 5 ? 'medium' : 'low',
      isRecommended: s.sharpeRatio > 1 && s.winRate > 50 && s.liquidations === 0
    }));

    return NextResponse.json({
      success: true,
      strategies: strategiesWithRisk,
      totalStrategiesAnalyzed: countResult.count
    });

  } catch (error) {
    console.error('Top strategies API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load top strategies' },
      { status: 500 }
    );
  }
}