/**
 * Market constants from Drift Protocol SDK
 * @see https://github.com/drift-labs/protocol-v2/blob/master/sdk/src/constants/perpMarkets.ts
 */

import { MainnetPerpMarkets, DevnetPerpMarkets } from '@drift-labs/sdk';

/**
 * Get market index by asset symbol from the SDK's official market configurations
 * This is the single source of truth - all other functions use this internally
 */
export function getMarketIndex(asset: string, env: 'mainnet-beta' | 'devnet' = 'mainnet-beta'): number {
  const isMainnet = env === 'mainnet-beta';
  const markets = isMainnet ? MainnetPerpMarkets : DevnetPerpMarkets;

  const market = markets.find(m =>
    m.baseAssetSymbol.toUpperCase() === asset.toUpperCase()
  );

  if (!market) {
    throw new Error(`Market not found for asset: ${asset}`);
  }

  return market.marketIndex;
}

/**
 * @deprecated Use getMarketIndex instead. Kept for backwards compatibility.
 */
export const getPerpMarketIndex = getMarketIndex;

/**
 * DRY-compliant market indices object - dynamically generated from SDK
 * No more duplicate MAINNET/DEVNET objects with identical values!
 */
export const PERP_MARKET_INDEX = {
  get MAINNET() {
    return this._createIndicesProxy('mainnet-beta');
  },
  get DEVNET() {
    return this._createIndicesProxy('devnet');
  },
  _createIndicesProxy(env: 'mainnet-beta' | 'devnet') {
    return new Proxy({} as Record<string, number>, {
      get(target, prop) {
        if (typeof prop === 'string') {
          try {
            return getMarketIndex(prop, env);
          } catch {
            return undefined;
          }
        }
        return undefined;
      }
    });
  }
} as const;

// Export specific indices for backwards compatibility - now DRY!
export const ETH_PERP_MARKET_INDEX_MAINNET = getMarketIndex('ETH', 'mainnet-beta');
export const BTC_PERP_MARKET_INDEX_MAINNET = getMarketIndex('BTC', 'mainnet-beta');
export const SOL_PERP_MARKET_INDEX_MAINNET = getMarketIndex('SOL', 'mainnet-beta');