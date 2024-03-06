import {
    PerpOrderType
} from '@blockworks-foundation/mango-v4';

// THRESHOLDS
export const MAX_SHORT_PERP = -55
export const MAX_LONG_PERP = 1
export const MAX_SPOT_TRADE = 1
export const EXTRA_USDC_AMOUNT = 0.02
export const MIN_DIFF_SIZE = 0.02
export const MIN_SPOT_USDC_DIFF = 0.15

// TRADING TRIGGERS
export const MINUS_THRESHOLD = -100
export const PLUS_THRESHOLD = 100

// TRADING PARAMS
export const MIN_SIZE = 0.1
export const QUOTE_BUFFER = 0.12
export const TRADE_SIZE = 0.5
export const ORDER_TYPE = PerpOrderType.limit
export const ENFORCE_BEST_PRICE = false
export const USDC_BUFFER = 1
export const SOL_BUFFER = 0.01
export const SWAP_ONLY_DIRECT_ROUTES = false
export const JUP_ONLY_DIRECT_ROUTES = false

// MAIN LOOP
export const CAN_TRADE = true
export const SLEEP_MAIN_LOOP = CAN_TRADE ? 0.1 : 1
export const FILTER_TO_ACCOUNTS:Array<String> = []
// export const FILTER_TO_ACCOUNTS = ['PRIVATE3']

// CACHE EXPIRATIONS
export const ORDER_EXPIRATION = 1 * 60  
export const TRANSACTION_EXPIRATION = .5 * 60 * 1000   
export const FUNDING_RATE_CACHE_EXPIRATION = 1
export const INTEREST_CACHE_EXPIRATION = 15
export const FUNDING_CACHE_EXPIRATION = 15
export const DEFAULT_CACHE_EXPIRATION = 15
export const BID_ASK_CACHE_EXPIRATION = 0.5
export const ACCOUNT_REFRESH_EXPIRATION = 1

// MINTS
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
export const SOL_MINT = 'So11111111111111111111111111111111111111112'
export const SOL_RESERVE = 0.035
export const USDC_DECIMALS = 6
export const SOL_DECIMALS = 9

// ALCHEMY
// export const CONNECTION_URL = 'https://mango-mango-d092.mainnet.rpcpool.com/';
export const CONNECTION_URL = 'https://solana-mainnet.g.alchemy.com/v2/YgL0vPVzbS8fh9y5l-eb35JE2emITsv0';
// export const CONNECTION_URL = 'https://side-indulgent-research.solana-mainnet.quiknode.pro/75ae6800554082022fe1a77e3f3b56e70067fdce';
export const LAVA_CONNECTION_URL = 'https://g.w.lavanet.xyz:443/gateway/solana/rpc-http/bbc072e803a9a135fe62f7b3ad32d971';

// MANGO
export const JUPITER_V6_QUOTE_API_MAINNET = 'https://quote-api.jup.ag/v6'
export const FUNDING_RATE_API = 'https://api.mngo.cloud/data/v4/one-hour-funding-rate?mango-group=78b8f4cGCwmZ9ysPFMWLaLTkkaYnUjwMJYStWe5RTSSX'
export const FUNDING_HOURLY = 'https://api.mngo.cloud/data/v4/one-hour-funding-rate?mango-group=78b8f4cGCwmZ9ysPFMWLaLTkkaYnUjwMJYStWe5RTSSX'
export const MANGO_DATA_API_URL = 'https://api.mngo.cloud/data/v4'
export const SOL_GROUP_PK = '78b8f4cGCwmZ9ysPFMWLaLTkkaYnUjwMJYStWe5RTSSX'
export const COMMITTMENT = 'processed'

export const PRIORITY_FEE_LEVELS = [
    { label: 'None', value: 0 },
    { label: 'Low', value: 2 }, //  +100%
    { label: 'High', value: 4 },
  ]

  export const DEFAULT_PRIORITY_FEE = 0
  export const DEFAULT_PRIORITY_FEE_LEVEL = PRIORITY_FEE_LEVELS[1]