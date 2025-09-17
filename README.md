# Lifeguard Trading Core

Automated cryptocurrency trading bots using Fear & Greed Index (FGI) signals. Supports both **Drift Protocol** (Solana) and **Hyperliquid** (EVM) perpetual futures DEXs.

## 🚀 Features

- **Multi-Exchange Support**: Trade on Drift Protocol and Hyperliquid
- **FGI-Based Strategy**: Contrarian trading based on market sentiment
- **Configurable Risk Management**: Leverage, position sizing, stop losses
- **PM2 Process Management**: Production-ready deployment
- **Backtesting Tools**: Historical performance analysis
- **Real-time Monitoring**: Web dashboard for tracking positions

## 📋 Prerequisites

- **Node.js 18+** or **Bun** runtime (recommended)
- Wallet with private key (Solana for Drift, Ethereum for Hyperliquid)
- Collateral funds (USDC on respective networks)

## 🛠 Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/lifeguard-trading-core.git
cd lifeguard-trading-core

# Install dependencies with Bun (recommended)
bun install

# Or with npm
npm install
```

## ⚙️ Configuration

1. **Copy the sample environment file:**
```bash
cp .env.sample .env
```

2. **Edit `.env` with your configuration:**

### For Drift Protocol (Solana)
```env
# Solana wallet private key (base58 format)
SOLANA_PRIVATE_KEY=your_private_key_here
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
DRIFT_ENV=mainnet-beta  # or 'devnet' for testing
```

### For Hyperliquid
```env
# Ethereum wallet private key (hex format with 0x prefix)
HYPERLIQUID_PRIVATE_KEY=0x...
HYPERLIQUID_TESTNET=true  # Use testnet first!
HYPERLIQUID_ASSET=ETH
HYPERLIQUID_LEVERAGE=3
```

### Trading Parameters (Both Bots)
```env
# FGI check interval (ms)
FGI_CHECK_INTERVAL_MS=300000  # 5 minutes

# Risk management
LEVERAGE=3
MAX_POSITION_RATIO=1
MAX_DAILY_LOSS_PERCENT=50
```

## 🎯 Trading Strategy

Both bots implement a **contrarian FGI strategy**:

- **LONG** when FGI < 30 (Extreme Fear) - "Buy when others are fearful"
- **SHORT** when FGI > 70 (Extreme Greed) - "Sell when others are greedy"
- **HOLD** when FGI is 30-70 (Neutral zone)

The strategy uses the 4-hour timeframe FGI data for ETH.

## 🚦 Quick Start

### Test Connections First

```bash
# Test Hyperliquid connection (no private key needed)
bun run src/test-hyperliquid-public.ts

# Test FGI data feed
bun run src/test-hyperliquid-fgi.ts
```

### Start Trading Bots

#### Option 1: PM2 (Production)

```bash
# Start all bots
npm run pm2:start

# Start specific bot
npm run bot:hyperliquid:start  # Hyperliquid only
pm2 start ecosystem.config.js --only drift-fgi-trader  # Drift only

# Monitor logs
npm run bot:hyperliquid:logs
pm2 logs drift-fgi-trader

# Stop bots
npm run bot:hyperliquid:stop
pm2 stop all
```

#### Option 2: Direct Execution (Development)

```bash
# Run Hyperliquid bot
bun run src/bots/hyperliquid-fgi-trader.ts

# Run Drift bot
bun run drift-fgi-trader-v2.ts
```

## 🧪 Testing & Safety

### 1. Start with Testnet

**Hyperliquid Testnet:**
1. Set `HYPERLIQUID_TESTNET=true` in `.env`
2. Get test funds: https://faucet.hyperliquid.xyz/
3. Test with small positions first

**Drift DevNet:**
1. Set `DRIFT_ENV=devnet` in `.env`
2. Get devnet SOL: `solana airdrop 2`
3. Get devnet USDC: `npm run devnet:fund`

### 2. Backtesting

Run historical simulations before live trading:

```bash
# Run backtest with current parameters
npm run backtest

