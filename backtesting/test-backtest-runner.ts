#!/usr/bin/env bun

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

const execAsync = promisify(exec);

// Test with a smaller subset first
const TEST_CONFIG = {
  ASSETS: ['ETH'],  // Just ETH for testing
  FGI_THRESHOLDS: [25, 50, 75],  // Just 3 thresholds to test
  STRATEGIES: ['momentum'],  // Just momentum for now
  LEVERAGE_LEVELS: [1, 4, 10],  // Just 3 leverage levels
  OUTPUT_DIR: './backtest-data-test'
};

async function runBacktest(asset: string, strategy: string, threshold: number, leverage: number) {
  console.log(chalk.gray(`Testing: ${asset} ${strategy} FGI=${threshold} Leverage=${leverage}x`));

  // First check if the backtest script exists
  const scriptPath = '/Users/alexnewman/Scripts/lifeguard-token-vault/backtesting/fgi-leverage-backtest.ts';

  try {
    await fs.access(scriptPath);
  } catch {
    console.error(chalk.red(`Backtest script not found at: ${scriptPath}`));
    return null;
  }

  const command = `bun run ${scriptPath} --asset=${asset} --leverage=${leverage}x --long-start=${threshold} --long-end=100 --short-start=0 --short-end=${threshold - 1} --days=30`;

  try {
    const { stdout, stderr } = await execAsync(command);

    if (stderr) {
      console.warn(chalk.yellow(`Warning: ${stderr}`));
    }

    // Simple parse to verify we're getting data
    const hasReturn = stdout.includes('Total Return');
    const hasTrades = stdout.includes('Total Trades');

    if (hasReturn && hasTrades) {
      console.log(chalk.green(`✓ Successfully ran backtest`));
      return { asset, strategy, threshold, leverage, output: stdout };
    } else {
      console.log(chalk.yellow(`⚠ Backtest completed but output format unexpected`));
      return { asset, strategy, threshold, leverage, output: stdout };
    }
  } catch (error) {
    console.error(chalk.red(`✗ Failed: ${error}`));
    return null;
  }
}

async function main() {
  console.log(chalk.bold.cyan('🧪 Testing Backtest System'));
  console.log(chalk.gray('=' .repeat(60)));

  const totalTests =
    TEST_CONFIG.ASSETS.length *
    TEST_CONFIG.STRATEGIES.length *
    TEST_CONFIG.FGI_THRESHOLDS.length *
    TEST_CONFIG.LEVERAGE_LEVELS.length;

  console.log(chalk.yellow(`Running ${totalTests} test backtests...`));

  await fs.mkdir(TEST_CONFIG.OUTPUT_DIR, { recursive: true });

  const results = [];
  let successful = 0;
  let failed = 0;

  for (const asset of TEST_CONFIG.ASSETS) {
    for (const strategy of TEST_CONFIG.STRATEGIES) {
      for (const threshold of TEST_CONFIG.FGI_THRESHOLDS) {
        for (const leverage of TEST_CONFIG.LEVERAGE_LEVELS) {
          const result = await runBacktest(asset, strategy, threshold, leverage);

          if (result) {
            successful++;
            results.push(result);
          } else {
            failed++;
          }
        }
      }
    }
  }

  // Save test results
  const outputFile = path.join(TEST_CONFIG.OUTPUT_DIR, 'test-results.json');
  await fs.writeFile(outputFile, JSON.stringify(results, null, 2));

  console.log(chalk.gray('=' .repeat(60)));
  console.log(chalk.bold.cyan('Test Results:'));
  console.log(chalk.green(`✓ Successful: ${successful}`));
  console.log(chalk.red(`✗ Failed: ${failed}`));
  console.log(chalk.cyan(`📁 Results saved to: ${path.resolve(outputFile)}`));

  if (successful === totalTests) {
    console.log(chalk.bold.green('\n✅ All tests passed! Ready to run full backtest suite.'));
  } else {
    console.log(chalk.bold.yellow(`\n⚠️ Some tests failed. Check the backtest script configuration.`));
  }
}

main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});