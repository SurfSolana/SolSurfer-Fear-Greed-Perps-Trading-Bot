/**
 * Signal Emitter System
 * Provides event-driven communication between core trading bot and executors
 */

import { EventEmitter } from 'events';
import { ITradeSignal, ISignalEmitter, IExecutionResult } from './plugin-interfaces';

export class SignalEmitter extends EventEmitter implements ISignalEmitter {
  private signalHistory: ITradeSignal[] = [];
  private maxHistorySize = 100;

  constructor() {
    super();
    this.setMaxListeners(20); // Allow multiple executors to listen
  }

  /**
   * Emit a trade signal
   */
  emit(event: 'signal', signal: ITradeSignal): boolean;
  emit(event: 'execution', result: IExecutionResult): boolean;
  emit(event: string, ...args: any[]): boolean {
    if (event === 'signal') {
      const signal = args[0] as ITradeSignal;
      this.addToHistory(signal);
      console.log(`📡 Emitting trade signal: ${signal.action} ${signal.asset} (${signal.strategy})`);
    }
    return super.emit(event, ...args);
  }

  /**
   * Listen for trade signals
   */
  on(event: 'signal', listener: (signal: ITradeSignal) => void): this;
  on(event: 'execution', listener: (result: IExecutionResult) => void): this;
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  /**
   * Remove listener
   */
  off(event: 'signal', listener: (signal: ITradeSignal) => void): this;
  off(event: 'execution', listener: (result: IExecutionResult) => void): this;
  off(event: string, listener: (...args: any[]) => void): this {
    return super.off(event, listener);
  }

  /**
   * Add signal to history
   */
  private addToHistory(signal: ITradeSignal): void {
    this.signalHistory.push(signal);
    if (this.signalHistory.length > this.maxHistorySize) {
      this.signalHistory.shift();
    }
  }

  /**
   * Get signal history
   */
  getHistory(): ITradeSignal[] {
    return [...this.signalHistory];
  }

  /**
   * Clear signal history
   */
  clearHistory(): void {
    this.signalHistory = [];
  }

  /**
   * Get recent signals
   */
  getRecentSignals(count: number = 10): ITradeSignal[] {
    return this.signalHistory.slice(-count);
  }
}

// Global signal emitter instance
export const globalSignalEmitter = new SignalEmitter();

// Helper function to create signal IDs
export function createSignalId(): string {
  return `signal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Helper function to create a trade signal
export function createTradeSignal(params: {
  asset: 'SOL' | 'ETH' | 'BTC';
  action: 'BUY' | 'SELL' | 'CLOSE';
  strategy: 'contrarian' | 'momentum';
  confidence: number;
  fgiValue: number;
  fgiThreshold: number;
  leverage?: number;
  reason: string;
}): ITradeSignal {
  return {
    id: createSignalId(),
    timestamp: Date.now(),
    asset: params.asset,
    action: params.action,
    confidence: params.confidence,
    strategy: params.strategy,
    metadata: {
      fgiValue: params.fgiValue,
      fgiThreshold: params.fgiThreshold,
      leverage: params.leverage,
      reason: params.reason
    }
  };
}