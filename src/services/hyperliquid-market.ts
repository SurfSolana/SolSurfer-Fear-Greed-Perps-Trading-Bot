import { infoClient } from "./hyperliquid-client";

// Get current price for an asset
export async function getCurrentPrice(asset: string = "ETH"): Promise<number> {
    // Get all market prices
    const allMids = await infoClient.allMids();

    // Find the price for our asset
    const assetPrice = allMids[asset];
    if (!assetPrice) {
        throw new Error(`Price not found for ${asset}`);
    }

    return parseFloat(assetPrice);
}

// Get order book for an asset
export async function getOrderBook(asset: string = "ETH") {
    const book = await infoClient.l2Book({ coin: asset });

    // Parse best bid and ask
    const bestBid = book.levels[0]?.length > 0 ? {
        price: parseFloat(book.levels[0][0].px),
        size: parseFloat(book.levels[0][0].sz)
    } : null;

    const bestAsk = book.levels[1]?.length > 0 ? {
        price: parseFloat(book.levels[1][0].px),
        size: parseFloat(book.levels[1][0].sz)
    } : null;

    return {
        bestBid,
        bestAsk,
        spread: bestBid && bestAsk ? bestAsk.price - bestBid.price : 0,
        midPrice: bestBid && bestAsk ? (bestBid.price + bestAsk.price) / 2 : 0
    };
}

// Get 24h volume and stats for an asset
export async function getMarketStats(asset: string = "ETH") {
    const metaAndCtxs = await infoClient.metaAndAssetCtxs();

    // Find the asset context
    const assetCtx = metaAndCtxs[1].find(ctx => ctx.coin === asset);
    if (!assetCtx) {
        throw new Error(`Market stats not found for ${asset}`);
    }

    return {
        markPrice: parseFloat(assetCtx.markPx),
        fundingRate: parseFloat(assetCtx.funding),
        openInterest: parseFloat(assetCtx.openInterest),
        dayVolume: parseFloat(assetCtx.dayNtlVlm),
        prevDayPrice: parseFloat(assetCtx.prevDayPx),
        dayChange: ((parseFloat(assetCtx.markPx) / parseFloat(assetCtx.prevDayPx)) - 1) * 100
    };
}

// Get available trading pairs
export async function getAvailableAssets() {
    const meta = await infoClient.meta();

    return meta.universe.map(asset => ({
        name: asset.name,
        index: meta.universe.indexOf(asset),
        minSize: parseFloat(asset.szDecimals.toString())
    }));
}

// Check if market is open
export async function isMarketOpen(): Promise<boolean> {
    try {
        const status = await infoClient.exchangeStatus();
        // Check if exchange is operational
        return status.isOperational === true;
    } catch (error) {
        console.error("Error checking market status:", error);
        return false;
    }
}

// Get funding history for tracking costs
export async function getFundingHistory(asset: string = "ETH", days: number = 7) {
    const endTime = Date.now();
    const startTime = endTime - (days * 24 * 60 * 60 * 1000);

    const funding = await infoClient.fundingHistory({
        coin: asset,
        startTime,
        endTime
    });

    return funding.map(f => ({
        time: f.time,
        coin: f.coin,
        fundingRate: parseFloat(f.fundingRate),
        premium: parseFloat(f.premium)
    }));
}

// Test exports
if (require.main === module) {
    (async () => {
        try {
            console.log("Testing market functions...");

            const price = await getCurrentPrice("ETH");
            console.log("ETH Price: $", price);

            const book = await getOrderBook("ETH");
            console.log("Order Book:", book);

            const stats = await getMarketStats("ETH");
            console.log("Market Stats:", stats);

            const isOpen = await isMarketOpen();
            console.log("Market Open:", isOpen);

        } catch (error) {
            console.error("Error:", error);
        }
    })();
}