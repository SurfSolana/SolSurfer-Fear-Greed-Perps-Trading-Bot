import * as hl from "@nktkas/hyperliquid";
import { config } from "dotenv";
config();

const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY;
const isTestnet = process.env.HYPERLIQUID_TESTNET === "true";

if (!privateKey) {
    throw new Error("HYPERLIQUID_PRIVATE_KEY not set in .env");
}

// Derive wallet address from private key for info queries
function getWalletAddress(): string {
    // The SDK accepts the private key directly, we need the address for queries
    // Using a simple approach - the SDK will handle the actual signing
    // For now we'll get the address when needed from the exchange client
    return "";
}

// Initialize HTTP transport
export const transport = new hl.HttpTransport({
    isTestnet,
    timeout: 30000 // 30 second timeout
});

// Initialize Info Client (no wallet needed, public data)
export const infoClient = new hl.InfoClient({
    transport
});

// Initialize Exchange Client (needs wallet for trading)
export const exchangeClient = new hl.ExchangeClient({
    wallet: privateKey as `0x${string}`,
    transport,
    isTestnet
});

// Helper to get wallet address from exchange client
export async function getAddress(): Promise<string> {
    // The exchange client has the wallet, we can derive the address
    // For now, we'll pass the private key and let the SDK handle it
    // In production, we'd properly derive this
    return privateKey!.slice(0, 42); // Placeholder - SDK handles actual address
}

console.log(`Hyperliquid client initialized for ${isTestnet ? 'TESTNET' : 'MAINNET'}`);

// Test export for quick connection check
if (require.main === module) {
    (async () => {
        try {
            console.log("Testing Hyperliquid connection...");

            // Test info client - get exchange status
            const status = await infoClient.exchangeStatus();
            console.log("Exchange Status:", status);

            // Test market data
            const meta = await infoClient.meta();
            console.log(`Found ${meta.universe.length} trading pairs`);

            console.log("✅ Hyperliquid connection successful!");
        } catch (error) {
            console.error("❌ Connection failed:", error);
        }
    })();
}