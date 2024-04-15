import {
    Bank, Group,
    PerpOrderSide,
    toNative
} from '@blockworks-foundation/mango-v4';
import {
    PublicKey
} from '@solana/web3.js';
import axios from 'axios';
import fs from 'fs';
import { getBuyPriceBuffer, getSellPriceBuffer } from './mangoUtils';
import {
    ACTIVITY_FEED_URL,
    DEFAULT_PRIORITY_FEE,
    GOOGLE_UPDATE_INTERVAL,
    MAX_FEE,
    MAX_LONG_PERP,
    MAX_PERP_TRADE_SIZE,
    MAX_SHORT_PERP,
    MIN_HEALTH_FACTOR,
    MIN_SOL_WALLET_BALANCE,
    SLEEP_MAIN_LOOP_IN_MINUTES,
    SOL_MINT,
    SOL_RESERVE
} from './constants';
import * as db from './db';
import { DB_KEYS } from './db';
import { authorize, updateGoogleSheet } from './googleUtils';
import {
    cancelOpenOrders,
    getBestPrice,
    perpTrade,
    postTrades,
    spotAndPerpSwap
} from './mangoSpotUtils';
import {
    getFundingRate,
    sleep
} from './mangoUtils';
import { postToSlackFunding, postToSlackPriceAlert } from './slackUtils';
import {
    AccountDefinition,
    AccountDetail,
    Client,
    Side
} from './types';

const { google } = require('googleapis');

function roundToNearestFloor(num: number, nearest: number = 2) {
    return Math.floor(num * nearest) / nearest;
}

function getTradeSize(requestedTradeSize: number, solAmount: number, action: Side,
    borrow: number, solPrice: number,
    minPerp: number, maxPerp: number, health: number, market: "SOL-PERP" | "BTC-PERP" | "ETH-PERP"
) {
    const freeCash = borrow 
    let maxSize = freeCash > 0 ? (freeCash / solPrice) / 2.1 : 0 // 2.1 to account for other side of trade
    let tickSize = 0.01
    if (market === "BTC-PERP") {
        tickSize = 0.0001
    } else if (market === "ETH-PERP") {
        tickSize = 0.0001
    }
    maxSize = roundToNearestFloor(maxSize, 1 / tickSize)

    if (action === Side.BUY) {
        maxSize = Math.min(maxSize, (maxPerp / solPrice) - solAmount)
    }
    if (action === Side.SELL) {
        maxSize = Math.min(maxSize, Math.abs(minPerp / solPrice) + solAmount)
    }
    let tradeSize = requestedTradeSize
    if (solAmount > 0 && action === Side.BUY) {
        tradeSize = Math.min(requestedTradeSize, maxSize)
        if (health < MIN_HEALTH_FACTOR) {
            tradeSize = 0
        }
    } else if (solAmount < 0 && action === Side.BUY) {
        const amt = Math.max(Math.abs(solAmount), maxSize)
        tradeSize = Math.min(requestedTradeSize, amt)
    } else if (solAmount < 0 && action === Side.SELL) {
        tradeSize = Math.min(requestedTradeSize, maxSize)
        if (health < MIN_HEALTH_FACTOR) {
            tradeSize = 0
        }
    } else if (solAmount > 0 && action === Side.SELL) {
        const amt = Math.max(Math.abs(solAmount), maxSize)
        tradeSize = Math.min(requestedTradeSize, amt)
    }
    return Math.max(tradeSize, 0)
}

