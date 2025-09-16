import { NextRequest, NextResponse } from 'next/server'

const STARTING_BALANCE = 10_000

type Asset = 'SOL' | 'ETH' | 'BTC'
type Strategy = 'momentum' | 'contrarian'
type Timeframe = '15min' | '1h' | '4h'

interface BacktestRequestBody {
  asset?: string
  strategy?: string
  lowThreshold?: number
  highThreshold?: number
  leverage?: number
  timeframe?: string
}

interface HistoricalPoint {
  timestamp: string
  price: number
  fgi: number
}

interface EquityPoint {
  timestamp: string
  price: number
  balance: number
  pnl: number
  drawdown: number
  fgi: number
  score: number
}

interface TradeSummary {
  direction: 'long' | 'short'
  entryTimestamp: string
  exitTimestamp?: string
  entryPrice: number
  exitPrice?: number
  entryFgi: number
  exitFgi?: number
  pnl?: number
  returnPct?: number
  leverage: number
  durationMinutes?: number
}

interface SimulationResult {
  summary: {
    startBalance: number
    endBalance: number
    totalPnl: number
    totalReturnPct: number
    maxDrawdown: number
    trades: number
    winRate: number
    periodStart: string
    periodEnd: string
  }
  trades: TradeSummary[]
  equityCurve: EquityPoint[]
}

const VALID_ASSETS: Asset[] = ['SOL', 'ETH', 'BTC']
const VALID_STRATEGIES: Strategy[] = ['momentum', 'contrarian']
const VALID_TIMEFRAMES: Timeframe[] = ['15min', '1h', '4h']

function normalizeParams(body: BacktestRequestBody) {
  const asset = (body.asset || 'ETH').toUpperCase()
  if (!VALID_ASSETS.includes(asset as Asset)) {
    throw new Error('Invalid asset. Supported: SOL, ETH, BTC')
  }

  const strategy = (body.strategy || 'momentum').toLowerCase()
  if (!VALID_STRATEGIES.includes(strategy as Strategy)) {
    throw new Error('Invalid strategy. Supported: momentum, contrarian')
  }

  const timeframeRaw = (body.timeframe || '4h').toLowerCase()
  const timeframe = timeframeRaw === '15m' ? '15min' : timeframeRaw
  if (!VALID_TIMEFRAMES.includes(timeframe as Timeframe)) {
    throw new Error('Invalid timeframe. Supported: 15min, 1h, 4h')
  }

  const leverage = Number(body.leverage ?? 3)
  if (!Number.isFinite(leverage) || leverage < 1 || leverage > 20) {
    throw new Error('Leverage must be between 1 and 20')
  }

  const lowThreshold = Number(body.lowThreshold ?? 25)
  const highThreshold = Number(body.highThreshold ?? 75)
  if ([lowThreshold, highThreshold].some(value => !Number.isFinite(value))) {
    throw new Error('Thresholds must be numbers')
  }
  if (lowThreshold < 0 || highThreshold > 100 || lowThreshold >= highThreshold) {
    throw new Error('Thresholds must be within 0-100 and low < high')
  }

  return {
    asset: asset as Asset,
    strategy: strategy as Strategy,
    timeframe: timeframe as Timeframe,
    leverage,
    lowThreshold,
    highThreshold
  }
}

async function fetchHistoricalPoints(asset: Asset, timeframe: Timeframe): Promise<HistoricalPoint[]> {
  const url = `https://api.surfsolana.com/${asset}/${timeframe}/30_days.json`
  const response = await fetch(url, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(`Failed to fetch historical data (${response.status})`)
  }

  const payload = await response.json()
  const records = Array.isArray(payload) ? payload : payload?.data
  if (!Array.isArray(records)) {
    throw new Error('Unexpected data format from historical API')
  }

  const points: HistoricalPoint[] = []
  let lastPrice: number | null = null
  let lastFgi: number | null = null

  for (const entry of records) {
    const timestampRaw = entry.timestamp || entry.date
    if (!timestampRaw) continue

    const parsedPrice = Number(entry.price ?? entry.close ?? entry.raw?.price)
    const parsedFgi = Number(entry.fgi ?? entry.cfgi ?? entry.raw?.cfgi ?? entry.value)
    const timestamp = new Date(timestampRaw).toISOString()

    const price = Number.isFinite(parsedPrice) ? parsedPrice : lastPrice
    const fgi = Number.isFinite(parsedFgi) ? parsedFgi : lastFgi

    if (!Number.isFinite(price) || !Number.isFinite(fgi)) {
      continue
    }

    lastPrice = price
    lastFgi = fgi

    points.push({ timestamp, price, fgi })
  }

  points.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  if (points.length < 2) {
    throw new Error('Insufficient data to run backtest')
  }

  return points
}

function calculateUnrealizedPnl(direction: 'long' | 'short', entryPrice: number, currentPrice: number, positionNotional: number) {
  const priceDelta = direction === 'long'
    ? (currentPrice - entryPrice) / entryPrice
    : (entryPrice - currentPrice) / entryPrice
  return priceDelta * positionNotional
}

