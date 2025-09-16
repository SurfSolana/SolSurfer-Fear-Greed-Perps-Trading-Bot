'use client'

import { TradingParameters, TradingStatus } from '@/lib/types'
import { CompactStatus } from '@/components/compact-status'
import { BigNumberControls } from '@/components/big-number-controls'
import { StrategyCarousel } from '@/components/strategy-carousel'

interface ControlPanelProps {
  parameters: TradingParameters
  onParametersChange: (params: TradingParameters) => void
  botStatus: TradingStatus
  currentPnL: number
  fgiValue: number
  balance?: number
  estimatedPnL: number
  projectedBalance: number
  backtestResult: any
  onStart: () => void
  onStop: () => void
  onSave: () => void
  onApplyStrategy: (strategy: any) => void
}

export function ControlPanel({
  parameters,
  onParametersChange,
  botStatus,
  currentPnL,
  fgiValue,
  balance,
  estimatedPnL,
  projectedBalance,
  backtestResult,
  onStart,
  onStop,
  onSave,
  onApplyStrategy,
}: ControlPanelProps) {
  return (
    <div className="space-y-6">
      <CompactStatus
        botStatus={botStatus}
        currentPnL={currentPnL}
        fgiValue={fgiValue}
        balance={balance}
        parameters={parameters}
        onParametersChange={onParametersChange}
        onStart={onStart}
        onStop={onStop}
        onSave={onSave}
      />
      <BigNumberControls
        parameters={parameters}
        onParametersChange={onParametersChange}
        estimatedPnL={estimatedPnL}
        projectedBalance={projectedBalance}
        backtestResult={backtestResult}
      />
      <StrategyCarousel
        onApplyStrategy={onApplyStrategy}
        currentAsset={parameters.asset}
      />
    </div>
  )
}
