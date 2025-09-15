import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

interface TradeData {
  timestamp?: string
  action?: string
  asset?: string
  price?: number
  size?: number
  fgi?: number
  pnl?: number
  fees?: number
  balance?: number
}

interface DailyPerformance {
  date?: string
  trades?: TradeData[]
}

export async function GET(request: NextRequest) {
  try {
    const transactions = []
    
    // Read trade logs from state files
    const logsDir = path.join(process.cwd(), '..', 'data', 'performance')
    const files = fs.existsSync(logsDir) ? fs.readdirSync(logsDir) : []

    // Look for daily performance files
    const perfFiles = files.filter(f => f.startsWith('daily-performance-') && f.endsWith('.json'))
    
    for (const file of perfFiles) {
      try {
        const content = fs.readFileSync(path.join(logsDir, file), 'utf-8')
        const data = JSON.parse(content)
        
        if (data.trades && Array.isArray(data.trades)) {
          const performanceData = data as DailyPerformance
          transactions.push(...performanceData.trades!.map((trade: TradeData, index: number) => ({
            id: `${file}-${index}`,
            timestamp: trade.timestamp || performanceData.date || new Date().toISOString(),
            action: trade.action || 'UNKNOWN',
            asset: trade.asset || 'SOL',
            price: trade.price || 0,
            size: trade.size || 0,
            fgi: trade.fgi || 50,
            pnl: trade.pnl,
            fees: trade.fees || 0,
            balance: trade.balance || 10000
          })))
        }
      } catch (error) {
        console.error(`Failed to parse ${file}:`, error)
      }
    }
    
    // Sort by timestamp (newest first)
    transactions.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    
    return NextResponse.json(transactions)
  } catch (error) {
    console.error('Failed to get trades:', error)
    return NextResponse.json([])
  }
}