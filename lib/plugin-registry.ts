/**
 * Plugin Registry System
 * Central registry for managing trading executors and strategies
 */

import {
  ITradeExecutor,
  IPluginRegistry,
  IStrategy,
  ITradingPlugin,
  ITradeSignal,
  IExecutionResult
} from './plugin-interfaces';
import { globalSignalEmitter } from './signal-emitter';

export class PluginRegistry implements IPluginRegistry {
  private executors: Map<string, ITradeExecutor> = new Map();
  private strategies: Map<string, IStrategy> = new Map();
  private plugins: Map<string, ITradingPlugin> = new Map();
  private activeExecutor?: ITradeExecutor;
  private isInitialized = false;

  constructor() {
    console.log('🔌 Plugin Registry initialized');
  }

  /**
   * Register a trade executor
   */
  registerExecutor(executor: ITradeExecutor): void {
    if (this.executors.has(executor.name)) {
      throw new Error(`Executor ${executor.name} is already registered`);
    }

    this.executors.set(executor.name, executor);
    console.log(`✅ Registered executor: ${executor.name} v${executor.version}`);

    // If no active executor, set this as active
    if (!this.activeExecutor) {
      this.setActiveExecutor(executor.name);
    }
  }

  /**
   * Unregister a trade executor
   */
  unregisterExecutor(name: string): void {
    const executor = this.executors.get(name);
    if (!executor) {
      throw new Error(`Executor ${name} not found`);
    }

    // Shutdown executor before removing
    executor.shutdown().catch(console.error);

    this.executors.delete(name);
    console.log(`🗑️ Unregistered executor: ${name}`);

    // If this was the active executor, clear it
    if (this.activeExecutor === executor) {
      this.activeExecutor = undefined;
    }
  }

  /**
   * Get an executor by name
   */
  getExecutor(name: string): ITradeExecutor | undefined {
    return this.executors.get(name);
  }

  /**
   * List all registered executors
   */
  listExecutors(): string[] {
    return Array.from(this.executors.keys());
  }

  /**
   * Set the active executor
   */
  async setActiveExecutor(name: string): Promise<void> {
    const executor = this.executors.get(name);
    if (!executor) {
      throw new Error(`Executor ${name} not found`);
    }

    // Shutdown previous executor if exists
    if (this.activeExecutor && this.activeExecutor !== executor) {
      await this.activeExecutor.shutdown();
    }

    // Initialize new executor
    await executor.initialize();
    this.activeExecutor = executor;

    console.log(`🎯 Active executor set to: ${name}`);
  }

  /**
   * Get the active executor
   */
  getActiveExecutor(): ITradeExecutor | undefined {
    return this.activeExecutor;
  }

  /**
   * Register a strategy
   */
  registerStrategy(strategy: IStrategy): void {
    if (this.strategies.has(strategy.name)) {
      throw new Error(`Strategy ${strategy.name} is already registered`);
    }

    this.strategies.set(strategy.name, strategy);
    console.log(`📊 Registered strategy: ${strategy.name}`);
  }

  /**
   * Get a strategy by name
   */
  getStrategy(name: string): IStrategy | undefined {
    return this.strategies.get(name);
  }

  /**
   * List all strategies
   */
  listStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Register a plugin
   */
  async registerPlugin(plugin: ITradingPlugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} is already registered`);
    }

    // Install the plugin
    await plugin.install(this);
    this.plugins.set(plugin.name, plugin);

    console.log(`🔧 Registered plugin: ${plugin.name} v${plugin.version} (${plugin.type})`);
  }

  /**
   * Unregister a plugin
   */
  async unregisterPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not found`);
    }

    await plugin.uninstall();
    this.plugins.delete(name);

    console.log(`🗑️ Unregistered plugin: ${name}`);
  }

  /**
   * Initialize the registry and connect signal handling
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Set up signal listener to forward to active executor
    globalSignalEmitter.on('signal', async (signal: ITradeSignal) => {
      if (this.activeExecutor && this.activeExecutor.isReady()) {
        try {
          const result = await this.activeExecutor.execute(signal);
          globalSignalEmitter.emit('execution', result);
        } catch (error) {
          console.error(`Failed to execute signal: ${error}`);
          globalSignalEmitter.emit('execution', {
            signalId: signal.id,
            success: false,
            executedAt: Date.now(),
            error: error instanceof Error ? error.message : 'Unknown error'
          } as IExecutionResult);
        }
      } else {
        console.warn('No active executor available to handle signal');
      }
    });

    this.isInitialized = true;
    console.log('✅ Plugin Registry initialized and ready');
  }

  /**
   * Shutdown the registry and all plugins
   */
  async shutdown(): Promise<void> {
    console.log('🔌 Shutting down Plugin Registry...');

    // Shutdown all executors
    for (const [name, executor] of this.executors) {
      try {
        await executor.shutdown();
        console.log(`  ✓ Shutdown executor: ${name}`);
      } catch (error) {
        console.error(`  ✗ Failed to shutdown executor ${name}:`, error);
      }
    }

    // Uninstall all plugins
    for (const [name, plugin] of this.plugins) {
      try {
        await plugin.uninstall();
        console.log(`  ✓ Uninstalled plugin: ${name}`);
      } catch (error) {
        console.error(`  ✗ Failed to uninstall plugin ${name}:`, error);
      }
    }

    // Clear all registrations
    this.executors.clear();
    this.strategies.clear();
    this.plugins.clear();
    this.activeExecutor = undefined;
    this.isInitialized = false;

    // Remove signal listeners
    globalSignalEmitter.removeAllListeners('signal');

    console.log('✅ Plugin Registry shutdown complete');
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    executors: number;
    strategies: number;
    plugins: number;
    activeExecutor: string | null;
  } {
    return {
      executors: this.executors.size,
      strategies: this.strategies.size,
      plugins: this.plugins.size,
      activeExecutor: this.activeExecutor?.name || null
    };
  }
}

// Global registry instance
export const globalRegistry = new PluginRegistry();

// Export convenience functions
export async function initializePluginSystem(): Promise<void> {
  await globalRegistry.initialize();
}

export async function shutdownPluginSystem(): Promise<void> {
  await globalRegistry.shutdown();
}