async function performSwap(client: Client,
    accountDefinition: AccountDefinition,
    accountDetails: AccountDetail,
    tradeSize: number,
    fundingRate: number,
    group: Group,
    market: "SOL-PERP" | "BTC-PERP" | "ETH-PERP") {

    let tradeInstructions: Array<any> = []
    let addressLookupTables: Array<any> = []
    console.log('----- ')
    console.log(`${accountDefinition.name} ${market} FUNDING RATE: `, fundingRate)

    const walletSol = accountDetails.walletSol - SOL_RESERVE
    const { solBalance, solAmount, solBank, usdcBank, solPrice, btcBalance, btcAmount, btcBank,
        ethAmount, ethBalance, ethBank
    } = accountDetails
    let perpBank: Bank = solBank
    let perpAmount = solAmount
    let perpBalance = solBalance
    let oraclePrice = solPrice
    let bestBid = accountDetails.bestBid
    let bestAsk = accountDetails.bestAsk
    const values = group.perpMarketsMapByMarketIndex.values()
    const perpMarket: any = Array.from(values).find((perpMarket: any) => perpMarket.name === market);

    // set rates
    db.setItem(DB_KEYS.USDC_BORROW_RATE, usdcBank.getBorrowRateUi() ||0 )
    db.setItem (DB_KEYS.USDC_DEPOSIT_RATE, solBank.getDepositRateUi() || 0)

    if (market === "BTC-PERP") {
        perpBank = btcBank
        perpAmount = btcAmount
        perpBalance = btcBalance
        oraclePrice = accountDetails.btcPrice
        bestBid = accountDetails.btcBestBid
        bestAsk = accountDetails.btcBestAsk
    } else if (market === "ETH-PERP") {
        perpBank = ethBank
        perpAmount = ethAmount
        perpBalance = ethBalance
        oraclePrice = accountDetails.ethPrice
        bestBid = accountDetails.ethBestBid
        bestAsk = accountDetails.ethBestAsk
    }

    const INCLUDE_WALLET = false
    const MIN_DIFF_SIZE = 10 / oraclePrice // $10 worth

    const spotVsPerpDiff = perpBalance + perpAmount + (INCLUDE_WALLET ? walletSol : 0)
    const spotUnbalanced = Math.abs(spotVsPerpDiff) > MIN_DIFF_SIZE

    let spotSide: Side = Side.BUY
    let buyPerpTradeSize = getTradeSize(
        tradeSize, perpAmount,
        Side.BUY, accountDetails.borrow,
        oraclePrice, MAX_SHORT_PERP, MAX_LONG_PERP, accountDetails.health, market)
    let sellPerpTradeSize = getTradeSize(
        tradeSize, perpAmount,
        Side.SELL, accountDetails.borrow,
        oraclePrice, MAX_SHORT_PERP, MAX_LONG_PERP, accountDetails.health, market)

    let spotAmount = 0
    if (spotUnbalanced) {
        if (spotVsPerpDiff > 0) {
            spotSide = Side.SELL
            buyPerpTradeSize = 0
            sellPerpTradeSize = 0
            spotAmount = Math.min(MAX_PERP_TRADE_SIZE, Math.abs(spotVsPerpDiff))
        } else {
            spotSide = Side.BUY
            buyPerpTradeSize = 0
            sellPerpTradeSize = 0
            spotAmount = Math.min(MAX_PERP_TRADE_SIZE, Math.abs(spotVsPerpDiff))
        }
    }

    if (buyPerpTradeSize > 0 || spotAmount > 0 || sellPerpTradeSize > 0) {
        const orders = await client.mangoAccount!.loadPerpOpenOrdersForMarket(
            client.client,
            client.group,
            perpMarket.perpMarketIndex,
            true
        )
        const result = await checkForPriceMismatch(accountDefinition, oraclePrice, bestBid, bestAsk, market)
        const buyMismatch = result.buyMismatch > getBuyPriceBuffer(market) * oraclePrice
        const sellMismatch = result.sellMismatch > getSellPriceBuffer(market) * oraclePrice

        let shouldExecuteImmediately = false
        let perpSize = 0
        let perpSide: PerpOrderSide = PerpOrderSide.bid
        let perpPrice = oraclePrice
        if (!spotUnbalanced && (buyMismatch || sellMismatch)) {
            // If balanced and there is a price mismatch, place a perp trade
            const side = result.buyMismatch > result.sellMismatch ? PerpOrderSide.bid : PerpOrderSide.ask
            let size = side === PerpOrderSide.bid ? buyPerpTradeSize : sellPerpTradeSize
            const price = side === PerpOrderSide.bid ? perpPrice - (getBuyPriceBuffer(market) * perpPrice) : perpPrice + (getSellPriceBuffer(market) * perpPrice)
            if (side === PerpOrderSide.bid && orders.find(o => o.side === PerpOrderSide.bid && !o.isOraclePegged)) {
                size = 0
            }
            if (side === PerpOrderSide.ask && orders.find(o => o.side === PerpOrderSide.ask && !o.isOraclePegged)) {
                size = 0
            }

            if (size > 0) {
                shouldExecuteImmediately = true
                perpSize = size
                perpSide = side
                perpPrice = price
            }
        }

        if (shouldExecuteImmediately) {
            const result = await perpTrade(
                accountDefinition,
                client.client,
                client.mangoAccount!,
                client.group,
                perpPrice,
                perpSize,
                perpSide,
                market)
            tradeInstructions.push(...result.tradeInstructions)
            addressLookupTables.push(...result.addressLookupTables)
        } else {
            // place spot and perp trade.  perp trades are oracle pegged
            // spot trades attempt to balance the wallet
            if (orders.find(o => o.side === PerpOrderSide.bid)) {
                buyPerpTradeSize = 0
            }
            if (orders.find(o => o.side === PerpOrderSide.ask)) {
                sellPerpTradeSize = 0
            }
            const result = await spotAndPerpSwap(
                spotAmount,
                perpBank,
                usdcBank,
                client.client,
                client.mangoAccount!,
                client.user,
                client.group,
                spotSide,
                accountDefinition,
                perpPrice,
                buyPerpTradeSize,
                sellPerpTradeSize,
                spotUnbalanced ? 0 : (perpPrice * getSellPriceBuffer(market)),
                spotUnbalanced ? 0 : (perpPrice * getBuyPriceBuffer(market)),
                orders.length,
                market)
            tradeInstructions.push(...result.tradeInstructions)
            addressLookupTables.push(...result.addressLookupTables)
        }
    }
    return { tradeInstructions, addressLookupTables }
}

