'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Info,
  AlertCircle,
  Volume2,
  VolumeX,
  Trash2,
  History,
  ChevronDown,
  ChevronUp,
  Zap
} from 'lucide-react'
import { Alert as AlertType } from '@/lib/types'
import { createGlowEffect, createTextGlow, cryptoColors, animationUtils } from '@/lib/effects'

// Extended alert interface with enhanced features
export interface EnhancedAlert extends AlertType {
  autoDismissAfter?: number // milliseconds
  persistent?: boolean
  sound?: boolean
  glowIntensity?: 'sm' | 'md' | 'lg'
  action?: {
    label: string
    onClick: () => void
  }
}

// Alert context and provider interfaces
export interface AlertContextType {
  alerts: EnhancedAlert[]
  addAlert: (alert: Omit<EnhancedAlert, 'id' | 'timestamp' | 'dismissed'>) => string
  removeAlert: (id: string) => void
  clearAllAlerts: () => void
  toggleSound: () => void
  soundEnabled: boolean
}

// Alert system configuration
interface AlertSystemProps {
  maxAlerts?: number
  defaultAutoDismiss?: number
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center'
  enableSound?: boolean
  showHistory?: boolean
  className?: string
}

// Individual alert component props
interface AlertItemProps {
  alert: EnhancedAlert
  onDismiss: (id: string) => void
  onAction?: (id: string) => void
  soundEnabled: boolean
}

// Alert colors and styles configuration
const ALERT_STYLES = {
  success: {
    color: cryptoColors.success,
    bgClass: 'bg-green-500/10 border-green-500/30',
    textClass: 'text-green-400',
    icon: CheckCircle2
  },
  warning: {
    color: cryptoColors.warning,
    bgClass: 'bg-yellow-500/10 border-yellow-500/30',
    textClass: 'text-yellow-400',
    icon: AlertTriangle
  },
  error: {
    color: cryptoColors.danger,
    bgClass: 'bg-red-500/10 border-red-500/30',
    textClass: 'text-red-400',
    icon: AlertCircle
  },
  info: {
    color: cryptoColors.neonBlue,
    bgClass: 'bg-blue-500/10 border-blue-500/30',
    textClass: 'text-blue-400',
    icon: Info
  }
}

// Position classes for the alert container
const POSITION_CLASSES = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-center': 'top-4 left-1/2 transform -translate-x-1/2'
}

