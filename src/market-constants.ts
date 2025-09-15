/**
 * Market constants from Drift Protocol SDK
 * @see https://github.com/drift-labs/protocol-v2/blob/master/sdk/src/constants/perpMarkets.ts
 */

import { MainnetPerpMarkets, DevnetPerpMarkets } from '@drift-labs/sdk';

/**
 * Get market index by asset symbol from the SDK's official market configurations
 */
export function getPerpMarketIndex(asset: string, isMainnet: boolean = true): number {
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
 * Market indices from Drift SDK for common assets
 * These match the official Drift Protocol market indices
 */
export const PERP_MARKET_INDEX = {
  // Mainnet indices
  MAINNET: {
    SOL: 0,
    BTC: 1,
    ETH: 2,
    APT: 3,
    BONK: 4,  // 1MBONK
    POL: 5,
    ARB: 6,
    DOGE: 7,
    BNB: 8,
    SUI: 9,
    PEPE: 10, // 1MPEPE
    OP: 11,
    RENDER: 12,
    XRP: 13,
    HNT: 14,
    INJ: 15,
    LINK: 16,
    RLB: 17,
    PYTH: 18,
    TIA: 19,
    JTO: 20,
  },
  // Devnet indices (same as mainnet for major markets)
  DEVNET: {
    SOL: 0,
    BTC: 1,
    ETH: 2,
    APT: 3,
    BONK: 4,
    POL: 5,
    ARB: 6,
    DOGE: 7,
    BNB: 8,
    SUI: 9,
    PEPE: 10,
    OP: 11,
    RENDER: 12,
    XRP: 13,
    HNT: 14,
    INJ: 15,
    LINK: 16,
    RLB: 17,
    PYTH: 18,
    TIA: 19,
    JTO: 20,
  }
} as const;

/**
 * Get the correct market index based on environment and asset
 */
export function getMarketIndex(asset: string, env: 'mainnet-beta' | 'devnet' = 'mainnet-beta'): number {
  const isMainnet = env === 'mainnet-beta';
  const indices = isMainnet ? PERP_MARKET_INDEX.MAINNET : PERP_MARKET_INDEX.DEVNET;

  const upperAsset = asset.toUpperCase();

  if (!(upperAsset in indices)) {
    // Fallback to SDK lookup
    return getPerpMarketIndex(asset, isMainnet);
  }

  return indices[upperAsset as keyof typeof indices];
}

// Export specific indices for backwards compatibility
export const ETH_PERP_MARKET_INDEX_MAINNET = PERP_MARKET_INDEX.MAINNET.ETH;
export const BTC_PERP_MARKET_INDEX_MAINNET = PERP_MARKET_INDEX.MAINNET.BTC;
export const SOL_PERP_MARKET_INDEX_MAINNET = PERP_MARKET_INDEX.MAINNET.SOL;