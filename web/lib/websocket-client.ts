/**
 * WebSocket client for real-time updates in Lifeguard Token Vault
 * Handles connection management, automatic reconnection, and event dispatching
 */

import * as React from 'react'
import { WebSocketMessage, WebSocketConnectionState, TradingStatus, Transaction, FGIUpdate, PriceUpdate } from './types'

type EventHandler<T = any> = (data: T) => void

export interface WebSocketClientOptions {
  url?: string
  reconnectInterval?: number
  maxReconnectAttempts?: number
  heartbeatInterval?: number
  fallbackToPolling?: () => void
}

export class WebSocketClient {
  private ws: WebSocket | null = null
  private readonly url: string
  private readonly options: Required<WebSocketClientOptions>
  private connectionState: WebSocketConnectionState
  private reconnectTimeoutId: NodeJS.Timeout | null = null
  private heartbeatIntervalId: NodeJS.Timeout | null = null
  private eventHandlers: Map<string, Set<EventHandler>> = new Map()
  private fallbackActive = false

  constructor(options: WebSocketClientOptions = {}) {
    // WebSocket server runs on port 3001 due to Next.js 15 limitations
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
    
    this.options = {
      url: `${protocol}//${hostname}:3001`,
      reconnectInterval: 1000, // Start with 1 second
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000, // 30 seconds
      fallbackToPolling: () => {}, // No-op by default
      ...options
    }
    
    this.url = this.options.url
    this.connectionState = {
      status: 'disconnected',
      reconnectAttempts: 0
    }
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve()
        return
      }

      this.updateConnectionState({ status: 'connecting' })
      
      try {
        this.ws = new WebSocket(this.url)
        
        // Connection opened
        this.ws.onopen = () => {
          this.updateConnectionState({
            status: 'connected',
            lastConnected: Date.now(),
            reconnectAttempts: 0,
            error: undefined
          })
          this.fallbackActive = false
          this.startHeartbeat()
          resolve()
        }

        // Message received
        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data)
            this.handleMessage(message)
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error)
          }
        }

        // Connection closed
        this.ws.onclose = (event) => {
          this.stopHeartbeat()
          
          if (event.wasClean) {
            this.updateConnectionState({ status: 'disconnected' })
          } else {
            this.updateConnectionState({ status: 'error', error: 'Connection lost' })
            this.scheduleReconnect()
          }
        }

        // Connection error
        this.ws.onerror = (error) => {
          this.updateConnectionState({ 
            status: 'error', 
            error: 'WebSocket connection failed'
          })
          reject(new Error('WebSocket connection failed'))
        }

      } catch (error) {
        this.updateConnectionState({ 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        reject(error)
      }
    })
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId)
      this.reconnectTimeoutId = null
    }
    
    this.stopHeartbeat()
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
    
    this.updateConnectionState({ status: 'disconnected' })
  }

  /**
   * Send a message to the server
   */
  send(message: Partial<WebSocketMessage>): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        const fullMessage: WebSocketMessage = {
          timestamp: Date.now(),
          ...message
        } as WebSocketMessage
        
        this.ws.send(JSON.stringify(fullMessage))
        return true
      } catch (error) {
        console.error('Failed to send WebSocket message:', error)
        return false
      }
    }
    return false
  }

  /**
   * Subscribe to bot status updates
   */
  onBotStatus(handler: EventHandler<TradingStatus>): () => void {
    return this.addEventListener('bot_status', handler)
  }

  /**
   * Subscribe to trade updates
   */
  onTradeUpdate(handler: EventHandler<Transaction>): () => void {
    return this.addEventListener('trade_update', handler)
  }

  /**
   * Subscribe to FGI updates
   */
  onFGIUpdate(handler: EventHandler<FGIUpdate>): () => void {
    return this.addEventListener('fgi_update', handler)
  }

  /**
   * Subscribe to price updates
   */
  onPriceUpdate(handler: EventHandler<PriceUpdate>): () => void {
    return this.addEventListener('price_update', handler)
  }

  /**
   * Subscribe to connection status changes
   */
  onConnectionStatus(handler: EventHandler<WebSocketConnectionState>): () => void {
    return this.addEventListener('connection_status', handler)
  }

  /**
   * Subscribe to errors
   */
  onError(handler: EventHandler<{ message: string; code?: string }>): () => void {
    return this.addEventListener('error', handler)
  }

  /**
   * Get current connection state
   */
  getConnectionState(): WebSocketConnectionState {
    return { ...this.connectionState }
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.connectionState.status === 'connected' && this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * Private methods
   */

  private addEventListener(eventType: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set())
    }
    
    this.eventHandlers.get(eventType)!.add(handler)
    
    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(eventType)
      if (handlers) {
        handlers.delete(handler)
      }
    }
  }

  private handleMessage(message: WebSocketMessage): void {
    // Handle ping/pong for heartbeat
    if (message.type === 'ping') {
      this.send({ type: 'pong', data: {} })
      return
    }

    // Dispatch to registered handlers
    const handlers = this.eventHandlers.get(message.type)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(message.data)
        } catch (error) {
          console.error(`Error in WebSocket event handler for ${message.type}:`, error)
        }
      })
    }

    // Special handling for connection status
    if (message.type === 'connection_status') {
      this.notifyConnectionStatusChange()
    }
  }

  private updateConnectionState(updates: Partial<WebSocketConnectionState>): void {
    this.connectionState = { ...this.connectionState, ...updates }
    this.notifyConnectionStatusChange()
  }

  private notifyConnectionStatusChange(): void {
    const handlers = this.eventHandlers.get('connection_status')
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(this.connectionState)
        } catch (error) {
          console.error('Error in connection status handler:', error)
        }
      })
    }
  }

  private scheduleReconnect(): void {
    if (this.connectionState.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.updateConnectionState({ 
        status: 'error', 
        error: 'Max reconnection attempts reached'
      })
      
      // Activate fallback to polling
      if (!this.fallbackActive) {
        this.fallbackActive = true
        this.options.fallbackToPolling()
      }
      return
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
    const backoffDelay = Math.min(
      this.options.reconnectInterval * Math.pow(2, this.connectionState.reconnectAttempts),
      30000
    )

    this.updateConnectionState({ 
      reconnectAttempts: this.connectionState.reconnectAttempts + 1 
    })

    this.reconnectTimeoutId = setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error)
        this.scheduleReconnect()
      })
    }, backoffDelay)
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    
    this.heartbeatIntervalId = setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'ping', data: {} })
      }
    }, this.options.heartbeatInterval)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId)
      this.heartbeatIntervalId = null
    }
  }
}

/**
 * Hook for using WebSocket client in React components
 */
export function useWebSocketClient(options: WebSocketClientOptions = {}) {
  const clientRef = React.useRef<WebSocketClient | null>(null)
  
  // Initialize client on first render
  if (!clientRef.current) {
    clientRef.current = new WebSocketClient(options)
  }

  const client = clientRef.current

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      client.disconnect()
    }
  }, [client])

  return client
}

// Export singleton instance for non-React usage
let singletonClient: WebSocketClient | null = null

export function getWebSocketClient(options: WebSocketClientOptions = {}): WebSocketClient {
  if (!singletonClient) {
    singletonClient = new WebSocketClient(options)
  }
  return singletonClient
}