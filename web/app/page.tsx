'use client'

import { useState, useEffect, useCallback } from 'react'
import { TradingParameters, TradingStatus } from '@/lib/types'
import { CompactStatus } from '@/components/compact-status'
import { BigNumberControls } from '@/components/big-number-controls'
import { StrategyCarousel } from '@/components/strategy-carousel'
import { Button } from '@/components/ui/button'
import { BacktestEquityChart } from '@/components/backtest-equity-chart'

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

  return (
    <div className="min-h-screen bg-black text-white">
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
        className="fixed top-0 left-0 right-0 z-50"
      />

      <main className="pt-16 container mx-auto px-4 py-6 space-y-6">
        {/* Header action row */}
        <div className="flex justify-end">
          <a href="/docs" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Docs</a>
        </div>


        <div className="space-y-4 bg-card border border-border rounded-xl p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">30 Day Backtest</h2>
              {rollingSummary && (
                <p className="text-xs text-muted-foreground">
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
              {rollingLoading ? 'Running…' : 'Run 30 Day Backtest'}
            </Button>
          </div>
          {rollingError && (
            <div className="text-sm text-destructive">
              {rollingError}
            </div>
          )}
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

        {/* Big number controls with carousel inside */}
        <BigNumberControls
          parameters={parameters}
          onParametersChange={handleParametersChange}
          estimatedPnL={estimatedPnL}
          projectedBalance={projectedBalance}
          backtestResult={backtestResult}
        >
          {/* Strategy carousel as child */}
          <div className="mt-6 mb-6">
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