async function checkForPriceMismatch(
    accountDefinition: AccountDefinition,
    perpPrice: number,
    bestBid: number,
    bestAsk: number,
    market: "SOL-PERP" | "BTC-PERP" | "ETH-PERP") {
    const buyPriceBuffer = getBuyPriceBuffer(market) * perpPrice
    const sellPriceBuffer = getSellPriceBuffer(market) * perpPrice

    const buySpread = perpPrice - bestAsk
    const sellSpread = bestBid - perpPrice
    console.log(`------ ${accountDefinition.name} PRICE MISMATCH --------`)
    console.log(`BUY  PRICE MISMATCH: BestAsk=${bestAsk.toFixed(2)} Oracle=${perpPrice.toFixed(2)}  Diff=${buySpread.toFixed(2)}`)
    console.log(`SELL PRICE MISMATCH: BestBid=${bestBid.toFixed(2)} Oracle=${perpPrice.toFixed(2)}  Diff=${sellSpread.toFixed(2)}`)
    if (buySpread > buyPriceBuffer * perpPrice && bestAsk > 0) {
        postToSlackPriceAlert(perpPrice, bestBid, bestAsk, buySpread, sellSpread)
    }
    if (sellSpread > sellPriceBuffer * perpPrice && bestBid > 0) {
        postToSlackPriceAlert(perpPrice, bestBid, bestAsk, buySpread, sellSpread)
    }
    return { buyMismatch: buySpread, sellMismatch: sellSpread }
}

