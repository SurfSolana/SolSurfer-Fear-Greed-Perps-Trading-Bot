'use client'

import { useState, useCallback, useEffect } from 'react'
import { TradingParameters } from '@/lib/types'
import { NumberInput } from '@/components/ui/number-input'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import NumberFlow from '@number-flow/react'

interface BigNumberControlsProps {
  parameters: TradingParameters
  onParametersChange: (params: TradingParameters) => void
  dataInterval: '15min' | '1h' | '4h'
  onDataIntervalChange: (interval: '15min' | '1h' | '4h') => void
  estimatedPnL?: number
  projectedBalance?: number
  backtestResult?: any
  className?: string
  children?: React.ReactNode
}

export function BigNumberControls({
  parameters,
  onParametersChange,
  dataInterval,
  onDataIntervalChange,
  estimatedPnL = 0,
  projectedBalance = 10000,
  backtestResult = null,
  className = "",
  children
}: BigNumberControlsProps) {
  const [lowThreshold, setLowThreshold] = useState(parameters.lowThreshold ?? 25)
  const [highThreshold, setHighThreshold] = useState(parameters.highThreshold ?? 75)
  const [leverage, setLeverage] = useState(parameters.leverage || 3)
  const [strategy, setStrategy] = useState<'momentum' | 'contrarian'>(parameters.strategy || 'momentum')
  const [asset, setAsset] = useState<'SOL' | 'ETH' | 'BTC'>(parameters.asset as 'SOL' | 'ETH' | 'BTC' || 'ETH')

  // Update local state when parameters change externally
  useEffect(() => {
    setLowThreshold(parameters.lowThreshold ?? 25)
    setHighThreshold(parameters.highThreshold ?? 75)
    setLeverage(parameters.leverage || 3)
    setStrategy(parameters.strategy || 'momentum')
    setAsset(parameters.asset as 'SOL' | 'ETH' | 'BTC' || 'ETH')
  }, [parameters.lowThreshold, parameters.highThreshold, parameters.leverage, parameters.strategy, parameters.asset])

  // Handle low threshold changes (must be below high)
  const handleLowThresholdChange = useCallback((newVal: number) => {
    const adjustedLow = Math.min(newVal, highThreshold - 1)
    setLowThreshold(adjustedLow)
    onParametersChange({
      ...parameters,
      lowThreshold: adjustedLow,
    })
  }, [parameters, onParametersChange, highThreshold])

  // Handle high threshold changes (must be above low)
  const handleHighThresholdChange = useCallback((newVal: number) => {
    const adjustedHigh = Math.max(newVal, lowThreshold + 1)
    setHighThreshold(adjustedHigh)
    onParametersChange({
      ...parameters,
      highThreshold: adjustedHigh
    })
  }, [parameters, onParametersChange, lowThreshold])

  // Handle leverage changes
  const handleLeverageChange = useCallback((newLeverage: number) => {
    setLeverage(newLeverage)
    onParametersChange({
      ...parameters,
      leverage: newLeverage
    })
  }, [parameters, onParametersChange])

  // Handle strategy toggle
  const handleStrategyChange = useCallback((checked: boolean) => {
    const newStrategy = checked ? 'contrarian' : 'momentum'
    setStrategy(newStrategy)
    onParametersChange({
      ...parameters,
      strategy: newStrategy
    })
  }, [parameters, onParametersChange])

  // Handle asset change
  const handleAssetChange = useCallback((newAsset: string) => {
    const typedAsset = newAsset as 'SOL' | 'ETH' | 'BTC'
    setAsset(typedAsset)
    onParametersChange({
      ...parameters,
      asset: typedAsset
    })
  }, [parameters, onParametersChange])

  // Calculate estimated performance
  const performancePercentage = projectedBalance > 0 ? (estimatedPnL / projectedBalance) * 100 : 0

  // Get labels based on strategy
  const shortLabel = strategy === 'momentum'
    ? 'Short < '
    : 'Long < '

  const longLabel = strategy === 'momentum'
    ? 'Long > '
    : 'Short > '

  const totalReturn = Number(backtestResult?.totalReturn ?? 0)
  const sharpeRatio = Number(backtestResult?.sharpeRatio ?? 0)
  const maxDrawdown = Number(backtestResult?.maxDrawdown ?? 0)
  const winRateValue = Number(backtestResult?.winRate ?? 0)
  const totalTrades = Number(backtestResult?.totalTrades ?? 0)
  const timeInMarket = Number(backtestResult?.timeInMarket ?? 0)
  const liquidations = Number(backtestResult?.liquidations ?? 0)
  const projectedNet = projectedBalance + estimatedPnL

  return (
    <div className={`panel-shell p-4 ${className}`}>
      <div className="panel-inner rounded-[calc(var(--radius)-6px)] px-6 py-6 space-y-8">
        <div className="flex flex-wrap items-center justify-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">Token</span>
            <Select value={asset} onValueChange={handleAssetChange}>
              <SelectTrigger className="w-24 rounded-md border border-white/10 bg-transparent px-3 py-1.5 font-mono font-semibold text-white hover:bg-white/5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SOL">SOL</SelectItem>
                <SelectItem value="ETH">ETH</SelectItem>
                <SelectItem value="BTC">BTC</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <ToggleSwitch
            checked={strategy === 'contrarian'}
            onCheckedChange={handleStrategyChange}
            leftLabel="Momentum"
            rightLabel="Contrarian"
            className="h-8 w-16 border border-white/10 bg-white/10 data-[state=checked]:bg-[#a78bfa]/40"
          />

          <div className="flex items-center gap-2">
            <span className="text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">Interval</span>
            <Select value={dataInterval} onValueChange={(v) => onDataIntervalChange(v as '15min' | '1h' | '4h')}>
              <SelectTrigger className="w-28 rounded-md border border-white/10 bg-transparent px-3 py-1.5 font-mono font-semibold text-[#60a5fa] hover:bg-white/5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15min">15 min</SelectItem>
                <SelectItem value="1h">1 hour</SelectItem>
                <SelectItem value="4h">4 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(240px,340px)_minmax(0,1fr)] items-center">
          <div className="surface-tile px-6 py-6 flex flex-col items-center gap-4 text-center">
            <p className="text-[0.6rem] uppercase tracking-[0.32em] text-muted-foreground">{shortLabel}FGI</p>
            <NumberInput
              value={lowThreshold}
              min={0}
              max={highThreshold - 1}
              onChange={handleLowThresholdChange}
              size="xl"
              className={strategy === 'momentum' ? 'text-[#fb7185]' : 'text-[#34d399]'}
            />
            <p className="text-xs text-muted-foreground">Auto entry trigger</p>
          </div>

          <div className="relative flex items-center justify-center">
            <div className="dial-shell">
              <div className="dial-ticks" />
              <div className="dial-core text-center text-black">
                <span className="text-[0.55rem] uppercase tracking-[0.35em] text-black/70">Projected</span>
                <NumberFlow
                  value={projectedNet}
                  format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }}
                />
                <span className="text-[0.55rem] uppercase tracking-[0.35em] text-black/60">Balance</span>
                <span className={`text-xs font-mono ${estimatedPnL >= 0 ? 'text-[#dcfce7]' : 'text-[#fecdd3]' }`}>
                  <NumberFlow
                    value={estimatedPnL}
                    format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 2 }}
                    prefix={estimatedPnL >= 0 ? '+' : ''}
                  />
                </span>
              </div>
            </div>
            <div className="absolute -bottom-10 flex items-center gap-4 text-[0.58rem] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
              <span className={
                leverage >= 8 ? 'text-[#fb7185]' : leverage >= 5 ? 'text-[#facc15]' : 'text-[#34d399]'
              }>
                {leverage}x Risk
              </span>
              <span className="text-[#22d3ee]">{strategy.toUpperCase()}</span>
            </div>
          </div>

          <div className="surface-tile px-6 py-6 flex flex-col items-center gap-4 text-center">
            <p className="text-[0.6rem] uppercase tracking-[0.32em] text-muted-foreground">{longLabel}FGI</p>
            <NumberInput
              value={highThreshold}
              min={lowThreshold + 1}
              max={100}
              onChange={handleHighThresholdChange}
              size="xl"
              className={strategy === 'momentum' ? 'text-[#34d399]' : 'text-[#fb7185]'}
            />
            <p className="text-xs text-muted-foreground">Profit capture trigger</p>
          </div>
        </div>

        {children && (
          <div className="surface-tile px-4 py-4">
            {children}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="surface-tile px-4 py-4">
            <p className="text-[0.6rem] uppercase tracking-[0.32em] text-muted-foreground">Estimated 30d P&L</p>
            <div className={`mt-3 text-3xl font-mono font-semibold ${
              performancePercentage >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]'
            }`}>
              <NumberFlow
                value={performancePercentage}
                format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
                prefix={performancePercentage >= 0 ? '+' : ''}
                suffix="%"
              />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Neutral zone {lowThreshold} - {highThreshold}
            </p>
          </div>

          <div className="surface-tile px-4 py-4">
            <p className="text-[0.6rem] uppercase tracking-[0.32em] text-muted-foreground">Backtest Pulse</p>
            {backtestResult ? (
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground uppercase tracking-[0.25em]">Total</span>
                  <span className={`font-mono font-semibold ${totalReturn >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]' }`}>
                    <NumberFlow value={totalReturn} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} suffix="%" />
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground uppercase tracking-[0.25em]">Sharpe</span>
                  <span className={`font-mono font-semibold ${
                    sharpeRatio > 1 ? 'text-[#34d399]' : sharpeRatio > 0 ? 'text-[#facc15]' : 'text-[#fb7185]'
                  }`}>
                    <NumberFlow value={sharpeRatio} format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} />
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground uppercase tracking-[0.25em]">Drawdown</span>
                  <span className="font-mono font-semibold text-[#fb7185]">
                    <NumberFlow value={-Math.abs(maxDrawdown)} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} suffix="%" />
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground italic">Backtest data loading…</p>
            )}
          </div>

          <div className="surface-tile px-4 py-4">
            <p className="text-[0.6rem] uppercase tracking-[0.32em] text-muted-foreground">Execution</p>
            {backtestResult ? (
              <div className="mt-3 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground uppercase tracking-[0.25em]">Win</span>
                  <span className={`font-mono font-semibold ${
                    winRateValue >= 60 ? 'text-[#34d399]' : winRateValue >= 40 ? 'text-[#facc15]' : 'text-[#fb7185]'
                  }`}>
                    <NumberFlow value={winRateValue} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} suffix="%" />
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground uppercase tracking-[0.25em]">Trades</span>
                  <span className="font-mono font-semibold text-[#38bdf8]">
                    <NumberFlow value={totalTrades} format={{ maximumFractionDigits: 0 }} />
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground uppercase tracking-[0.25em]">Exposure</span>
                  <span className="font-mono font-semibold text-[#60a5fa]">
                    <NumberFlow value={timeInMarket} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} suffix="%" />
                  </span>
                </div>
                {liquidations > 0 && (
                  <div className="flex items-center justify-between text-[#fb7185]">
                    <span className="uppercase tracking-[0.25em]">Liquidations</span>
                    <span className="font-mono font-semibold">
                      <NumberFlow value={liquidations} format={{ maximumFractionDigits: 0 }} />
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground italic">Awaiting metrics…</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
