import { readFileSync, writeFileSync, existsSync, watchFile } from 'fs';
import { TradingConfig, DEFAULT_CONFIG } from './config';

const CONFIG_FILE = './trading-config.json';

export class ConfigurationManager {
  private config: TradingConfig;
  private watchers: Array<(config: TradingConfig) => void> = [];

  constructor() {
    this.config = this.loadConfig();
  }

  loadConfig(): TradingConfig {
    try {
      if (!existsSync(CONFIG_FILE)) {
        this.saveConfig(DEFAULT_CONFIG);
        return DEFAULT_CONFIG;
      }

      const content = readFileSync(CONFIG_FILE, 'utf-8');
      const loaded = JSON.parse(content) as Partial<TradingConfig>;

      // Merge with defaults to ensure all fields exist
      this.config = {
        ...DEFAULT_CONFIG,
        ...loaded,
        dataInterval: (loaded as any).timeframe || loaded.dataInterval || DEFAULT_CONFIG.dataInterval
      };

      return this.config;
    } catch (error) {
      console.error('Error loading config:', error);
      return DEFAULT_CONFIG;
    }
  }

  saveConfig(config: TradingConfig): void {
    try {
      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
      this.config = config;
      this.notifyWatchers(config);
    } catch (error) {
      console.error('Error saving config:', error);
    }
  }

  getConfig(): TradingConfig {
    return this.config;
  }

  updateConfig(updates: Partial<TradingConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig(this.config);
  }

  watchConfig(callback: (config: TradingConfig) => void): void {
    this.watchers.push(callback);

    // Set up file watcher for hot-reload
    watchFile(CONFIG_FILE, { interval: 1000 }, () => {
      const newConfig = this.loadConfig();
      if (JSON.stringify(newConfig) !== JSON.stringify(this.config)) {
        this.config = newConfig;
        this.notifyWatchers(newConfig);
      }
    });
  }

  private notifyWatchers(config: TradingConfig): void {
    this.watchers.forEach(callback => callback(config));
  }

  // Validation helpers
  isEnabled(): boolean {
    return this.config.enabled;
  }

  getAsset(): string {
    return this.config.asset;
  }

  getLeverage(): number {
    return this.config.leverage;
  }

  getThresholds(): { low: number; high: number } {
    return {
      low: this.config.lowThreshold,
      high: this.config.highThreshold
    };
  }

  getStrategy(): 'momentum' | 'contrarian' {
    return this.config.strategy;
  }

  getDataInterval(): '15min' | '1h' | '4h' | '24h' {
    return this.config.dataInterval;
  }

  getMaxPositionRatio(): number {
    return this.config.maxPositionRatio;
  }
}