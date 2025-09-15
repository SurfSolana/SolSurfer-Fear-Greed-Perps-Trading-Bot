'use client'

import { TradingStatus, TradingParameters } from '@/lib/types'
import { Circle, Play, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'

interface CompactStatusProps {
  botStatus?: TradingStatus
  currentPnL?: number
  fgiValue?: number
  balance?: number
  className?: string
  parameters: TradingParameters
  onParametersChange: (params: TradingParameters) => void
  onStart: () => void
  onStop: () => void
}

export function CompactStatus({
  botStatus,
  currentPnL = 0,
  fgiValue = 50,
  className = "",
  balance,
  parameters,
  onParametersChange,
  onStart,
  onStop,
}: CompactStatusProps) {
  const isActive = botStatus?.isActive || false
  const formatPnL = (pnl: number) => {
    const sign = pnl >= 0 ? '+' : ''
    return `${sign}${pnl.toFixed(2)}`
  }

  const formatCurrency = (amount?: number) => {
    if (amount == null) return '—'
    try {
      return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
    } catch {
      return `$${amount.toFixed(2)}`
    }
  }

  const getFGIStatus = (value: number) => {
    if (value <= 25) return { label: 'EXTREME FEAR', color: 'text-destructive' }
    if (value <= 45) return { label: 'FEAR', color: 'text-orange-500' }
    if (value <= 55) return { label: 'NEUTRAL', color: 'text-muted-foreground' }
    if (value <= 75) return { label: 'GREED', color: 'text-yellow-500' }
    return { label: 'EXTREME GREED', color: 'text-destructive' }
  }

  const fgiStatus = getFGIStatus(fgiValue)

  const handleLeverageChange = (value: number[]) => {
    onParametersChange({ ...parameters, leverage: value[0] })
  }

  const handleToggle = () => {
    if (isActive) {
      onStop()
    } else {
      onStart()
    }
  }

  return (
    <div className={`bg-background/80 backdrop-blur-lg border-b border-border ${className}`}>
      <div className="container mx-auto px-4 py-2">
        <div className="flex items-center justify-between gap-4">

          {/* Bot Status & Controls */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Circle
                className={`w-2 h-2 fill-current ${
                  isActive ? 'text-primary animate-pulse' : 'text-muted-foreground'
                }`}
              />
              <span className="text-sm font-mono font-medium">
                {isActive ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>

            {/* Start/Stop Button */}
            <Button
              onClick={handleToggle}
              size="sm"
              className={`h-8 px-4 font-semibold ${
                isActive
                  ? 'bg-destructive hover:bg-destructive/80 text-destructive-foreground'
                  : 'bg-primary hover:bg-primary/80 text-primary-foreground'
              }`}
            >
              {isActive ? (
                <>
                  <Square className="w-3 h-3 mr-1" />
                  STOP
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 mr-1" />
                  START
                </>
              )}
            </Button>

            {/* Leverage Slider */}
            <div className="hidden md:flex items-center gap-2 ml-4">
              <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                Leverage:
              </span>
              <div className="relative w-24">
                <Slider
                  value={[parameters.leverage]}
                  onValueChange={handleLeverageChange}
                  min={1}
                  max={20}
                  step={1}
                  className="w-full [&_[role=slider]]:bg-white [&_[role=slider]]:border-2 [&_[role=slider]]:border-primary [&_.relative]:bg-muted [&_[data-orientation]]:bg-primary"
                />
              </div>
              <span className="text-sm font-mono font-bold text-primary">{parameters.leverage}x</span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6">
            {/* Current P&L */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">P&L</span>
              <span className={`font-mono font-bold ${
                currentPnL >= 0 ? 'text-primary' : 'text-destructive'
              }`}>
                {formatPnL(currentPnL)}
              </span>
            </div>

            {/* Balance */}
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Balance</span>
              <span className="font-mono font-bold text-foreground">
                {formatCurrency(balance)}
              </span>
            </div>

            {/* FGI Value */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">FGI</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-foreground">{fgiValue}</span>
                <span className={`text-xs font-mono ${fgiStatus.color}`}>
                  {fgiStatus.label}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}