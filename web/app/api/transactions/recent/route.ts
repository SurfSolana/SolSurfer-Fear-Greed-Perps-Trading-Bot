import { NextResponse } from 'next/server'

export async function GET() {
  // Mock recent transactions data
  const transactions = [
    {
      id: 'tx_001',
      timestamp: new Date().toISOString(),
      type: 'BUY',
      asset: 'SOL',
      amount: 0.5,
      price: 142.34,
      pnl: 2.34,
      fgiValue: 22,
      strategy: 'contrarian'
    },
    {
      id: 'tx_002',
      timestamp: new Date(Date.now() - 300000).toISOString(),
      type: 'SELL',
      asset: 'SOL',
      amount: 0.3,
      price: 145.67,
      pnl: 1.23,
      fgiValue: 67,
      strategy: 'contrarian'
    }
  ]

  return NextResponse.json(transactions)
}