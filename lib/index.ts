/**
 * Lifeguard Trading Core
 * Main entry point for the library
 */

// Core interfaces
export * from './plugin-interfaces';

// Signal emitter system
export {
  SignalEmitter,
  globalSignalEmitter,
  createSignalId,
  createTradeSignal
} from './signal-emitter';

// Plugin registry
export {
  PluginRegistry,
  globalRegistry,
  initializePluginSystem,
  shutdownPluginSystem
} from './plugin-registry';

// Version
export const VERSION = '1.0.0';

// Re-export types for convenience
export type {
  ITradeSignal,
  IExecutionResult,
  ITradeExecutor,
  IPluginRegistry,
  ISignalEmitter,
  IExecutorConfig,
  IStrategy,
  ITradingPlugin
} from './plugin-interfaces';