function runSimulation(points: HistoricalPoint[], params: ReturnType<typeof normalizeParams>): SimulationResult {
  let capital = STARTING_BALANCE
  let peakEquity = STARTING_BALANCE
  let maxDrawdown = 0

  type ActiveTrade = {
    direction: 'long' | 'short'
    entryTimestampMs: number
    entryPrice: number
    entryFgi: number
    notional: number
    capitalAtEntry: number
  }

  let activeTrade: ActiveTrade | null = null
  const trades: TradeSummary[] = []
  const equityCurve: EquityPoint[] = []

  const decideDirection = (fgi: number): 'long' | 'short' | null => {
    if (params.strategy === 'momentum') {
      if (fgi >= params.highThreshold) return 'long'
      if (fgi <= params.lowThreshold) return 'short'
      return null
    }
    if (fgi <= params.lowThreshold) return 'long'
    if (fgi >= params.highThreshold) return 'short'
    return null
  }

  const openTrade = (direction: 'long' | 'short', point: HistoricalPoint, timestampMs: number) => {
    const notional = capital * params.leverage
    activeTrade = {
      direction,
      entryTimestampMs: timestampMs,
      entryPrice: point.price,
      entryFgi: point.fgi,
      notional,
      capitalAtEntry: capital
    }
  }

  const closeTrade = (point: HistoricalPoint, timestampMs: number) => {
    if (!activeTrade) return
    const pnl = calculateUnrealizedPnl(activeTrade.direction, activeTrade.entryPrice, point.price, activeTrade.notional)
    capital = Number((capital + pnl).toFixed(2))

    const base = activeTrade.capitalAtEntry || STARTING_BALANCE
    trades.push({
      direction: activeTrade.direction,
      entryTimestamp: new Date(activeTrade.entryTimestampMs).toISOString(),
      exitTimestamp: point.timestamp,
      entryPrice: activeTrade.entryPrice,
      exitPrice: point.price,
      entryFgi: activeTrade.entryFgi,
      exitFgi: point.fgi,
      pnl: Number(pnl.toFixed(2)),
      returnPct: Number(((pnl / base) * 100).toFixed(2)),
      leverage: params.leverage,
      durationMinutes: Math.max(1, Math.round((timestampMs - activeTrade.entryTimestampMs) / 60000))
    })

    activeTrade = null
  }

  points.forEach((point, index) => {
    const timestampMs = new Date(point.timestamp).getTime()
    const desired = decideDirection(point.fgi)
    const isLastPoint = index === points.length - 1

    if (activeTrade) {
      if (desired && desired !== activeTrade.direction) {
        closeTrade(point, timestampMs)
        openTrade(desired, point, timestampMs)
      }
    } else if (desired) {
      openTrade(desired, point, timestampMs)
    }

    if (isLastPoint && activeTrade) {
      closeTrade(point, timestampMs)
    }

    const equity = activeTrade
      ? (() => {
          const unrealized = calculateUnrealizedPnl(
            activeTrade.direction,
            activeTrade.entryPrice,
            point.price,
            activeTrade.notional
          )
          return Number((capital + unrealized).toFixed(2))
        })()
      : capital

    peakEquity = Math.max(peakEquity, equity)
    const drawdown = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0
    maxDrawdown = Math.max(maxDrawdown, drawdown)

    const priceRounded = Number(point.price.toFixed(2))
    const fgiRounded = Number(point.fgi.toFixed(2))

    equityCurve.push({
      timestamp: point.timestamp,
      price: priceRounded,
      balance: equity,
      pnl: Number((equity - STARTING_BALANCE).toFixed(2)),
      drawdown: Number(drawdown.toFixed(2)),
      fgi: fgiRounded,
      score: fgiRounded
    })
  })

  const closedTrades = trades.filter(trade => typeof trade.pnl === 'number')
  const winningTrades = closedTrades.filter(trade => (trade.pnl ?? 0) > 0)
  const finalBalance = equityCurve.length ? equityCurve[equityCurve.length - 1].balance : capital

  const summary = {
    startBalance: STARTING_BALANCE,
    endBalance: Number(finalBalance.toFixed(2)),
    totalPnl: Number((finalBalance - STARTING_BALANCE).toFixed(2)),
    totalReturnPct: Number((((finalBalance - STARTING_BALANCE) / STARTING_BALANCE) * 100).toFixed(2)),
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    trades: closedTrades.length,
    winRate: closedTrades.length ? Number(((winningTrades.length / closedTrades.length) * 100).toFixed(2)) : 0,
    periodStart: points[0].timestamp,
    periodEnd: points[points.length - 1].timestamp
  }

  return { summary, trades, equityCurve }
}


export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as BacktestRequestBody
    const params = normalizeParams(body)
    const points = await fetchHistoricalPoints(params.asset, params.timeframe)
    const result = runSimulation(points, params)

    return NextResponse.json({
      success: true,
      data: result,
      metadata: params
    })
  } catch (error: any) {
    console.error('[rolling-backtest] error', error)
    return NextResponse.json({
      success: false,
      error: error?.message || 'Failed to run backtest'
    }, { status: 400 })
  }
}
