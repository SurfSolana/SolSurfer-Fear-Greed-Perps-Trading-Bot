#!/usr/bin/env bun

/**
 * Test script for Drift Protocol subaccount management
 * Tests the improved drift-client.ts with proper subaccount handling
 */

import { DriftTradingClient } from './src/drift-client';
import chalk from 'chalk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

async function testSubAccounts() {
  console.log(chalk.blue('═══════════════════════════════════════════════'));
  console.log(chalk.blue('  Drift Protocol SubAccount Management Test'));
  console.log(chalk.blue('═══════════════════════════════════════════════\n'));

  // Get private key from environment
  const privateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!privateKey) {
    console.error(chalk.red('❌ SOLANA_PRIVATE_KEY not found in .env'));
    process.exit(1);
  }

  // Create Drift client
  const driftClient = new DriftTradingClient(privateKey);

  try {
    // Test 1: Initialize client (will discover and handle subaccounts)
    console.log(chalk.yellow('\n📝 Test 1: Initialize Drift Client'));
    console.log(chalk.gray('─'.repeat(50)));
    await driftClient.initialize();

    // Test 2: List all available subaccounts
    console.log(chalk.yellow('\n📝 Test 2: List Available SubAccounts'));
    console.log(chalk.gray('─'.repeat(50)));
    const subAccounts = await driftClient.listSubAccounts();

    console.log(chalk.cyan('Available SubAccounts:'));
    for (const account of subAccounts) {
      const status = account.isActive ? chalk.green('[ACTIVE]') : '';
      const collateral = account.totalCollateral !== undefined
        ? `$${account.totalCollateral.toFixed(2)}`
        : 'N/A';
      console.log(
        `  SubAccount ${account.id}: ${account.exists ? 'EXISTS' : 'NOT FOUND'} ${status}`
      );
      if (account.totalCollateral !== undefined) {
        console.log(`    Total Collateral: ${collateral}`);
        console.log(`    Free Collateral: $${account.freeCollateral?.toFixed(2)}`);
      }
    }

    // Test 3: Get current active subaccount
    console.log(chalk.yellow('\n📝 Test 3: Current Active SubAccount'));
    console.log(chalk.gray('─'.repeat(50)));
    const activeId = driftClient.getActiveSubAccountId();
    console.log(chalk.cyan(`Active SubAccount ID: ${activeId}`));

    // Test 4: Get collateral info for active account
    console.log(chalk.yellow('\n📝 Test 4: Collateral Information'));
    console.log(chalk.gray('─'.repeat(50)));
    try {
      const collateralInfo = await driftClient.getCollateralInfo();
      console.log(chalk.cyan('Collateral Info:'));
      console.log(`  Total: $${collateralInfo.total.toFixed(2)}`);
      console.log(`  Free: $${collateralInfo.free.toFixed(2)}`);
      console.log(`  Used: $${collateralInfo.used.toFixed(2)}`);
      console.log(`  Health: ${collateralInfo.health.toFixed(2)}%`);
    } catch (error) {
      console.log(chalk.yellow('  No collateral info available (account may be empty)'));
    }

    // Test 5: Check for open positions
    console.log(chalk.yellow('\n📝 Test 5: Check Open Positions'));
    console.log(chalk.gray('─'.repeat(50)));
    try {
      const position = await driftClient.getPosition();
      if (position.exists) {
        console.log(chalk.cyan('Open Position Found:'));
        console.log(`  Direction: ${position.direction}`);
        console.log(`  Size: ${position.size} ETH`);
        console.log(`  Entry Price: $${position.entryPrice.toFixed(2)}`);
        console.log(`  Mark Price: $${position.markPrice.toFixed(2)}`);
        console.log(`  PnL: $${position.pnl.toFixed(2)} (${position.pnlPercent.toFixed(2)}%)`);
      } else {
        console.log(chalk.gray('  No open positions'));
      }
    } catch (error) {
      console.log(chalk.gray('  No position data available'));
    }

    // Test 6: Try switching to a different subaccount (if multiple exist)
    const availableIds = driftClient.getAvailableSubAccounts();
    if (availableIds.length > 1) {
      console.log(chalk.yellow('\n📝 Test 6: Switch SubAccount'));
      console.log(chalk.gray('─'.repeat(50)));

      const targetId = availableIds.find(id => id !== activeId);
      if (targetId !== undefined) {
        console.log(chalk.cyan(`Switching from SubAccount ${activeId} to ${targetId}...`));
        await driftClient.switchSubAccount(targetId);
        console.log(chalk.green(`✅ Successfully switched to SubAccount ${targetId}`));
      }
    } else {
      console.log(chalk.yellow('\n📝 Test 6: Switch SubAccount'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.gray('  Only one subaccount available, skipping switch test'));
    }

    // Clean shutdown
    console.log(chalk.yellow('\n📝 Shutting down...'));
    console.log(chalk.gray('─'.repeat(50)));
    await driftClient.shutdown();

    console.log(chalk.green('\n✅ All tests completed successfully!'));

  } catch (error) {
    console.error(chalk.red('\n❌ Test failed:'), error);

    // Try to shutdown gracefully
    try {
      await driftClient.shutdown();
    } catch (shutdownError) {
      // Ignore shutdown errors
    }

    process.exit(1);
  }
}

// Run the test
testSubAccounts().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});