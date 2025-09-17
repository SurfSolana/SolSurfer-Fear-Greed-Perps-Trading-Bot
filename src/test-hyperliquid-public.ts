#!/usr/bin/env bun

import * as hl from "@nktkas/hyperliquid";
import chalk from 'chalk';

// Test public API without needing a private key
async function testPublicAPI() {
    console.log(chalk.cyan('\n🧪 Testing Hyperliquid Public API...'));

    try {
        // Initialize info client (no wallet needed)
        const infoClient = new hl.InfoClient({
            transport: new hl.HttpTransport({
                isTestnet: false, // Use mainnet for testing
                timeout: 10000
            })
        });

        // Test 1: Get exchange status
        console.log(chalk.gray('\n1. Checking exchange status...'));
        const status = await infoClient.exchangeStatus();
        console.log(chalk.green('✅ Exchange operational:', status.isOperational));

        // Test 2: Get available markets
        console.log(chalk.gray('\n2. Getting available markets...'));
        const meta = await infoClient.meta();
        console.log(chalk.green(`✅ Found ${meta.universe.length} trading pairs`));

        // Show ETH market info
        const ethMarket = meta.universe.find(m => m.name === 'ETH');
        if (ethMarket) {
            console.log(chalk.blue(`   ETH Market Index: ${meta.universe.indexOf(ethMarket)}`));
        }

        // Test 3: Get current prices
        console.log(chalk.gray('\n3. Getting current prices...'));
        const allMids = await infoClient.allMids();
        const ethPrice = allMids['ETH'];
        const btcPrice = allMids['BTC'];

        if (ethPrice) {
            console.log(chalk.green(`✅ ETH Price: $${parseFloat(ethPrice).toFixed(2)}`));
        }
        if (btcPrice) {
            console.log(chalk.green(`✅ BTC Price: $${parseFloat(btcPrice).toFixed(2)}`));
        }

        // Test 4: Get order book
        console.log(chalk.gray('\n4. Getting ETH order book...'));
        const book = await infoClient.l2Book({ coin: 'ETH' });

        if (book.levels[0]?.length > 0 && book.levels[1]?.length > 0) {
            const bestBid = parseFloat(book.levels[0][0].px);
            const bestAsk = parseFloat(book.levels[1][0].px);
            const spread = bestAsk - bestBid;

            console.log(chalk.green(`✅ Best Bid: $${bestBid.toFixed(2)}`));
            console.log(chalk.green(`✅ Best Ask: $${bestAsk.toFixed(2)}`));
            console.log(chalk.green(`✅ Spread: $${spread.toFixed(2)}`));
        }

        // Test 5: Get market stats
        console.log(chalk.gray('\n5. Getting ETH market stats...'));
        const metaAndCtxs = await infoClient.metaAndAssetCtxs();
        const ethCtx = metaAndCtxs[1].find(ctx => ctx.coin === 'ETH');

        if (ethCtx) {
            const fundingRate = parseFloat(ethCtx.funding);
            const openInterest = parseFloat(ethCtx.openInterest);
            const dayVolume = parseFloat(ethCtx.dayNtlVlm);

            console.log(chalk.green(`✅ Funding Rate: ${(fundingRate * 100).toFixed(4)}%`));
            console.log(chalk.green(`✅ Open Interest: $${(openInterest / 1e6).toFixed(2)}M`));
            console.log(chalk.green(`✅ 24h Volume: $${(dayVolume / 1e6).toFixed(2)}M`));
        }

        console.log(chalk.cyan('\n🎉 All tests passed! Hyperliquid SDK is working correctly.\n'));

        // Instructions for next steps
        console.log(chalk.yellow('📝 Next steps:'));
        console.log(chalk.gray('1. Add your private key to .env file:'));
        console.log(chalk.gray('   HYPERLIQUID_PRIVATE_KEY=0x...'));
        console.log(chalk.gray('2. For testnet, get test funds from:'));
        console.log(chalk.gray('   https://faucet.hyperliquid.xyz/'));
        console.log(chalk.gray('3. Start the bot with:'));
        console.log(chalk.gray('   bun run bot:hyperliquid:start'));

    } catch (error) {
        console.error(chalk.red('❌ Test failed:'), error);
        process.exit(1);
    }
}

// Run the test
testPublicAPI();