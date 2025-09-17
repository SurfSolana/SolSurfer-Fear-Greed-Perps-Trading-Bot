module.exports = {
  apps: [
    {
      name: 'drift-fgi-trader',
      script: 'bun',
      args: 'run drift-fgi-trader-v2.ts service',
      cwd: './',
      env: {
        SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY,
        USE_DRIFT_SDK: 'true'
      }
    },
    {
      name: 'hyperliquid-fgi-trader',
      script: 'bun',
      args: 'run hyperliquid-fgi-trader-v2.ts',
      cwd: './',
      env: {
        HYPERLIQUID_PRIVATE_KEY: process.env.HYPERLIQUID_PRIVATE_KEY,
        HYPERLIQUID_TESTNET: process.env.HYPERLIQUID_TESTNET,
        HYPERLIQUID_ASSET: process.env.HYPERLIQUID_ASSET,
        HYPERLIQUID_LEVERAGE: process.env.HYPERLIQUID_LEVERAGE
      },
      autorestart: true,
      max_memory_restart: '1G',
      error_file: './logs/hyperliquid-error.log',
      out_file: './logs/hyperliquid-out.log'
    }
  ]
}