import { exchangeClient, infoClient } from "./hyperliquid-client";
import { getPosition } from "./hyperliquid-account";

// Get asset index from coin symbol
async function getAssetIndex(coin: string): Promise<number> {
    const meta = await infoClient.meta();
    const assetIndex = meta.universe.findIndex(asset => asset.name === coin);
    if (assetIndex === -1) {
        throw new Error(`Asset ${coin} not found`);
    }
    return assetIndex;
}

// Place a long (buy) order
export async function placeLongOrder(
    size: number,
    price?: number,
    asset: string = "ETH"
): Promise<any> {
    const assetIndex = await getAssetIndex(asset);

    const order = {
        a: assetIndex,  // asset index
        b: true,        // true for buy/long
        p: price ? price.toString() : "0",  // "0" for market order
        s: size.toString(),  // size
        r: false,       // not reduce-only
        t: price ? {
            limit: { tif: "Gtc" }  // Good till cancelled for limit
        } : {
            limit: { tif: "Ioc" }  // Immediate or cancel for market
        }
    };

    const result = await exchangeClient.order({
        orders: [order],
        grouping: "na"
    });

    console.log(`Placed LONG order for ${size} ${asset} at ${price || 'market'}`);
    return result;
}

// Place a short (sell) order
export async function placeShortOrder(
    size: number,
    price?: number,
    asset: string = "ETH"
): Promise<any> {
    const assetIndex = await getAssetIndex(asset);

    const order = {
        a: assetIndex,  // asset index
        b: false,       // false for sell/short
        p: price ? price.toString() : "0",  // "0" for market order
        s: size.toString(),  // size
        r: false,       // not reduce-only
        t: price ? {
            limit: { tif: "Gtc" }  // Good till cancelled for limit
        } : {
            limit: { tif: "Ioc" }  // Immediate or cancel for market
        }
    };

    const result = await exchangeClient.order({
        orders: [order],
        grouping: "na"
    });

    console.log(`Placed SHORT order for ${size} ${asset} at ${price || 'market'}`);
    return result;
}

// Close all positions for an asset
export async function closePosition(asset: string = "ETH"): Promise<any> {
    const position = await getPosition(asset);
    if (!position) {
        console.log(`No open position for ${asset}`);
        return null;
    }

    const assetIndex = await getAssetIndex(asset);
    const size = Math.abs(position.size);
    const isLong = position.size > 0;

    // To close a long, we sell. To close a short, we buy.
    const order = {
        a: assetIndex,
        b: !isLong,     // opposite side to close
        p: "0",         // market order
        s: size.toString(),
        r: true,        // reduce-only to ensure we're closing
        t: { limit: { tif: "Ioc" } }
    };

    const result = await exchangeClient.order({
        orders: [order],
        grouping: "na"
    });

    console.log(`Closed ${isLong ? 'LONG' : 'SHORT'} position of ${size} ${asset}`);
    return result;
}

// Cancel all open orders
export async function cancelAllOrders(): Promise<any> {
    // Cancel all orders by not specifying order IDs
    const result = await exchangeClient.cancel({
        cancels: []  // Empty array cancels all
    });

    console.log("Cancelled all open orders");
    return result;
}

// Cancel orders for specific asset
export async function cancelAssetOrders(asset: string = "ETH"): Promise<any> {
    const assetIndex = await getAssetIndex(asset);

    const result = await exchangeClient.cancel({
        cancels: [{
            a: assetIndex,
            o: 0  // 0 means cancel all for this asset
        }]
    });

    console.log(`Cancelled all ${asset} orders`);
    return result;
}

// Update leverage for an asset
export async function setLeverage(leverage: number, asset: string = "ETH"): Promise<any> {
    const assetIndex = await getAssetIndex(asset);

    const result = await exchangeClient.updateLeverage({
        asset: assetIndex,
        isCross: true,  // Use cross leverage
        leverage: leverage
    });

    console.log(`Set ${asset} leverage to ${leverage}x`);
    return result;
}

// Test exports
if (require.main === module) {
    (async () => {
        try {
            console.log("Testing trade functions...");

            // Example: Place a small test order (commented out for safety)
            // await setLeverage(3, "ETH");
            // await placeLongOrder(0.001, undefined, "ETH");
            // await closePosition("ETH");

            console.log("Trade functions ready!");
        } catch (error) {
            console.error("Error:", error);
        }
    })();
}