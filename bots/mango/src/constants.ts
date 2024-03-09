import {PerpOrderType} from '@blockworks-foundation/mango-v4';
import {Cluster} from '@solana/web3.js';

// THRESHOLDS
export const MAX_SHORT_PERP = -70
export const MAX_LONG_PERP = 1
export const MAX_SPOT_TRADE_SIZE = 3
export const MAX_PERP_TRADE_SIZE = 2
export const EXTRA_USDC_AMOUNT = 0.02
export const MIN_DIFF_SIZE = 0.1
export const MIN_SPOT_USDC_DIFF = 0.15
export const MIN_SOL_BORROW = 0.02
export const MIN_USDC_BORROW = 1
export const MIN_SOL_WALLET_AMOUNT = 0.1
export const MIN_USDC_WALLET_AMOUNT = 10

// TRADING TRIGGERS
export const MINUS_THRESHOLD = -100
export const PLUS_THRESHOLD = 100

// TRADING PARAMS
export const MIN_SIZE = 0.1
export const QUOTE_BUFFER = 0.12
export const TRADE_SIZE = 1.5
export const ORDER_TYPE = PerpOrderType.limit
export const ENFORCE_BEST_PRICE = false
export const USDC_BUFFER = 1
export const SOL_BUFFER = 0.005
export const SWAP_ONLY_DIRECT_ROUTES = false
export const JUP_ONLY_DIRECT_ROUTES = false

// MAIN LOOP
export const CAN_TRADE = true
export const NO_TRADE_TIMEOUT = 5
export const SLEEP_MAIN_LOOP = CAN_TRADE ? 0.1 : 1
export const FILTER_TO_ACCOUNTS:Array<String> = []
// export const FILTER_TO_ACCOUNTS = ['PRIVATE3']

// CACHE EXPIRATIONS
export const ORDER_EXPIRATION = 0.9 * 60  
export const TRANSACTION_EXPIRATION = 2 * 60 * 1000   
export const FUNDING_RATE_CACHE_EXPIRATION = 1
export const INTEREST_CACHE_EXPIRATION = 5
export const FUNDING_CACHE_EXPIRATION = 5
export const JUP_PRICE_EXPIRATION = 0.5
export const DEFAULT_CACHE_EXPIRATION = 15
export const BID_ASK_CACHE_EXPIRATION = 0.5
export const ACCOUNT_REFRESH_EXPIRATION = 1

// MINTS
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
export const SOL_MINT = 'So11111111111111111111111111111111111111112'
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
export const CONNECTION_URL = 'https://solana-mainnet.g.alchemy.com/v2/YgL0vPVzbS8fh9y5l-eb35JE2emITsv0'; // alchemy
export const GROUP_PK = process.env.GROUP_PK || SOL_GROUP_PK; // SOL GROUP
export const CLUSTER: Cluster = (process.env.CLUSTER_OVERRIDE as Cluster) || 'mainnet-beta';
export const CLUSTER_URL = CONNECTION_URL;
// export const CONNECTION_URL = 'https://mango-mango-d092.mainnet.rpcpool.com/';
// export const CONNECTION_URL = 'https://side-indulgent-research.solana-mainnet.quiknode.pro/75ae6800554082022fe1a77e3f3b56e70067fdce';  //quicknode
// export const CONNECTION_URL = 'https://ssc-dao.genesysgo.net';  //genesysgo
// export const CONNECTION_URL = 'https://go.getblock.io/9c9d31fe58774a27957c60d3a35197b4';  //getblock
// export const LAVA_CONNECTION_URL = 'https://g.w.lavanet.xyz:443/gateway/solana/rpc-http/bbc072e803a9a135fe62f7b3ad32d971'; // lava

export const PRIORITY_FEE_LEVELS = [
    { label: 'None', value: 0 },
    { label: 'Low', value: 2 }, //  +100%
    { label: 'High', value: 4 },
  ]

  export const DEFAULT_PRIORITY_FEE = 2
  export const DEFAULT_PRIORITY_FEE_LEVEL = PRIORITY_FEE_LEVELS[1]

  // JUP
  export const JUP_PRICE_URL = "https://price.jup.ag/v4/price?ids=JUP,SOL"

  // GOOGLE SHEETS
  export const SPREADSHEET_ID = '1-k6Lv4quwIS-rRck-JYLA0WiuC9x43nDuMa_95q8CIw';