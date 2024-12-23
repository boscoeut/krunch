import { Cluster, PublicKey } from '@solana/web3.js';

// THRESHOLDS
export const MAX_PERP_TRADE_SIZE = 1000
export const MIN_DIFF_SIZE = 0.1
export const MIN_SOL_WALLET_BALANCE = 0.02

// TRADING PARAMS
export const SWAP_ONLY_DIRECT_ROUTES = false
export const SOL_PRICE_SPOT_DIFF_SLIPPAGE = 0.1
export const POST_TRADE_TIMEOUT = 45
export const TRADE_TIMEOUT = 90

// MAIN LOOP
export const SLEEP_MAIN_LOOP_IN_MINUTES = 0.1

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
export const ETH_WORMHOLE_MINT = '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs'
export const BTC_WORMHOLE_MINT = '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh'
export const SOL_MINT = 'So11111111111111111111111111111111111111112'
export const RENDER_MINT = 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof'
export const W_MINT = '85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ'
export const DRIFT_MINT = 'DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7'
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
export const SYNCICA_CONNECTION_URL = 'https://solana-mainnet.api.syndica.io/api-key/'+"9dDnwXBjwi4yf8gg5QQpgeKUkVCYwZxbTTVoZtoyBChsUSodLjzGvjgBwxi85nZ8VsLcLQxhyV1Qu21DxbDCNKo9ZCdYyVMmKa"
export const ALCHEMY_PAID_CONNECTION_URL = 'https://solana-mainnet.g.alchemy.com/v2/odv67ZxOsKsh9lMdK-_SDDpwj4dmC9P8'; // alchemy PAID
export const ROBO_CONNECTION_URL = 'https://solana-mainnet.g.alchemy.com/v2/YgL0vPVzbS8fh9y5l-eb35JE2emITsv0'; // alchemy robo
// export const CONNECTION_URL = 'https://solana-mainnet.g.alchemy.com/v2/TwEGOh2Jxfb6fiqCCsZ9k3urgbjOtRSH'; // alchemy boscoe
export const CONNECTION_URL = SYNCICA_CONNECTION_URL

export const ALCHEMY_WS_URL = "wss://solana-mainnet.g.alchemy.com/v2/YgL0vPVzbS8fh9y5l-eb35JE2emITsv0"
export const LITE_RPC_URL = "https://api.mngo.cloud/lite-rpc/v1/"
export const LAVA_CONNECTION_URL = 'https://g.w.lavanet.xyz:443/gateway/solana/rpc-http/bbc072e803a9a135fe62f7b3ad32d971'; // lava
export const GROUP_PK = process.env.GROUP_PK || SOL_GROUP_PK; // SOL GROUP
export const CLUSTER: Cluster = (process.env.CLUSTER_OVERRIDE as Cluster) || 'mainnet-beta';
export const CLUSTER_URL = CONNECTION_URL;
export const FEE_CONNECTION_URL = LAVA_CONNECTION_URL
export const MAX_PRIORITY_FEE_KEYS = 128
export const GROUP_ADDRESS_LOOKUP_TABLE_KEY = new PublicKey("AgCBUZ6UMWqPLftTxeAqpQxtrfiCyL2HgRfmmM6QTfCj")
// export const QUICKNODE_CONNECTION_URL = 'https://side-indulgent-research.solana-mainnet.quiknode.pro/75ae6800554082022fe1a77e3f3b56e70067fdce';  //quicknode
// export const CONNECTION_URL = 'https://ssc-dao.genesysgo.net';  //genesysgo
export const GET_BLOCK_CONNECTION_URL = 'https://go.getblock.io/9c9d31fe58774a27957c60d3a35197b4';  //getblock
export const ACTIVITY_FEED_URL = 'https://api.mngo.cloud/data/v4/stats/activity-feed?offset=0&limit=1000&mango-account='
export const HELIUS_CONNECTION_URL = 'https://mainnet.helius-rpc.com/?api-key=f8550011-b7ca-4967-a265-6605701031fe'
export const HELIUS_BOSCO_CONNECTION_URL = "https://mainnet.helius-rpc.com/?api-key=6fce0a28-fd4e-4bb9-8d3a-56ee7da6a7d2"
export const HELIUS_ALEX_CONNECTION_URL = "https://mainnet.helius-rpc.com/?api-key=19ccc2d5-d98c-49d2-961f-d6132f665552"
export const HELIUS_ROBO_CONNECTION_URL = 'https://mainnet.helius-rpc.com/?api-key=9ff7c826-8d26-482d-a39b-9e01d3310fcc'
export const HELIUS_GRACE_CONNECTION_URL = 'https://mainnet.helius-rpc.com/?api-key=5b648979-cb5a-4b0d-86e3-c4bd87c26c63'
export const HELIUS_GITLAB_CONNECTION_URL = 'https://mainnet.helius-rpc.com/?api-key=9379282b-031e-49d8-a84b-4cd1bf2445d8'
export const HELIUS_JANE_CONNECTION_URL = 'https://mainnet.helius-rpc.com/?api-key=a3ffcb7a-40d3-4808-8766-aaa33947d99f'
export const HELIUS_ALEX_NC_CONNECTION_URL = 'https://mainnet.helius-rpc.com/?api-key=bb96a580-603f-42ab-8290-e50e30b1ad85'
export const HELIUS_WALLET_5='https://mainnet.helius-rpc.com/?api-key=918f4c30-1029-4b83-88ea-ce13169370e5'
export const USE_PRIORITY_FEE=true
export const MAX_FEE = 75_000
export const FEE_DIFF_BUFFER = 15_000
export const FEE_MULTIPLIER = 1

// JUP
export const JUP_PRICE_URL = "https://price.jup.ag/v4/price?ids=JUP,So11111111111111111111111111111111111111112,85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ,TBTC,ETH,DRIFT,RENDER"

// GOOGLE SHEETS
export const SPREADSHEET_ID = '1-k6Lv4quwIS-rRck-JYLA0WiuC9x43nDuMa_95q8CIw';
export const GOOGLE_UPDATE_INTERVAL = 15 * 1000

export const SHOULD_CANCEL_ORDERS = false