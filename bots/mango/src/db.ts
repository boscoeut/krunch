import {
    ACCOUNT_REFRESH_EXPIRATION, BID_ASK_CACHE_EXPIRATION,
    DEFAULT_CACHE_EXPIRATION,
    FUNDING_CACHE_EXPIRATION, FUNDING_RATE_CACHE_EXPIRATION,
    INTEREST_CACHE_EXPIRATION, JUP_PRICE_EXPIRATION, FEE_CACHE_EXPIRATION
} from "./constants";
import {
    fetchFundingData, fetchInterestData, fetchJupPrice, getAccountData,
    handleEstimateFeeWithAddressLookup, getBidsAndAsks, getFundingRate, reloadClient, setupClient
} from './mangoUtils';
import { CacheItem } from "./types";

export enum DB_KEYS {
    NUM_TRADES = "NUM_TRADES",
    FUNDING_RATE = "FUNDING_RATE",
    FUNDING_DATA = "FUNDING_DATA",
    NUM_TRADES_SUCCESS = "NUM_TRADES_SUCCESS",
    NUM_TRADES_FAIL = "NUM_TRADES_FAIL",
    INTEREST_DATA = "INTEREST_DATA",
    JUP_PRICE = "JUP_PRICE",
    RELOAD_CLIENT = "RELOAD_CLIENT",
    BIDS_AND_ASKS = "BIDS_AND_ASKS",
    GET_CLIENT = "GET_CLIENT",
    SWAP = "SWAP",
    SOL_PRICE = "SOL_PRICE",
    ACCOUNT_DETAILS = "ACCOUNT_DETAILS",
    FEE_ESTIMATE = "FEE_ESTIMATE"
}

export type GetOptions = {
    force?: boolean,
    params?: any[],
    cacheKey?: string
}
export type Increment = {
    key: string,
    item: number
}

export type DBModifier<T> = {
    expiration: number,
    modifier: (...args: any) => Promise<T>
}
const dbCache = new Map<string, CacheItem>()
const modifiers = new Map<DB_KEYS, DBModifier<any>>();

export function registerModifier(key: DB_KEYS, modifier: DBModifier<any>) {
    modifiers.set(key, modifier);
}

const getDBKey = (key: DB_KEYS, options?: GetOptions) => {
    return key.toString() + "_" + (options?.cacheKey || "")
}

export async function get<T>(key: DB_KEYS, options?: GetOptions): Promise<T> {
    const dbKey = getDBKey(key, options)
    let item = dbCache.get(dbKey) || { date: new Date(0), item: null }
    const modifier = modifiers.get(key)
    const expiration = modifier?.expiration || DEFAULT_CACHE_EXPIRATION
    const now = new Date()
    const diff = (now.getTime() - item.date.getTime()) / 1000
    const shouldRefresh = (diff > expiration * 60 || options?.force) && expiration > 0
    const shouldInit = expiration < 0 && !item.item
    if (shouldRefresh || shouldInit || options?.force === true) {
        const value = await modifier?.modifier(...(options?.params || []))
        item = { date: now, item: value }
        dbCache.set(dbKey, item)
    }
    return item.item
}


export function deleteItem(key: DB_KEYS, options?: GetOptions) {
    const dbKey = getDBKey(key, options)
    dbCache.delete(dbKey);
}

export function getItem<T>(key: DB_KEYS, options?: GetOptions): T {
    const dbKey = getDBKey(key, options)
    return dbCache.get(dbKey)?.item as T;
}

export function setItem(key: DB_KEYS, value: any, options?: GetOptions) {
    const dbKey = getDBKey(key, options)
    dbCache.set(dbKey, {
        date: new Date(),
        item: value
    });
}

export function incrementItem(key: DB_KEYS, options?: GetOptions) {
    const dbKey = getDBKey(key, options)
    console.log('INCREMENTING', dbKey)
    const item = dbCache.get(dbKey)?.item
    const value = item?.item || 0
    dbCache.set(dbKey, {
        date: new Date(),
        item: {
            item: value + 1,
            key: options?.cacheKey || ""
        }
    });
}

export function getItems(dbKeys: DB_KEYS[]) {
    const items: any[] = []
    const stringKeys = dbKeys.map((key) => key.toString() + "_")
    for (const [key, value] of dbCache.entries()) {
        for (const stringKey of stringKeys) {
            if (key.startsWith(stringKey)) {
                items.push(value.item)
                break
            }
        }
    }
    return items
}

// REGISTER MODIFIERS
registerModifier(DB_KEYS.FUNDING_RATE, {
    expiration: FUNDING_RATE_CACHE_EXPIRATION,
    modifier: getFundingRate
})

registerModifier(DB_KEYS.FUNDING_DATA, {
    expiration: FUNDING_CACHE_EXPIRATION,
    modifier: fetchFundingData
})

registerModifier(DB_KEYS.INTEREST_DATA, {
    expiration: INTEREST_CACHE_EXPIRATION,
    modifier: fetchInterestData
})
registerModifier(DB_KEYS.JUP_PRICE, {
    expiration: JUP_PRICE_EXPIRATION,
    modifier: fetchJupPrice
})
registerModifier(DB_KEYS.RELOAD_CLIENT, {
    expiration: ACCOUNT_REFRESH_EXPIRATION,
    modifier: reloadClient
})
registerModifier(DB_KEYS.BIDS_AND_ASKS, {
    expiration: BID_ASK_CACHE_EXPIRATION,
    modifier: getBidsAndAsks
})
registerModifier(DB_KEYS.GET_CLIENT, {
    expiration: -1,
    modifier: setupClient
})
registerModifier(DB_KEYS.ACCOUNT_DETAILS, {
    expiration: ACCOUNT_REFRESH_EXPIRATION,
    modifier: getAccountData
})
registerModifier(DB_KEYS.FEE_ESTIMATE, {
    expiration: FEE_CACHE_EXPIRATION,
    modifier: handleEstimateFeeWithAddressLookup
})