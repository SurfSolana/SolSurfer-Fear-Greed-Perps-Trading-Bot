import { infoClient } from "./hyperliquid-client";
import { privateKeyToAccount } from "viem/accounts";

// Get wallet address from private key
function getWalletAddress(): string {
    const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY;
    if (!privateKey) throw new Error("No private key");

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    return account.address;
}

// Get account balance (USD value)
export async function getBalance(): Promise<number> {
    const address = getWalletAddress();
    const state = await infoClient.clearinghouseState({ user: address });

    // Account value is total equity in USD
    const balance = parseFloat(state.marginSummary.accountValue);
    return balance;
}

// Get open positions for the account
export async function getPositions() {
    const address = getWalletAddress();
    const state = await infoClient.clearinghouseState({ user: address });

    // Filter for positions with non-zero size
    const positions = state.assetPositions
        .filter(pos => {
            const szi = parseFloat(pos.position.szi);
            return szi !== 0;
        })
        .map(pos => ({
            asset: pos.position.coin,
            size: parseFloat(pos.position.szi),
            entryPrice: parseFloat(pos.position.entryPx || "0"),
            unrealizedPnl: parseFloat(pos.position.unrealizedPnl),
            marginUsed: parseFloat(pos.position.marginUsed),
            leverage: parseFloat(pos.position.leverage.value),
            liquidationPrice: pos.position.liquidationPx ? parseFloat(pos.position.liquidationPx) : null
        }));

    return positions;
}

// Get position for specific asset
export async function getPosition(asset: string = "ETH") {
    const positions = await getPositions();
    return positions.find(p => p.asset === asset) || null;
}

// Get all open orders
export async function getOpenOrders() {
    const address = getWalletAddress();
    const orders = await infoClient.openOrders({ user: address });

    return orders.map(order => ({
        id: order.oid,
        asset: order.coin,
        side: order.side,
        price: parseFloat(order.limitPx),
        size: parseFloat(order.sz),
        orderType: order.orderType,
        timestamp: order.timestamp
    }));
}

// Get account leverage setting
export async function getCurrentLeverage(asset: string = "ETH"): Promise<number> {
    const address = getWalletAddress();
    const state = await infoClient.clearinghouseState({ user: address });

    const assetPos = state.assetPositions.find(pos => pos.position.coin === asset);
    if (assetPos) {
        return parseFloat(assetPos.position.leverage.value);
    }

    // Default leverage if no position exists
    return 1;
}

// Get available balance for trading
export async function getAvailableBalance(): Promise<number> {
    const address = getWalletAddress();
    const state = await infoClient.clearinghouseState({ user: address });

    // Available balance is withdrawable amount
    const available = parseFloat(state.withdrawable);
    return available;
}

// Test exports
if (require.main === module) {
    (async () => {
        try {
            console.log("Testing account functions...");

            const balance = await getBalance();
            console.log("Account Balance: $", balance);

            const positions = await getPositions();
            console.log("Open Positions:", positions);

            const orders = await getOpenOrders();
            console.log("Open Orders:", orders);

            const available = await getAvailableBalance();
            console.log("Available Balance: $", available);

        } catch (error) {
            console.error("Error:", error);
        }
    })();
}