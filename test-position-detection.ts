#!/usr/bin/env bun
import { DriftTradingClient } from './src/drift-client';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

async function testPositionDetection() {
  console.log(chalk.cyan('🔍 Testing Position Detection\n'));

  const driftClient = new DriftTradingClient();

  try {
    // Initialize client
    console.log(chalk.yellow('Initializing Drift client...'));
    await driftClient.initialize();
    console.log(chalk.green('✅ Client initialized\n'));

    // Check active subaccount
    const activeSubAccount = driftClient.getActiveSubAccountId();
    console.log(chalk.cyan(`📂 Active SubAccount: ${activeSubAccount}\n`));

    // Check ETH position (market index 1 on mainnet)
    console.log(chalk.yellow('Checking ETH position (market index 1)...'));
    const ethPosition = await driftClient.getPosition(1);

    console.log(chalk.cyan('\n📊 ETH Position Results:'));
    console.log(`   Exists: ${ethPosition.exists ? chalk.green('YES') : chalk.red('NO')}`);

    if (ethPosition.exists) {
      console.log(`   Direction: ${ethPosition.direction}`);
      console.log(`   Size: ${ethPosition.size.toFixed(4)} ETH`);
      console.log(`   Entry Price: $${ethPosition.entryPrice.toFixed(2)}`);
      console.log(`   Mark Price: $${ethPosition.markPrice.toFixed(2)}`);
      console.log(`   PnL: $${ethPosition.pnl.toFixed(2)} (${ethPosition.pnlPercent.toFixed(2)}%)`);
    }

    // Also check SOL position (market index 0 on mainnet) for comparison
    console.log(chalk.yellow('\nChecking SOL position (market index 0)...'));
    const solPosition = await driftClient.getPosition(0);

    console.log(chalk.cyan('\n📊 SOL Position Results:'));
    console.log(`   Exists: ${solPosition.exists ? chalk.green('YES') : chalk.red('NO')}`);

    if (solPosition.exists) {
      console.log(`   Direction: ${solPosition.direction}`);
      console.log(`   Size: ${solPosition.size.toFixed(4)} SOL`);
      console.log(`   Entry Price: $${solPosition.entryPrice.toFixed(2)}`);
      console.log(`   Mark Price: $${solPosition.markPrice.toFixed(2)}`);
      console.log(`   PnL: $${solPosition.pnl.toFixed(2)} (${solPosition.pnlPercent.toFixed(2)}%)`);
    }

    // List all subaccounts
    console.log(chalk.yellow('\n📂 Listing all subaccounts...'));
    const subaccounts = await driftClient.listSubAccounts();

    if (subaccounts.length > 0) {
      console.log(chalk.cyan(`Found ${subaccounts.length} subaccount(s):`));
      for (const account of subaccounts) {
        console.log(`   SubAccount ${account.subAccountId}: ${account.name || 'Unnamed'}`);
        console.log(`     - Authority: ${account.authority}`);
        console.log(`     - Collateral: $${account.totalCollateral.toFixed(2)} ($${account.freeCollateral.toFixed(2)} free)`);
        console.log(`     - Positions: ${account.activePositions}`);
      }
    } else {
      console.log(chalk.red('No subaccounts found'));
    }

  } catch (error) {
    console.error(chalk.red('❌ Error:'), error);
  } finally {
    await driftClient.shutdown();
  }
}

// Run the test
testPositionDetection().catch(console.error);