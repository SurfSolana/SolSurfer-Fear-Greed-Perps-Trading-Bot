import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { 
  DriftClient, 
  User, 
  Wallet, 
  BulkAccountLoader,
  initialize,
  BN,
  BASE_PRECISION,
  QUOTE_PRECISION,
  PRICE_PRECISION,
  OrderType,
  PositionDirection,
  getMarketOrderParams,
  PostOnlyParams,
  convertToNumber,
  DriftEnv
} from '@drift-labs/sdk';
import bs58 from 'bs58';
import chalk from 'chalk';

// Configuration
export const DRIFT_CONFIG = {
  // Environment: 'devnet' for testing, 'mainnet-beta' for production
  ENV: (process.env.DRIFT_ENV || 'mainnet-beta') as DriftEnv,
  
  // Market indices
  ETH_PERP_MARKET_INDEX: parseInt(process.env.DRIFT_ETH_MARKET_INDEX || '2'),
  
  // Connection settings
  RPC_ENDPOINTS: {
    devnet: 'https://api.devnet.solana.com',
    mainnet: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
  },
  
  // Risk parameters
  MAX_SLIPPAGE_BPS: parseInt(process.env.MAX_SLIPPAGE_BPS || '100'), // 1%
  ORACLE_STALENESS_THRESHOLD: parseInt(process.env.ORACLE_STALENESS_THRESHOLD || '30'), // seconds
  
  // Retry settings
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000
};

export class DriftTradingClient {
  private connection: Connection;
  private wallet: Wallet;
  private driftClient?: DriftClient;
  private user?: User;
  private bulkAccountLoader?: BulkAccountLoader;
  private isInitialized: boolean = false;

