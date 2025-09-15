import { PrivyClient, WalletWithMetadata } from '@privy-io/server-auth';
import dotenv from 'dotenv';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import BN from 'bn.js';
import { 
  slippageOptions, 
  priorityFeeOptions, 
  defaultConfig,
  routeOptions
} from './jupiterConfig';
import {
  getJupiterQuote,
  getJupiterSwapTransaction,
  executeJupiterSwap,
  getSolBalance,
  getUsdcBalance
} from './jupiterSwap';
import { spawn } from 'child_process';
// Import database module
import db, { 
  TransactionStatus, 
  TransactionType,
  TransactionRecord,
  upsertUser,
  upsertWallet,
  initializeDatabase,
  safeDbOperation
} from './database';

// Load environment variables
dotenv.config();

// Test mode and command-line arguments parsing
const args = process.argv.slice(2);
const TEST_MODE = args.includes('--test') || args.includes('-t');
const FORCE_FGI = args.find(arg => arg.startsWith('--fgi='))?.split('=')[1];
const FORCE_DIRECTION = args.find(arg => arg.startsWith('--direction='))?.split('=')[1];
const SKIP_SWAP = args.includes('--skip-swap') || args.includes('--dry-run');
const SKIP_WAIT = args.includes('--skip-wait');

// Service configuration
const SERVICE_MODE = !args.includes('--no-service') && !args.includes('--run-once');
const CHECK_INTERVAL_MS = process.env.FGI_CHECK_INTERVAL_MS 
  ? parseInt(process.env.FGI_CHECK_INTERVAL_MS) 
  : 5 * 60 * 1000; // 5 minutes by default
const MAX_ERRORS_BEFORE_RESTART = 5;

// Shutdown flag for graceful termination
let isShuttingDown = false;

// Add a global flag to track database availability
let isDatabaseAvailable = false;

if (TEST_MODE) {
  console.log(chalk.yellow('🧪 Running in TEST_MODE 🧪'));
  if (FORCE_FGI) console.log(chalk.yellow(`Using forced FGI value: ${FORCE_FGI}`));
  if (FORCE_DIRECTION) console.log(chalk.yellow(`Using forced direction: ${FORCE_DIRECTION}`));
  if (SKIP_SWAP) console.log(chalk.yellow('Skipping actual swap execution (dry run)'));
  if (SKIP_WAIT) console.log(chalk.yellow('Skipping wait time for next 4h data point'));
}

// Constants
const API_URL = 'https://api.surfsolana.com/SOL/4h/latest.json';
const BACKTEST_API_URL = 'http://localhost:3003/api/backtest/latest-summary';
const STATE_FILE_PATH = './data/fgi_state.json';
const POLLING_INTERVAL_MS = TEST_MODE ? 100 : 1000; // 100ms in test mode, 1 second normally
const MAX_POLLING_DURATION_MS = TEST_MODE ? 10000 : 3 * 60 * 1000; // 10 seconds in test mode
const DEFAULT_FGI_THRESHOLD = 50; // Default FGI threshold as fallback
const SOL_RESERVE_AMOUNT = 0.01; // Amount of SOL to reserve for fees
const TX_SUBMISSION_DELAY_MS = 100; // Delay between transaction submissions to avoid RPC rate limits
const FETCH_TIMEOUT_MS = 10000; // 10 second timeout for API requests
const MAX_RETRIES = 3; // Maximum number of retries for API requests
const INITIAL_RETRY_DELAY_MS = 1000; // Start with 1 second delay between retries
const MAX_SWAP_RETRIES = 3; // Maximum number of retries for swaps
const RETRY_DELAY_MS = 2000; // Delay between swap retries

// Token mint addresses
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Enum for swap direction based on FGI score
enum SwapDirection {
  SOL_TO_USDC = 'sol_to_usdc',
  USDC_TO_SOL = 'usdc_to_sol'
}

// Interface for FGI API response
interface FgiApiResponse {
  timestamp: string;
  price: number;
  fgi: number;
  raw: {
    date: string;
    price: number;
    cfgi: number;
    data_price: number;
    data_volatility: number;
    data_volume: number;
    data_impulse: number;
    data_technical: number;
    data_social: number;
    data_dominance: number;
    data_trends: number;
    datas_whales: number;
    data_orders: number;
  };
}

// Interface for the stored state
interface FgiState {
  lastProcessedTimestamp: string;
  lastFgiScore: number;
  lastAction: string;
  lastSwapDirection: SwapDirection | null;
}

// Interface for wallet with token balances
interface WalletWithBalances {
  userId: string;
  email: string | null;
  wallet: WalletWithMetadata;
  solBalance: number;
  usdcBalance: number;
}

// Interface for backtest summary data
interface BacktestSummary {
  generatedAt: string;
  date: string;
  backtestPeriod: {
    start: string;
    end: string;
  };
  topStrategies: Array<{
    asset: string;
    timeframe: string;
    fgiMidpoint: number;
    strategyReturn: number;
    baselineReturn: number;
    outperformance: number;
    numTrades: number;
    winRate: number;
    inverted: boolean;
  }>;
}

// Check required environment variables
const requiredEnvVars = [
  'PRIVY_APP_ID', 
  'PRIVY_APP_SECRET', 
  'PRIVY_AUTHORIZATION_KEY', 
  'SOLANA_RPC_URL',
  'POSTGRES_HOST',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB'
];
const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);