async function checkActivityFeed(accountName: string, mangoAccount: string) {
    const url = ACTIVITY_FEED_URL + mangoAccount
    const feed = await axios.get(url)

    let swapUsdc = 0
    let swapSol = 0
    let perpUsdc = 0
    let perpSol = 0
    const feedItems = feed.data.filter((item: any) => new Date(item.block_datetime) > new Date('2024-04-15'))
    // const feedItems = feed.data.slice(2,4)
    for (const item of feedItems) {
        if (item.activity_type === 'swap') {
            if (item.activity_details.swap_in_symbol === "USDC") {
                swapUsdc -= item.activity_details.swap_in_amount
                swapUsdc -= item.activity_details.loan_origination_fee
                swapSol += item.activity_details.swap_out_amount
            } else {
                swapUsdc += item.activity_details.swap_out_amount
                swapSol -= item.activity_details.swap_in_amount
                swapUsdc -= item.activity_details.loan_origination_fee
            }
        } else if (item.activity_type === 'perp_trade') {
            let itemTotal = item.activity_details.price * item.activity_details.quantity
            const isTaker = item.activity_details.taker === mangoAccount
            let side = 'ask'
            if (isTaker) {
                side = item.activity_details.taker_side
                perpUsdc += itemTotal * item.activity_details.taker_fee
            } else {
                side = item.activity_details.taker_side === 'ask' ? 'bid' : 'ask'
                perpUsdc += itemTotal * item.activity_details.maker_fee
            }
            if (side === "ask") {
                perpSol -= item.activity_details.quantity
                perpUsdc += itemTotal
            } else {
                perpSol += item.activity_details.quantity
                perpUsdc -= itemTotal
            }
        }
    }
    const swapUsdcTotal = Math.abs(swapSol) > 0 ? swapUsdc / Math.abs(swapSol) : 0
    const perpUsdcTotal = Math.abs(swapSol) > 0 ? perpUsdc / Math.abs(perpSol) : 0
    console.log(`------ ${accountName} HISTORY --------`)
    console.log(`${accountName} SWAP: ${swapUsdcTotal} USDC`)
    console.log(`${accountName} PERP: ${perpUsdcTotal} USDC`)
    console.log(`${accountName} TOTAL: ${(swapUsdcTotal + perpUsdcTotal)} USDC`)
    db.tradeHistory.set(accountName, swapUsdcTotal + perpUsdcTotal)
}

