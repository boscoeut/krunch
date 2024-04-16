import { Group, MangoAccount, MangoClient, PerpMarket } from "@blockworks-foundation/mango-v4";
import { Keypair } from '@solana/web3.js';
import {
    BID_ASK_CACHE_EXPIRATION,
    DEFAULT_CACHE_EXPIRATION,
    FEE_CACHE_EXPIRATION,
    FUNDING_CACHE_EXPIRATION,
    INTEREST_CACHE_EXPIRATION, JUP_PRICE_EXPIRATION
} from "./constants";
import {
    handleEstimateFeeWithAddressLookup,
    setupClient,
    fetchFundingData as utilFetchFundingData, fetchInterestData as utilFetchInterestData, fetchJupPrice as utilFetchJupPrice,
    getAccountData as utilGetAccountData,
    getBidsAndAsks as utilGetBidsAndAsks
} from './mangoUtils';
import { AccountDefinition, AccountDetail, CacheItem, OpenTransaction } from "./types";

const transactionCache: OpenTransaction[] = []
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

export const tradeHistory = new Map<string, number>()

export function addOpenTransaction(openTransaction: OpenTransaction) {
    transactionCache.unshift(openTransaction)
    if (transactionCache.length > 10) {
        transactionCache.pop()
    }
}

export function updateOpenTransaction(orderId: number, error: string) {
    const transaction = transactionCache.find((t) => t.orderId === orderId)
    if (transaction) {
        transaction.error = error
    }
}

export function getTransactionCache() {
    return transactionCache
}



export enum DB_KEYS {
    HISTORICAL_FUNDING_DATA = "HISTORICAL_FUNDING_DATA",
    INTEREST_DATA = "INTEREST_DATA",
    JUP_PRICE = "JUP_PRICE",
    BIDS_AND_ASKS = "BIDS_AND_ASKS",
    SOL_PRICE = "SOL_PRICE",
    FEE_ESTIMATE = "FEE_ESTIMATE",
    USDC_BORROW_RATE="USDC_BORROW_RATE",
    USDC_DEPOSIT_RATE="USDC_DEPOSIT_RATE",
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

export function getModifier(key: DB_KEYS) {
    if (key === DB_KEYS.HISTORICAL_FUNDING_DATA) {
        return {
            expiration: FUNDING_CACHE_EXPIRATION,
            modifier: utilFetchFundingData
        }
    } else if (key === DB_KEYS.INTEREST_DATA) {
        return {
            expiration: INTEREST_CACHE_EXPIRATION,
            modifier: utilFetchInterestData
        }
    } else if (key === DB_KEYS.JUP_PRICE) {
        return {
            expiration: JUP_PRICE_EXPIRATION,
            modifier: utilFetchJupPrice
        }
    } else if (key === DB_KEYS.BIDS_AND_ASKS) {
        return {
            expiration: BID_ASK_CACHE_EXPIRATION,
            modifier: utilGetBidsAndAsks
        }
    } else if (key === DB_KEYS.FEE_ESTIMATE) {
        return {
            expiration: FEE_CACHE_EXPIRATION,
            modifier: handleEstimateFeeWithAddressLookup
        }
    }
    return null

}

const getDBKey = (key: DB_KEYS, options?: GetOptions) => {
    return key.toString() + "_" + (options?.cacheKey || "")
}

export async function get<T>(key: DB_KEYS, options?: GetOptions): Promise<T> {
    const dbKey = getDBKey(key, options)
    let item = dbCache.get(dbKey) || { date: new Date(0), item: null }
    const modifier = getModifier(key)
    const expiration = modifier?.expiration || DEFAULT_CACHE_EXPIRATION
    const now = new Date()
    const diff = (now.getTime() - item.date.getTime()) / 1000
    const shouldRefresh = (diff > expiration * 60 || options?.force) && expiration > 0
    const shouldInit = expiration < 0 && !item.item
    if (shouldRefresh || shouldInit || options?.force === true) {
        if (modifier) {
            const m = modifier.modifier as any
            const value = await m(...(options?.params || []))
            item = { date: now, item: value }
            dbCache.set(dbKey, item)
        }
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
export const fetchHistoricalFundingData = async (mangoAccountPk: string, force: boolean = false) => {
    const fundingData = await get<any[]>(DB_KEYS.HISTORICAL_FUNDING_DATA, { force, cacheKey: mangoAccountPk, params: [mangoAccountPk] })
    return fundingData
}

export const fetchInterestData = async (mangoAccountPk: string, force: boolean = false) => {
    return await get<any[]>(DB_KEYS.INTEREST_DATA, { cacheKey: mangoAccountPk, force, params: [mangoAccountPk] })
}


export const fetchJupPrice = async () => {
    return await get<{ solPrice: number, jupPrice: number, wormholePrice: number, btcPrice: number, ethPrice: number }>(DB_KEYS.JUP_PRICE)
}
export const getBidsAndAsks = async (marketName: string, perpMarket: PerpMarket, client: MangoClient) => {
    return await get<{ bestBid: number, bestAsk: number }>(DB_KEYS.BIDS_AND_ASKS, { cacheKey: marketName, params: [perpMarket, client] })
}

export async function getAccountData(
    accountDefinition: AccountDefinition,
    client: MangoClient,
    group: Group,
    mangoAccount: MangoAccount,
    user: Keypair
): Promise<AccountDetail> {
    const accountDetails = await utilGetAccountData(
        accountDefinition,
        client,
        group,
        mangoAccount,
        user)
    return accountDetails
}

export const getFeeEstimate = async (cacheOnly: boolean = false) => {
    if (cacheOnly) {
        return getItem<number>(DB_KEYS.FEE_ESTIMATE)
    }
    else {
        return await get<number>(DB_KEYS.FEE_ESTIMATE)
    }
}

export const getClient = async (accountDefinition: AccountDefinition, DEFAULT_PRIORITY_FEE: number) => {
    return await setupClient(accountDefinition, DEFAULT_PRIORITY_FEE)
}
