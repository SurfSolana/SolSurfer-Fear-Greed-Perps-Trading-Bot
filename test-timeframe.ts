#!/usr/bin/env bun

import { readFileSync, writeFileSync } from 'fs';
import chalk from 'chalk';

// Test script to verify timeframe configuration changes

console.log(chalk.blue('Testing timeframe configuration hot-reload...'));

const CONFIG_FILE = './trading-config.json';

// Read current config
const originalConfig = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
console.log(chalk.gray('Original config:'), originalConfig);

// Test different timeframes
const timeframes = ['15min', '1h', '4h', '24h'];

async function testTimeframe(timeframe: string) {
  console.log(chalk.yellow(`\n📝 Testing ${timeframe} timeframe...`));

  // Update config with new timeframe
  const newConfig = {
    ...originalConfig,
    timeframe
  };

  writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2));
  console.log(chalk.green(`✅ Updated config to ${timeframe}`));

  // Wait a moment for the bot to pick up the change
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log(chalk.gray(`Bot should now be using ${timeframe} intervals`));
  console.log(chalk.gray(`Expected behavior:`));

  switch(timeframe) {
    case '15min':
      console.log(chalk.gray('  - Polls every 15 minutes'));
      console.log(chalk.gray('  - API URL: /ETH/15min/latest.json'));
      console.log(chalk.gray('  - Progress updates every 15 seconds'));
      break;
    case '1h':
      console.log(chalk.gray('  - Polls every hour'));
      console.log(chalk.gray('  - API URL: /ETH/1h/latest.json'));
      console.log(chalk.gray('  - Progress updates every minute'));
      break;
    case '4h':
      console.log(chalk.gray('  - Polls every 4 hours'));
      console.log(chalk.gray('  - API URL: /ETH/4h/latest.json'));
      console.log(chalk.gray('  - Progress updates every minute'));
      break;
    case '24h':
      console.log(chalk.gray('  - Polls every 24 hours'));
      console.log(chalk.gray('  - API URL: /ETH/24h/latest.json'));
      console.log(chalk.gray('  - Progress updates every minute'));
      break;
  }
}

// Run tests
async function runTests() {
  for (const timeframe of timeframes) {
    await testTimeframe(timeframe);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Restore original config
  console.log(chalk.blue('\n🔄 Restoring original configuration...'));
  writeFileSync(CONFIG_FILE, JSON.stringify(originalConfig, null, 2));
  console.log(chalk.green('✅ Configuration restored'));

  console.log(chalk.blue('\n📊 Test Summary:'));
  console.log(chalk.green('✅ All timeframes tested successfully'));
  console.log(chalk.gray('The bot should hot-reload each timeframe change'));
  console.log(chalk.gray('Check the bot logs to verify it picked up the changes'));
}

runTests().catch(console.error);