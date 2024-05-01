import { PerpOrderType } from '@blockworks-foundation/mango-v4';
import { Cluster, PublicKey } from '@solana/web3.js';

// THRESHOLDS
export const MAX_PERP_TRADE_SIZE = 1000
export const MIN_DIFF_SIZE = 0.1
export const MIN_SOL_WALLET_BALANCE = 0.02

// TRADING PARAMS
export const SWAP_ONLY_DIRECT_ROUTES = false
export const SOL_PRICE_SPOT_DIFF_SLIPPAGE = 0.1
export const JUPITER_SPOT_SLIPPAGE = 10
export const POST_TRADE_TIMEOUT = 45
export const TRADE_TIMEOUT = 90
export const MIN_HEALTH_FACTOR = 135
export const DRIFT_HEALTH_FACTOR = 175
export const SHORT_FUNDING_RATE_THRESHOLD = 25
export const LONG_FUNDING_RATE_THRESHOLD = -25
export const FREE_CASH_LIMIT = 0.075
// MAIN LOOP
export const SLEEP_MAIN_LOOP_IN_MINUTES = 0.1
// export const FILTER_TO_ACCOUNTS: Array<String> = [  "ACCOUNT2"]
export const FILTER_TO_ACCOUNTS: Array<String> = ["SEVEN","DRIFT","SOL_FLARE","PRIVATE3","BUCKET","SIX","FIVE","BIRD", "ACCOUNT2", "BUCKET"]

// CACHE EXPIRATIONS
export const ORDER_EXPIRATION = 1 * 30
export const INTEREST_CACHE_EXPIRATION = 5
export const FUNDING_CACHE_EXPIRATION = 5
export const TRANSACTION_CACHE_SIZE = 30
export const JUP_PRICE_EXPIRATION = 1
export const DEFAULT_CACHE_EXPIRATION = 15
export const BID_ASK_CACHE_EXPIRATION = 1
export const FEE_CACHE_EXPIRATION = 1
export const FUNDING_RATE_EXPIRATION = 1
export const CURRENT_FUNDING_EXPIRATION = 5

// MINTS
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
export const SOL_MINT = 'So11111111111111111111111111111111111111112'
export const W_MINT = '85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ'
export const JUP_MINT = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'
export const SOL_RESERVE = 0.035
export const USDC_DECIMALS = 6
export const SOL_DECIMALS = 9
// MANGO
export const JUPITER_V6_QUOTE_API_MAINNET = 'https://quote-api.jup.ag/v6'
export const FUNDING_RATE_API = 'https://api.mngo.cloud/data/v4/one-hour-funding-rate?mango-group=78b8f4cGCwmZ9ysPFMWLaLTkkaYnUjwMJYStWe5RTSSX'
export const FUNDING_HOURLY = 'https://api.mngo.cloud/data/v4/one-hour-funding-rate?mango-group=78b8f4cGCwmZ9ysPFMWLaLTkkaYnUjwMJYStWe5RTSSX'
export const MANGO_DATA_API_URL = 'https://api.mngo.cloud/data/v4'
export const SOL_GROUP_PK = '78b8f4cGCwmZ9ysPFMWLaLTkkaYnUjwMJYStWe5RTSSX'
export const COMMITTMENT = 'processed'
export const CONNECTION_URL = 'https://solana-mainnet.g.alchemy.com/v2/YgL0vPVzbS8fh9y5l-eb35JE2emITsv0'; // alchemy robo
// export const CONNECTION_URL = 'https://solana-mainnet.g.alchemy.com/v2/TwEGOh2Jxfb6fiqCCsZ9k3urgbjOtRSH'; // alchemy boscoe

export const ALCHEMY_WS_URL = "wss://solana-mainnet.g.alchemy.com/v2/YgL0vPVzbS8fh9y5l-eb35JE2emITsv0"
export const LITE_RPC_URL = "https://api.mngo.cloud/lite-rpc/v1/"
export const LAVA_CONNECTION_URL = 'https://g.w.lavanet.xyz:443/gateway/solana/rpc-http/bbc072e803a9a135fe62f7b3ad32d971'; // lava
export const GROUP_PK = process.env.GROUP_PK || SOL_GROUP_PK; // SOL GROUP
export const CLUSTER: Cluster = (process.env.CLUSTER_OVERRIDE as Cluster) || 'mainnet-beta';
export const CLUSTER_URL = CONNECTION_URL;
export const FEE_CONNECTION_URL = LAVA_CONNECTION_URL
export const MAX_PRIORITY_FEE_KEYS = 128
export const GROUP_ADDRESS_LOOKUP_TABLE_KEY = new PublicKey("AgCBUZ6UMWqPLftTxeAqpQxtrfiCyL2HgRfmmM6QTfCj")
export const QUICKNODE_CONNECTION_URL = 'https://side-indulgent-research.solana-mainnet.quiknode.pro/75ae6800554082022fe1a77e3f3b56e70067fdce';  //quicknode
// export const CONNECTION_URL = 'https://ssc-dao.genesysgo.net';  //genesysgo
export const GET_BLOCK_CONNECTION_URL = 'https://go.getblock.io/9c9d31fe58774a27957c60d3a35197b4';  //getblock
export const ACTIVITY_FEED_URL = 'https://api.mngo.cloud/data/v4/stats/activity-feed?offset=0&limit=1000&mango-account='

export const USE_PRIORITY_FEE=true
export const MAX_FEE = 75_000
export const FEE_DIFF_BUFFER = 15_000
export const DEFAULT_PRIORITY_FEE = 50_000
export const FEE_MULTIPLIER = 1

// JUP
export const JUP_PRICE_URL = "https://price.jup.ag/v4/price?ids=JUP,SOL,85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ,TBTC,ETH"

// GOOGLE SHEETS
export const SPREADSHEET_ID = '1-k6Lv4quwIS-rRck-JYLA0WiuC9x43nDuMa_95q8CIw';
export const GOOGLE_UPDATE_INTERVAL = 15 * 1000