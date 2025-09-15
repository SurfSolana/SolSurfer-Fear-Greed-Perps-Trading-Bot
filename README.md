# Drift FGI Trader v2

An automated trading bot for Drift Protocol that executes trades based on Fear & Greed Index (FGI) signals from the 4-hour ETH market.

## Strategy

The bot implements a momentum-based strategy optimized through backtesting:
- **SHORT** when FGI d 49 (extreme fear)
- **LONG** when FGI e 50 (greed)
- **4x leverage** on all positions
- Automatically syncs with 4-hour candle boundaries

## Prerequisites

- Node.js 18+ or Bun runtime
- Solana wallet with private key
- USDC collateral on Drift Protocol
- API access to FGI data endpoint

## Installation

```bash
# Install dependencies using Bun (recommended)
bun install

# Or using npm
npm install
```

## Configuration

Create a `.env` file in the root directory:

```bash
# Required for live trading
SOLANA_PRIVATE_KEY=your_base58_private_key_here
USE_DRIFT_SDK=true  # Set to false for simulation mode

# Trading Parameters (optional - defaults shown)
LEVERAGE=4
MAX_POSITION_RATIO=0.7  # Use 70% of available collateral

# Check interval (optional)
FGI_CHECK_INTERVAL_MS=300000  # 5 minutes
```

## Usage

### Running Commands

The bot can be run directly with Bun:

```bash
# Test connection and fetch current FGI
bun run drift-fgi-trader-v2.ts test

# Run a single trade check
bun run drift-fgi-trader-v2.ts once

# Start as a service (continuous monitoring)
bun run drift-fgi-trader-v2.ts service

# Check current position status
bun run drift-fgi-trader-v2.ts check-position

# Close all positions
bun run drift-fgi-trader-v2.ts close

# Force open positions (ignores FGI signal)
bun run drift-fgi-trader-v2.ts force-long
bun run drift-fgi-trader-v2.ts force-short
```

### Using npm scripts

Alternatively, use the provided npm scripts:

```bash
# Start the trader
npm run start service

# Force trades
npm run trade:force-long
npm run trade:force-short

# Close positions
npm run trade:close

# Check status
npm run trade:status
```

## Operating Modes

### 1. Test Mode
```bash
bun run drift-fgi-trader-v2.ts test
```
- Verifies connection to Drift Protocol
- Fetches current FGI data
- Does not execute trades

### 2. Once Mode
```bash
bun run drift-fgi-trader-v2.ts once
```
- Runs a single trade check
- Executes trade if conditions are met
- Exits after completion

### 3. Service Mode
```bash
bun run drift-fgi-trader-v2.ts service
```
- Runs continuously
- Syncs with 4-hour candle boundaries
- Automatically polls for new candles
- Executes trades when new data arrives
- Press Ctrl+C to stop gracefully

### 4. Simulation Mode
Set `USE_DRIFT_SDK=false` in `.env` to run without real trades:
- Tests logic without risking capital
- Logs simulated trades
- Useful for development and testing

## Features

### Automatic 4H Candle Synchronization
- Calculates next candle update time
- Waits for candle boundaries
- Polls API when new data expected
- Prevents duplicate trades on same candle

### Position Management
- Automatic position flipping (SHORT to LONG or vice versa)
- PnL settlement for compounding
- State persistence across restarts

### Risk Management
- Position ratio controls
- Leverage controls

### State Tracking
- Position state saved to `fgi-drift-state-v2.json`
- Survives restarts without losing context

## Testing

### Test with Custom FGI Value
```bash
bun run drift-fgi-trader-v2.ts test --test-fgi 25  # Test SHORT signal
bun run drift-fgi-trader-v2.ts test --test-fgi 75  # Test LONG signal
```

## Monitoring

The bot provides detailed console output with color-coded messages:
- =� Green: Successful operations
- =4 Red: Errors and SHORT signals
- =5 Blue: Information and waiting periods
- =� Yellow: Warnings and simulations
- =� Cyan: Status updates

## Files Generated

- `fgi-drift-state-v2.json` - Current position state
- `logs/daily-performance-{date}.json` - Daily trading metrics
- `.env` - Your configuration (create manually)

## Safety Features

1. **State Persistence**: Remembers position across restarts
2. **Duplicate Prevention**: Won't process same candle twice
3. **Graceful Shutdown**: Warns about open positions on exit

## Troubleshooting

### "SOLANA_PRIVATE_KEY environment variable is required"
Ensure your `.env` file contains a valid Solana private key in base58 format.

### "No collateral available"
Deposit USDC to your Drift account before trading.

### API Connection Issues
Check network connectivity and FGI API endpoint availability.

### Position Not Opening
- Verify sufficient collateral
- Ensure market is open

## Web UI Dashboard

The project includes a web interface for monitoring trading performance and visualizing backtest results.

### Running the Web UI

```bash
# Navigate to web directory
cd web/

# Install dependencies (first time only)
bun install

# Start development server
bun dev
```

The web interface will be available at [http://localhost:3000](http://localhost:3000)

### Current Features
- **Backtest Visualization**: View historical performance charts and metrics
- **FGI Time Series**: Monitor Fear & Greed Index movements over time
- **Strategy Carousel**: Browse and test different trading strategies
- **Performance Metrics**: Track PnL, win rate, and other key indicators

### ⚠️ Integration Status
**Note**: The web UI is currently in development. The following features are not yet operational:
- Start/Stop bot buttons
- Trading control buttons
- Live position management

These controls are display-only for now. Full integration with the trading bot is in progress. Currently, the web UI is best used for viewing backtest results and analyzing historical performance.

## PM2 Process Management

The bot can be managed using PM2 for production deployments with hot-reloadable configuration:

### Setup PM2
```bash
# Install PM2 globally
bun add -g pm2

# Start both bot and web UI
bun run pm2:start

# View logs
bun run pm2:logs

# Stop all processes
bun run pm2:stop

# Restart all processes
bun run pm2:restart

# View status
bun run pm2:status
```

### Hot Configuration Reload

The bot reads configuration from `trading-config.json` on each trading cycle, allowing parameter changes without restarts:

1. **From Web UI**: Use the SAVE button after changing parameters
2. **Manual Edit**: Modify `trading-config.json` directly
3. **Test Script**: Run `bun run test-hot-config.ts` to verify hot-reload

Configuration includes:
- `asset`: Trading pair (ETH, SOL, BTC)
- `leverage`: 1-20x leverage
- `lowThreshold`: FGI threshold for SHORT (0-100)
- `highThreshold`: FGI threshold for LONG (0-100)
- `maxPositionRatio`: Portion of collateral to use (0.1-1.0)
- `strategy`: "momentum" or "contrarian"
- `enabled`: true/false to pause trading

## Development

### Running Backtests
```bash
npm run backtest
npm run backtest:monthly
```

### Devnet Testing
```bash
npm run devnet:setup
npm run devnet:fund
npm run devnet:test
```
