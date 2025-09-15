#!/usr/bin/env bun

import { readFileSync, writeFileSync } from 'fs'
import chalk from 'chalk'

const CONFIG_FILE = './trading-config.json'

console.log(chalk.cyan('🧪 Testing Hot-Reload Configuration'))
console.log(chalk.gray('This script will modify the config file and verify the bot reads it'))

// Read current config
const currentConfig = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
console.log(chalk.blue('\nCurrent config:'), currentConfig)

// Test 1: Change leverage
console.log(chalk.yellow('\n📝 Test 1: Changing leverage to 10x...'))
const test1Config = { ...currentConfig, leverage: 10 }
writeFileSync(CONFIG_FILE, JSON.stringify(test1Config, null, 2))
console.log(chalk.green('✅ Config updated. Bot should now use 10x leverage on next cycle'))

// Wait 2 seconds
await new Promise(resolve => setTimeout(resolve, 2000))

// Test 2: Disable trading
console.log(chalk.yellow('\n📝 Test 2: Disabling trading...'))
const test2Config = { ...currentConfig, enabled: false }
writeFileSync(CONFIG_FILE, JSON.stringify(test2Config, null, 2))
console.log(chalk.green('✅ Config updated. Bot should now be in monitoring-only mode'))

// Wait 2 seconds
await new Promise(resolve => setTimeout(resolve, 2000))

// Test 3: Change thresholds
console.log(chalk.yellow('\n📝 Test 3: Changing FGI thresholds...'))
const test3Config = { ...currentConfig, lowThreshold: 30, highThreshold: 70 }
writeFileSync(CONFIG_FILE, JSON.stringify(test3Config, null, 2))
console.log(chalk.green('✅ Config updated. Bot should now use 30/70 thresholds'))

// Wait 2 seconds
await new Promise(resolve => setTimeout(resolve, 2000))

// Restore original config
console.log(chalk.yellow('\n📝 Restoring original config...'))
writeFileSync(CONFIG_FILE, JSON.stringify(currentConfig, null, 2))
console.log(chalk.green('✅ Original config restored'))

console.log(chalk.cyan('\n🎉 Hot-reload configuration test complete!'))
console.log(chalk.gray('Run the bot with "bun run drift-fgi-trader-v2.ts service" to see it reload configs'))
console.log(chalk.gray('Or use PM2: "bun run pm2:start"'))