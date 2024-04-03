import {
    PerpOrderSide
} from '@blockworks-foundation/mango-v4';
import fs from 'fs';
import {
    DEFAULT_PRIORITY_FEE,
    MAX_FEE,
    MAX_LONG_PERP,
    MAX_PERP_TRADE_SIZE,
    MAX_SHORT_PERP,
    SLEEP_MAIN_LOOP_IN_MINUTES,
    SOL_RESERVE
} from './constants';
import * as db from './db';
import { DB_KEYS } from './db';
import { authorize, updateGoogleSheet } from './googleUtils';
import {
    cancelOpenOrders,
    getTradePossibilities,
    spotAndPerpSwap
} from './mangoSpotUtils';
import {
    sleep
} from './mangoUtils';
import { postToSlackFunding } from './slackUtils';
import {
    AccountDefinition,
    AccountDetail,
    Client
} from './types';

const { google } = require('googleapis');
type TradeStrategy = "BUY_PERP_SELL_SPOT" | "SELL_PERP_BUY_SPOT" | "NONE"

function roundToNearestHalf(num: number) {
    return Math.floor(num * 2) / 2;
}
function getTradeSize(requestedTradeSize: number, solAmount: number, action: 'BUY' | 'SELL',
    borrow: number, accountDefinition: AccountDefinition, solPrice: number, 
    minPerp: number, maxPerp: number, health:number
) {
    const freeCash = borrow - accountDefinition.healthThreshold
    let maxSize = freeCash > 0 ? (freeCash / solPrice) / 2.1 : 0
    maxSize = roundToNearestHalf(maxSize)

    if (action === 'BUY') {
        maxSize = Math.min(maxSize, maxPerp - solAmount)
    }
    if (action === 'SELL') {
        maxSize = Math.min(maxSize, Math.abs(minPerp) + solAmount)
    }
    let tradeSize = requestedTradeSize
    if (solAmount > 0 && action === "BUY") {
        tradeSize = Math.min(requestedTradeSize, maxSize)
        if (health < 100){
            tradeSize = 0
        }
    } else if (solAmount < 0 && action === "BUY") {
        const amt = Math.max(Math.abs(solAmount), maxSize)
        tradeSize = Math.min(requestedTradeSize, amt)
    } else if (solAmount < 0 && action === "SELL") {
        tradeSize = Math.min(requestedTradeSize, maxSize)
        if (health < 100){
            tradeSize = 0
        }
    } else if (solAmount > 0 && action === "SELL") {
        const amt = Math.max(Math.abs(solAmount), maxSize)
        tradeSize = Math.min(requestedTradeSize, amt)
    }
    return Math.max(tradeSize, 0)
}


async function performSpap(client: Client,
    accountDefinition: AccountDefinition,
    accountDetails: AccountDetail,
    tradeSize: number,
    fundingRate: number,
    simulateTrades: boolean = false) {

    console.log('----- ')
    console.log(accountDefinition.name + " FUNDING RATE: ", fundingRate)

    const walletSol = accountDetails.walletSol - SOL_RESERVE
    const { solBalance, solAmount, solBank, usdcBank, solPrice } = accountDetails

    const INCLUDE_WALLET = false
    const MIN_DIFF_SIZE = 0.01

    const spotVsPerpDiff = solBalance + solAmount + (INCLUDE_WALLET ? walletSol : 0)
    const spotUnbalanced = Math.abs(spotVsPerpDiff) > MIN_DIFF_SIZE

    let spotSide: "BUY" | "SELL" = "BUY"
    let buyPerpTradeSize = getTradeSize(
        tradeSize, solAmount,
        "BUY", accountDetails.borrow,
        accountDefinition, solPrice, MAX_SHORT_PERP, MAX_LONG_PERP, accountDetails.health)
    let sellPerpTradeSize = getTradeSize(
        tradeSize, solAmount,
        "SELL", accountDetails.borrow,
        accountDefinition, solPrice, MAX_SHORT_PERP, MAX_LONG_PERP, accountDetails.health)

    let spotAmount = 0
    if (spotUnbalanced) {
        if (spotVsPerpDiff > 0) {
            if (buyPerpTradeSize <= 0) {
                spotSide = "BUY"
                spotAmount = 0
                buyPerpTradeSize = 0
                sellPerpTradeSize = Math.min(MAX_PERP_TRADE_SIZE, Math.abs(spotVsPerpDiff))
            } else {
                spotSide = "SELL"
                buyPerpTradeSize = 0
                sellPerpTradeSize = 0
                spotAmount = Math.min(MAX_PERP_TRADE_SIZE, Math.abs(spotVsPerpDiff))
            }
        } else {
            if (sellPerpTradeSize <= 0) {
                spotSide = "SELL"
                spotAmount = 0
                sellPerpTradeSize = 0
                buyPerpTradeSize = Math.min(MAX_PERP_TRADE_SIZE, Math.abs(spotVsPerpDiff))
            } else {
                spotSide = "BUY"
                buyPerpTradeSize = 0
                sellPerpTradeSize = 0
                spotAmount = Math.min(MAX_PERP_TRADE_SIZE, Math.abs(spotVsPerpDiff))
            }
        }
    }

    if (buyPerpTradeSize > 0 || spotAmount > 0 || sellPerpTradeSize > 0) {
        const orders = await client.mangoAccount!.loadPerpOpenOrdersForMarket(
            client.client,
            client.group,
            accountDetails.perpMarket.perpMarketIndex,
            true
        )
        if (orders.find(o => o.side === PerpOrderSide.bid)) {
            buyPerpTradeSize = 0
        }
        if (orders.find(o => o.side === PerpOrderSide.ask)) {
            sellPerpTradeSize = 0
        }
        const possibilities = await getTradePossibilities(accountDefinition.name, client.client, 
            client.group, solPrice, spotAmount, usdcBank, solBank);

        await spotAndPerpSwap(
            spotAmount,
            solBank,
            usdcBank,
            client.client,
            client.mangoAccount!,
            client.user,
            client.group,
            spotSide,
            accountDefinition,
            solPrice,
            spotSide === "SELL" ? possibilities.bestSellRoute : possibilities.bestBuyRoute,
            spotSide === "SELL" ? possibilities.sellSpotPrice : possibilities.buySpotPrice,
            accountDetails.walletSol,
            !simulateTrades,
            buyPerpTradeSize,
            sellPerpTradeSize,
            spotUnbalanced ? 0 : accountDefinition.priceBuffer)
    }              
}


