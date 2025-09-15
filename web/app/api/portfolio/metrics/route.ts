import { NextResponse } from 'next/server'

export async function GET() {
  // Mock portfolio metrics data
  const metrics = {
    totalValue: 125.43,
    dailyPnL: 12.34,
    totalPnL: 25.43,
    winRate: 0.72,
    totalTrades: 148,
    avgTradeSize: 0.85,
    maxDrawdown: -8.2,
    sharpeRatio: 1.42
  }

  return NextResponse.json(metrics)
}