// Individual Alert Item Component
function AlertItem({ alert, onDismiss, onAction, soundEnabled }: AlertItemProps) {
  const [progress, setProgress] = useState(100)
  const [isVisible, setIsVisible] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const style = ALERT_STYLES[alert.type]
  const Icon = style.icon

  // Auto-dismiss functionality
  useEffect(() => {
    setIsVisible(true)

    if (!alert.persistent && alert.autoDismissAfter) {
      const duration = alert.autoDismissAfter
      const startTime = Date.now()

      const updateProgress = () => {
        if (isPaused) return

        const elapsed = Date.now() - startTime
        const remaining = Math.max(0, duration - elapsed)
        const progressPercent = (remaining / duration) * 100

        setProgress(progressPercent)

        if (remaining <= 0) {
          handleDismiss()
        }
      }

      intervalRef.current = setInterval(updateProgress, 100)
      timeoutRef.current = setTimeout(() => {
        if (!isPaused) {
          handleDismiss()
        }
      }, duration)
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [alert.autoDismissAfter, alert.persistent, isPaused])

  // Sound effect (placeholder - would integrate with actual sound system)
  useEffect(() => {
    if (alert.sound && soundEnabled) {
      // Placeholder for sound effect
      // In a real implementation, you might use Web Audio API or HTML5 audio
      console.log(`🔊 Playing ${alert.type} sound`)
    }
  }, [alert.sound, alert.type, soundEnabled])

  const handleDismiss = useCallback(() => {
    setIsVisible(false)
    setTimeout(() => onDismiss(alert.id), 300) // Wait for exit animation
  }, [alert.id, onDismiss])

  const handleAction = useCallback(() => {
    if (alert.action) {
      alert.action.onClick()
      onAction?.(alert.id)
    }
  }, [alert.action, alert.id, onAction])

  return (
    <div
      className={`
        transform transition-all duration-300 ease-in-out
        ${isVisible ? 'translate-x-0 opacity-100 scale-100' : 'translate-x-full opacity-0 scale-95'}
        hover:scale-105 hover:z-20 relative
        ${alert.persistent ? 'border-l-4 border-l-purple-500' : ''}
      `}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{
        boxShadow: createGlowEffect(style.color, alert.glowIntensity || 'sm'),
        ...animationUtils.enableHardwareAcceleration()
      }}
    >
      <Alert className={`${style.bgClass} border-2 relative overflow-hidden min-w-80 max-w-md`}>
        {/* Progress bar for auto-dismiss */}
        {!alert.persistent && alert.autoDismissAfter && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-muted/20">
            <div
              className={`h-full transition-all duration-100 ease-linear ${
                alert.type === 'error' ? 'bg-red-400' :
                alert.type === 'warning' ? 'bg-yellow-400' :
                alert.type === 'success' ? 'bg-green-400' : 'bg-blue-400'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Alert Icon */}
        <Icon
          className={`h-5 w-5 ${style.textClass} animate-pulse`}
          style={{
            filter: `drop-shadow(0 0 4px ${style.color}40)`,
          }}
        />

        {/* Alert Content */}
        <div className="flex-1 space-y-1">
          <AlertTitle
            className={`${style.textClass} font-bold flex items-center justify-between`}
            style={{ textShadow: createTextGlow(style.color, 'sm') }}
          >
            {alert.title}
            {alert.actionRequired && (
              <Badge variant="outline" className="text-xs animate-pulse">
                <Zap className="h-3 w-3 mr-1" />
                Action Required
              </Badge>
            )}
          </AlertTitle>

          <AlertDescription className="text-muted-foreground text-sm leading-relaxed">
            {alert.message}
          </AlertDescription>

          {/* Action Button */}
          {alert.action && (
            <div className="pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleAction}
                className={`${style.textClass} transition-all duration-200 hover:scale-105`}
                style={{ boxShadow: createGlowEffect(style.color, 'sm') }}
              >
                {alert.action.label}
              </Button>
            </div>
          )}

          {/* Timestamp */}
          <div className="text-xs text-muted-foreground pt-1 opacity-70">
            {new Date(alert.timestamp).toLocaleTimeString()}
            {alert.persistent && (
              <span className="ml-2 text-purple-400">• Persistent</span>
            )}
          </div>
        </div>

        {/* Dismiss Button */}
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDismiss}
          className={`absolute top-2 right-2 h-6 w-6 p-0 ${style.textClass} hover:bg-red-500/20 transition-all duration-200`}
        >
          <X className="h-3 w-3" />
        </Button>
      </Alert>
    </div>
  )
}

// Main Alert System Component
export function AlertSystem({
  maxAlerts = 5,
  defaultAutoDismiss = 5000,
  position = 'top-right',
  enableSound = false,
  showHistory = false,
  className
}: AlertSystemProps) {
  const [alerts, setAlerts] = useState<EnhancedAlert[]>([])
  const [dismissedAlerts, setDismissedAlerts] = useState<EnhancedAlert[]>([])
  const [soundEnabled, setSoundEnabled] = useState(enableSound)
  const [showHistoryPanel, setShowHistoryPanel] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Handle client-side mounting for portal
  useEffect(() => {
    setMounted(true)
  }, [])

  const addAlert = useCallback((alertData: Omit<EnhancedAlert, 'id' | 'timestamp' | 'dismissed'>) => {
    const alert: EnhancedAlert = {
      ...alertData,
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      dismissed: false,
      autoDismissAfter: alertData.autoDismissAfter ?? defaultAutoDismiss,
      glowIntensity: alertData.glowIntensity || 'md'
    }

    setAlerts(prev => {
      const newAlerts = [alert, ...prev]
      // Keep only maxAlerts visible alerts
      return newAlerts.slice(0, maxAlerts)
    })

    return alert.id
  }, [maxAlerts, defaultAutoDismiss])

  const removeAlert = useCallback((id: string) => {
    setAlerts(prev => {
      const alertToRemove = prev.find(alert => alert.id === id)
      if (alertToRemove && showHistory) {
        setDismissedAlerts(dismissedPrev => [
          { ...alertToRemove, dismissed: true },
          ...dismissedPrev.slice(0, 19) // Keep last 20 in history
        ])
      }
      return prev.filter(alert => alert.id !== id)
    })
  }, [showHistory])

  const clearAllAlerts = useCallback(() => {
    if (showHistory) {
      setDismissedAlerts(prev => [
        ...alerts.map(alert => ({ ...alert, dismissed: true })),
        ...prev.slice(0, 19)
      ])
    }
    setAlerts([])
  }, [alerts, showHistory])

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => !prev)
  }, [])

  // Don't render on server
  if (!mounted) return null

  const alertContainer = (
    <div
      className={`
        fixed z-50 flex flex-col space-y-3 pointer-events-none
        ${POSITION_CLASSES[position]}
        ${className || ''}
        ${position.includes('bottom') ? 'flex-col-reverse' : ''}
      `}
      style={{ maxWidth: '400px' }}
    >
      {alerts.map(alert => (
        <div key={alert.id} className="pointer-events-auto">
          <AlertItem
            alert={alert}
            onDismiss={removeAlert}
            onAction={removeAlert}
            soundEnabled={soundEnabled}
          />
        </div>
      ))}

      {/* Controls Panel */}
      {alerts.length > 0 && (
        <div className="pointer-events-auto mt-2">
          <Card className="bg-black/80 backdrop-blur-sm border-muted/30">
            <CardContent className="p-3">
              <div className="flex items-center justify-between space-x-2">
                <div className="flex items-center space-x-2">
                  <Badge variant="outline" className="text-xs">
                    {alerts.length} active
                  </Badge>
                  {showHistory && dismissedAlerts.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {dismissedAlerts.length} in history
                    </Badge>
                  )}
                </div>

                <div className="flex items-center space-x-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={toggleSound}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  >
                    {soundEnabled ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
                  </Button>

                  {showHistory && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowHistoryPanel(!showHistoryPanel)}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                    >
                      <History className="h-3 w-3" />
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={clearAllAlerts}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* History Panel */}
      {showHistory && showHistoryPanel && dismissedAlerts.length > 0 && (
        <div className="pointer-events-auto mt-2">
          <Card className="bg-black/90 backdrop-blur-sm border-muted/30 max-h-64 overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-muted-foreground">Alert History</CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowHistoryPanel(false)}
                  className="h-4 w-4 p-0"
                >
                  <ChevronUp className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3 space-y-2 overflow-y-auto max-h-48">
              {dismissedAlerts.slice(0, 10).map(alert => {
                const style = ALERT_STYLES[alert.type]
                const Icon = style.icon
                return (
                  <div
                    key={alert.id}
                    className="flex items-start space-x-2 p-2 rounded bg-muted/10 opacity-60 hover:opacity-80 transition-opacity"
                  >
                    <Icon className={`h-3 w-3 ${style.textClass} mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-muted-foreground truncate">
                        {alert.title}
                      </div>
                      <div className="text-xs text-muted-foreground/70 truncate">
                        {alert.message}
                      </div>
                      <div className="text-xs text-muted-foreground/50">
                        {new Date(alert.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )

  // Render in portal to body
  return createPortal(alertContainer, document.body)
}

// Hook for using alerts (would typically be part of a context provider)
export function useAlerts() {
  const [alerts, setAlerts] = useState<EnhancedAlert[]>([])
  const [soundEnabled, setSoundEnabled] = useState(false)

  const addAlert = useCallback((alertData: Omit<EnhancedAlert, 'id' | 'timestamp' | 'dismissed'>) => {
    const alert: EnhancedAlert = {
      ...alertData,
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      dismissed: false
    }

    setAlerts(prev => [alert, ...prev])
    return alert.id
  }, [])

  const removeAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== id))
  }, [])

  const clearAllAlerts = useCallback(() => {
    setAlerts([])
  }, [])

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => !prev)
  }, [])

  return {
    alerts,
    addAlert,
    removeAlert,
    clearAllAlerts,
    toggleSound,
    soundEnabled
  }
}

