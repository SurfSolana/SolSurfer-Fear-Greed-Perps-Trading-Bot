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
    }
  ]
}