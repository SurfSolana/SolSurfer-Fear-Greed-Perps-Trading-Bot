'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { TradingParameters, TradingStatus } from '@/lib/types'
import { CompactStatus } from '@/components/compact-status'
import { FGITimeSeries, ViewWindow, DataInterval } from '@/components/fgi-time-series'
import { BigNumberControls } from '@/components/big-number-controls'
import { StrategyCarousel } from '@/components/strategy-carousel'

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
  const [selectedViewWindow, setSelectedViewWindow] = useState<ViewWindow>('7days')
  const [dataInterval, setDataInterval] = useState<DataInterval>('4h')

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
      asset: strategy.asset,
      strategy: strategy.strategy,
      lowThreshold: strategy.strategy === 'momentum' ? strategy.fgiThreshold : 100 - strategy.fgiThreshold,
      highThreshold: strategy.strategy === 'momentum' ? 100 - strategy.fgiThreshold : strategy.fgiThreshold,
      leverage: strategy.leverage
    })
  }, [parameters])

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
        className="fixed top-0 left-0 right-0 z-50"
      />

      <main className="pt-16 container mx-auto px-4 py-6 space-y-6">
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

        {/* FGI graph with timeframe selector inside */}
        <FGITimeSeries
          currentFGI={currentFGI}
          asset={parameters.asset || 'ETH'}
          onAssetChange={(asset) => handleParametersChange({ ...parameters, asset })}
          selectedViewWindow={selectedViewWindow}
          onViewWindowChange={setSelectedViewWindow}
          dataInterval={dataInterval}
          onDataIntervalChange={setDataInterval}
          thresholds={{
            low: parameters.lowThreshold ?? 25,
            high: parameters.highThreshold ?? 75
          }}
        />
      </main>
    </div>
  )
}