// Utility functions for common alert patterns
export const alertUtils = {
  // Quick success alert
  success: (title: string, message: string, options?: Partial<EnhancedAlert>) => ({
    type: 'success' as const,
    title,
    message,
    autoDismissAfter: 3000,
    ...options
  }),

  // Quick warning alert
  warning: (title: string, message: string, options?: Partial<EnhancedAlert>) => ({
    type: 'warning' as const,
    title,
    message,
    autoDismissAfter: 5000,
    ...options
  }),

  // Quick error alert
  error: (title: string, message: string, options?: Partial<EnhancedAlert>) => ({
    type: 'error' as const,
    title,
    message,
    persistent: true,
    actionRequired: true,
    ...options
  }),

  // Quick info alert
  info: (title: string, message: string, options?: Partial<EnhancedAlert>) => ({
    type: 'info' as const,
    title,
    message,
    autoDismissAfter: 4000,
    ...options
  }),

  // Trading-specific alerts
  tradeExecuted: (asset: string, action: string, pnl: number) => ({
    type: pnl >= 0 ? 'success' as const : 'warning' as const,
    title: 'Trade Executed',
    message: `${action} ${asset} - P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
    autoDismissAfter: 4000,
    sound: true,
    glowIntensity: 'md' as const
  }),

  connectionStatus: (status: 'connected' | 'disconnected' | 'reconnecting') => ({
    type: status === 'connected' ? 'success' as const :
          status === 'disconnected' ? 'error' as const : 'warning' as const,
    title: 'Connection Status',
    message: `Bot is ${status}`,
    persistent: status === 'disconnected',
    actionRequired: status === 'disconnected',
    sound: status !== 'reconnecting'
  }),

  systemError: (error: string, action?: { label: string, onClick: () => void }) => ({
    type: 'error' as const,
    title: 'System Error',
    message: error,
    persistent: true,
    actionRequired: true,
    action,
    sound: true,
    glowIntensity: 'lg' as const
  })
}

export default AlertSystem