'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  level?: 'global' | 'component'
  componentName?: string
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  errorId: string
}

export class ErrorBoundary extends Component<Props, State> {
  private resetTimeoutId: number | null = null

  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: ''
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Generate a unique error ID for tracking
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    return {
      hasError: true,
      error,
      errorId
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    
    // Store error info in state
    this.setState({
      errorInfo
    })

    // Log to external error monitoring service (if available)
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'exception', {
        description: error.toString(),
        fatal: false,
        error_id: this.state.errorId
      })
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: ''
    })
  }

  handleRefresh = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/'
    }
  }

  render() {
    if (this.state.hasError) {
      // If a custom fallback is provided, use it
      if (this.props.fallback) {
        return this.props.fallback
      }

      const isGlobal = this.props.level === 'global'
      const componentName = this.props.componentName || 'component'

      if (isGlobal) {
        return (
          <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
            <Card className="max-w-lg w-full">
              <CardHeader className="text-center">
                <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mb-4">
                  <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
                </div>
                <CardTitle className="text-2xl">Something went wrong</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center text-gray-600 dark:text-gray-400">
                  <p className="mb-2">
                    We encountered an unexpected error. Don't worry, your data is safe.
                  </p>
                  <p className="text-sm">
                    Error ID: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-xs">{this.state.errorId}</code>
                  </p>
                </div>

                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    If this problem persists, please contact support with the error ID above.
                  </AlertDescription>
                </Alert>

                <div className="flex flex-col gap-3">
                  <Button onClick={this.handleReset} className="w-full">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Try Again
                  </Button>
                  
                  <Button variant="outline" onClick={this.handleRefresh} className="w-full">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh Page
                  </Button>
                  
                  <Button variant="outline" onClick={this.handleGoHome} className="w-full">
                    <Home className="w-4 h-4 mr-2" />
                    Go to Home
                  </Button>
                </div>

                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <details className="mt-6">
                    <summary className="cursor-pointer text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                      Developer Details
                    </summary>
                    <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono text-red-600 dark:text-red-400 overflow-auto max-h-40">
                      <div className="font-bold mb-1">Error:</div>
                      <div className="mb-2">{this.state.error.toString()}</div>
                      {this.state.errorInfo && (
                        <>
                          <div className="font-bold mb-1">Component Stack:</div>
                          <div className="whitespace-pre-wrap">{this.state.errorInfo.componentStack}</div>
                        </>
                      )}
                    </div>
                  </details>
                )}
              </CardContent>
            </Card>
          </div>
        )
      }

      // Component-level error boundary
      return (
        <div className="w-full h-full min-h-[200px] bg-gray-50 dark:bg-gray-900 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="mx-auto w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {componentName} unavailable
            </h3>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              This section couldn't load properly. The rest of the page should still work normally.
            </p>

            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button size="sm" variant="outline" onClick={this.handleReset}>
                <RefreshCw className="w-3 h-3 mr-1" />
                Retry
              </Button>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                  Error Details
                </summary>
                <div className="mt-1 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs font-mono text-red-600 dark:text-red-400 overflow-auto max-h-32">
                  {this.state.error.toString()}
                </div>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Higher-order component for easier usage
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  const WithErrorBoundaryComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  )

  WithErrorBoundaryComponent.displayName = `withErrorBoundary(${WrappedComponent.displayName || WrappedComponent.name})`

  return WithErrorBoundaryComponent
}

// Simplified error boundary for quick usage
export function SimpleErrorBoundary({ 
  children, 
  fallback 
}: { 
  children: ReactNode
  fallback?: ReactNode 
}) {
  return (
    <ErrorBoundary 
      level="component" 
      fallback={fallback}
    >
      {children}
    </ErrorBoundary>
  )
}