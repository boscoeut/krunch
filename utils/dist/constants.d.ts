import { PublicKey } from "@solana/web3.js";
/**
 * To Change Networks
 * 1. Change NETWORK to 'Localnet', 'Devnet', or 'Mainnet'
 * 2. Change cluster = "Devnet" in Anchor.toml
 * 3. Run anchor run deploy-dev for dev
 * 4. Run anchor run deploy-local for local
 */
export declare const NETWORK: 'Localnet' | 'Devnet' | 'Mainnet';
export declare const SHOW_LIGHT_MODE = false;
export declare const AUTO_REFRESH_INTERVAL: number;
export declare const LOCALNET = "Localnet";
export declare const DEVNET = "Devnet";
export declare const SLOTS_PER_DAY: number;
export declare const NETWORK_EXPLORER: string;
export declare const NETWORK_URL: string;
export declare const ADMIN_ADDRESS: string;
export declare const TOKEN_PROGRAM_ID: string;
export declare const ASSOCIATED_TOKEN_PROGRAM_ID: string;
export declare const USDC_MINT: PublicKey;
export declare const SOL_MINT: PublicKey;
export declare const USDT_MINT: PublicKey;
export declare const BTC_MINT: PublicKey;
export declare const ETH_MINT: PublicKey;
export declare const SOL_USD_FEED: PublicKey;
export declare const USDC_USD_FEED: PublicKey;
export declare const USDT_USD_FEED: PublicKey;
export declare const ETH_USD_FEED: PublicKey;
export declare const BTC_USD_FEED: PublicKey;
export declare const CHAINLINK_PROGRAM: string;
export declare const MARKET_WEIGHT = 1;
export declare const REWARD_FREQUENCY: number;
export declare const PRICE_DECIMALS: number;
export declare const FEE_DECIMALS: number;
export declare const MARKET_WEIGHT_DECIMALS: number;
export declare const EXCHANGE_MARKET_WEIGHT = 0.5;
export declare const AMOUNT_DECIMALS: number;
export declare const LEVERAGE_DECIMALS: number;
export declare const MARKET_LEVERAGE = 10;
export declare const EXCHANGE_LEVERAGE = 10;
export declare const TAKER_FEE = 0.002;
export declare const MAKER_FEE = -0.001;
export declare const REWARD_RATE: number;
export declare const MARKET_TYPES: {
    id: number;
    name: string;
}[];
export declare const MARKETS: {
    name: string;
    feedAddress: string;
    marketIndex: number;
    marketTypeId: number;
}[];
export declare const EXCHANGE_POSITIONS: {
    decimals: number;
    mint: PublicKey;
    feedAddress: PublicKey;
    market: string;
}[];
export declare const TV_MARKETS: {
    "SOL/USD": string;
    "ETH/USD": string;
    "BTC/USD": string;
};
