/**
 * Plugin Interface Definitions
 * These interfaces allow the vault (or any execution provider) to connect
 * to the core trading bot without tight coupling.
 */

// Trade signal emitted by core bot
export interface ITradeSignal {
  id: string;
  timestamp: number;
  asset: 'SOL' | 'ETH' | 'BTC';
  action: 'BUY' | 'SELL' | 'CLOSE';
  confidence: number; // 0-100
  strategy: 'contrarian' | 'momentum';
  metadata: {
    fgiValue: number;
    fgiThreshold: number;
    leverage?: number;
    reason: string;
  };
}

// Trade execution result
export interface IExecutionResult {
  signalId: string;
  success: boolean;
  executedAt: number;
  transactionId?: string;
  error?: string;
  details?: {
    price: number;
    quantity: number;
    fees: number;
    slippage?: number;
  };
}

// Main executor interface that vault implements
export interface ITradeExecutor {
  name: string;
  version: string;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;

  // Trading
  execute(signal: ITradeSignal): Promise<IExecutionResult>;

  // Status
  isReady(): boolean;
  getBalance(): Promise<{ total: number; available: number }>;
  getPositions(): Promise<Array<{
    asset: string;
    side: 'long' | 'short';
    size: number;
    entryPrice: number;
    pnl: number;
  }>>;
}

// Plugin registration interface
export interface IPluginRegistry {
  registerExecutor(executor: ITradeExecutor): void;
  unregisterExecutor(name: string): void;
  getExecutor(name: string): ITradeExecutor | undefined;
  listExecutors(): string[];
}

// Event emitter for signals
export interface ISignalEmitter {
  on(event: 'signal', listener: (signal: ITradeSignal) => void): void;
  off(event: 'signal', listener: (signal: ITradeSignal) => void): void;
  emit(event: 'signal', signal: ITradeSignal): void;
}

// Configuration for executors
export interface IExecutorConfig {
  mode: 'live' | 'paper' | 'backtest';
  maxPositionSize?: number;
  maxLeverage?: number;
  stopLoss?: number;
  takeProfit?: number;
  customSettings?: Record<string, any>;
}

// Strategy interface for extending core strategies
export interface IStrategy {
  name: string;
  description: string;

  // Called on each FGI update
  evaluate(fgiValue: number, marketData: any): ITradeSignal | null;

  // Configuration
  getParameters(): Record<string, any>;
  setParameters(params: Record<string, any>): void;
}

// Main plugin interface
export interface ITradingPlugin {
  name: string;
  version: string;
  type: 'executor' | 'strategy' | 'indicator' | 'data-source';

  // Lifecycle
  install(registry: IPluginRegistry): Promise<void>;
  uninstall(): Promise<void>;

  // Configuration
  configure(config: Record<string, any>): void;
  getConfig(): Record<string, any>;
}

// Export type guards
export const isTradeSignal = (obj: any): obj is ITradeSignal => {
  return obj &&
    typeof obj.id === 'string' &&
    typeof obj.timestamp === 'number' &&
    ['SOL', 'ETH', 'BTC'].includes(obj.asset) &&
    ['BUY', 'SELL', 'CLOSE'].includes(obj.action);
};

export const isExecutionResult = (obj: any): obj is IExecutionResult => {
  return obj &&
    typeof obj.signalId === 'string' &&
    typeof obj.success === 'boolean' &&
    typeof obj.executedAt === 'number';
};