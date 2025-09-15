import { MainnetPerpMarkets, DevnetPerpMarkets, PerpMarketConfig } from '@drift-labs/sdk';

export function getPerpMarket(symbol: string, isDev: boolean = false): PerpMarketConfig {
  const markets = isDev ? DevnetPerpMarkets : MainnetPerpMarkets;
  const market = markets.find(m => m.baseAssetSymbol === symbol);

  if (!market) {
    throw new Error(`Market ${symbol} not found in ${isDev ? 'Devnet' : 'Mainnet'} markets`);
  }

  return market;
}