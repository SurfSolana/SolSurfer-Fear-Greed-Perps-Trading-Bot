'use client'

import { useMemo, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Line, Legend, Scatter } from 'recharts'
import { Loader2 } from 'lucide-react'

type EquityPoint = {
  timestamp: string
  price: number
  balance: number
  pnl: number
  drawdown: number
  fgi: number
  score?: number
}

type Summary = {
  startBalance: number
  endBalance: number
  totalReturnPct: number
  totalPnl: number
  maxDrawdown: number
  trades: number
  winRate: number
  periodStart: string
  periodEnd: string
}

type TradeRecord = {
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

type ChartPoint = EquityPoint & {
  fgiValue: number
  timestampMs: number
}

type TradeMarkerPoint = ChartPoint & {
  tradeType: 'entry' | 'exit'
  tradeDirection: 'long' | 'short'
  trade: TradeRecord
}

type TooltipPayload = ChartPoint & {
  tradeType?: 'entry' | 'exit'
  tradeDirection?: 'long' | 'short'
  trade?: TradeRecord
}

type ThresholdLineConfig = {
  value: number
  color: string
  label: string
  position: 'left' | 'right'
}

interface BacktestEquityChartProps {
  data: EquityPoint[]
  summary?: Summary
  loading?: boolean
  trades?: TradeRecord[]
  thresholds?: {
    low: number
    high: number
  }
  strategy?: 'momentum' | 'contrarian'
}

const LONG_COLOR = '#22c55e'
const SHORT_COLOR = '#f87171'
const FEAR_COLOR = '#f87171'
const GREED_COLOR = '#22c55e'

const formatCurrency = (value: number) => {
  if (!Number.isFinite(value)) return '$0'
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`
}

const formatPercent = (value: number) => {
  if (!Number.isFinite(value)) return '0%'
  return `${value.toFixed(2)}%`
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null
  const tradePayload = payload.find((item: any) => item?.payload?.tradeType)
  const primaryPayload = tradePayload ?? payload[0]
  const areaPayload = payload.find((item: any) => item?.dataKey === 'balance')
  const point = (primaryPayload?.payload ?? areaPayload?.payload) as TooltipPayload | undefined
  if (!point) return null
  const timestampSource = point?.timestamp ?? label
  const timestamp = new Date(timestampSource)
  const scoreValue = typeof point.fgiValue === 'number'
    ? point.fgiValue
    : typeof point.score === 'number'
      ? point.score
      : point.fgi
  const score = Number.isFinite(scoreValue) ? Number(scoreValue) : null
  const price = Number.isFinite(point.price) ? point.price : undefined
  const tradeType = point.tradeType
  const trade = point.trade
  const direction = point.tradeDirection
  const tradeLabel = tradeType
    ? `${tradeType === 'entry' ? 'Entry' : 'Exit'}${direction ? ` (${direction.toUpperCase()})` : ''}`
    : null

  return (
    <div className="rounded-md border border-border bg-background/90 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <div className="font-semibold text-foreground">
        {timestamp.toLocaleDateString()} {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
      {typeof price === 'number' && (
        <div className="text-muted-foreground">Price: <span className="text-foreground">{formatCurrency(price)}</span></div>
      )}
      <div className="text-muted-foreground">Balance: <span className="text-foreground">{formatCurrency(point.balance)}</span></div>
      <div className="text-muted-foreground">PnL: <span className={point.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>{formatCurrency(point.pnl)}</span></div>
      <div className="text-muted-foreground">Drawdown: <span className={point.drawdown >= 0 ? 'text-amber-300' : 'text-foreground'}>{formatPercent(point.drawdown)}</span></div>
      {typeof score === 'number' && (
        <div className="text-muted-foreground">Score: <span className="text-foreground">{score.toFixed(0)}</span></div>
      )}
      {trade && tradeLabel && (
        <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
          <div className="text-muted-foreground">Trade: <span className="text-foreground">{tradeLabel}</span></div>
          {tradeType === 'entry' ? (
            <>
              <div className="text-muted-foreground">Entry Price: <span className="text-foreground">{formatCurrency(trade.entryPrice)}</span></div>
              <div className="text-muted-foreground">Entry FGI: <span className="text-foreground">{Math.round(trade.entryFgi)}</span></div>
            </>
          ) : (
            <>
              {typeof trade.exitPrice === 'number' && (
                <div className="text-muted-foreground">Exit Price: <span className="text-foreground">{formatCurrency(trade.exitPrice)}</span></div>
              )}
              {typeof trade.exitFgi === 'number' && (
                <div className="text-muted-foreground">Exit FGI: <span className="text-foreground">{Math.round(trade.exitFgi)}</span></div>
              )}
              {typeof trade.pnl === 'number' && (
                <div className="text-muted-foreground">Trade PnL: <span className={trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>{formatCurrency(trade.pnl)}</span></div>
              )}
              {typeof trade.returnPct === 'number' && (
                <div className="text-muted-foreground">Return: <span className={trade.returnPct >= 0 ? 'text-green-400' : 'text-red-400'}>{formatPercent(trade.returnPct)}</span></div>
              )}
              {typeof trade.durationMinutes === 'number' && (
                <div className="text-muted-foreground">Duration: <span className="text-foreground">{trade.durationMinutes} min</span></div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

const EntryMarker = ({ cx, cy, payload }: any) => {
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) return null
  const direction = payload.tradeDirection === 'short' ? 'short' : 'long'
  const fill = direction === 'long' ? LONG_COLOR : SHORT_COLOR

  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <circle r={6} fill={fill} stroke="#0f172a" strokeWidth={2} />
    </g>
  )
}

const ExitMarker = ({ cx, cy, payload }: any) => {
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) return null
  const direction = payload.tradeDirection === 'short' ? 'short' : 'long'
  const stroke = direction === 'long' ? LONG_COLOR : SHORT_COLOR

  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <circle r={7} fill="#0f172a" stroke={stroke} strokeWidth={2} />
      <line x1={-3.5} y1={-3.5} x2={3.5} y2={3.5} stroke={stroke} strokeWidth={1.5} />
      <line x1={-3.5} y1={3.5} x2={3.5} y2={-3.5} stroke={stroke} strokeWidth={1.5} />
    </g>
  )
}

export function BacktestEquityChart({ data, summary, loading, trades = [], thresholds, strategy = 'momentum' }: BacktestEquityChartProps) {
  const chartData = useMemo(() => {
    return (data || [])
      .map((point) => {
        const fgiRaw = Number.isFinite(point.fgi)
          ? Number(point.fgi)
          : Number.isFinite(point.score)
            ? Number(point.score)
            : null

        const timestampMs = new Date(point.timestamp).getTime()

        if (!Number.isFinite(point.balance) || fgiRaw === null || !Number.isFinite(timestampMs)) {
          return null
        }

        return {
          ...point,
          fgiValue: Number(fgiRaw),
          timestampMs
        }
      })
      .filter((point): point is ChartPoint => Boolean(point))
  }, [data])

  const { minBalance, maxBalance } = useMemo(() => {
    if (!chartData || chartData.length === 0) {
      return { minBalance: 0, maxBalance: 0 }
    }
    const balances = chartData.map(point => point.balance)
    return {
      minBalance: Math.min(...balances),
      maxBalance: Math.max(...balances)
    }
  }, [chartData])

  const dataByTimestamp = useMemo(() => {
    const map = new Map<string, ChartPoint>()
    chartData.forEach(point => {
      map.set(point.timestamp, point)
    })
    return map
  }, [chartData])

  const { entryMarkers, exitMarkers } = useMemo(() => {
    if (!trades || trades.length === 0) {
      return { entryMarkers: [] as TradeMarkerPoint[], exitMarkers: [] as TradeMarkerPoint[] }
    }

    const entries: TradeMarkerPoint[] = []
    const exits: TradeMarkerPoint[] = []

    trades.forEach((trade) => {
      const entryTimestamp = new Date(trade.entryTimestamp).toISOString()
      const entryPoint = dataByTimestamp.get(entryTimestamp)

      if (entryPoint) {
        entries.push({
          ...entryPoint,
          tradeType: 'entry',
          tradeDirection: trade.direction,
          trade
        })
      }

      if (trade.exitTimestamp) {
        const exitTimestamp = new Date(trade.exitTimestamp).toISOString()
        const exitPoint = dataByTimestamp.get(exitTimestamp)
        if (exitPoint) {
          exits.push({
            ...exitPoint,
            tradeType: 'exit',
            tradeDirection: trade.direction,
            trade
          })
        }
      }
    })

    return { entryMarkers: entries, exitMarkers: exits }
  }, [trades, dataByTimestamp])

  const thresholdConfig = useMemo<Record<'fear' | 'greed', ThresholdLineConfig> | null>(() => {
    if (!thresholds) return null
    const low = Number(thresholds.low)
    const high = Number(thresholds.high)

    if (!Number.isFinite(low) || !Number.isFinite(high)) {
      return null
    }

    const fear: ThresholdLineConfig = {
      value: low,
      color: FEAR_COLOR,
      label: `Fear (${strategy === 'contrarian' ? 'Long' : 'Short'} trigger)`,
      position: strategy === 'contrarian' ? 'right' : 'left'
    }

    const greed: ThresholdLineConfig = {
      value: high,
      color: GREED_COLOR,
      label: `Greed (${strategy === 'momentum' ? 'Long' : 'Short'} trigger)`,
      position: strategy === 'momentum' ? 'right' : 'left'
    }

    return { fear, greed }
  }, [thresholds, strategy])

  return (
    <Card className="border-border bg-background/60">
      <CardHeader className="space-y-2">
        <CardTitle className="text-base font-semibold">PnL Curve (Starting Capital $10,000)</CardTitle>
        {summary && (
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <div>
              <span className="uppercase tracking-wide">Final Balance</span>
              <div className="text-foreground">{formatCurrency(summary.endBalance)}</div>
            </div>
            <div>
              <span className="uppercase tracking-wide">Total Return</span>
              <div className={summary.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                {formatCurrency(summary.totalPnl)} ({formatPercent(summary.totalReturnPct)})
              </div>
            </div>
            <div>
              <span className="uppercase tracking-wide">Max Drawdown</span>
              <div className="text-amber-300">{formatPercent(summary.maxDrawdown)}</div>
            </div>
            <div>
              <span className="uppercase tracking-wide">Trades</span>
              <div className="text-foreground">{summary.trades}</div>
            </div>
            <div>
              <span className="uppercase tracking-wide">Win Rate</span>
              <div className="text-foreground">{formatPercent(summary.winRate)}</div>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="h-80">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-foreground" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Run the backtest to visualize performance.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="timestampMs"
                type="number"
                domain={['dataMin', 'dataMax']}
                scale="time"
                stroke="#64748b"
                fontSize={12}
                tickFormatter={(value) => new Date(value).toLocaleDateString()}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="fgi"
                domain={[0, 100]}
                stroke="#f97316"
                tickFormatter={(value) => `${Math.round(value)}`}
                fontSize={12}
                axisLine={false}
                tickLine={false}
                label={{ value: 'FGI', angle: -90, position: 'insideLeft', fill: '#f97316', fontSize: 11, offset: 10 }}
              />
              <YAxis
                yAxisId="balance"
                domain={[minBalance * 0.98, maxBalance * 1.02]}
                orientation="right"
                stroke="#64748b"
                tickFormatter={(value) => `$${Math.round(value).toLocaleString()}`}
                fontSize={12}
                axisLine={false}
                tickLine={false}
                label={{ value: 'Equity', angle: 90, position: 'insideRight', fill: '#94a3b8', fontSize: 11, offset: -5 }}
              />
              {thresholdConfig && (
                <>
                  <ReferenceLine
                    yAxisId="fgi"
                    y={thresholdConfig.fear.value}
                    stroke={thresholdConfig.fear.color}
                    strokeDasharray="6 3"
                    strokeWidth={1.5}
                    label={{
                      value: thresholdConfig.fear.label,
                      position: thresholdConfig.fear.position,
                      fill: thresholdConfig.fear.color,
                      fontSize: 11
                    }}
                  />
                  <ReferenceLine
                    yAxisId="fgi"
                    y={thresholdConfig.greed.value}
                    stroke={thresholdConfig.greed.color}
                    strokeDasharray="6 3"
                    strokeWidth={1.5}
                    label={{
                      value: thresholdConfig.greed.label,
                      position: thresholdConfig.greed.position,
                      fill: thresholdConfig.greed.color,
                      fontSize: 11
                    }}
                  />
                </>
              )}
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#334155', strokeWidth: 1 }} />
              <Legend
                verticalAlign="top"
                align="right"
                iconSize={10}
                wrapperStyle={{ color: '#cbd5f5', fontSize: 11 }}
              />
              <ReferenceLine yAxisId="balance" y={10000} stroke="#475569" strokeDasharray="4 4" />
              <Area
                type="monotone"
                dataKey="balance"
                yAxisId="balance"
                stroke="#22d3ee"
                strokeWidth={2.5}
                fill="url(#pnlGradient)"
                dot={false}
                isAnimationActive={false}
                name="Equity"
              />
              <Line
                type="monotone"
                dataKey="fgiValue"
                yAxisId="fgi"
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="FGI Score"
              />
              {entryMarkers.length > 0 && (
                <Scatter
                  name="Trade Entry"
                  data={entryMarkers}
                  yAxisId="fgi"
                  dataKey="fgiValue"
                  shape={EntryMarker}
                  legendType="circle"
                  isAnimationActive={false}
                />
              )}
              {exitMarkers.length > 0 && (
                <Scatter
                  name="Trade Exit"
                  data={exitMarkers}
                  yAxisId="fgi"
                  dataKey="fgiValue"
                  shape={ExitMarker}
                  legendType="circle"
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
