import { PositionDirection } from '@drift-labs/sdk';
import { BN } from '@coral-xyz/anchor';

export interface PositionState {
  hasPosition: boolean;
  direction: PositionDirection | null;
  entryPrice: number;
  size: number;
  timestamp: Date | null;
  unrealizedPnL: number;
  realizedPnL: number;
  targetDirection: PositionDirection | null;
  lastFGI: number;
}

export const EMPTY_POSITION_STATE: PositionState = {
  hasPosition: false,
  direction: null,
  entryPrice: 0,
  size: 0,
  timestamp: null,
  unrealizedPnL: 0,
  realizedPnL: 0,
  targetDirection: null,
  lastFGI: 0
};

export function createPositionState(overrides: Partial<PositionState> = {}): PositionState {
  return {
    ...EMPTY_POSITION_STATE,
    ...overrides
  };
}

export function updatePositionState(
  state: PositionState,
  updates: Partial<PositionState>
): PositionState {
  return {
    ...state,
    ...updates
  };
}

export function resetPositionState(state: PositionState): PositionState {
  return {
    ...EMPTY_POSITION_STATE,
    realizedPnL: state.realizedPnL, // Preserve cumulative realized PnL
    lastFGI: state.lastFGI // Preserve last FGI reading
  };
}

export function positionStateFromDrift(
  position: any,
  currentPrice: number,
  lastFGI: number
): PositionState {
  if (!position || position.baseAssetAmount.eq(new BN(0))) {
    return createPositionState({ lastFGI });
  }

  const isLong = position.baseAssetAmount.gt(new BN(0));
  const size = Math.abs(position.baseAssetAmount.toNumber()) / 1e9; // Convert from base precision
  const entryPrice = Math.abs(position.quoteAssetAmount.toNumber() / position.baseAssetAmount.toNumber());

  const unrealizedPnL = isLong
    ? (currentPrice - entryPrice) * size
    : (entryPrice - currentPrice) * size;

  return {
    hasPosition: true,
    direction: isLong ? PositionDirection.LONG : PositionDirection.SHORT,
    entryPrice,
    size,
    timestamp: new Date(),
    unrealizedPnL,
    realizedPnL: 0,
    targetDirection: null,
    lastFGI
  };
}

export function shouldClosePosition(
  state: PositionState,
  targetDirection: PositionDirection | null
): boolean {
  if (!state.hasPosition) return false;
  if (!targetDirection) return false;
  return state.direction !== targetDirection;
}

export function formatPositionState(state: PositionState): string {
  if (!state.hasPosition) {
    return `No position | Last FGI: ${state.lastFGI}`;
  }

  const direction = state.direction === PositionDirection.LONG ? 'LONG' : 'SHORT';
  const pnl = state.unrealizedPnL >= 0 ? '+' : '';

  return `${direction} ${state.size.toFixed(4)} @ $${state.entryPrice.toFixed(2)} | PnL: ${pnl}$${state.unrealizedPnL.toFixed(2)}`;
}