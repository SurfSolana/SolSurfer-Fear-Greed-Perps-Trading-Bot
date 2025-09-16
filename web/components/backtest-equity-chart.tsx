'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import { Loader2 } from 'lucide-react'

type EquityPoint = {
  timestamp: string
  balance: number
  pnl: number
  drawdown: number
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

interface BacktestEquityChartProps {
  data: EquityPoint[]
  summary?: Summary
  loading?: boolean
}

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
  const point = payload[0]?.payload as EquityPoint | undefined
  if (!point) return null
  const timestamp = new Date(label)

  return (
    <div className="rounded-md border border-border bg-background/90 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <div className="font-semibold text-foreground">
        {timestamp.toLocaleDateString()} {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div className="text-muted-foreground">Balance: <span className="text-foreground">{formatCurrency(point.balance)}</span></div>
      <div className="text-muted-foreground">PnL: <span className={point.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>{formatCurrency(point.pnl)}</span></div>
      <div className="text-muted-foreground">Drawdown: <span className={point.drawdown >= 0 ? 'text-amber-300' : 'text-foreground'}>{formatPercent(point.drawdown)}</span></div>
    </div>
  )
}

export function BacktestEquityChart({ data, summary, loading }: BacktestEquityChartProps) {
  const { minBalance, maxBalance } = useMemo(() => {
    if (!data || data.length === 0) {
      return { minBalance: 0, maxBalance: 0 }
    }
    const balances = data.map(point => point.balance)
    return {
      minBalance: Math.min(...balances),
      maxBalance: Math.max(...balances)
    }
  }, [data])

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
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Run the backtest to visualize performance.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="timestamp"
                stroke="#64748b"
                fontSize={12}
                tickFormatter={(value) => new Date(value).toLocaleDateString()}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[minBalance * 0.98, maxBalance * 1.02]}
                stroke="#64748b"
                tickFormatter={(value) => `$${Math.round(value).toLocaleString()}`}
                fontSize={12}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#334155', strokeWidth: 1 }} />
              <ReferenceLine y={10000} stroke="#475569" strokeDasharray="4 4" />
              <Area
                type="monotone"
                dataKey="balance"
                stroke="#22d3ee"
                strokeWidth={2.5}
                fill="url(#pnlGradient)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
