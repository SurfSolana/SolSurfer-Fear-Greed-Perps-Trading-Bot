'use client'

import { useState } from 'react'
import { TradingStatus, TradingParameters } from '@/lib/types'
import { Play, Square, Save } from 'lucide-react'
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
    if (value <= 25) return { label: 'EXTREME FEAR', textClass: 'text-[#fb7185]', barClass: 'bg-[#fb7185]' }
    if (value <= 45) return { label: 'FEAR', textClass: 'text-[#f97316]', barClass: 'bg-[#f97316]' }
    if (value <= 55) return { label: 'NEUTRAL', textClass: 'text-slate-300', barClass: 'bg-slate-400' }
    if (value <= 75) return { label: 'GREED', textClass: 'text-[#22d3ee]', barClass: 'bg-[#22d3ee]' }
    return { label: 'EXTREME GREED', textClass: 'text-[#facc15]', barClass: 'bg-[#facc15]' }
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
    <>
      <div className={`pointer-events-auto w-full ${className}`}>
        <div className="w-full pt-0">
          <div className="panel-shell p-3">
            <div className="panel-inner rounded-[calc(var(--radius)-6px)] px-6 py-5 flex flex-col gap-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-4">
                  <div
                    className="status-indicator"
                    data-state={isActive ? 'active' : 'inactive'}
                  />
                  <div>
                    <p className="text-[0.58rem] uppercase tracking-[0.42em] text-muted-foreground">
                      Bot State
                    </p>
                    <p className="font-mono text-sm font-semibold text-white">
                      {isActive ? 'Online' : 'Standby'}
                    </p>
                  </div>
                  <div className="hidden lg:flex items-center gap-2">
                    <span className="control-chip" data-active={parameters.asset === 'ETH'}>ETH</span>
                    <span className="control-chip" data-active={parameters.asset === 'SOL'}>SOL</span>
                    <span className="control-chip" data-active={parameters.asset === 'BTC'}>BTC</span>
                    <span className="control-chip" data-active={parameters.strategy === 'contrarian'}>
                      {parameters.strategy === 'contrarian' ? 'CONTRA' : 'MOMENT'}
                    </span>
                    <span className="control-chip" data-active={parameters.leverage >= 5}>
                      {parameters.leverage}x
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={handleToggle}
                    size="sm"
                    variant={isActive ? 'destructive' : 'default'}
                  >
                    {isActive ? (
                      <>
                        <Square className="w-3 h-3" />
                        Stop Bot
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3" />
                        Start Bot
                      </>
                    )}
                  </Button>

                  {onSave && (
                    <Button
                      onClick={onSave}
                      size="sm"
                      variant="secondary"
                    >
                      <Save className="w-3 h-3" />
                      Save Config
                    </Button>
                  )}

                  <div className="hidden md:flex items-center gap-3">
                    <span className="text-[0.6rem] uppercase tracking-[0.38em] text-muted-foreground">
                      Leverage
                    </span>
                    <div className="w-28">
                      <Slider
                        value={[parameters.leverage]}
                        onValueChange={handleLeverageChange}
                        min={1}
                        max={20}
                        step={1}
                        className="w-full [&_[role=slider]]:bg-[#39bdf8] [&_[role=slider]]:border-2 [&_[role=slider]]:border-white/30 [&_[role=slider]]:shadow-[0_0_12px_rgba(57,189,248,0.55)]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="surface-tile px-4 py-3">
                  <p className="text-[0.6rem] uppercase tracking-[0.38em] text-muted-foreground">
                    P&L
                  </p>
                  <p
                    className={`mt-2 font-mono text-lg font-semibold ${
                      currentPnL >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]'
                    }`}
                  >
                    {formatPnL(currentPnL)}
                  </p>
                  <p className="mt-1 text-[0.65rem] text-muted-foreground">
                    Running total
                  </p>
                </div>

                <div className="surface-tile px-4 py-3">
                  <p className="text-[0.6rem] uppercase tracking-[0.38em] text-muted-foreground">
                    Balance
                  </p>
                  <p className="mt-2 font-mono text-lg font-semibold text-white">
                    {formatCurrency(balance)}
                  </p>
                  <p className="mt-1 text-[0.65rem] text-muted-foreground">
                    Account equity
                  </p>
                </div>

                <div className="surface-tile px-4 py-3">
                  <p className="text-[0.6rem] uppercase tracking-[0.38em] text-muted-foreground">
                    FGI
                  </p>
                  <div className="mt-2 flex items-baseline gap-3">
                    <span className="font-mono text-lg font-semibold text-white">{fgiValue}</span>
                    <span className={`text-[0.65rem] font-medium tracking-[0.24em] uppercase ${fgiStatus.textClass}`}>
                      {fgiStatus.label}
                    </span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${fgiStatus.barClass}`}
                      style={{ width: `${Math.min(100, Math.max(0, fgiValue))}%` }}
                    />
                  </div>
                </div>

                <div className="surface-tile px-4 py-3">
                  <p className="text-[0.6rem] uppercase tracking-[0.38em] text-muted-foreground">
                    Link
                  </p>
                  <p className="mt-2 font-mono text-lg font-semibold text-white">
                    {botStatus?.connectionState === 'connected' ? 'Online' : 'Offline'}
                  </p>
                  <p className="mt-1 text-[0.65rem] text-muted-foreground">
                    Mode: {botStatus?.mode === 'paper' ? 'Paper' : 'Live'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
    </>
  )
}
