'use client'

import { useState, useEffect, useCallback } from 'react'
import { TradingParameters, TradingStatus } from '@/lib/types'
import { CompactStatus } from '@/components/compact-status'
import { BigNumberControls } from '@/components/big-number-controls'
import { StrategyCarousel } from '@/components/strategy-carousel'
import { Button } from '@/components/ui/button'
import { BacktestEquityChart } from '@/components/backtest-equity-chart'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface RollingEquityPoint {
  timestamp: string
  price: number
  balance: number
  pnl: number
  drawdown: number
  fgi: number
  score: number
}

interface RollingSummary {
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

interface RollingTradeSummary {
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

export default function TradingDashboard() {

  // Parameters and status
  const [parameters, setParameters] = useState<TradingParameters>({
    asset: 'ETH',
    lowThreshold: 25,
    highThreshold: 75,
    leverage: 3,
    strategy: 'momentum'  // Changed to momentum since we have that data
  })

  const [botStatus, setBotStatus] = useState<TradingStatus>({
    isActive: false,
    mode: 'paper',
    connectionState: 'disconnected',
    lastUpdate: new Date().toISOString()
  })

  const [currentFGI, setCurrentFGI] = useState<number>(50)
  const [currentPnL, setCurrentPnL] = useState<number>(0)
  const [balance, setBalance] = useState<number | undefined>(undefined)
  const [dataInterval, setDataInterval] = useState<'15min' | '1h' | '4h'>('4h')

  // Fetch current FGI
  const fetchFGI = useCallback(async () => {
    try {
      const res = await fetch('/api/fgi/current', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setCurrentFGI(Number(data.value) || 50)
      }
    } catch (e) {
      console.error('FGI fetch failed', e)
    }
  }, [])

  // Fetch bot status
  const fetchBotStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/bot/status', { cache: 'no-store' })
      if (response.ok) {
        const data = await response.json()
        setBotStatus({
          isActive: !!data.isRunning,
          mode: 'paper',
          connectionState: 'connected',
          lastUpdate: data.lastUpdate || new Date().toISOString()
        })
  setCurrentPnL(Number(data.currentPnL) || 0)
  if (typeof data.balance === 'number') setBalance(data.balance)
      }
    } catch (error) {
      console.error('Failed to fetch bot status:', error)
    }
  }, [])

  useEffect(() => {
    // Load immediately on mount
    fetchFGI()
    fetchBotStatus()
    const i = setInterval(() => {
      fetchFGI()
      fetchBotStatus()
    }, 30000)
    return () => clearInterval(i)
  }, [fetchFGI, fetchBotStatus])

  // Estimate 30d rolling PnL using backtest API (4h baseline)
  const [estimatedPnL, setEstimatedPnL] = useState(0)
  const [projectedBalance, setProjectedBalance] = useState(10000)
  const [backtestResult, setBacktestResult] = useState<any>(null)
  const [rollingSummary, setRollingSummary] = useState<RollingSummary | null>(null)
  const [rollingCurve, setRollingCurve] = useState<RollingEquityPoint[]>([])
  const [rollingTrades, setRollingTrades] = useState<RollingTradeSummary[]>([])
  const [rollingLoading, setRollingLoading] = useState(false)
  const [rollingError, setRollingError] = useState<string | null>(null)

  const fetchEstimate = useCallback(async () => {
    try {
      // Use the consolidated database (same as other APIs)
      const res = await fetch(`/api/backtest/sqlite?asset=${parameters.asset || 'ETH'}&strategy=${parameters.strategy || 'momentum'}&fgi=${parameters.lowThreshold ?? 25}&leverage=${parameters.leverage}`)

      if (res.ok) {
        const json = await res.json()
        if (json.success && json.data) {
          setBacktestResult(json.data)
          const monthlyReturnPct = Number(json.data.monthlyReturn) || 0
          const base = balance || 10000
          const pnl = (monthlyReturnPct / 100) * base
          setEstimatedPnL(pnl)
          setProjectedBalance(base + pnl)
        }
      }
    } catch (e) {
      console.error('estimate fetch failed', e)
    }
  }, [parameters, balance])

  useEffect(() => {
    // Kick off estimate on mount and when parameters change
    const t = setTimeout(fetchEstimate, 50)
    return () => clearTimeout(t)
  }, [fetchEstimate])

  // Handlers
  const handleParametersChange = useCallback((p: TradingParameters) => {
    setParameters(prev => ({ ...prev, ...p }))
  }, [])

  const handleStart = useCallback(async () => {
    try {
      const response = await fetch('/api/bot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parameters)
      })
      if (response.ok) setBotStatus(prev => ({ ...prev, isActive: true }))
    } catch (e) { console.error(e) }
  }, [parameters])

  const handleStop = useCallback(async () => {
    try {
      const response = await fetch('/api/bot/stop', { method: 'POST' })
      if (response.ok) {
        setBotStatus(prev => ({ ...prev, isActive: false }))
        setCurrentPnL(0)
      }
    } catch (e) { console.error(e) }
  }, [])

  const handleApplyStrategy = useCallback((strategy: any) => {
    // Apply the strategy parameters
    setParameters({
      ...parameters,
      asset: strategy.asset.replace('-PERP', ''), // Remove -PERP suffix if present
      strategy: strategy.strategy,
      lowThreshold: strategy.shortThreshold,
      highThreshold: strategy.longThreshold,
      leverage: strategy.leverage
    })
  }, [parameters])

  const handleSave = useCallback(async () => {
    try {
      const response = await fetch('/api/config/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset: parameters.asset || 'ETH',
          leverage: parameters.leverage,
          lowThreshold: parameters.lowThreshold ?? 49,
          highThreshold: parameters.highThreshold ?? 50,
          maxPositionRatio: 1.0, // Use 100% of available collateral
          strategy: parameters.strategy || 'momentum',
          enabled: botStatus.isActive,
          timeframe: dataInterval || '4h'
        })
      })

      if (response.ok) {
        console.log('Settings saved successfully')
        // Optionally show a toast notification here
      }
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  }, [parameters, botStatus.isActive])

  const handleRun30DayBacktest = useCallback(async () => {
    setRollingLoading(true)
    setRollingError(null)
    try {
      const timeframeMap: Record<'15min' | '1h' | '4h', string> = {
        '15min': '15min',
        '1h': '1h',
        '4h': '4h'
      }

      const response = await fetch('/api/backtest/rolling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset: parameters.asset || 'ETH',
          strategy: parameters.strategy || 'momentum',
          lowThreshold: parameters.lowThreshold ?? 25,
          highThreshold: parameters.highThreshold ?? 75,
          leverage: parameters.leverage,
          timeframe: timeframeMap[dataInterval]
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || 'Failed to run backtest')
      }

      const json = await response.json()
      if (!json.success || !json.data) {
        throw new Error(json.error || 'Backtest response incomplete')
      }

      setRollingSummary(json.data.summary || null)
      setRollingCurve(json.data.equityCurve || [])
      setRollingTrades(json.data.trades || [])
    } catch (error: any) {
      console.error('Rolling backtest failed:', error)
      setRollingError(error?.message || 'Failed to run backtest')
      setRollingSummary(null)
      setRollingCurve([])
      setRollingTrades([])
    } finally {
      setRollingLoading(false)
    }
  }, [parameters, dataInterval])

  // Auto-run backtest on initial load
  useEffect(() => {
    const timer = setTimeout(() => {
      handleRun30DayBacktest()
    }, 500)
    return () => clearTimeout(timer)
  }, []) // Empty deps = run once on mount only

  return (
    <div className="min-h-screen pb-16">
      {/* Top status bar with integrated controls */}
      <CompactStatus
        botStatus={botStatus}
        currentPnL={currentPnL}
        fgiValue={currentFGI}
        balance={balance}
        parameters={parameters}
        onParametersChange={handleParametersChange}
        onStart={handleStart}
        onStop={handleStop}
        onSave={handleSave}
        className="sticky top-0 z-40"
      />
      <main className="mx-auto w-full max-w-[1180px] px-6 pb-16 pt-10 space-y-8">
        <div className="flex justify-end">
          <a href="/docs" className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground hover:text-white transition-colors">
            Docs
          </a>
        </div>

        <div className="panel-shell p-4">
          <div className="panel-inner rounded-[calc(var(--radius)-6px)] px-6 py-6 space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">30 Day Backtest</h2>
              {rollingSummary && (
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  {new Date(rollingSummary.periodStart).toLocaleDateString()} — {new Date(rollingSummary.periodEnd).toLocaleDateString()}
                </p>
              )}
            </div>
            <Button
              onClick={handleRun30DayBacktest}
              disabled={rollingLoading}
              variant="default"
              className="self-start md:self-auto"
            >
              {rollingLoading ? 'Running…' : 'Refresh Backtest'}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300 bg-white/5 rounded-xl px-4 py-3 border border-white/10">
            <span className="flex items-center gap-1.5">
              <span className="text-[0.6rem] uppercase tracking-[0.3em] opacity-60">Token</span>
              <Select
                value={parameters.asset || 'ETH'}
                onValueChange={(value) => handleParametersChange({ ...parameters, asset: value as 'SOL' | 'ETH' | 'BTC' })}
              >
                <SelectTrigger className="font-mono font-semibold text-white w-fit h-auto rounded-md border border-white/10 bg-transparent px-3 py-1.5 hover:bg-white/5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SOL">SOL</SelectItem>
                  <SelectItem value="ETH">ETH</SelectItem>
                  <SelectItem value="BTC">BTC</SelectItem>
                </SelectContent>
              </Select>
            </span>
            <span className="text-white/30">•</span>
            <span className="flex items-center gap-1.5">
              <span className="text-[0.6rem] uppercase tracking-[0.3em] opacity-60">Strategy</span>
              <Select
                value={parameters.strategy || 'momentum'}
                onValueChange={(value) => handleParametersChange({ ...parameters, strategy: value as 'momentum' | 'contrarian' })}
              >
                <SelectTrigger className={`font-semibold w-fit h-auto rounded-md border border-white/10 bg-transparent px-3 py-1.5 transition-colors ${
                  parameters.strategy === 'momentum' ? 'text-[#22d3ee]' : 'text-[#a78bfa]'
                }`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="momentum">Momentum</SelectItem>
                  <SelectItem value="contrarian">Contrarian</SelectItem>
                </SelectContent>
              </Select>
            </span>
            <span className="text-white/30">•</span>
            <span className="flex items-center gap-1.5">
              <span className="text-[0.6rem] uppercase tracking-[0.3em] opacity-60">Range</span>
              <span className="font-mono font-semibold inline-flex items-center">
                <Select
                  value={String(parameters.lowThreshold ?? 25)}
                  onValueChange={(value) => {
                    const newLow = Number(value)
                    handleParametersChange({
                      ...parameters,
                      lowThreshold: newLow,
                      highThreshold: Math.max(parameters.highThreshold ?? 75, newLow + 1)
                    })
                  }}
                >
                  <SelectTrigger className="w-fit h-auto rounded-md border border-white/10 bg-transparent px-3 py-1.5 font-mono font-semibold text-[#fb7185] hover:bg-white/5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map(val => (
                      <SelectItem key={val} value={String(val)} disabled={val >= (parameters.highThreshold ?? 75)}>
                        {val}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="mx-1 text-white/30">-</span>
                <Select
                  value={String(parameters.highThreshold ?? 75)}
                  onValueChange={(value) => {
                    const newHigh = Number(value)
                    handleParametersChange({
                      ...parameters,
                      highThreshold: newHigh,
                      lowThreshold: Math.min(parameters.lowThreshold ?? 25, newHigh - 1)
                    })
                  }}
                >
                  <SelectTrigger className="w-fit h-auto rounded-md border border-white/10 bg-transparent px-3 py-1.5 font-mono font-semibold text-[#34d399] hover:bg-white/5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[50, 55, 60, 65, 70, 75, 80, 85, 90, 95].map(val => (
                      <SelectItem key={val} value={String(val)} disabled={val <= (parameters.lowThreshold ?? 25)}>
                        {val}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </span>
            </span>
            <span className="text-white/30">•</span>
            <span className="flex items-center gap-1.5">
              <span className="text-[0.6rem] uppercase tracking-[0.3em] opacity-60">Leverage</span>
              <Select
                value={String(parameters.leverage || 3)}
                onValueChange={(value) => handleParametersChange({ ...parameters, leverage: Number(value) })}
              >
                <SelectTrigger className="font-mono font-semibold text-[#f472b6] w-fit h-auto rounded-md border border-white/10 bg-transparent px-3 py-1.5 hover:bg-white/5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(val => (
                    <SelectItem key={val} value={String(val)}>{val}x</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </span>
            <span className="text-white/30">•</span>
            <span className="flex items-center gap-1.5">
              <span className="text-[0.6rem] uppercase tracking-[0.3em] opacity-60">Interval</span>
              <Select
                value={dataInterval}
                onValueChange={(value) => setDataInterval(value as '15min' | '1h' | '4h')}
              >
                <SelectTrigger className="font-mono font-semibold text-[#60a5fa] w-fit h-auto rounded-md border border-white/10 bg-transparent px-3 py-1.5 hover:bg-white/5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15min">15 min</SelectItem>
                  <SelectItem value="1h">1 hour</SelectItem>
                  <SelectItem value="4h">4 hours</SelectItem>
                </SelectContent>
              </Select>
            </span>
          </div>
          {rollingError && (
            <div className="text-sm font-medium text-[#fb7185]">
              {rollingError}
            </div>
          )}
          <div className="surface-tile px-4 py-4">
            <BacktestEquityChart
              data={rollingCurve}
              summary={rollingSummary || undefined}
              loading={rollingLoading}
              trades={rollingTrades}
              thresholds={{
                low: parameters.lowThreshold ?? 25,
                high: parameters.highThreshold ?? 75
              }}
              strategy={(parameters.strategy as 'momentum' | 'contrarian') || 'momentum'}
            />
          </div>
        </div>
        </div>

        {/* Big number controls with carousel inside */}
        <BigNumberControls
          parameters={parameters}
          onParametersChange={handleParametersChange}
          dataInterval={dataInterval}
          onDataIntervalChange={setDataInterval}
          estimatedPnL={estimatedPnL}
          projectedBalance={projectedBalance}
          backtestResult={backtestResult}
        >
          {/* Strategy carousel as child */}
          <div className="mt-8">
            <StrategyCarousel
              onApplyStrategy={handleApplyStrategy}
              currentAsset={parameters.asset}
            />
          </div>
        </BigNumberControls>
      </main>
    </div>
  )
}
