import {
  BN,
  DriftClient,
  MarketType,
  PositionDirection,
  BASE_PRECISION,
  PRICE_PRECISION,
  convertToNumber,
  calculatePositionPNL
} from '@drift-labs/sdk';
import { PublicKey, TransactionSignature } from '@solana/web3.js';

export interface PositionParams {
  direction: PositionDirection;
  baseAssetAmount: BN;
  marketIndex: number;
}

export interface Position {
  direction: PositionDirection;
  baseAssetAmount: BN;
  quoteAssetAmount: BN;
  marketIndex: number;
}

export class DriftClientWrapper {
  constructor(private driftClient: DriftClient) {}

  async getPosition(marketIndex: number): Promise<Position | null> {
    try {
      const user = this.driftClient.getUser();
      const position = user.getPerpPosition(marketIndex);

      if (!position || position.baseAssetAmount.eq(new BN(0))) {
        return null;
      }

      return {
        direction: position.baseAssetAmount.gt(new BN(0))
          ? PositionDirection.LONG
          : PositionDirection.SHORT,
        baseAssetAmount: position.baseAssetAmount,
        quoteAssetAmount: position.quoteAssetAmount,
        marketIndex
      };
    } catch (error) {
      console.error('Error getting position:', error);
      return null;
    }
  }

  async closePosition(marketIndex: number): Promise<TransactionSignature | null> {
    try {
      const position = await this.getPosition(marketIndex);
      if (!position) return null;

      const tx = await this.driftClient.closePerpPosition(marketIndex);
      console.log(`Position closed. TX: ${tx}`);
      return tx;
    } catch (error) {
      console.error('Error closing position:', error);
      return null;
    }
  }

  async openPosition(params: PositionParams): Promise<TransactionSignature | null> {
    try {
      const tx = await this.driftClient.openPosition(
        params.direction,
        params.baseAssetAmount,
        params.marketIndex,
        MarketType.PERP
      );
      console.log(`Position opened. TX: ${tx}`);
      return tx;
    } catch (error) {
      console.error('Error opening position:', error);
      return null;
    }
  }

  async calculatePnL(marketIndex: number): Promise<number> {
    try {
      const user = this.driftClient.getUser();
      const perpPosition = user.getPerpPosition(marketIndex);

      if (!perpPosition || perpPosition.baseAssetAmount.eq(new BN(0))) {
        return 0;
      }

      const market = this.driftClient.getPerpMarketAccount(marketIndex);
      if (!market) return 0;

      // Get oracle price data using the SDK's method
      const oraclePriceData = this.driftClient.getOracleDataForPerpMarket(marketIndex);
      if (!oraclePriceData) {
        console.warn('No oracle price data available for market', marketIndex);
        return 0;
      }

      const pnl = calculatePositionPNL(
        market,
        perpPosition,
        true,
        oraclePriceData
      );

      return convertToNumber(pnl, PRICE_PRECISION);
    } catch (error) {
      console.error('Error calculating PnL:', error);
      return 0;
    }
  }

  async getCollateral(): Promise<number> {
    try {
      const user = this.driftClient.getUser();
      const totalCollateral = user.getTotalCollateral();
      return convertToNumber(totalCollateral, PRICE_PRECISION);
    } catch (error) {
      console.error('Error getting collateral:', error);
      return 0;
    }
  }
}