if (missingEnvVars.length > 0) {
  console.error(`Error: Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.error('Please ensure all required variables are set in your .env file');
  process.exit(1);
}

// Initialize Privy Client
const privy = new PrivyClient(
  process.env.PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!,
  {
    walletApi: {
      authorizationPrivateKey: process.env.PRIVY_AUTHORIZATION_KEY!
    }
  }
);

// Solana network connection
const connection = new Connection(process.env.SOLANA_RPC_URL!, 'confirmed');

/**
 * Ensure the data directory exists
 */
function ensureDataDirectoryExists() {
  const dataDir = path.dirname(STATE_FILE_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(chalk.blue(`Created data directory: ${dataDir}`));
  }
}

/**
 * Load the previously stored FGI state
 */
function loadFgiState(): FgiState | null {
  ensureDataDirectoryExists();
  
  if (fs.existsSync(STATE_FILE_PATH)) {
    const stateData = fs.readFileSync(STATE_FILE_PATH, 'utf8');
    return JSON.parse(stateData);
  }
  return null;
}

/**
 * Save the current FGI state
 */
function saveFgiState(state: FgiState) {
  ensureDataDirectoryExists();
  fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2));
  console.log(chalk.green('FGI state saved successfully'));
}

/**
 * Initialize FGI state if it doesn't exist
 */
async function initializeFgiState(): Promise<FgiState> {
  const existingState = loadFgiState();
  
  if (existingState) {
    console.log(chalk.blue('Using existing FGI state:'));
    console.log(`Last processed timestamp: ${existingState.lastProcessedTimestamp}`);
    console.log(`Last FGI score: ${existingState.lastFgiScore}`);
    console.log(`Last action: ${existingState.lastAction}`);
    return existingState;
  }
  
  console.log(chalk.blue('Initializing new FGI state...'));
  const response = await fetch(API_URL);
  const data: FgiApiResponse = await response.json();
  
  const newState: FgiState = {
    lastProcessedTimestamp: data.timestamp,
    lastFgiScore: data.fgi,
    lastAction: 'initialize',
    lastSwapDirection: null
  };
  
  saveFgiState(newState);
  console.log(chalk.green('FGI state initialized with:'));
  console.log(`Timestamp: ${data.timestamp}`);
  console.log(`FGI score: ${data.fgi}`);
  return newState;
}

/**
 * Fetch the optimal FGI midpoint from the latest backtest results
 */
async function fetchOptimalFgiMidpoint(): Promise<number> {
  console.log(chalk.blue(`Fetching optimal FGI midpoint from ${BACKTEST_API_URL}`));
  
  const response = await fetch(BACKTEST_API_URL, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    timeout: FETCH_TIMEOUT_MS
  }).catch(error => {
    console.error(chalk.red('Error fetching optimal FGI midpoint:'), error);
    console.log(chalk.yellow(`Falling back to default FGI threshold: ${DEFAULT_FGI_THRESHOLD}`));
    return null;
  });
  
  if (!response || !response.ok) {
    console.log(chalk.yellow('No optimal midpoint found, using default threshold'));
    return DEFAULT_FGI_THRESHOLD;
  }
  
  const data: BacktestSummary = await response.json();
  
  if (data && data.topStrategies && data.topStrategies.length > 0) {
    const optimalMidpoint = data.topStrategies[0].fgiMidpoint;
    console.log(chalk.green(`✅ Found optimal FGI midpoint from backtest: ${optimalMidpoint}`));
    return optimalMidpoint;
  } else {
    console.log(chalk.yellow('No optimal midpoint found in backtest data, using default threshold'));
    return DEFAULT_FGI_THRESHOLD;
  }
}

/**
 * Get mock FGI data for testing
 */
function getMockFgiData(forcedFgi?: string): FgiApiResponse {
  const fgiValue = forcedFgi ? parseInt(forcedFgi) : Math.floor(Math.random() * 100);
  
  return {
    timestamp: new Date().toISOString(),
    price: 60000 + Math.random() * 5000,
    fgi: fgiValue,
    raw: {
      date: new Date().toISOString(),
      price: 60000 + Math.random() * 5000,
      cfgi: fgiValue,
      data_price: Math.random() * 100,
      data_volatility: Math.random() * 100,
      data_volume: Math.random() * 100,
      data_impulse: Math.random() * 100,
      data_technical: Math.random() * 100,
      data_social: Math.random() * 100,
      data_dominance: Math.random() * 100,
      data_trends: Math.random() * 100,
      datas_whales: Math.random() * 100,
      data_orders: Math.random() * 100
    }
  };
}

/**
 * Calculate the next expected update time based on the current timestamp
 */
function calculateNextUpdateTime(currentTimestamp: string): Date {
  if (!currentTimestamp || typeof currentTimestamp !== 'string') {
    console.log(chalk.yellow(`Invalid timestamp provided: ${currentTimestamp}, using current time instead`));
    return new Date(Date.now() + 4 * 60 * 60 * 1000);
  }
  
  const parsedTime = new Date(currentTimestamp);
  if (isNaN(parsedTime.getTime())) {
    console.log(chalk.yellow(`Could not parse timestamp: ${currentTimestamp}, using current time instead`));
    return new Date(Date.now() + 4 * 60 * 60 * 1000);
  }
  
  // Normalize timestamp by subtracting 2 hours to align with UTC
  const normalizedTime = new Date(parsedTime);
  normalizedTime.setHours(parsedTime.getHours() - 2);
  
  // Calculate next update time based on the normalized time
  const nextUpdateTime = new Date(normalizedTime);
  nextUpdateTime.setHours(normalizedTime.getHours() + 4);
  
  console.log(chalk.blue(`Original timestamp: ${currentTimestamp}`));
  console.log(chalk.blue(`Normalized (UTC aligned) timestamp: ${normalizedTime.toISOString()}`));
  console.log(chalk.blue(`Next expected 4h update time: ${nextUpdateTime.toISOString()}`));
  
  return nextUpdateTime;
}

/**
 * Wait until the specified time before starting to poll
 */
async function waitUntilNextUpdateTime(nextUpdateTime: Date): Promise<void> {
  const now = new Date();
  
  if (TEST_MODE && SKIP_WAIT) {
    console.log(chalk.yellow('TEST MODE: Skipping wait for next update time'));
    return;
  }
  
  if (nextUpdateTime > now) {
    const waitTimeMs = nextUpdateTime.getTime() - now.getTime();
    const waitTimeMinutes = Math.floor(waitTimeMs / 60000);
    const waitTimeSeconds = Math.floor((waitTimeMs % 60000) / 1000);
    
    // Calculate percentage based on position in 4-hour cycle
    // A 4h cycle is 240 minutes total
    const TOTAL_CYCLE_MINUTES = 240;
    const remainingPercent = (waitTimeMinutes + (waitTimeSeconds / 60)) / TOTAL_CYCLE_MINUTES;
    const percentComplete = Math.floor((1 - remainingPercent) * 100);
    
    console.log(chalk.blue(`⏳ Waiting until next 4h data point at ${nextUpdateTime.toISOString()}`));
    console.log(chalk.blue(`   (${waitTimeMinutes} minutes and ${waitTimeSeconds} seconds from now)`));
    console.log(chalk.blue(`   ${percentComplete}% of the 4h cycle complete`));
    
    if (TEST_MODE) {
      console.log(chalk.yellow('TEST MODE: Using shortened wait time of 3 seconds'));
      await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
      const startTime = Date.now();
      const totalWaitTime = waitTimeMs;
      
      const interval = setInterval(() => {
        const elapsedMs = Date.now() - startTime;
        const remainingMs = totalWaitTime - elapsedMs;
        const remainingMinutes = Math.floor(remainingMs / 60000);
        const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);
        
        // Calculate percentage accounting for already elapsed time in the 4h cycle
        const currentRemainingPercent = (remainingMinutes + (remainingSeconds / 60)) / TOTAL_CYCLE_MINUTES;
        const currentPercentComplete = Math.floor((1 - currentRemainingPercent) * 100);
        
        console.log(chalk.blue(`⏳ Still waiting... ${currentPercentComplete}% complete. ${remainingMinutes}m ${remainingSeconds}s remaining.`));
      }, 60000);
      
      try {
        await new Promise(resolve => setTimeout(resolve, waitTimeMs));
      } finally {
        clearInterval(interval);
      }
    }
    
    console.log(chalk.green('✅ Wait complete! Starting to poll for new 4h data.'));
  } else {
    console.log(chalk.green('Next update time has already passed. Starting to poll immediately.'));
  }
}

/**
 * Improved fetch function with timeout, retries, and better error handling
 */
async function fetchWithRetry<T>(
  url: string, 
  options: RequestInit = {}, 
  retries = MAX_RETRIES, 
  retryDelay = INITIAL_RETRY_DELAY_MS
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  
  const fetchOptions = { 
    ...options,
    signal: controller.signal 
  };
  
  let response;
  try {
    response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      console.error(chalk.red(`Request to ${url} timed out after ${FETCH_TIMEOUT_MS}ms`));
    } else {
      console.error(chalk.red(`Error fetching ${url}:`), error);
    }
    
    if (retries > 0) {
      console.log(chalk.yellow(`Retrying in ${retryDelay}ms... (${retries} retries left)`));
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return fetchWithRetry<T>(url, options, retries - 1, retryDelay * 2);
    }
    
    throw error;
  }
  
  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  if (TEST_MODE) {
    console.log(chalk.yellow('API Response structure:'));
    console.log(JSON.stringify(data, null, 2).substring(0, 500) + '...');
  }
  
  return data as T;
}

/**
 * Validate the FGI response data has the expected structure
 */
function validateFgiResponse(data: any): data is FgiApiResponse {
  if (!data) return false;
  
  const hasRequiredFields = 
    'timestamp' in data && 
    'price' in data && 
    'fgi' in data;
  
  if (!hasRequiredFields) {
    console.error(chalk.red('Invalid API response: missing required fields'));
    console.error('Received:', JSON.stringify(data).substring(0, 200) + '...');
    return false;
  }
  
  return true;
}

/**
 * Poll the FGI API until we get a new update
 */
async function pollFgiApiForNewData(lastProcessedTimestamp: string): Promise<FgiApiResponse | null> {
  console.log(chalk.blue(`Starting to process 4h FGI data after timestamp: ${lastProcessedTimestamp}`));
  
  if (FORCE_FGI) {
    console.log(chalk.yellow(`Using forced FGI value: ${FORCE_FGI}`));
    return getMockFgiData(FORCE_FGI);
  }
  
  console.log(chalk.blue(`Fetching current FGI data from ${API_URL}`));
  const initialData = await fetchWithRetry<FgiApiResponse>(API_URL);
  
  if (!validateFgiResponse(initialData)) {
    console.error(chalk.red('Invalid FGI data received from API'));
    return null;
  }
  
  console.log(chalk.green(`Successfully fetched FGI data: Score=${initialData.fgi}, Timestamp=${initialData.timestamp}`));
  
  if (initialData.timestamp !== lastProcessedTimestamp) {
    console.log(chalk.green(`✅ New 4h FGI data already available! Timestamp: ${initialData.timestamp}, FGI: ${initialData.fgi}`));
    return initialData;
  }
  
  const nextUpdateTime = calculateNextUpdateTime(initialData.timestamp);
  console.log(chalk.blue(`Current data timestamp: ${initialData.timestamp || 'undefined'}`));
  
  let nextUpdateTimeString = 'invalid date';
  try {
    nextUpdateTimeString = nextUpdateTime.toISOString();
  } catch (error) {
    console.error(chalk.red('Invalid next update time:'), error);
  }
  console.log(chalk.blue(`Next expected 4h data update: ${nextUpdateTimeString}`));
  
  await waitUntilNextUpdateTime(nextUpdateTime);
  
  if (TEST_MODE) {
    console.log(chalk.yellow('TEST MODE: Making a single API request'));
    const data = await fetchWithRetry<FgiApiResponse>(API_URL);
    
    if (!validateFgiResponse(data)) {
      console.error(chalk.red('Invalid FGI data received from API in test mode'));
      return null;
    }
    
    console.log(chalk.green(`✅ FGI data from API: Timestamp: ${data.timestamp}, FGI: ${data.fgi}`));
    
    return data;
  }
  
  const startTime = Date.now();
  let pollCount = 0;
  
  process.stdout.write(chalk.blue('Polling 4h FGI API '));
  
  while (Date.now() - startTime < MAX_POLLING_DURATION_MS) {
    process.stdout.write(chalk.blue('.'));
    pollCount++;
    
    if (pollCount % 60 === 0) {
      process.stdout.write('\n' + chalk.blue('Polling continues '));
    }
    
    let data;
    
    try {
      data = await fetchWithRetry<FgiApiResponse>(API_URL);
    } catch (error) {
      process.stdout.write('\n');
      console.error(chalk.red('Error polling 4h FGI API:'), error);
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS * 2));
      continue;
    }
    
    if (!validateFgiResponse(data)) {
      process.stdout.write('\n');
      console.error(chalk.red('Invalid API response structure'));
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS * 2));
      continue;
    }
    
    if (data.timestamp !== lastProcessedTimestamp) {
      process.stdout.write('\n');
      console.log(chalk.green(`✅ New 4h FGI data detected! Timestamp: ${data.timestamp}, FGI: ${data.fgi}`));
      return data;
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  process.stdout.write('\n');
  console.log(chalk.red(`Timed out waiting for new 4h FGI data after ${MAX_POLLING_DURATION_MS / 1000} seconds (${pollCount} attempts)`));
  return null;
}

/**
 * Fetches all delegated wallets with their balances
 */
async function getAllDelegatedWallets(): Promise<WalletWithBalances[]> {
  try {
    console.log(chalk.blue('🔍 Fetching users from Privy...'));
    
    const users = await privy.getUsers();
    
    if (!users || users.length === 0) {
      console.log(chalk.yellow('No users found in your Privy app.'));
      return [];
    }
    
    console.log(chalk.green(`📋 Found ${users.length} users total.`));
    
    const delegatedWallets: WalletWithBalances[] = [];
    
    for (const user of users) {
      // Store user in database - using safe operation helper
      if (isDatabaseAvailable) {
        await safeDbOperation(
          () => upsertUser({
            userId: user.id,
            email: user.email
          }),
          null,
          `storing user ${user.id}`
        );
      }
      
      const embeddedWallets = user.linkedAccounts.filter(
        (account): account is WalletWithMetadata => 
          account.type === 'wallet' && 
          account.walletClientType === 'privy'
      );
      
      const userDelegatedWallets = embeddedWallets.filter(wallet => wallet.delegated);
      
      if (userDelegatedWallets.length > 0) {
        for (const wallet of userDelegatedWallets) {
          console.log(chalk.blue(`Found wallet: ${wallet.address}`));
          
          // Store wallet in database - using safe operation helper
          if (isDatabaseAvailable) {
            await safeDbOperation(
              () => upsertWallet({
                userId: user.id,
                walletAddress: wallet.address,
                walletType: wallet.walletClientType,
                isDelegated: wallet.delegated
              }),
              null,
              `storing wallet ${wallet.address}`
            );
          }
          
          const solBalance = await getSolBalance(wallet.address);
          const usdcBalance = await getUsdcBalance(wallet.address);
          
          console.log(chalk.green(`Wallet balances: ${solBalance.toFixed(6)} SOL, ${usdcBalance.toFixed(2)} USDC`));
          
          delegatedWallets.push({
            userId: user.id,
            email: user.email,
            wallet,
            solBalance,
            usdcBalance
          });
        }
      }
    }
    
    if (delegatedWallets.length === 0) {
      console.log(chalk.yellow('No delegated wallets found for any users.'));
      return [];
    }
    
    console.log(chalk.green(`🔐 Found ${delegatedWallets.length} delegated wallets with balances.`));
    return delegatedWallets;
    
  } catch (error) {
    console.error(chalk.red('Error listing wallets:'), error);
    return [];
  }
}

/**
 * Checks and aligns all wallets with the current FGI score on startup
 */
async function checkWalletAlignmentOnStartup(): Promise<void> {
  console.log(chalk.blue('🔄 Checking wallet alignment on startup...'));
  
  // Get latest FGI data
  console.log(chalk.blue('Fetching current FGI data...'));
  const fgiData = await fetchWithRetry<FgiApiResponse>(API_URL);
  
  if (!validateFgiResponse(fgiData)) {
    console.error(chalk.red('Invalid FGI data received during startup check'));
    return;
  }
  
  console.log(chalk.green(`Current FGI Score: ${fgiData.fgi}`));
  console.log(chalk.green(`Current Price: $${fgiData.price}`));
  
  // Fetch optimal FGI midpoint
  const fgiThreshold = await fetchOptimalFgiMidpoint();
  
  // Determine target alignment direction
  const targetDirection = fgiData.fgi >= fgiThreshold 
    ? SwapDirection.USDC_TO_SOL
    : SwapDirection.SOL_TO_USDC;
  
  console.log(chalk.blue(`Using FGI threshold: ${fgiThreshold} ${fgiThreshold === DEFAULT_FGI_THRESHOLD ? '(default)' : '(from backtest)'}`));
  console.log(chalk.blue(`Target wallet alignment based on current FGI: ${targetDirection}`));
  
  // Align wallets to target direction
  console.log(chalk.blue(`Starting wallet alignment check to match current FGI direction: ${targetDirection}`));
  const alignmentResult = await bulkSwapAll(targetDirection, fgiData.fgi);
  
  console.log(chalk.green('✅ Startup wallet alignment check complete'));
  console.log(`Results: ${alignmentResult.successCount} swapped, ${alignmentResult.failureCount} failed, ${alignmentResult.skippedCount} already aligned`);
  
  // Update FGI state with this alignment action
  const currentState = loadFgiState() || {
    lastProcessedTimestamp: fgiData.timestamp,
    lastFgiScore: fgiData.fgi,
    lastAction: 'initialize',
    lastSwapDirection: null
  };
  
  const newState: FgiState = {
    ...currentState,
    lastAction: `startup_alignment_${targetDirection}_${alignmentResult.successCount}_swapped`,
    lastSwapDirection: targetDirection
  };
  
  saveFgiState(newState);
}

/**
 * Bulk swap all wallets based on the specified direction
 */
async function bulkSwapAll(targetDirection: SwapDirection, fgiScore: number) {
  console.log(chalk.blue(`🚀 Starting wallet evaluations based on FGI score: ${fgiScore} (Target: ${targetDirection}) 🚀`));

  const walletsWithBalances = await getAllDelegatedWallets();
  
  if (walletsWithBalances.length === 0) {
    console.log(chalk.yellow('No wallets to process. Exiting.'));
    return {
      totalWallets: 0,
      successCount: 0,
      failureCount: 0,
      skippedCount: 0
    };
  }

  const swapConfig = {
    slippage: slippageOptions.medium,
    useDynamicSlippage: false,
    priorityFee: priorityFeeOptions.priorityLevels.high,
    useDynamicComputeUnitLimit: true,
    platformFee: {
      enabled: true,
      feeBps: routeOptions.platformFee.feeBps,
      feeAccount: routeOptions.platformFee.feeAccount
    }
  };
  
  console.log(chalk.green('👉 Using configuration:'));
  console.log(`📊 Slippage: Medium (${slippageOptions.medium/100}%)`);
  console.log(`💰 Priority Fee: High (max ${priorityFeeOptions.priorityLevels.high.maxLamports/LAMPORTS_PER_SOL} SOL)`);
  console.log(`💻 Compute Units: Dynamic (Jupiter optimized)`);
  console.log(`💵 Platform Fee: ${routeOptions.platformFee.feeBps/100}% to ${routeOptions.platformFee.feeAccount}`);
  
  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;
  
  const confirmationPromises: Array<{ 
    wallet: string, 
    promise: Promise<any>, 
    transactionId: number | null 
  }> = [];
  
  for (const walletInfo of walletsWithBalances) {
    const userEmail = walletInfo.email || 'No email';
    const walletAddress = walletInfo.wallet.address;
    
    // Always check on-chain balances to determine swap direction
    let swapDirection: SwapDirection | null = null;
    
    if (targetDirection === SwapDirection.USDC_TO_SOL) {
      // If target is USDC_TO_SOL, check if there's ANY USDC to swap
      if (walletInfo.usdcBalance > 0) {
        swapDirection = SwapDirection.USDC_TO_SOL;
        console.log(chalk.blue(`Wallet ${walletAddress} needs to convert USDC to SOL`));
      } else {
        console.log(chalk.yellow(`Skipping wallet ${walletAddress} (${userEmail}) - No USDC to convert`));
        skippedCount++;
        continue;
      }
    } else {
      // If target is SOL_TO_USDC, check if there's ANY SOL above the reserve
      const availableSol = walletInfo.solBalance - SOL_RESERVE_AMOUNT;
      if (availableSol > 0) {
        swapDirection = SwapDirection.SOL_TO_USDC;
        console.log(chalk.blue(`Wallet ${walletAddress} needs to convert SOL to USDC`));
      } else {
        console.log(chalk.yellow(`Skipping wallet ${walletAddress} (${userEmail}) - No SOL above reserve to convert`));
        skippedCount++;
        continue;
      }
    }
    
    let amountToSwap: string;
    let inputMint: string;
    let outputMint: string;
    
    if (swapDirection === SwapDirection.USDC_TO_SOL) {
      // Always swap ALL USDC to SOL (we already checked for positive balance)
      const usdcDecimals = 6;
      const usdcAmountString = (walletInfo.usdcBalance * Math.pow(10, usdcDecimals)).toFixed(0);
      const usdcAmount = new BN(usdcAmountString);
      amountToSwap = usdcAmount.toString();
      
      inputMint = USDC_MINT;
      outputMint = SOL_MINT;
      
      console.log(chalk.blue(`Processing wallet ${walletAddress} (${userEmail})`));
      console.log(chalk.blue(`Swapping ${walletInfo.usdcBalance} USDC to SOL`));
      
    } else {
      // Always swap ALL SOL above reserve to USDC (we already checked for positive available balance)
      const availableSol = walletInfo.solBalance - SOL_RESERVE_AMOUNT;
      const solAmountString = (availableSol * LAMPORTS_PER_SOL).toFixed(0);
      const availableSolBN = new BN(solAmountString);
      amountToSwap = availableSolBN.toString();
      
      inputMint = SOL_MINT;
      outputMint = USDC_MINT;
      
      console.log(chalk.blue(`Processing wallet ${walletAddress} (${userEmail})`));
      console.log(chalk.blue(`Swapping ${availableSol} SOL to USDC (keeping ${SOL_RESERVE_AMOUNT} SOL as reserve)`));
    }
    
    // Execute swap with retry logic
    const swapParams = {
      inputMint,
      outputMint,
      amount: amountToSwap,
      slippageBps: slippageOptions.medium,
      userPublicKey: walletInfo.wallet.address,
      walletId: walletInfo.wallet.id
    };
    
    // Create transaction record
    const transactionRecord: TransactionRecord = {
      userId: walletInfo.userId,
      walletAddress: walletAddress,
      email: userEmail,
      transactionType: swapDirection,
      inputAmount: amountToSwap,
      inputToken: inputMint,
      outputToken: outputMint,
      fgiScore: fgiScore,
      status: TransactionStatus.PENDING
    };
    
    // Log the transaction in the database - using safe operation helper
    let transactionId = null;
    if (isDatabaseAvailable) {
      transactionId = await safeDbOperation(
        () => db.logTransaction(transactionRecord),
        null,
        'logging transaction'
      );
    }
    
    if (SKIP_SWAP) {
      console.log(chalk.yellow(`TEST MODE: Skipping swap for wallet ${walletAddress}`));
      if (transactionId && isDatabaseAvailable) {
        await safeDbOperation(
          () => db.updateTransaction(transactionId, {
            status: TransactionStatus.CONFIRMED,
            outputAmount: "0",
            signature: "SIMULATED_TX_" + Date.now()
          }),
          null,
          `updating transaction ${transactionId}`
        );
      }
      successCount++;
      continue;
    }
    
    // Implement retry logic for failed swaps
    let swapSuccess = false;
    let swapResult;
    let retryCount = 0;
    
    while (!swapSuccess && retryCount < MAX_SWAP_RETRIES) {
      if (retryCount > 0) {
        console.log(chalk.yellow(`Retry attempt ${retryCount} for wallet ${walletAddress}...`));
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
      
      // KEEP THIS TRY-CATCH: It's directly around the transaction code
      try {
        swapResult = await executeJupiterSwap(swapParams, swapConfig, true);
        
        if (swapResult.success) {
          swapSuccess = true;
          console.log(chalk.green(`✅ Swap submitted successfully for wallet ${walletAddress}!`));
          successCount++;
          
          // Update transaction record with signature - using safe operation helper
          if (transactionId !== null && isDatabaseAvailable) {
            await safeDbOperation(
              () => db.updateTransaction(transactionId, {
                status: TransactionStatus.PENDING,
                signature: swapResult.signature
              }),
              null,
              `updating transaction ${transactionId} with signature`
            );
          }
          
          // Store signature for later confirmation without awaiting
          if (swapResult.signature) {
            confirmationPromises.push({
              wallet: walletAddress,
              promise: connection.confirmTransaction(swapResult.signature, 'confirmed'),
              transactionId
            });
          }
        } else {
          console.log(chalk.yellow(`Swap attempt ${retryCount + 1} failed for wallet ${walletAddress}. Error: ${swapResult.error}`));
          retryCount++;
        }
      } catch (error) {
        console.error(chalk.red(`Error in swap attempt ${retryCount + 1} for wallet ${walletAddress}:`), error);
        retryCount++;
      }
    }
    
    if (!swapSuccess) {
      console.log(chalk.red(`❌ Swap failed after ${MAX_SWAP_RETRIES} attempts for wallet ${walletAddress}.`));
      failureCount++;
      
      // Update transaction record with failure - using safe operation helper
      if (transactionId !== null && isDatabaseAvailable) {
        await safeDbOperation(
          () => db.updateTransaction(transactionId, {
            status: TransactionStatus.FAILED,
            errorMessage: swapResult?.error || 'Failed after max retries'
          }),
          null,
          `updating failed transaction ${transactionId}`
        );
      }
    }
    
    console.log(chalk.blue(`Waiting ${TX_SUBMISSION_DELAY_MS}ms before next transaction to avoid rate limits...`));
    await new Promise(resolve => setTimeout(resolve, TX_SUBMISSION_DELAY_MS));
  }
  
  // Process confirmation promises
  if (confirmationPromises.length > 0) {
    console.log(chalk.blue(`Waiting for ${confirmationPromises.length} transaction confirmations...`));
    
    const confirmationResults = await Promise.allSettled(
      confirmationPromises.map(async ({ wallet, promise, transactionId }) => {
        const result = await promise.catch(error => {
          console.error(chalk.red(`Error confirming transaction for wallet ${wallet}:`), error);
          return { value: { err: error.message } };
        });
        
        const confirmed = result.value && !result.value.err;
        
        if (confirmed) {
          // Update transaction status after confirmation
          if (transactionId !== null && isDatabaseAvailable) {
            await safeDbOperation(
              () => db.updateTransaction(transactionId, {
                status: TransactionStatus.CONFIRMED
              }),
              null,
              `updating transaction ${transactionId} after confirmation`
            );
          }
        } else {
          console.log(chalk.yellow(`Transaction for wallet ${wallet} failed on-chain.`));
          
          // Get updated wallet balances
          const currentSolBalance = await getSolBalance(wallet);
          const currentUsdcBalance = await getUsdcBalance(wallet);
          
          if (transactionId !== null && isDatabaseAvailable) {
            await safeDbOperation(
              () => db.updateTransaction(transactionId, {
                status: TransactionStatus.FAILED,
                errorMessage: JSON.stringify(result.value?.err || 'On-chain confirmation failed')
              }),
              null,
              `updating failed confirmation for transaction ${transactionId}`
            );
          }
        }
        
        return { wallet, result, transactionId, confirmed };
      })
    );
    
    const confirmedCount = confirmationResults.filter(
      result => result.status === 'fulfilled' && result.value.confirmed
    ).length;
    
    console.log(chalk.blue(`Confirmation results: ${confirmedCount} of ${confirmationPromises.length} transactions confirmed`));
  }
  
  console.log(chalk.blue('\n📊 Bulk Swap Summary:'));
  console.log(chalk.green(`✅ Successful swaps: ${successCount}`));
  console.log(chalk.red(`❌ Failed swaps: ${failureCount}`));
  console.log(chalk.yellow(`⏭️ Skipped wallets: ${skippedCount}`));
  console.log(chalk.blue(`Total wallets processed: ${successCount + failureCount + skippedCount} of ${walletsWithBalances.length}`));
  
  return {
    totalWallets: walletsWithBalances.length,
    successCount,
    failureCount,
    skippedCount
  };
}

/**
 * Run the FGI backtests to sync with latest data
 */
async function runBacktest(): Promise<void> {
  console.log(chalk.blue('🔄 Running FGI Backtests to sync with latest data 🔄'));
  
  // Use the Node spawn API to run the FGI backtest script as a separate process
  return new Promise((resolve, reject) => {
    // Use relative path instead of __dirname
    const backtest = spawn('tsx', ['./src/fgiBacktest.ts']);
    
    backtest.stdout.on('data', (data) => {
      // Forward the backtest output to our console
      console.log(chalk.cyan(`[Backtest] ${data.toString().trim()}`));
    });
    
    backtest.stderr.on('data', (data) => {
      console.error(chalk.red(`[Backtest Error] ${data.toString().trim()}`));
    });
    
    backtest.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green('✅ FGI Backtest completed successfully!'));
        resolve();
      } else {
        console.log(chalk.yellow(`⚠️ FGI Backtest exited with code ${code}`));
        resolve(); // Still resolve to allow the main process to continue
      }
    });
    
    backtest.on('error', (err) => {
      console.error(chalk.red('Error running FGI Backtest:'), err);
      reject(err);
    });
  });
}

/**
 * Setup signal handlers for graceful shutdown
 */
function setupSignalHandlers() {
  const handleSignal = async (signal: string) => {
    console.log(chalk.yellow(`\n${signal} received. Shutting down gracefully...`));
    isShuttingDown = true;
    
    // Close database connections if database is available
    if (isDatabaseAvailable) {
      try {
        await db.closeDatabase();
        console.log(chalk.green('Database connections closed successfully.'));
      } catch (dbError) {
        console.error(chalk.red('Error closing database:'), dbError);
      }
    }
    
    setTimeout(() => {
      console.log(chalk.red('Force exit after timeout'));
      process.exit(0);
    }, 10000);
  };
  
  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('Unhandled Promise Rejection:'), reason);
  });
}

/**
 * Main service loop - runs continuously when in service mode
 */
async function serviceLoop() {
  let errorCount = 0;
  
  console.log(chalk.blue('🔄 FGI Auto Swap Service Starting 🔄'));
  console.log(`Service started at: ${new Date().toISOString()}`);
  console.log(chalk.blue(`Running in ${SERVICE_MODE ? 'SERVICE MODE' : 'ONE-TIME MODE'}`));
  
  // Initialize database
  const dbInitialized = await initializeDatabase().catch(error => {
    console.error(chalk.red('Database initialization error:'), error);
    console.log(chalk.yellow('Service will continue without transaction logging.'));
    return false;
  });
  
  if (!dbInitialized) {
    console.error(chalk.red('Failed to initialize database. Service will continue with limited functionality.'));
    isDatabaseAvailable = false;
  } else {
    console.log(chalk.green('✅ Database initialized successfully'));
    isDatabaseAvailable = true;
    
    // Log some database stats if we have any
    const stats = await safeDbOperation(
      () => db.getTransactionStats(),
      { total: 0, successful: 0, failed: 0, pending: 0 },
      'fetching transaction statistics'
    );
    
    console.log(chalk.blue('📊 Transaction Statistics:'));
    console.log(`Total Transactions: ${stats.total}`);
    console.log(`Successful: ${stats.successful}`);
    console.log(`Failed: ${stats.failed}`);
    console.log(`Pending: ${stats.pending}`);
  }
  
  // Check wallet alignment on startup - make sure all wallets match current FGI
  console.log(chalk.blue('📊 Performing initial wallet alignment check...'));
  await checkWalletAlignmentOnStartup().catch(error => {
    console.error(chalk.red('Error during startup wallet alignment:'), error);
    console.log(chalk.yellow('Continuing with normal service operation despite alignment error'));
  });
  
  // Run backtest on service startup to ensure the latest data is used
  console.log(chalk.blue('📊 Running initial FGI backtest on startup...'));
  await runBacktest().catch(error => {
    console.error(chalk.red('Error running initial backtest at startup:'), error);
    console.log(chalk.yellow('Continuing with normal service operation despite backtest error'));
  });
  
  while (!isShuttingDown) {
    console.log(chalk.blue(`\n=== Starting FGI check cycle at ${new Date().toISOString()} ===`));
    
    const currentState = await initializeFgiState();
    
    const newFgiData = await pollFgiApiForNewData(currentState.lastProcessedTimestamp);
    
    if (!newFgiData) {
      console.log(chalk.yellow('No new FGI data available. Will try again later.'));
    } else {
      // Fetch optimal FGI midpoint from backtest results
      const fgiThreshold = await fetchOptimalFgiMidpoint();
      
      let targetDirection = newFgiData.fgi >= fgiThreshold 
        ? SwapDirection.USDC_TO_SOL
        : SwapDirection.SOL_TO_USDC;
      
      if (TEST_MODE && FORCE_DIRECTION) {
        if (FORCE_DIRECTION.toLowerCase() === 'usdc_to_sol' || FORCE_DIRECTION.toLowerCase() === 'usdctosol') {
          targetDirection = SwapDirection.USDC_TO_SOL;
          console.log(chalk.yellow('TEST MODE: Forcing direction to USDC_TO_SOL'));
        } else if (FORCE_DIRECTION.toLowerCase() === 'sol_to_usdc' || FORCE_DIRECTION.toLowerCase() === 'soltousdc') {
          targetDirection = SwapDirection.SOL_TO_USDC;
          console.log(chalk.yellow('TEST MODE: Forcing direction to SOL_TO_USDC'));
        }
      }
      
      console.log(chalk.green(`FGI Score: ${newFgiData.fgi}`));
      console.log(chalk.green(`Price: $${newFgiData.price}`));
      console.log(chalk.blue(`Using FGI threshold: ${fgiThreshold} ${fgiThreshold === DEFAULT_FGI_THRESHOLD ? '(default)' : '(from backtest)'}`));
      console.log(chalk.blue(`Target direction based on FGI: ${targetDirection === SwapDirection.USDC_TO_SOL ? 'USDC to SOL' : 'SOL to USDC'}`));
      
      console.log(chalk.blue(`Checking all wallets to align with target direction: ${targetDirection}...`));
      const swapResult = await bulkSwapAll(targetDirection, newFgiData.fgi);
      
      const newState: FgiState = {
        lastProcessedTimestamp: newFgiData.timestamp,
        lastFgiScore: newFgiData.fgi,
        lastAction: `aligned_wallets_to_${targetDirection}_${swapResult.successCount}_success_${swapResult.failureCount}_failed`,
        lastSwapDirection: targetDirection
      };
      
      saveFgiState(newState);
      
      console.log(chalk.green('✅ FGI Processing Cycle Completed'));
      console.log(`Cycle completed at: ${new Date().toISOString()}`);
      console.log(`Results: ${swapResult.successCount} successful, ${swapResult.failureCount} failed, ${swapResult.skippedCount} skipped`);
      
      // Run backtest after a successful cycle to update with latest data
      console.log(chalk.blue('📊 Running FGI backtests with latest data...'));
      await runBacktest().catch(error => {
        console.error(chalk.red('Error running backtest after cycle:'), error);
      });
    }
    
    errorCount = 0;
    
    if (!SERVICE_MODE) {
      console.log(chalk.blue('One-time execution completed. Exiting.'));
      break;
    }
    
    // Determine when to schedule the next check
    let nextCheckTime: Date;
    if (newFgiData && newFgiData.timestamp) {
      // Calculate when the next 4h data point is expected using the normalized timestamp
      const nextExpectedUpdate = calculateNextUpdateTime(newFgiData.timestamp);
      
      // Set next check exactly at the expected update time - no buffer
      nextCheckTime = nextExpectedUpdate;
      
      console.log(chalk.blue(`Next expected 4h data update: ${nextExpectedUpdate.toISOString()}`));
      console.log(chalk.blue(`Next check scheduled exactly at update time, will poll every second after that`));
    } else {
      // Fallback to default interval if we don't have valid timestamp information
      nextCheckTime = new Date(Date.now() + CHECK_INTERVAL_MS);
      console.log(chalk.yellow(`No valid timestamp data, using default check interval of ${CHECK_INTERVAL_MS / 60000} minutes`));
    }
    
    const waitTimeMs = nextCheckTime.getTime() - Date.now();
    const waitTimeMinutes = Math.floor(waitTimeMs / 60000);
    const waitTimeSeconds = Math.floor((waitTimeMs % 60000) / 1000);
    
    console.log(chalk.blue(`\n⏰ All tasks completed. Service will be idle until next check cycle.`));
    console.log(chalk.blue(`Next check scheduled at: ${nextCheckTime.toLocaleTimeString()} (in ${waitTimeMinutes} minutes and ${waitTimeSeconds} seconds)`));
    
    if (!isShuttingDown) {
      await new Promise(resolve => setTimeout(resolve, waitTimeMs));
    }
  }
  
  console.log(chalk.green('Service has been gracefully shut down.'));
  process.exit(0);
}

// Main execution
serviceLoop().catch(err => {
  console.error(chalk.red('Fatal error:'), err);
  process.exit(1);
});