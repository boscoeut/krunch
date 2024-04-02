import {
    PerpOrderSide, PerpSelfTradeBehavior, PerpOrderType
} from '@blockworks-foundation/mango-v4';
import fs from 'fs';
import {
    DEFAULT_PRIORITY_FEE,
    MAX_FEE,
    MAX_LONG_PERP,
    MAX_SHORT_PERP,
    MAX_PERP_TRADE_SIZE,
    PERP_BUY_PRICE_BUFFER,
    MAX_SPOT_TRADE_SIZE,
    SLEEP_MAIN_LOOP_IN_MINUTES,
    SOL_RESERVE
} from './constants';
import * as db from './db';
import { DB_KEYS } from './db';
import { authorize, updateGoogleSheet } from './googleUtils';
import {
    cancelOpenOrders,
    getTradePossibilities,
    spotAndPerpSwap2
} from './mangoSpotUtils';
import {
    sleep, toFixedFloor
} from './mangoUtils';
import {
    AccountDefinition,
    AccountDetail,
    Client
} from './types';
import { postToSlackFunding, postToSlackAlert } from './slackUtils';

const { google } = require('googleapis');
type TradeStrategy = "BUY_PERP_SELL_SPOT" | "SELL_PERP_BUY_SPOT" | "NONE"

function roundToNearestHalf(num: number) {
    return Math.floor(num * 2) / 2;
}
function getTradeSize(requestedTradeSize: number, solAmount: number, action: 'BUY' | 'SELL',
    borrow: number, accountDefinition: AccountDefinition, solPrice: number, minPerp: number, maxPerp: number
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

    const optimalSize = maxSize
    let tradeSize = requestedTradeSize

    if (solAmount > 0 && action === "BUY") {
        tradeSize = Math.min(requestedTradeSize, optimalSize)
    } else if (solAmount < 0 && action === "BUY") {
        const amt = Math.max(Math.abs(solAmount), optimalSize)
        tradeSize = Math.min(requestedTradeSize, amt)
    } else if (solAmount < 0 && action === "SELL") {
        tradeSize = Math.min(requestedTradeSize, optimalSize)
    } else if (solAmount > 0 && action === "SELL") {
        const amt = Math.max(Math.abs(solAmount), optimalSize)
        tradeSize = Math.min(requestedTradeSize, amt)
    }

    return tradeSize

}

async function determineBuyVsSell(name: string, client: Client, spotAmount: number, solPrice: number, usdcBank: any, solBank: any) {
    let strategy: TradeStrategy = "NONE"

    const possibilities = await getTradePossibilities(name, client.client, client.group, solPrice, spotAmount, usdcBank, solBank);
    if (possibilities.buyPerpSellSpot > 0) {
        strategy = "BUY_PERP_SELL_SPOT"
        // postToSlackAlert(name, "BUY", possibilities.buyPerpSellSpot,possibilities.buySpotPrice, possibilities.bestAsk, solPrice)
    } else if (possibilities.sellPerpBuySpot > 0) {
        strategy = "SELL_PERP_BUY_SPOT"
        // postToSlackAlert(name, "SELL", possibilities.sellPerpBuySpot, possibilities.sellSpotPrice, possibilities.bestBid, solPrice)
    }
    return {
        strategy,
        possibilities,
    }
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

    let balanceStrategy: TradeStrategy = "NONE"

    const newTradeSize = getTradeSize(
        tradeSize, solAmount,
        fundingRate <= 0 ? "BUY" : "SELL", accountDetails.borrow,
        accountDefinition, solPrice, MAX_SHORT_PERP, MAX_LONG_PERP)
    console.log("New Trade Size", newTradeSize)

    let spotAmount = 0
    let perpAmount = newTradeSize

    if (spotUnbalanced) {
        perpAmount = 0
        spotAmount = Math.min(MAX_PERP_TRADE_SIZE, Math.abs(spotVsPerpDiff))
        if (spotVsPerpDiff > 0) {
            balanceStrategy = "BUY_PERP_SELL_SPOT"
        } else {
            balanceStrategy = "SELL_PERP_BUY_SPOT"
        }
    }

    if (perpAmount > 0 || spotAmount > 0) {
        const strategy = fundingRate > 0 ? "SELL_PERP_BUY_SPOT" : "BUY_PERP_SELL_SPOT"

        const orders = await client.mangoAccount!.loadPerpOpenOrdersForMarket(
            client.client,
            client.group,
            accountDetails.perpMarket.perpMarketIndex,
            true
        )
        if (orders.length === 2) {
            perpAmount = 0
        }

        const { possibilities }: any = await determineBuyVsSell(
            accountDefinition.name,
            client, spotAmount, solPrice, usdcBank, solBank)

        let tradeStrategy = strategy
        if (spotUnbalanced) {
            tradeStrategy = balanceStrategy
        }

        if (tradeStrategy === "BUY_PERP_SELL_SPOT") {
            // buy Perp and sell Spot
            console.log(`BUY_PERP_SELL_SPOT: ${possibilities.buyPerpSellSpot}`)
            const perpPrice = spotUnbalanced ? solPrice : possibilities.sellSpotPrice - PERP_BUY_PRICE_BUFFER

            await spotAndPerpSwap2(
                spotAmount,
                solBank,
                usdcBank,
                client.client,
                client.mangoAccount!,
                client.user,
                client.group,
                "SELL",
                accountDefinition,
                solPrice,
                perpAmount,
                perpPrice,
                PerpOrderSide.bid,
                possibilities.bestSellRoute,
                possibilities.sellSpotPrice,
                possibilities.bestAsk,
                accountDetails.walletSol,
                possibilities.buyPerpSellSpot + possibilities.buyPriceBuffer,
                !simulateTrades)
        } else if (tradeStrategy === "SELL_PERP_BUY_SPOT") {
            // sell Perp and buy Spot
            console.log(`SELL_PERP_BUY_SPOT: ${possibilities.sellPerpBuySpot}`)
            const perpPrice = spotUnbalanced ? solPrice : possibilities.buySpotPrice + possibilities.sellPriceBuffer

            await spotAndPerpSwap2(
                toFixedFloor(spotAmount * solPrice),
                usdcBank,
                solBank,
                client.client,
                client.mangoAccount!,
                client.user,
                client.group,
                "BUY",
                accountDefinition,
                solPrice,
                perpAmount,
                perpPrice,
                PerpOrderSide.ask,
                possibilities.bestBuyRoute,
                possibilities.buySpotPrice,
                possibilities.bestBid,
                accountDetails.walletSol,
                possibilities.sellPerpBuySpot + possibilities.sellPriceBuffer,
                !simulateTrades)
        }
    } else {
        console.log(`${accountDefinition.name}: SKIPPING TRADE DUE TO TRADE SIZE = 0`)
    }
}


async function doubleSwapLoop(CAN_TRADE_NOW: boolean = true, UPDATE_GOOGLE_SHEET: boolean = true, SIMULATE_TRADES: boolean = false) {
    //  await postToSlack('Mango Bot', 'BUY', 0, 0, 0, 0)
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
                // const newItems = accountDefinitions.filter(a=>a.name==="BIRD").map(async (accountDefinition) => {
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

    doubleSwapLoop(false, true, false);
} catch (error) {
    console.log(error);
}
