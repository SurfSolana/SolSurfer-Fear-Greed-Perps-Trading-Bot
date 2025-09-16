'use client'

import { useState } from 'react'
import { TradingStatus, TradingParameters } from '@/lib/types'
import { Circle, Play, Square, Save, TrendingUp, TrendingDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { ConfirmationDialog } from './confirmation-dialog'

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
  onSave?: () => void
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
  onSave,
}: CompactStatusProps) {
  const isActive = botStatus?.isActive || false
  const [showStartConfirm, setShowStartConfirm] = useState(false)
  const [showStopConfirm, setShowStopConfirm] = useState(false)
  
  const formatPnL = (pnl: number) => {
    const sign = pnl >= 0 ? '+$' : '-$'
    return `${sign}${Math.abs(pnl).toFixed(2)}`
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
    if (value <= 25) return { label: 'EXTREME FEAR', color: 'text-red-400' }
    if (value <= 45) return { label: 'FEAR', color: 'text-orange-400' }
    if (value <= 55) return { label: 'NEUTRAL', color: 'text-gray-400' }
    if (value <= 75) return { label: 'GREED', color: 'text-yellow-400' }
    return { label: 'EXTREME GREED', color: 'text-green-400' }
  }

  const fgiStatus = getFGIStatus(fgiValue)

  const handleLeverageChange = (value: number[]) => {
    onParametersChange({ ...parameters, leverage: value[0] })
  }

  const handleToggle = () => {
    if (isActive) {
      setShowStopConfirm(true)
    } else {
      setShowStartConfirm(true)
    }
  }

  const confirmStart = () => {
    setShowStartConfirm(false)
    onStart()
  }

  const confirmStop = () => {
    setShowStopConfirm(false)
    onStop()
  }

  return (
    <div className={`bg-gray-900/50 rounded-2xl p-6 shadow-xl backdrop-blur-sm ${className}`}>
      <div className="flex items-center justify-between gap-8">

        {/* Bot Status & Controls */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Circle
              className={`w-3 h-3 fill-current ${
                isActive ? 'text-primary animate-pulse' : 'text-muted-foreground'
              }`}
            />
            <span className="text-md font-mono font-medium">
              {isActive ? 'ACTIVE' : 'INACTIVE'}
            </span>
          </div>

          {/* Start/Stop Button - Primary CTA with proper prominence */}
          <Button
            onClick={handleToggle}
            size="lg"
            className={`h-12 px-8 font-bold text-lg transition-all ${
              isActive
                ? 'bg-destructive hover:bg-destructive/90 text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5'
                : 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl hover:-translate-y-0.5 animate-pulse'
            }`}
          >
            {isActive ? (
              <>
                <Square className="w-5 h-5 mr-3" />
                STOP BOT
              </>
            ) : (
              <>
                <Play className="w-5 h-5 mr-3" />
                START BOT
              </>
            )}
          </Button>

          {/* Save Settings Button - Secondary action */}
          {onSave && (
            <Button
              onClick={onSave}
              size="sm"
              variant="outline"
              className="h-9 px-4 font-medium text-sm opacity-80 hover:opacity-100 border-gray-700 hover:border-gray-500 transition-all duration-150"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Config
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-10">
          {/* Current P&L - PRIMARY METRIC */}
          <div className="text-center">
            <div className="text-sm text-gray-400 font-mono uppercase tracking-widest mb-1">P&L</div>
            <div className="flex items-center gap-2">
              {currentPnL >= 0 ? (
                <TrendingUp className="w-6 h-6 text-green-400" />
              ) : (
                <TrendingDown className="w-6 h-6 text-red-400" />
              )}
              <span className={`text-3xl font-mono font-bold ${
                currentPnL >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {formatPnL(currentPnL)}
              </span>
            </div>
          </div>

          {/* Balance - SECONDARY METRIC */}
          <div className="text-center">
            <div className="text-sm text-gray-400 font-mono uppercase tracking-widest mb-1">Balance</div>
            <span className="text-2xl font-mono font-semibold text-gray-200">
              {formatCurrency(balance)}
            </span>
          </div>

          {/* FGI Value - TERTIARY METRIC */}
          <div className="text-center">
            <div className="text-sm text-gray-400 font-mono uppercase tracking-widest mb-1">FGI</div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-mono font-medium text-gray-300">{fgiValue}</span>
              <span className={`text-sm font-mono opacity-80 ${fgiStatus.color}`}>
                {fgiStatus.label}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Confirmation Dialogs */}
      <ConfirmationDialog
        isOpen={showStartConfirm}
        title="Start Trading Bot"
        message={`Are you sure you want to start the trading bot with ${parameters.leverage}x leverage? The bot will begin trading automatically using the ${parameters.strategy} strategy.`}
        onConfirm={confirmStart}
        onCancel={() => setShowStartConfirm(false)}
        confirmText="Start Trading"
        cancelText="Cancel"
        variant="info"
      />

      <ConfirmationDialog
        isOpen={showStopConfirm}
        title="Stop Trading Bot"
        message="Are you sure you want to stop the trading bot? Any open positions will be closed automatically."
        onConfirm={confirmStop}
        onCancel={() => setShowStopConfirm(false)}
        confirmText="Stop Trading"
        cancelText="Keep Running"
        variant="danger"
      />
    </div>
  )
}