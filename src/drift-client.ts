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
  MARGIN_PRECISION,
  OrderType,
  PositionDirection,
  getMarketOrderParams,
  PostOnlyParams,
  convertToNumber,
  DriftEnv,
  UserAccount,
  MainnetPerpMarkets,
  DevnetPerpMarkets
} from '@drift-labs/sdk';
import bs58 from 'bs58';
import chalk from 'chalk';

/**
 * 🔒 LOCKED by @docs-agent | Change to 🔑 to allow @docs-agent edits
 *
 * OFFICIAL DOCS: Drift Protocol v2 SDK
 * Last Verified: 2025-09-15
 *
 * Configuration for Drift Protocol client including subaccount management
 *
 * Key Requirements:
 * - Support multiple subaccounts per wallet
 * - Allow subaccount selection via environment variable
 * - Handle subaccount initialization and recovery
 *
 * @see docs/drift-protocol/subaccounts.md for full documentation
 */
// Configuration
export const DRIFT_CONFIG = {
  // Environment: 'devnet' for testing, 'mainnet-beta' for production
  ENV: (process.env.DRIFT_ENV || 'mainnet-beta') as DriftEnv,

  // Subaccount configuration
  SUBACCOUNT_ID: parseInt(process.env.DRIFT_SUBACCOUNT_ID || '0'), // Default to subaccount 0
  AUTO_CREATE_SUBACCOUNT: process.env.DRIFT_AUTO_CREATE_SUBACCOUNT !== 'false', // Auto-create if doesn't exist
  SUBACCOUNT_NAME: process.env.DRIFT_SUBACCOUNT_NAME || 'Trading Bot Account',

  // Market indices - directly from SDK arrays
  ETH_PERP_MARKET_INDEX: MainnetPerpMarkets[2].marketIndex,  // ETH is at index 2
  BTC_PERP_MARKET_INDEX: MainnetPerpMarkets[1].marketIndex,  // BTC is at index 1
  SOL_PERP_MARKET_INDEX: MainnetPerpMarkets[0].marketIndex,  // SOL is at index 0

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

/**
 * 🔒 LOCKED by @docs-agent | Change to 🔑 to allow @docs-agent edits
 *
 * OFFICIAL DOCS: Drift Protocol v2 - User Account Management
 * Source: https://drift-labs.github.io/v2-teacher/
 *
 * DriftTradingClient handles:
 * - Multiple subaccounts per wallet
 * - Automatic subaccount creation if needed
 * - Subaccount switching and management
 * - Proper error handling for closed/invalid subaccounts
 */
export class DriftTradingClient {
  private connection: Connection;
  private wallet: Wallet;
  private driftClient?: DriftClient;
  private user?: User;
  private bulkAccountLoader?: BulkAccountLoader;
  private isInitialized: boolean = false;
  private activeSubAccountId: number = DRIFT_CONFIG.SUBACCOUNT_ID;
  private availableSubAccounts: number[] = [];

  constructor(privateKey: string) {
    // Setup wallet from private key - handle both base58 and array formats
    let keypair: Keypair;
    try {
      // First try as base58
      keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
    } catch (error) {
      // If base58 fails, try parsing as JSON array
      try {
        const secretKeyArray = JSON.parse(privateKey);
        keypair = Keypair.fromSecretKey(new Uint8Array(secretKeyArray));
      } catch (parseError) {
        throw new Error('Invalid private key format. Expected base58 string or JSON array');
      }
    }

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
    console.log(chalk.cyan(`👛 Wallet: ${this.wallet.publicKey.toBase58()}`));
    console.log(chalk.cyan(`📋 Target SubAccount: ${this.activeSubAccountId}`));
  }
  
  /**
   * 🔒 LOCKED by @docs-agent | Change to 🔑 to allow @docs-agent edits
   *
   * OFFICIAL DOCS: Drift SDK - Initialize DriftClient and User
   * Source: https://drift-labs.github.io/v2-teacher/#client-initialization
   *
   * Initializes the DriftClient with proper subaccount handling:
   * 1. Sets up DriftClient with specified subAccountIds
   * 2. Checks if subaccount exists
   * 3. Creates new subaccount if needed and AUTO_CREATE is enabled
   * 4. Initializes User object for the active subaccount
   *
   * @see TypeScript initializeUserAccount Parameters in official docs
   */
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

      // List available subaccounts first
      await this.discoverSubAccounts();

      // Initialize DriftClient with specific subaccount configuration
      this.driftClient = new DriftClient({
        connection: this.connection,
        wallet: this.wallet,
        programID: new PublicKey(sdkConfig.DRIFT_PROGRAM_ID),
        env: DRIFT_CONFIG.ENV,
        activeSubAccountId: this.activeSubAccountId,
        subAccountIds: this.availableSubAccounts.length > 0 ? this.availableSubAccounts : [this.activeSubAccountId],
        accountSubscription: {
          type: 'polling', // More reliable than websocket
          accountLoader: this.bulkAccountLoader,
        },
      });

      await this.driftClient.subscribe();
      console.log(chalk.green('✅ Drift client subscribed'));

      // Check if the specified subaccount exists
      const subAccountExists = await this.checkSubAccountExists(this.activeSubAccountId);

      if (!subAccountExists) {
        console.log(chalk.yellow(`⚠️ SubAccount ${this.activeSubAccountId} does not exist`));

        // If we have any existing subaccounts, use the first one
        if (this.availableSubAccounts.length > 0) {
          const fallbackId = this.availableSubAccounts[0];
          console.log(chalk.yellow(`🔄 Using existing subaccount ${fallbackId} instead`));
          this.activeSubAccountId = fallbackId;

          // Update the DriftClient with the new subaccount
          this.driftClient.switchActiveUser(this.activeSubAccountId);
        } else if (DRIFT_CONFIG.AUTO_CREATE_SUBACCOUNT) {
          // Try to create the subaccount
          try {
            console.log(chalk.cyan(`📝 Creating new subaccount ${this.activeSubAccountId}...`));
            await this.createSubAccount(this.activeSubAccountId);
          } catch (createError: any) {
            // Check if it's an insufficient balance error
            if (createError.message?.includes('insufficient lamports')) {
              console.log(chalk.red('❌ Insufficient SOL balance to create subaccount'));
              console.log(chalk.yellow('💡 You need approximately 0.035 SOL to create a new subaccount'));
              throw new Error('Insufficient SOL balance to create Drift subaccount. Please add SOL to your wallet.');
            }
            throw createError;
          }
        } else {
          // No existing accounts and auto-create is disabled
          throw new Error(`SubAccount ${this.activeSubAccountId} does not exist and AUTO_CREATE is disabled`);
        }
      } else {
        console.log(chalk.green(`✅ Using existing subaccount ${this.activeSubAccountId}`));
      }

      // Get the user account public key for the active subaccount
      const userAccountPublicKey = await this.driftClient.getUserAccountPublicKey(this.activeSubAccountId);

      // Initialize User object for the active subaccount
      this.user = new User({
        driftClient: this.driftClient,
        userAccountPublicKey,
        accountSubscription: {
          type: 'polling',
          accountLoader: this.bulkAccountLoader,
        },
      });

      await this.user.subscribe();
      console.log(chalk.green(`✅ User account subscribed (SubAccount: ${this.activeSubAccountId})`));

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
  
  /**
   * 🔒 LOCKED by @docs-agent | Change to 🔑 to allow @docs-agent edits
   *
   * OFFICIAL DOCS: Drift SDK - SubAccount Discovery
   *
   * Discovers all existing subaccounts for the current wallet
   * Uses getUserAccountPublicKey with different subaccount IDs to check existence
   */
  async discoverSubAccounts(): Promise<void> {
    console.log(chalk.cyan('🔍 Discovering existing subaccounts...'));
    this.availableSubAccounts = [];

    // Need to initialize SDK config first to get program ID
    const sdkConfig = initialize({ env: DRIFT_CONFIG.ENV });
    const programId = new PublicKey(sdkConfig.DRIFT_PROGRAM_ID);

    // Check subaccounts 0-9 (typical range)
    for (let i = 0; i < 10; i++) {
      try {
        const [pubKey] = await PublicKey.findProgramAddress(
          [
            Buffer.from('user'),
            this.wallet.publicKey.toBuffer(),
            new BN(i).toArrayLike(Buffer, 'le', 2),
          ],
          programId
        );

        // Check if account exists on-chain
        const accountInfo = await this.connection.getAccountInfo(pubKey);
        if (accountInfo) {
          this.availableSubAccounts.push(i);
          console.log(chalk.green(`  ✓ SubAccount ${i} exists`));
        }
      } catch (error) {
        // Account doesn't exist, continue
      }
    }

    if (this.availableSubAccounts.length === 0) {
      console.log(chalk.yellow('  ⚠️ No existing subaccounts found'));
    } else {
      console.log(chalk.cyan(`  📊 Found ${this.availableSubAccounts.length} subaccount(s): [${this.availableSubAccounts.join(', ')}]`));
    }
  }

  /**
   * 🔒 LOCKED by @docs-agent | Change to 🔑 to allow @docs-agent edits
   *
   * OFFICIAL DOCS: Drift SDK - Check SubAccount Existence
   *
   * Checks if a specific subaccount exists for the current wallet
   *
   * @param subAccountId - The subaccount ID to check
   * @returns true if the subaccount exists, false otherwise
   */
  async checkSubAccountExists(subAccountId: number): Promise<boolean> {
    try {
      const sdkConfig = initialize({ env: DRIFT_CONFIG.ENV });
      const programId = new PublicKey(sdkConfig.DRIFT_PROGRAM_ID);

      const [pubKey] = await PublicKey.findProgramAddress(
        [
          Buffer.from('user'),
          this.wallet.publicKey.toBuffer(),
          new BN(subAccountId).toArrayLike(Buffer, 'le', 2),
        ],
        programId
      );

      const accountInfo = await this.connection.getAccountInfo(pubKey);
      return accountInfo !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * 🔒 LOCKED by @docs-agent | Change to 🔑 to allow @docs-agent edits
   *
   * OFFICIAL DOCS: Drift SDK - Initialize User Account
   * Source: https://drift-labs.github.io/v2-teacher/#initialize-new-drift-user-account
   *
   * Creates a new subaccount for the current wallet
   * Requires a small rent deposit which can be reclaimed upon deletion
   *
   * @param subAccountId - The subaccount ID to create (0-255)
   * @param name - Optional display name for the subaccount
   */
  async createSubAccount(subAccountId: number, name?: string): Promise<void> {
    if (!this.driftClient) {
      throw new Error('DriftClient not initialized');
    }

    try {
      console.log(chalk.cyan(`📝 Initializing subaccount ${subAccountId}...`));

      const [txSig, userPublicKey] = await this.driftClient.initializeUserAccount(
        subAccountId,
        name || DRIFT_CONFIG.SUBACCOUNT_NAME
      );

      console.log(chalk.green(`✅ SubAccount ${subAccountId} created!`));
      console.log(chalk.gray(`   Transaction: ${txSig}`));
      console.log(chalk.gray(`   Account: ${userPublicKey.toBase58()}`));

      // Add to available subaccounts list
      if (!this.availableSubAccounts.includes(subAccountId)) {
        this.availableSubAccounts.push(subAccountId);
      }
    } catch (error: any) {
      // Check if error is because account already exists
      if (error.message?.includes('already in use') || error.message?.includes('already exists')) {
        console.log(chalk.yellow(`⚠️ SubAccount ${subAccountId} already exists`));
        if (!this.availableSubAccounts.includes(subAccountId)) {
          this.availableSubAccounts.push(subAccountId);
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * 🔒 LOCKED by @docs-agent | Change to 🔑 to allow @docs-agent edits
   *
   * OFFICIAL DOCS: Drift SDK - Switch Active SubAccount
   * Source: https://drift-labs.github.io/v2-teacher/#switch-active-drift-sub-account
   *
   * Switches to a different subaccount for trading operations
   *
   * @param subAccountId - The subaccount ID to switch to
   */
  async switchSubAccount(subAccountId: number): Promise<void> {
    if (!this.driftClient) {
      throw new Error('DriftClient not initialized');
    }

    // Check if subaccount exists
    const exists = await this.checkSubAccountExists(subAccountId);
    if (!exists) {
      throw new Error(`SubAccount ${subAccountId} does not exist`);
    }

    console.log(chalk.cyan(`🔄 Switching to subaccount ${subAccountId}...`));

    // Switch the active subaccount in DriftClient
    this.driftClient.switchActiveUser(subAccountId);
    this.activeSubAccountId = subAccountId;

    // Reinitialize User object for the new subaccount
    if (this.user) {
      await this.user.unsubscribe();
    }

    const userAccountPublicKey = await this.driftClient.getUserAccountPublicKey(subAccountId);

    this.user = new User({
      driftClient: this.driftClient,
      userAccountPublicKey,
      accountSubscription: {
        type: 'polling',
        accountLoader: this.bulkAccountLoader,
      },
    });

    await this.user.subscribe();
    console.log(chalk.green(`✅ Switched to subaccount ${subAccountId}`));

    // Log new account info
    const totalCollateral = this.user.getTotalCollateral();
    const freeCollateral = this.user.getFreeCollateral();

    console.log(chalk.cyan(`💰 Total Collateral: $${convertToNumber(totalCollateral, QUOTE_PRECISION).toFixed(2)}`));
    console.log(chalk.cyan(`💵 Free Collateral: $${convertToNumber(freeCollateral, QUOTE_PRECISION).toFixed(2)}`));
  }

  /**
   * 🔒 LOCKED by @docs-agent | Change to 🔑 to allow @docs-agent edits
   *
   * OFFICIAL DOCS: Drift SDK - List SubAccounts
   *
   * Lists all available subaccounts with their collateral information
   *
   * @returns Array of subaccount information
   */
  async listSubAccounts(): Promise<Array<{
    id: number;
    exists: boolean;
    totalCollateral?: number;
    freeCollateral?: number;
    isActive: boolean;
  }>> {
    const accounts = [];

    // Discover accounts if not already done
    if (this.availableSubAccounts.length === 0) {
      await this.discoverSubAccounts();
    }

    for (const subAccountId of this.availableSubAccounts) {
      try {
        // Get account info if this is the active account
        if (subAccountId === this.activeSubAccountId && this.user) {
          const totalCollateral = this.user.getTotalCollateral();
          const freeCollateral = this.user.getFreeCollateral();

          accounts.push({
            id: subAccountId,
            exists: true,
            totalCollateral: convertToNumber(totalCollateral, QUOTE_PRECISION),
            freeCollateral: convertToNumber(freeCollateral, QUOTE_PRECISION),
            isActive: true
          });
        } else {
          accounts.push({
            id: subAccountId,
            exists: true,
            isActive: false
          });
        }
      } catch (error) {
        accounts.push({
          id: subAccountId,
          exists: false,
          isActive: false
        });
      }
    }

    return accounts;
  }

  /**
   * Get the currently active subaccount ID
   */
  getActiveSubAccountId(): number {
    return this.activeSubAccountId;
  }

  /**
   * Get list of available subaccount IDs
   */
  getAvailableSubAccounts(): number[] {
    return [...this.availableSubAccounts];
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

    // Log which subaccount we're checking
    console.log(chalk.gray(`🔍 Checking position for SubAccount ${this.activeSubAccountId}, Market ${marketIndex}`));

    // Fetch latest account data before checking position
    try {
      await this.user.fetchAccounts();
      console.log(chalk.gray('   ✓ Account data fetched'));
    } catch (error) {
      console.log(chalk.yellow('⚠️ Warning: Could not fetch latest account data'));
    }

    // Get all perp positions to debug
    const allPositions = this.user.getActivePerpPositions();
    if (allPositions && allPositions.length > 0) {
      console.log(chalk.gray(`   Found ${allPositions.length} active position(s) across all markets`));
      for (const pos of allPositions) {
        console.log(chalk.gray(`   - Market ${pos.marketIndex}: ${pos.baseAssetAmount.toString()} base units`));
      }
    } else {
      console.log(chalk.gray('   No active positions found in any market'));
    }

    const perpPosition = this.user.getPerpPosition(marketIndex);

    // Debug logging
    if (perpPosition) {
      console.log(chalk.gray(`   Position data for market ${marketIndex}:`));
      console.log(chalk.gray(`   - Base amount: ${perpPosition.baseAssetAmount.toString()}`));
      console.log(chalk.gray(`   - Quote amount: ${perpPosition.quoteAssetAmount.toString()}`));
    } else {
      console.log(chalk.gray(`   No position object for market ${marketIndex}`));
    }

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

  getClient(): DriftClient {
    if (!this.driftClient) {
      throw new Error('DriftClient not initialized');
    }
    return this.driftClient;
  }
}