async function doubleSwapLoop(CAN_TRADE_NOW: boolean = true, UPDATE_GOOGLE_SHEET: boolean = true, SIMULATE_TRADES: boolean = false) {
    let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
    const googleClient: any = await authorize();
    const googleSheets = google.sheets({ version: 'v4', auth: googleClient });
    const googleUpdateInterval = 30 * 1000
    const accountDetailList: AccountDetail[] = []
    let lastGoogleUpdate = 0
    let lastFundingRate = 0
    const FUNDING_DIFF = 50
    const CHECK_FEES = false
    let feeEstimate = Math.min(DEFAULT_PRIORITY_FEE, MAX_FEE)

    while (true) {
        try {
            accountDetailList.length = 0
            if (CHECK_FEES) {
                let newFeeEstimate = DEFAULT_PRIORITY_FEE
                try {
                    newFeeEstimate = await db.get<number>(DB_KEYS.FEE_ESTIMATE)
                } catch (e: any) {
                    console.error('Error getting fee estimate', e.message)
                }
                console.log('FEE ESTIMATE: ', newFeeEstimate)
            }
            db.clearOpenTransactions()

            const fundingRate = await db.get<number>(DB_KEYS.FUNDING_RATE)
            if (Math.abs(fundingRate - lastFundingRate) > FUNDING_DIFF) {
                postToSlackFunding(fundingRate)
                lastFundingRate = fundingRate
            }
            if (fundingRate === 0) {
                console.log('FUNDING RATE IS 0, SLEEPING FOR 5 SECONDS')
                await sleep(5 * 1000)
            } else {
                const newItems = accountDefinitions.map(async (accountDefinition) => {
                    if (accountDefinition.canTrade && CAN_TRADE_NOW) {
                        let client = await db.get<Client>(DB_KEYS.GET_CLIENT, {
                            params: [accountDefinition, DEFAULT_PRIORITY_FEE],
                            cacheKey: accountDefinition.name,
                            force: true
                        })

                        const accountDetails = await db.get<AccountDetail>(DB_KEYS.ACCOUNT_DETAILS, {
                            cacheKey: accountDefinition.name, params: [
                                accountDefinition,
                                client.client,
                                client.group,
                                client.mangoAccount,
                                client.user]
                        })
                        await performSpap(client, accountDefinition,
                            accountDetails, accountDefinition.tradeSize, fundingRate, SIMULATE_TRADES)
                        return accountDetails
                    } else {
                        console.log('CANNOT TRADE NOW: ', accountDefinition.name)
                        let client = await db.get<Client>(DB_KEYS.GET_CLIENT, {
                            params: [accountDefinition, DEFAULT_PRIORITY_FEE],
                            cacheKey: accountDefinition.name,
                            force: false
                        })

                        const accountDetails = await db.get<AccountDetail>(DB_KEYS.ACCOUNT_DETAILS, {
                            cacheKey: accountDefinition.name, params: [
                                accountDefinition,
                                client.client,
                                client.group,
                                client.mangoAccount,
                                client.user]
                        })

                        await cancelOpenOrders(client.client, client.mangoAccount!, client.group,
                            accountDetails.perpMarket.perpMarketIndex, accountDefinition.name)
                        return accountDetails
                    }
                });
                accountDetailList.push(...await Promise.all(newItems))

                const now = Date.now()
                if ((UPDATE_GOOGLE_SHEET || db.getOpenTransactions() > 0) &&
                    (now - lastGoogleUpdate > googleUpdateInterval) &&
                    accountDetailList.length === accountDefinitions.length) {
                    // update google sheet
                    await updateGoogleSheet(googleSheets, accountDetailList, feeEstimate)
                    // end google sheet update
                    console.log('Google Sheet Updated', new Date().toTimeString())
                    lastGoogleUpdate = now
                }
                if (CAN_TRADE_NOW && (db.getOpenTransactions() > 0 || Math.abs(fundingRate) > 50)) {
                    await sleep(SLEEP_MAIN_LOOP_IN_MINUTES * 1000 * 60)
                } else {
                    await sleep(0.5 * 1000 * 60)
                }
            }
        } catch (e: any) {
            console.error(`Error in main loop: ${e.message}`)
            // sleep for 5 seconds  
            await sleep(5000)
        }
    }
}

try {
    doubleSwapLoop(true, true, false);
} catch (error) {
    console.log(error);
}
