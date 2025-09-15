'use client'

import { useState, useCallback, useEffect } from 'react'
import { TradingParameters } from '@/lib/types'
import { NumberInput } from '@/components/ui/number-input'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import NumberFlow from '@number-flow/react'

interface BigNumberControlsProps {
  parameters: TradingParameters
  onParametersChange: (params: TradingParameters) => void
  estimatedPnL?: number
  projectedBalance?: number
  backtestResult?: any
  className?: string
  children?: React.ReactNode
}

export function BigNumberControls({
  parameters,
  onParametersChange,
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

  // Update local state when parameters change externally
  useEffect(() => {
    setLowThreshold(parameters.lowThreshold ?? 25)
    setHighThreshold(parameters.highThreshold ?? 75)
    setLeverage(parameters.leverage || 3)
    setStrategy(parameters.strategy || 'momentum')
  }, [parameters.lowThreshold, parameters.highThreshold, parameters.leverage, parameters.strategy])

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

  // Calculate estimated performance
  const performancePercentage = projectedBalance > 0 ? (estimatedPnL / projectedBalance) * 100 : 0

  // Get labels based on strategy
  const shortLabel = strategy === 'momentum'
    ? 'Short < '
    : 'Long < '

  const longLabel = strategy === 'momentum'
    ? 'Long > '
    : 'Short > '

  return (
    <div className={`bg-card border border-border rounded-xl p-8 ${className}`}>
      {/* Strategy Toggle */}
      <div className="flex justify-center mb-6">
        <ToggleSwitch
          checked={strategy === 'contrarian'}
          onCheckedChange={handleStrategyChange}
          leftLabel="Momentum"
          rightLabel="Contrarian"
        />
      </div>

      {/* Top row: Trading controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center mb-8">

        {/* Left: Short/Long Threshold based on strategy */}
        <div className="flex flex-col items-center space-y-4">
          <div className="text-center">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {shortLabel}
            </h3>
            <div className="mb-4">
              <NumberInput
                value={lowThreshold}
                min={0}
                max={highThreshold - 1}
                onChange={handleLowThresholdChange}
                size="xl"
                className={strategy === 'momentum' ? "text-red-400 font-bold font-mono" : "text-green-400 font-bold font-mono"}
              />
            </div>
          </div>
        </div>

        {/* Center: Leverage */}
        <div className="flex flex-col items-center space-y-4">
          <div className="text-center">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Leverage
            </h3>
            <div className="mb-4">
              <NumberInput
                value={leverage}
                min={1}
                max={10}
                onChange={handleLeverageChange}
                size="xl"
                className="text-fuchsia-400 font-bold font-mono"
                suffix="x"
              />
            </div>
            <div className={`text-xs font-medium ${
              leverage >= 8 ? 'text-red-400' : leverage >= 5 ? 'text-yellow-400' : 'text-muted-foreground'
            }`}>
              {leverage >= 8 ? 'HIGH RISK' : leverage >= 5 ? 'MODERATE RISK' : 'LOW RISK'}
            </div>
          </div>
        </div>

        {/* Right: Long/Short Threshold based on strategy */}
        <div className="flex flex-col items-center space-y-4">
          <div className="text-center">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {longLabel}
            </h3>
            <div className="mb-4">
              <NumberInput
                value={highThreshold}
                min={lowThreshold + 1}
                max={100}
                onChange={handleHighThresholdChange}
                size="xl"
                className={strategy === 'momentum' ? "text-green-400 font-bold font-mono" : "text-red-400 font-bold font-mono"}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Strategy Carousel - moved here */}
      {children}

      {/* Bottom: P&L Display and Metrics */}
      <div className="border-t border-border pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: P&L Display */}
          <div className="flex flex-col items-center space-y-4">
            <div className="text-center">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Estimated 30 Day P&L
              </h3>
              <div className={`text-5xl font-bold font-mono mb-2 ${
                performancePercentage >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                <NumberFlow
                  value={performancePercentage}
                  format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
                  prefix={performancePercentage >= 0 ? '+' : ''}
                  suffix="%"
                />
              </div>
              <div className="text-lg font-mono text-muted-foreground">
                <NumberFlow
                  value={estimatedPnL}
                  format={{ style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }}
                  prefix={estimatedPnL >= 0 ? '+' : ''}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Projected balance: <NumberFlow
                  value={projectedBalance + estimatedPnL}
                  format={{ style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }}
                  className="inline"
                />
              </div>
            </div>

            {/* Performance Indicator */}
            <div className="flex items-center gap-2 text-xs">
              <div className={`w-2 h-2 rounded-full animate-pulse ${
                performancePercentage >= 10 ? 'bg-green-400' :
                performancePercentage >= 5 ? 'bg-yellow-400' :
                performancePercentage >= 0 ? 'bg-blue-400' :
                performancePercentage >= -5 ? 'bg-orange-400' : 'bg-red-400'
              }`}></div>
              <span className="text-muted-foreground">
                {performancePercentage >= 10 ? 'Excellent' :
                 performancePercentage >= 5 ? 'Good' :
                 performancePercentage >= 0 ? 'Positive' :
                 performancePercentage >= -5 ? 'Caution' : 'High Risk'}
              </span>
            </div>

            {/* Neutral zone indicator */}
            <div className="text-xs text-muted-foreground text-center">
              Neutral zone: {lowThreshold} - {highThreshold}
            </div>
          </div>

          {/* Right: Backtest Metrics */}
          <div className="bg-black/30 rounded-lg p-6 border border-border/50">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
              Backtest Metrics
            </h3>
            {backtestResult ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Total Return</div>
                  <div className={`text-lg font-mono font-semibold ${
                    backtestResult.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    <NumberFlow
                      value={backtestResult.totalReturn}
                      format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
                      suffix="%"
                    />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Sharpe Ratio</div>
                  <div className={`text-lg font-mono font-semibold ${
                    backtestResult.sharpeRatio > 1 ? 'text-green-400' :
                    backtestResult.sharpeRatio > 0 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    <NumberFlow
                      value={backtestResult.sharpeRatio}
                      format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
                    />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Max Drawdown</div>
                  <div className="text-lg font-mono font-semibold text-red-400">
                    <NumberFlow
                      value={-Math.abs(backtestResult.maxDrawdown)}
                      format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
                      suffix="%"
                    />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Win Rate</div>
                  <div className={`text-lg font-mono font-semibold ${
                    backtestResult.winRate >= 60 ? 'text-green-400' :
                    backtestResult.winRate >= 40 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    <NumberFlow
                      value={backtestResult.winRate}
                      format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
                      suffix="%"
                    />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Total Trades</div>
                  <div className="text-lg font-mono font-semibold text-cyan-400">
                    <NumberFlow
                      value={backtestResult.totalTrades}
                      format={{ minimumFractionDigits: 0, maximumFractionDigits: 0 }}
                    />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Time in Market</div>
                  <div className="text-lg font-mono font-semibold text-blue-400">
                    <NumberFlow
                      value={backtestResult.timeInMarket}
                      format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
                      suffix="%"
                    />
                  </div>
                </div>
                {backtestResult.liquidations > 0 && (
                  <div className="col-span-2">
                    <div className="text-xs text-muted-foreground mb-1">Liquidations</div>
                    <div className="text-lg font-mono font-semibold text-red-500">
                      <NumberFlow
                        value={backtestResult.liquidations}
                        format={{ minimumFractionDigits: 0, maximumFractionDigits: 0 }}
                      />
                      <span className="text-xs text-red-400 ml-2">⚠️ High Risk</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                Loading backtest data...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}