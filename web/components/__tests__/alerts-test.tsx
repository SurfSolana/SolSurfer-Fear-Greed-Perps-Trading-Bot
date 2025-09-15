/**
 * Simple test implementation to verify Alert System functionality
 * This demonstrates how to use the AlertSystem and BacktestPreview components
 */
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import AlertSystem, { useAlerts, alertUtils } from '@/components/alerts'
import { BacktestPreview } from '@/components/backtest-preview'
import { TradingParameters } from '@/lib/types'

export function AlertSystemTestPage() {
  const { alerts, addAlert, removeAlert, clearAllAlerts, toggleSound, soundEnabled } = useAlerts()

  // Sample trading parameters for backtest preview
  const [parameters] = useState<TradingParameters>({
    fgiBuyThreshold: 25,
    fgiSellThreshold: 75,
    leverage: 3,
    positionSize: 1000,
    maxPositions: 2,
    stopLoss: 10,
    takeProfit: 20,
    // Additional fields that might be needed
    asset: 'SOL',
    strategy: 'contrarian',
    lowThreshold: 25,
    highThreshold: 75
  } as any)

  const testAlerts = () => {
    // Test different alert types
    addAlert(alertUtils.success('Trade Executed', 'Successfully opened long position on SOL'))

    setTimeout(() => {
      addAlert(alertUtils.warning('High Volatility', 'Market volatility is above normal levels'))
    }, 1000)

    setTimeout(() => {
      addAlert(alertUtils.error('Connection Lost', 'Unable to connect to trading API', {
        action: {
          label: 'Retry Connection',
          onClick: () => alert('Retrying connection...')
        }
      }))
    }, 2000)

    setTimeout(() => {
      addAlert(alertUtils.info('FGI Update', 'Fear & Greed Index updated to 32 (Fear)'))
    }, 3000)

    setTimeout(() => {
      addAlert(alertUtils.tradeExecuted('ETH-PERP', 'CLOSE_LONG', 125.50))
    }, 4000)
  }

  const testPersistentAlert = () => {
    addAlert({
      type: 'warning',
      title: 'System Maintenance',
      message: 'Scheduled maintenance will begin in 30 minutes',
      persistent: true,
      actionRequired: true,
      glowIntensity: 'lg',
      action: {
        label: 'View Schedule',
        onClick: () => alert('Opening maintenance schedule...')
      }
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold text-white text-center mb-8">
          Component Test Suite
        </h1>

        {/* Alert System Test */}
        <Card className="bg-black/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              🚨 Alert System Test
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button onClick={testAlerts} variant="outline">
                Test Multiple Alerts
              </Button>
              <Button onClick={testPersistentAlert} variant="outline">
                Test Persistent Alert
              </Button>
              <Button onClick={clearAllAlerts} variant="destructive">
                Clear All Alerts
              </Button>
              <Button onClick={toggleSound} variant="secondary">
                {soundEnabled ? 'Disable' : 'Enable'} Sound
              </Button>
            </div>

            <div className="text-sm text-gray-400">
              Active alerts: {alerts.length} | Sound: {soundEnabled ? 'On' : 'Off'}
            </div>
          </CardContent>
        </Card>

        {/* BacktestPreview Test */}
        <Card className="bg-black/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              📊 Backtest Preview Test
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BacktestPreview
              parameters={parameters}
              onRunBacktest={() => {
                addAlert(alertUtils.info('Backtest Started', 'Running backtest with current parameters...'))
              }}
              onExportResults={() => {
                addAlert(alertUtils.success('Export Complete', 'Backtest results exported successfully'))
              }}
              showComparison={true}
              className="max-w-2xl"
            />
          </CardContent>
        </Card>

        {/* Current Parameters Display */}
        <Card className="bg-black/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white text-sm">Current Test Parameters</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs text-gray-400 overflow-auto">
              {JSON.stringify(parameters, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>

      {/* Alert System Component */}
      <AlertSystem
        maxAlerts={5}
        position="top-right"
        enableSound={soundEnabled}
        showHistory={true}
        className="z-50"
      />
    </div>
  )
}

export default AlertSystemTestPage