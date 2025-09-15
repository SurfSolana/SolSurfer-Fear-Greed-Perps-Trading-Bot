# Drift FGI Trader - Web UI Dashboard

A web interface for monitoring and controlling the Drift FGI Trader bot, providing real-time performance metrics and backtest visualization.

## 🚀 Quick Start

```bash
# Install dependencies
bun install

# Start development server
bun dev

# Open browser to http://localhost:3000
```

## 📊 Features

### Trading Dashboard
- **FGI Time Series**: Monitor Fear & Greed Index movements over time
- **Strategy Carousel**: Browse and compare different trading strategies
- **Backtest Preview**: View and analyze backtest results
- **Performance Metrics**: Track PnL, win rate, and other key metrics
- **Compact Status**: Current bot status and connection state

## ⚠️ Current Status

### What's Working
✅ Backtest result visualization
✅ Historical trade data display
✅ Performance metrics calculation
✅ Charts and data visualization
✅ WebSocket connection infrastructure

### In Development
🚧 **Bot Control Integration** - The following features are not yet operational:
- Start/Stop bot buttons
- Live position management
- Parameter adjustment controls
- Force trade execution

**Note**: These controls are currently display-only. The UI is functional for viewing backtest results and historical performance while full bot integration is being completed.

## 🛠️ Technical Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Charts**: Recharts for data visualization
- **Real-time**: WebSocket (Socket.io)
- **State**: React Query for server state

## 📁 Project Structure

```
web/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Main dashboard
│   └── api/               # API endpoints
│       ├── backtest/      # Backtest execution
│       ├── bot/           # Bot control (start/stop/status)
│       ├── fgi/           # FGI data endpoints
│       └── trades/        # Trade history
├── components/            # React components
│   ├── fgi-time-series.tsx    # FGI chart visualization
│   ├── backtest-preview.tsx   # Backtest results display
│   ├── strategy-carousel.tsx  # Strategy selector
│   ├── compact-status.tsx     # Bot status display
│   ├── big-number-controls.tsx # Parameter controls
│   └── ui/                    # shadcn/ui components
├── lib/                   # Utilities
│   └── types.ts          # TypeScript definitions
└── public/               # Static assets
```

## 🔧 Available Scripts

```bash
# Development
bun dev                # Start dev server with hot reload
bun build             # Build for production
bun start             # Run production build

# Testing
bun test              # Run test suite
bun test:contract     # Run contract tests

# Cache Management
bun warm-cache        # Pre-calculate popular backtests
```

## 🌐 API Endpoints

### Backtest API
- `POST /api/backtest/execute` - Run backtest with parameters
- `POST /api/backtest/warm-cache` - Pre-calculate common scenarios

### Bot Control API (In Development)
- `POST /api/bot/start` - Start trading bot
- `POST /api/bot/stop` - Stop trading bot
- `GET /api/bot/status` - Get current status

### Data API
- `GET /api/trades` - Fetch trade history
- `GET /api/fgi/current` - Get current FGI value
- `WS /api/ws` - WebSocket for real-time updates

## 🔗 Integration with Trading Bot

The web UI connects to the main Drift FGI Trader bot running in the parent directory. Ensure the bot is configured and running for live data:

```bash
# In parent directory
bun run drift-fgi-trader-v2.ts service

# Then in web directory
bun dev
```

## 🐛 Known Issues

1. **Bot control buttons are display-only** - Integration in progress
2. **WebSocket reconnection** - Manual refresh required on disconnect
3. **Cache warming** - Initial backtests may be slow

## 🚀 Deployment

The UI is optimized for Vercel deployment:

```bash
# Build for production
bun run build

# Deploy to Vercel
vercel deploy
```

## 📝 Environment Variables

Create a `.env.local` file for configuration:

```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3000

# Optional: External services
NEXT_PUBLIC_FGI_API_URL=your_fgi_endpoint
```

## 🤝 Contributing

The web UI is actively being developed. Priority areas:
1. Complete bot control integration
2. Add more backtest scenarios
3. Improve real-time performance
4. Enhance data visualizations

---

**Current Focus**: The web UI currently serves as a monitoring dashboard for backtest results. Full trading bot integration is under active development.