async function doubleSwapLoop(CAN_TRADE_NOW: boolean = true, UPDATE_GOOGLE_SHEET: boolean = true, SIMULATE_TRADES: boolean = false) {
    let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
    const googleClient: any = await authorize();
    const googleSheets = google.sheets({ version: 'v4', auth: googleClient });
    const accountDetailList: AccountDetail[] = []
    let lastGoogleUpdate = 0
    let lastFundingRate = 0
    let buyMismatch = 0
    let sellMismatch = 0
    const FUNDING_DIFF = 50
    const CHECK_FEES = false
    let feeEstimate = Math.min(DEFAULT_PRIORITY_FEE, MAX_FEE)

    while (true) {
        try {
            accountDetailList.length = 0
            if (CHECK_FEES) {
                let newFeeEstimate = DEFAULT_PRIORITY_FEE
                try {
                    newFeeEstimate = await db.getFeeEstimate()
                } catch (e: any) {
                    console.error('Error getting fee estimate', e.message)
                }
                console.log('FEE ESTIMATE: ', newFeeEstimate)
            }

            // check for best route
            db.clearOpenTransactions()

            const fundingRates = await getFundingRate()
            if (Math.abs(fundingRates.solFundingRate - lastFundingRate) > FUNDING_DIFF) {
                postToSlackFunding(fundingRates.solFundingRate)
                lastFundingRate = fundingRates.solFundingRate
            }
            console.log('SOL FUNDING RATE: ', fundingRates.solFundingRate)
            if (fundingRates.solFundingRate === 0) {
                console.log('FUNDING RATE IS 0, SLEEPING FOR 5 SECONDS')
                await sleep(10 * 1000)
            } else {
                const newItems = accountDefinitions.map(async (accountDefinition) => {
                    let client = await db.getClient(accountDefinition, DEFAULT_PRIORITY_FEE)

                    if (accountDefinition.name === 'DRIFT') {
                        await checkActivityFeed(accountDefinition.name, client.mangoAccount!.publicKey.toString())
                    }

                    const accountDetails = await db.getAccountData(
                        accountDefinition,
                        client.client,
                        client.group,
                        client.mangoAccount!,
                        client.user
                    )
                    let tradeInstructions: Array<any> = []
                    let addressLookupTables: Array<any> = []

                    if (accountDefinition.canTrade && CAN_TRADE_NOW) {
                        if (accountDetails.walletSol < MIN_SOL_WALLET_BALANCE) {
                            const borrowAmount = SOL_RESERVE - accountDetails.walletSol
                            const mintPk = new PublicKey(SOL_MINT)
                            const borrowAmountBN = toNative(borrowAmount, client.group.getMintDecimals(mintPk));
                            await client.client.tokenWithdrawNative(client.group, client.mangoAccount!, mintPk, borrowAmountBN, true)
                        } else {
                            if (accountDefinition.ethTradeSize > 0 && tradeInstructions.length <= 0) {
                                const result = await performSwap(client, accountDefinition,
                                    accountDetails, accountDefinition.ethTradeSize, fundingRates.ethFundingRate, client.group, "ETH-PERP")
                                tradeInstructions.push(...result.tradeInstructions)
                                addressLookupTables.push(...result.addressLookupTables)
                            }                           
                            if (accountDefinition.btcTradeSize > 0 && tradeInstructions.length <= 0) {
                                const result = await performSwap(client, accountDefinition,
                                    accountDetails, accountDefinition.btcTradeSize, fundingRates.btcFundingRate, client.group, "BTC-PERP")
                                tradeInstructions.push(...result.tradeInstructions)
                                addressLookupTables.push(...result.addressLookupTables)
                            }
                            if (accountDefinition.solTradeSize > 0 && tradeInstructions.length <= 0) {
                                const result = await performSwap(client, accountDefinition,
                                    accountDetails, accountDefinition.solTradeSize, fundingRates.solFundingRate, client.group, "SOL-PERP")
                                tradeInstructions.push(...result.tradeInstructions)
                                addressLookupTables.push(...result.addressLookupTables)
                            }
                        }
                    } else {
                        console.log('CANNOT TRADE NOW: ', accountDefinition.name)
                        await cancelOpenOrders(client.client, client.mangoAccount!, client.group, "ETH-PERP", accountDefinition.name)
                        await cancelOpenOrders(client.client, client.mangoAccount!, client.group, "SOL-PERP", accountDefinition.name)
                        await cancelOpenOrders(client.client, client.mangoAccount!, client.group, "BTC-PERP", accountDefinition.name)
                    }

                    if (!SIMULATE_TRADES && tradeInstructions.length > 0) {
                        await postTrades(accountDefinition.name,
                            tradeInstructions,
                            client.client,
                            client.group,
                            addressLookupTables,
                            false)
                    }
                    return accountDetails
                });

                accountDetailList.push(...await Promise.all(newItems))

                // check for best route
                let bestBuyPrice = 0
                let bestSellPrice = 0
                let solPrice = 0
                if (accountDetailList.length > 0) {
                    const inBank = accountDetailList[0].solBank
                    const outBank = accountDetailList[0].usdcBank
                    solPrice = accountDetailList[0].solPrice
                    const sellRoute = await getBestPrice(Side.SELL, 1, inBank, outBank)
                    const buyRoute = await getBestPrice(Side.BUY, solPrice, outBank, inBank)
                    bestBuyPrice = buyRoute.price
                    bestSellPrice = sellRoute.price
                    if (sellRoute.price > solPrice) {
                        console.log('sell opportunity', sellRoute.price - solPrice)
                    }
                    if (buyRoute.price < solPrice) {
                        console.log('buy opportunity', solPrice - buyRoute.price)
                    }
                }


                const now = Date.now()
                if ((UPDATE_GOOGLE_SHEET || db.getOpenTransactions() > 0) &&
                    (now - lastGoogleUpdate > GOOGLE_UPDATE_INTERVAL) &&
                    accountDetailList.length === accountDefinitions.length) {
                    // update google sheet
                    await updateGoogleSheet(fundingRates, googleSheets, accountDetailList, feeEstimate, db.getTransactionCache(), bestBuyPrice, bestSellPrice, solPrice)
                    // end google sheet update
                    console.log('Google Sheet Updated', new Date().toTimeString())
                    lastGoogleUpdate = now
                }
                if (CAN_TRADE_NOW && db.getOpenTransactions() > 0) {
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
