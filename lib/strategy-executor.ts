import { PositionDirection } from '@drift-labs/sdk';
import { TradingConfig } from './config';

export interface FGIData {
  value: number;
  timestamp: string;
  classification: string;
}

export interface StrategyDecision {
  shouldTrade: boolean;
  targetDirection: PositionDirection | null;
  reason: string;
  fgiValue: number;
  thresholds: {
    low: number;
    high: number;
  };
}

export class StrategyExecutor {
  constructor(private config: TradingConfig) {}

  updateConfig(config: TradingConfig): void {
    this.config = config;
  }

  makeDecision(fgiValue: number): StrategyDecision {
    const thresholds = {
      low: this.config.lowThreshold,
      high: this.config.highThreshold
    };

    // Determine target direction based on strategy
    let targetDirection: PositionDirection | null = null;
    let reason = '';

    if (this.config.strategy === 'momentum') {
      if (fgiValue <= thresholds.low) {
        targetDirection = PositionDirection.SHORT;
        reason = `FGI ${fgiValue} ≤ ${thresholds.low} (Fear) → SHORT`;
      } else if (fgiValue >= thresholds.high) {
        targetDirection = PositionDirection.LONG;
        reason = `FGI ${fgiValue} ≥ ${thresholds.high} (Greed) → LONG`;
      } else {
        reason = `FGI ${fgiValue} in neutral zone (${thresholds.low}-${thresholds.high})`;
      }
    } else {
      // Contrarian strategy
      if (fgiValue <= thresholds.low) {
        targetDirection = PositionDirection.LONG;
        reason = `FGI ${fgiValue} ≤ ${thresholds.low} (Fear) → LONG (contrarian)`;
      } else if (fgiValue >= thresholds.high) {
        targetDirection = PositionDirection.SHORT;
        reason = `FGI ${fgiValue} ≥ ${thresholds.high} (Greed) → SHORT (contrarian)`;
      } else {
        reason = `FGI ${fgiValue} in neutral zone (${thresholds.low}-${thresholds.high})`;
      }
    }

    return {
      shouldTrade: targetDirection !== null,
      targetDirection,
      reason,
      fgiValue,
      thresholds
    };
  }

  shouldGoLong(fgiValue: number): boolean {
    const decision = this.makeDecision(fgiValue);
    return decision.targetDirection === PositionDirection.LONG;
  }

  shouldGoShort(fgiValue: number): boolean {
    const decision = this.makeDecision(fgiValue);
    return decision.targetDirection === PositionDirection.SHORT;
  }

  getPositionSizeMultiplier(fgiValue: number): number {
    // Optional: Scale position size based on FGI extremes
    // This keeps existing behavior of using full position size
    return 1.0;
  }

  formatDecision(decision: StrategyDecision): string {
    const strategy = this.config.strategy.toUpperCase();
    const asset = this.config.asset;

    if (!decision.shouldTrade) {
      return `[${strategy}] ${asset}: ${decision.reason}`;
    }

    const direction = decision.targetDirection === PositionDirection.LONG ? 'LONG' : 'SHORT';
    return `[${strategy}] ${asset}: ${decision.reason} | Leverage: ${this.config.leverage}x`;
  }

  getStrategyDescription(): string {
    const { strategy, asset, leverage, lowThreshold, highThreshold } = this.config;

    if (strategy === 'momentum') {
      return `Momentum Strategy: ${asset} ${leverage}x
        - SHORT when FGI ≤ ${lowThreshold} (Fear)
        - LONG when FGI ≥ ${highThreshold} (Greed)`;
    } else {
      return `Contrarian Strategy: ${asset} ${leverage}x
        - LONG when FGI ≤ ${lowThreshold} (Fear)
        - SHORT when FGI ≥ ${highThreshold} (Greed)`;
    }
  }
}