  constructor(privateKey: string) {
    // Setup wallet from private key
    const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
    this.wallet = new Wallet(keypair);
    
    // Setup connection - use config values
    const rpcUrl = DRIFT_CONFIG.ENV === 'devnet' 
      ? DRIFT_CONFIG.RPC_ENDPOINTS.devnet
      : DRIFT_CONFIG.RPC_ENDPOINTS.mainnet;
      
    this.connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000
    });

    console.log(chalk.cyan(`🔧 Drift client configured for ${DRIFT_CONFIG.ENV}`));
    console.log(chalk.cyan(`📡 RPC: ${rpcUrl}`));
    console.log(chalk.cyan(`👛 Wallet: ${this.wallet.publicKey.toBase58()}`))
  }
  
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log(chalk.yellow('⚠️ Drift client already initialized'));
      return;
    }
    
    try {
      console.log(chalk.cyan('🚀 Initializing Drift Protocol client...'));
      
      // Initialize SDK configuration
      const sdkConfig = initialize({ env: DRIFT_CONFIG.ENV });
      
      // Setup bulk account loader for efficiency
      this.bulkAccountLoader = new BulkAccountLoader(
        this.connection,
        'confirmed',
        1000 // batch size
      );
      
      // Initialize DriftClient
      this.driftClient = new DriftClient({
        connection: this.connection,
        wallet: this.wallet,
        programID: new PublicKey(sdkConfig.DRIFT_PROGRAM_ID),
        env: DRIFT_CONFIG.ENV,
        accountSubscription: {
          type: 'polling', // More reliable than websocket
          accountLoader: this.bulkAccountLoader,
        },
      });
      
      await this.driftClient.subscribe();
      console.log(chalk.green('✅ Drift client subscribed'));
      
      // Get existing account (already initialized)
      const userAccountPublicKey = await this.driftClient.getUserAccountPublicKey();
      
      this.user = new User({
        driftClient: this.driftClient,
        userAccountPublicKey,
        accountSubscription: {
          type: 'polling',
          accountLoader: this.bulkAccountLoader,
        },
      });
      
      await this.user.subscribe();
      console.log(chalk.green('✅ User account subscribed'));
      
      // Log account info
      const totalCollateral = this.user.getTotalCollateral();
      const freeCollateral = this.user.getFreeCollateral();
      
      console.log(chalk.cyan(`💰 Total Collateral: $${convertToNumber(totalCollateral, QUOTE_PRECISION).toFixed(2)}`));
      console.log(chalk.cyan(`💵 Free Collateral: $${convertToNumber(freeCollateral, QUOTE_PRECISION).toFixed(2)}`));

      this.isInitialized = true;
      console.log(chalk.green('✅ Drift client fully initialized'));
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to initialize Drift client:'), error);
      throw error;
    }
  }
  
  async shutdown(): Promise<void> {
    console.log(chalk.yellow('🔌 Shutting down Drift client...'));

    if (this.user) {
      await this.user.unsubscribe();
    }
    
    if (this.driftClient) {
      await this.driftClient.unsubscribe();
    }
    
    this.isInitialized = false;
    console.log(chalk.green('✅ Drift client shut down'));
  }
  
  async getCollateralInfo(): Promise<{
    total: number;
    free: number;
    used: number;
    health: number;
  }> {
    if (!this.user) throw new Error('User not initialized');
    
    const totalCollateral = this.user.getTotalCollateral();
    const freeCollateral = this.user.getFreeCollateral();
    const marginRatio = this.user.getMarginRatio();
    
    // Convert BN to numbers - QUOTE_PRECISION is already a BN
    const total = totalCollateral ? convertToNumber(totalCollateral, QUOTE_PRECISION) : 0;
    const free = freeCollateral ? convertToNumber(freeCollateral, QUOTE_PRECISION) : 0;
    const health = marginRatio ? convertToNumber(marginRatio, new BN(10000)) : 0;
    
    const used = total - free;
    
    return { total, free, used, health };
  }
  
  async getPosition(marketIndex: number = DRIFT_CONFIG.ETH_PERP_MARKET_INDEX): Promise<{
    exists: boolean;
    size: number;
    direction: 'LONG' | 'SHORT' | 'NONE';
    entryPrice: number;
    markPrice: number;
    pnl: number;
    pnlPercent: number;
  }> {
    if (!this.user) throw new Error('User not initialized');
    
    const perpPosition = this.user.getPerpPosition(marketIndex);
    
    if (!perpPosition || perpPosition.baseAssetAmount.isZero()) {
      return {
        exists: false,
        size: 0,
        direction: 'NONE',
        entryPrice: 0,
        markPrice: 0,
        pnl: 0,
        pnlPercent: 0
      };
    }
    
    const baseAssetAmount = perpPosition.baseAssetAmount;
    const isLong = baseAssetAmount.gt(new BN(0));
    const size = Math.abs(convertToNumber(baseAssetAmount, BASE_PRECISION));
    
    // Get market data
    const market = this.driftClient!.getPerpMarketAccount(marketIndex);
    const markPrice = convertToNumber(market!.amm.lastMarkPriceTwap, PRICE_PRECISION);
    
    // Calculate entry price
    const quoteAssetAmount = perpPosition.quoteAssetAmount;
    const entryPrice = Math.abs(convertToNumber(quoteAssetAmount, QUOTE_PRECISION) / size);
    
    // Calculate PnL (simplified)
    const pnlValue = (markPrice - entryPrice) * size * (isLong ? 1 : -1);
    const pnlPercent = (pnlValue / (entryPrice * size)) * 100;
    
    return {
      exists: true,
      size,
      direction: isLong ? 'LONG' : 'SHORT',
      entryPrice,
      markPrice,
      pnl: pnlValue,
      pnlPercent
    };
  }
  
  async openPosition(
    direction: 'LONG' | 'SHORT',
    sizeInUSD: number,
    marketIndex: number = DRIFT_CONFIG.ETH_PERP_MARKET_INDEX
  ): Promise<string> {
    if (!this.driftClient || !this.user) throw new Error('Client not initialized');
    
    console.log(chalk.cyan(`📈 Opening ${direction} position: $${sizeInUSD.toFixed(2)}`));
    
    // Get current market price
    const market = this.driftClient.getPerpMarketAccount(marketIndex);
    if (!market) throw new Error('Market not found');
    
    const markPrice = convertToNumber(market.amm.lastMarkPriceTwap, PRICE_PRECISION);
    
    // Calculate base asset amount (size in ETH)
    const baseAssetAmount = new BN(sizeInUSD / markPrice * BASE_PRECISION.toNumber());
    
    // Create market order
    const orderParams = getMarketOrderParams({
      baseAssetAmount,
      direction: direction === 'LONG' ? PositionDirection.LONG : PositionDirection.SHORT,
      marketIndex,
    });
    
    // Execute with retry logic
    let attempts = 0;
    let lastError: any;
    
    while (attempts < DRIFT_CONFIG.MAX_RETRY_ATTEMPTS) {
      try {
        const txSig = await this.driftClient.placePerpOrder(orderParams);
        console.log(chalk.green(`✅ Position opened! Tx: ${txSig}`));
        return txSig;
        
      } catch (error: any) {
        lastError = error;
        attempts++;
        
        // Parse error code
        const errorCode = error.code || error.logs?.find((log: string) => 
          log.includes('Program log: Error Code:')
        )?.match(/Error Code: (\d+)/)?.[1];
        
        console.log(chalk.yellow(`⚠️ Attempt ${attempts} failed: ${error.message}`));
        
        // Check for specific errors
        if (errorCode === '6117') { // User being liquidated
          throw new Error('Account under liquidation - cannot open position');
        }
        
        if (errorCode === '6154') { // Max open interest
          throw new Error('Market at max capacity');
        }
        
        if (attempts < DRIFT_CONFIG.MAX_RETRY_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, DRIFT_CONFIG.RETRY_DELAY_MS * attempts));
        }
      }
    }
    
    throw lastError || new Error('Failed to open position after retries');
  }
  
  async closePosition(
    marketIndex: number = DRIFT_CONFIG.ETH_PERP_MARKET_INDEX
  ): Promise<string> {
    if (!this.driftClient || !this.user) throw new Error('Client not initialized');
    
    const position = await this.getPosition(marketIndex);
    
    if (!position.exists) {
      console.log(chalk.yellow('⚠️ No position to close'));
      return '';
    }
    
    console.log(chalk.cyan(`📉 Closing ${position.direction} position: ${position.size} ETH`));
    console.log(chalk.cyan(`💰 PnL: $${position.pnl.toFixed(2)} (${position.pnlPercent.toFixed(2)}%)`));
    
    // Create order to close position (opposite direction)
    const baseAssetAmount = new BN(position.size * BASE_PRECISION.toNumber());
    const closeDirection = position.direction === 'LONG' 
      ? PositionDirection.SHORT 
      : PositionDirection.LONG;
    
    const orderParams = getMarketOrderParams({
      baseAssetAmount,
      direction: closeDirection,
      marketIndex,
      reduceOnly: true // Important: only close existing position
    });
    
    try {
      const txSig = await this.driftClient.placePerpOrder(orderParams);
      console.log(chalk.green(`✅ Position closed! Tx: ${txSig}`));
      return txSig;
      
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to close position:'), error);
      throw error;
    }
  }
  
  async settlePNL(marketIndex: number = DRIFT_CONFIG.ETH_PERP_MARKET_INDEX): Promise<string> {
    if (!this.driftClient || !this.user) throw new Error('Client not initialized');
    
    try {
      const userAccountPublicKey = await this.driftClient.getUserAccountPublicKey();
      const userAccount = this.user.getUserAccount();
      
      const settleTxSig = await this.driftClient.settlePNL(
        userAccountPublicKey,
        userAccount,
        marketIndex
      );
      
      console.log(chalk.green(`✅ PNL settled! Tx: ${settleTxSig}`));
      return settleTxSig;
      
    } catch (error: any) {
      // Only ignore truly benign "no PnL to settle" errors
      const errorMessage = error.message || error.toString();
      
      // Common benign error messages from Drift Protocol
      const benignErrors = [
        'no pnl to settle',
        'nothing to settle',
        'already settled',
        'position closed'
      ];
      
      const isBenignError = benignErrors.some(benign => 
        errorMessage.toLowerCase().includes(benign.toLowerCase())
      );
      
      if (isBenignError) {
        console.log(chalk.gray('💸 No PNL to settle (already settled)'));
        return '';
      }
      
      // Real settlement errors should bubble up
      console.error(chalk.red('❌ PNL settlement failed:'), error);
      throw error;
    }
  }
  
  async closeAllPositions(): Promise<void> {
    if (!this.user) throw new Error('User not initialized');
    
    console.log(chalk.red('🚨 Closing all positions...'));
    
    // Check all perp market indices (0-10 typical range)
    const closedMarkets: number[] = [];
    for (let i = 0; i < 10; i++) {
      try {
        const position = this.user.getPerpPosition(i);
        if (position && !position.baseAssetAmount.isZero()) {
          await this.closePosition(i);
          closedMarkets.push(i);
        }
      } catch (error) {
        // Position doesn't exist or other error, continue
      }
    }
    
    // Settle PNL for all closed markets
    if (closedMarkets.length > 0) {
      console.log(chalk.cyan('💸 Settling all PNL...'));
      for (const marketIndex of closedMarkets) {
        try {
          await this.settlePNL(marketIndex);
        } catch (error) {
          // Continue if settle fails
        }
      }
    }
    
    console.log(chalk.green('✅ All positions closed'));
  }
  
  isLiquidationRisk(): boolean {
    if (!this.user) return false;
    
    const marginRatio = this.user.getMarginRatio();
    const marginPercent = marginRatio ? convertToNumber(marginRatio, new BN(10000)) : 0;
    
    // Alert if margin < 10%
    if (marginPercent < 10) {
      console.log(chalk.red(`🚨 LIQUIDATION RISK: Margin at ${marginPercent.toFixed(2)}%`));
      return true;
    }
    
    return false;
  }
}