# Monthly performance analysis
npm run backtest:monthly
```

### 3. Safety Features

- **Position Limits**: Max position size caps
- **Liquidation Buffer**: Maintains 15% safety margin
- **Daily Loss Limits**: Stops trading after 50% daily loss
- **Manual Override**: Close positions anytime with:
  ```bash
  # Force close all Drift positions
  npm run trade:close

  # Stop all bots immediately
  pm2 stop all
  ```

## 📊 Monitoring

### Web Dashboard

```bash
# Start web dashboard (port 3000)
cd web && npm run dev

# View at http://localhost:3000
```

### PM2 Monitoring

```bash
# View all processes
pm2 status

# Real-time logs
pm2 logs

# Process metrics
pm2 monit
```

### Database Logs

All trades are logged to `trading.db` SQLite database:

```bash
# View recent trades
sqlite3 trading.db "SELECT * FROM trades ORDER BY timestamp DESC LIMIT 10;"
```

## 🏗 Project Structure

```
lifeguard-trading-core/
├── src/
│   ├── bots/
│   │   └── hyperliquid-fgi-trader.ts   # Hyperliquid FGI bot
│   ├── services/
│   │   ├── hyperliquid-client.ts       # HL SDK initialization
│   │   ├── hyperliquid-account.ts      # Account management
│   │   ├── hyperliquid-trade.ts        # Order execution
│   │   └── hyperliquid-market.ts       # Market data
│   └── test-*.ts                       # Test scripts
├── drift-fgi-trader-v2.ts              # Drift FGI bot
├── ecosystem.config.js                  # PM2 configuration
├── web/                                 # Dashboard UI
├── backtesting/                         # Backtest tools
├── docs/                               # Documentation
│   ├── plans/                          # Implementation plans
│   └── todos/                          # Task lists
└── .env.sample                         # Configuration template
```

## 🔧 Advanced Configuration

### Custom FGI Thresholds

Edit the bot files to adjust thresholds:

```typescript
// src/bots/hyperliquid-fgi-trader.ts
const CONFIG = {
    longThreshold: 30,   // Adjust fear threshold
    shortThreshold: 70,  // Adjust greed threshold
}
```

### Multiple Assets

To trade different assets, create separate PM2 processes:

```javascript
// ecosystem.config.js
{
  name: 'hyperliquid-btc-trader',
  env: {
    HYPERLIQUID_ASSET: 'BTC',
    // ... other config
  }
}
```

## 🐛 Troubleshooting

### Common Issues

1. **"HYPERLIQUID_PRIVATE_KEY not set"**
   - Add your private key to `.env` file
   - Never commit `.env` to git!

2. **"Insufficient balance"**
   - Add collateral to your wallet
   - For testnet: use faucets
   - For mainnet: deposit USDC

3. **"Market is closed"**
   - Check exchange status
   - May occur during maintenance

4. **Connection timeouts**
   - Check network connection
   - Try alternative RPC endpoints
   - Increase timeout in client config

### Debug Mode

Enable detailed logging:

```bash
# Run with debug output
DEBUG=* bun run src/bots/hyperliquid-fgi-trader.ts

# Check PM2 error logs
pm2 logs --err
```

## 🔐 Security

- **NEVER** share or commit private keys
- Use separate wallets for testing
- Start with small position sizes
- Monitor positions regularly
- Set up alerts for large drawdowns

## 📈 Performance Tracking

Track your trading performance:

```bash
# View daily P&L
cat daily-performance.json

# Database analytics
sqlite3 trading.db "
  SELECT
    date(timestamp) as day,
    count(*) as trades,
    sum(case when action like '%CLOSE%' then price * size else 0 end) as volume
  FROM trades
  GROUP BY day
  ORDER BY day DESC;
"
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file

## ⚠️ Disclaimer

**This software is for educational purposes only.**

- Trading cryptocurrencies involves substantial risk
- Past performance does not guarantee future results
- Never trade with funds you cannot afford to lose
- The authors are not responsible for any financial losses

## 🆘 Support

- **Issues**: Open a GitHub issue
- **Documentation**: Check `/docs` folder
- **Hyperliquid Docs**: https://hyperliquid.gitbook.io
- **Drift Docs**: https://docs.drift.trade

---

Built with ❤️ using TypeScript, Bun, and the power of contrarian trading.