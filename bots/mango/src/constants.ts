import {
    PerpOrderType
} from '@blockworks-foundation/mango-v4';


// THRESHOLDS
export const MAX_SHORT_PERP = -5
export const MAX_LONG_PERP = 5
export const MINUS_THRESHOLD = -75
export const PLUS_THRESHOLD = 75
export const MAX_SPOT_TRADE = 1
export const EXTRA_USDC_AMOUNT = 0.02
export const MIN_DIFF_SIZE = 0.02

// TRADING PARAMS
export const MIN_SIZE = 0.01
export const QUOTE_BUFFER = 0.20
export const TRADE_SIZE = 0.01
export const ORDER_TYPE = PerpOrderType.immediateOrCancel
export const ENFORCE_BEST_PRICE = false

// MAIN LOOP
export const CAN_TRADE = true
export const SLEEP_MAIN_LOOP = CAN_TRADE ? 0.5 : 2
export const FILTER_TO_ACCOUNTS:Array<String> = []
// export const FILTER_TO_ACCOUNTS = ['PRIVATE3']

// CACHE EXPIRATIONS
export const ORDER_EXPIRATION = 1 * 60 * 1000   
export const FUNDING_RATE_CACHE_EXPIRATION = 1
export const INTEREST_CACHE_EXPIRATION = 15
export const FUNDING_CACHE_EXPIRATION = 15
export const DEFAULT_CACHE_EXPIRATION = 15
export const BID_ASK_CACHE_EXPIRATION = 0.5
export const ACCOUNT_REFRESH_EXPIRATION = 1

// ALCHEMY
export const CONNECTION_URL = 'https://solana-mainnet.g.alchemy.com/v2/YgL0vPVzbS8fh9y5l-eb35JE2emITsv0';

// MANGO
export const JUPITER_V6_QUOTE_API_MAINNET = 'https://quote-api.jup.ag/v6'
export const FUNDING_RATE_API = 'https://api.mngo.cloud/data/v4/one-hour-funding-rate?mango-group=78b8f4cGCwmZ9ysPFMWLaLTkkaYnUjwMJYStWe5RTSSX'
export const FUNDING_HOURLY = 'https://api.mngo.cloud/data/v4/one-hour-funding-rate?mango-group=78b8f4cGCwmZ9ysPFMWLaLTkkaYnUjwMJYStWe5RTSSX'
export const MANGO_DATA_API_URL = 'https://api.mngo.cloud/data/v4'
export const SOL_GROUP_PK = '78b8f4cGCwmZ9ysPFMWLaLTkkaYnUjwMJYStWe5RTSSX'