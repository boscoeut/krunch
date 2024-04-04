import { Group, MangoAccount, MangoClient, PerpMarket } from "@blockworks-foundation/mango-v4";
import { Keypair } from '@solana/web3.js';
import {
    ACCOUNT_REFRESH_EXPIRATION, BID_ASK_CACHE_EXPIRATION,
    CURRENT_FUNDING_EXPIRATION,
    DEFAULT_CACHE_EXPIRATION,
    FEE_CACHE_EXPIRATION,
    FUNDING_CACHE_EXPIRATION, FUNDING_RATE_CACHE_EXPIRATION,
    INTEREST_CACHE_EXPIRATION, JUP_PRICE_EXPIRATION
} from "./constants";
import {
    getCurrentFunding,
    handleEstimateFeeWithAddressLookup,
    setupClient,
    fetchFundingData as utilFetchFundingData, fetchInterestData as utilFetchInterestData, fetchJupPrice as utilFetchJupPrice,
    getAccountData as utilGetAccountData,
    getBidsAndAsks as utilGetBidsAndAsks, getFundingRate as utilGetFundingRate
} from './mangoUtils';
import { AccountDefinition, AccountDetail, CacheItem } from "./types";


let openTransactions = 0
export function incrementOpenTransactions() {
    openTransactions++
}
export function clearOpenTransactions() {
    openTransactions = 0
}
export function getOpenTransactions() {
    return openTransactions
}

export enum DB_KEYS {
    FUNDING_RATE = "FUNDING_RATE",
    HISTORICAL_FUNDING_DATA = "HISTORICAL_FUNDING_DATA",
    INTEREST_DATA = "INTEREST_DATA",
    JUP_PRICE = "JUP_PRICE",
    BIDS_AND_ASKS = "BIDS_AND_ASKS",
    GET_CLIENT = "GET_CLIENT",
    SOL_PRICE = "SOL_PRICE",
    ACCOUNT_DETAILS = "ACCOUNT_DETAILS",
    FEE_ESTIMATE = "FEE_ESTIMATE",
    CURR_FUNDING_DATA = "CURR_FUNDING_DATA",
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
export const getFundingRate = async (force: boolean = false): Promise<number> => {
    return await get<number>(DB_KEYS.FUNDING_RATE, { force })
}
registerModifier(DB_KEYS.FUNDING_RATE, {
    expiration: FUNDING_RATE_CACHE_EXPIRATION,
    modifier: utilGetFundingRate
})

export const fetchHistoricalFundingData = async (mangoAccountPk: string, force: boolean = false) => {
    const fundingData = await get<any[]>(DB_KEYS.HISTORICAL_FUNDING_DATA, { force, cacheKey: mangoAccountPk, params: [mangoAccountPk] })
    return fundingData
}
registerModifier(DB_KEYS.HISTORICAL_FUNDING_DATA, {
    expiration: FUNDING_CACHE_EXPIRATION,
    modifier: utilFetchFundingData
})

export const fetchInterestData = async (mangoAccountPk: string, force: boolean = false) => {
    return await get<any[]>(DB_KEYS.INTEREST_DATA, { cacheKey: mangoAccountPk, force, params: [mangoAccountPk] })
}
registerModifier(DB_KEYS.INTEREST_DATA, {
    expiration: INTEREST_CACHE_EXPIRATION,
    modifier: utilFetchInterestData
})

export const fetchJupPrice = async () => {
    return await get<{ solPrice: number, jupPrice: number }>(DB_KEYS.JUP_PRICE)
}
registerModifier(DB_KEYS.JUP_PRICE, {
    expiration: JUP_PRICE_EXPIRATION,
    modifier: utilFetchJupPrice
})
export const getBidsAndAsks = async (marketName: string, perpMarket: PerpMarket, client: MangoClient) => {
    return await get<{ bestBid: number, bestAsk: number }>(DB_KEYS.BIDS_AND_ASKS, { cacheKey: marketName, params: [perpMarket, client] })
}
registerModifier(DB_KEYS.BIDS_AND_ASKS, {
    expiration: BID_ASK_CACHE_EXPIRATION,
    modifier: utilGetBidsAndAsks
})

export async function getAccountData(
    accountDefinition: AccountDefinition,
    client: MangoClient,
    group: Group,
    mangoAccount: MangoAccount,
    user: Keypair
): Promise<AccountDetail> {
    const accountDetails = await get<AccountDetail>(DB_KEYS.ACCOUNT_DETAILS, {
        cacheKey: accountDefinition.name, params: [
            accountDefinition,
            client,
            group,
            mangoAccount,
            user]
    })
    return accountDetails
}
registerModifier(DB_KEYS.ACCOUNT_DETAILS, {
    expiration: ACCOUNT_REFRESH_EXPIRATION,
    modifier: utilGetAccountData
})
export const getFeeEstimate = async (cacheOnly: boolean = false) => {
    if (cacheOnly) {
        return getItem<number>(DB_KEYS.FEE_ESTIMATE)
    }
    else {
        return await get<number>(DB_KEYS.FEE_ESTIMATE)
    }
}
registerModifier(DB_KEYS.FEE_ESTIMATE, {
    expiration: FEE_CACHE_EXPIRATION,
    modifier: handleEstimateFeeWithAddressLookup
})
//// MODIFIERS

registerModifier(DB_KEYS.CURR_FUNDING_DATA, {
    expiration: CURRENT_FUNDING_EXPIRATION,
    modifier: getCurrentFunding
})

registerModifier(DB_KEYS.GET_CLIENT, {
    expiration: ACCOUNT_REFRESH_EXPIRATION,
    modifier: setupClient
})