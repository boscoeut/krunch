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
import {
    ACTIVITY_FEED_URL,
    DEFAULT_PRIORITY_FEE,
    FREE_CASH_LIMIT,
    GOOGLE_UPDATE_INTERVAL,
    MAX_FEE,
    MAX_PERP_TRADE_SIZE,
    MIN_SOL_WALLET_BALANCE,
    SLEEP_MAIN_LOOP_IN_MINUTES,
    SHORT_FUNDING_RATE_THRESHOLD,
    LONG_FUNDING_RATE_THRESHOLD,
    SOL_MINT,
    SOL_RESERVE
} from './constants';
import * as db from './db';
import { DB_KEYS } from './db';
import { authorize, getTradeData, updateGoogleSheet } from './googleUtils';
import {
    cancelOpenOrders,
    getBestPrice,
    perpTrade,
    postTrades,
    spotAndPerpSwap
} from './mangoSpotUtils';
import {
    getDefaultTradeSize,
    getMaxLongPerpSize, getMaxShortPerpSize,
    getMinHealth,
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
    borrow: number, oraclePrice: number,
    minPerp: number, maxPerp: number, health: number, market: "SOL-PERP" | "BTC-PERP" | "ETH-PERP",
    account: string
) {
    const freeCash = borrow * FREE_CASH_LIMIT
    let maxSize = freeCash > 0 ? (freeCash / oraclePrice) : 0
    let tickSize = 0.01
    if (market === "BTC-PERP") {
        tickSize = 0.0001
    } else if (market === "ETH-PERP") {
        tickSize = 0.0001
    }
    maxSize = roundToNearestFloor(maxSize, 1 / tickSize)

    if (action === Side.BUY) {
        maxSize = Math.min(maxSize, (maxPerp / oraclePrice) - solAmount)
    }
    if (action === Side.SELL) {
        maxSize = Math.min(maxSize, Math.abs(minPerp / oraclePrice) + solAmount)
    }
    let tradeSize = requestedTradeSize
    if (solAmount >= 0 && action === Side.BUY) {
        tradeSize = Math.min(requestedTradeSize, maxSize)
        if (health < getMinHealth(account)) {
            tradeSize = 0
        }
    } else if (solAmount < 0 && action === Side.BUY) {
        const amt = Math.max(Math.abs(solAmount), maxSize)
        tradeSize = Math.min(requestedTradeSize, amt)
    } else if (solAmount <= 0 && action === Side.SELL) {
        tradeSize = Math.min(requestedTradeSize, maxSize)
        if (health < getMinHealth(account)) {
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
    market: "SOL-PERP" | "BTC-PERP" | "ETH-PERP",
    shortRateThreshold:number,
    longRateThreshold:number,
    sellPriceBuffer:number,
    buyPriceBuffer:number
) {

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
    db.setItem(DB_KEYS.USDC_BORROW_RATE, usdcBank.getBorrowRateUi() || 0)
    db.setItem(DB_KEYS.USDC_DEPOSIT_RATE, usdcBank.getDepositRateUi() || 0)

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
    const orderIds: Array<number> = []

    let spotSide: Side = Side.BUY
    let buyPerpTradeSize = getTradeSize(
        tradeSize, perpAmount,
        Side.BUY, accountDetails.borrow,
        oraclePrice, getMaxShortPerpSize(market, accountDefinition), getMaxLongPerpSize(market, accountDefinition), accountDetails.health, market,
        accountDefinition.name)
    let sellPerpTradeSize = getTradeSize(
        tradeSize, perpAmount,
        Side.SELL, accountDetails.borrow,
        oraclePrice, getMaxShortPerpSize(market, accountDefinition), getMaxLongPerpSize(market, accountDefinition), accountDetails.health, market,
        accountDefinition.name)

    let spotAmount = 0
    if (spotUnbalanced) {
        const MAX_TRADE = MAX_PERP_TRADE_SIZE / oraclePrice
        if (spotVsPerpDiff > 0) {
            spotSide = Side.SELL
            buyPerpTradeSize = 0
            sellPerpTradeSize = 0
            spotAmount = Math.min(MAX_TRADE, Math.abs(spotVsPerpDiff))
        } else {
            spotSide = Side.BUY
            buyPerpTradeSize = 0
            sellPerpTradeSize = 0
            spotAmount = Math.min(MAX_TRADE, Math.abs(spotVsPerpDiff))
        }
    }

    if (buyPerpTradeSize > 0 || spotAmount > 0 || sellPerpTradeSize > 0) {
        const orders = await client.mangoAccount!.loadPerpOpenOrdersForMarket(
            client.client,
            client.group,
            perpMarket.perpMarketIndex,
            true
        )
        db.setItem(DB_KEYS.OPEN_ORDERS, orders.length, { cacheKey: accountDefinition.name + '_' + market })
        const result = await checkForPriceMismatch(accountDefinition, oraclePrice, bestBid, bestAsk, market,buyPriceBuffer, sellPriceBuffer)
        const buyMismatch = result.buyMismatch > buyPriceBuffer * oraclePrice
        const sellMismatch = result.sellMismatch > sellPriceBuffer * oraclePrice

        const IMMEDIATE_EXECUTION = false //  set to true when you want to place a trade immediately if there is a price mismatch
        let shouldExecuteImmediately = false
        let perpSize = 0
        let perpSide: PerpOrderSide = PerpOrderSide.bid
        let perpPrice = oraclePrice
        if (!spotUnbalanced && (buyMismatch || sellMismatch)) {
            // If balanced and there is a price mismatch, place a perp trade
            const side = result.buyMismatch > result.sellMismatch ? PerpOrderSide.bid : PerpOrderSide.ask
            let size = side === PerpOrderSide.bid ? buyPerpTradeSize : sellPerpTradeSize
            const price = side === PerpOrderSide.bid ? perpPrice - (buyPriceBuffer * perpPrice) : perpPrice + (sellPriceBuffer * perpPrice)
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

        if (shouldExecuteImmediately && IMMEDIATE_EXECUTION) {
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
            orderIds.push(...result.orderIds)
            addressLookupTables.push(...result.addressLookupTables)
        } else {
            // place spot and perp trade.  perp trades are oracle pegged
            // spot trades attempt to balance the wallet
            const cancelOrders: Array<any> = []
            if (orders.find(o => o.side === PerpOrderSide.bid)) {
                buyPerpTradeSize = 0
            }
            if (fundingRate >= longRateThreshold) {
                buyPerpTradeSize = 0
                if (fundingRate >= shortRateThreshold) {
                    cancelOrders.push(...(orders.filter(o => o.side === PerpOrderSide.bid)))
                }
            }
            if (orders.find(o => o.side === PerpOrderSide.ask)) {
                sellPerpTradeSize = 0
            }
            if (fundingRate <= shortRateThreshold) {
                sellPerpTradeSize = 0
                if (fundingRate <= longRateThreshold) {
                    cancelOrders.push(...(orders.filter(o => o.side === PerpOrderSide.ask)))
                }
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
                spotUnbalanced ? 0 : (perpPrice * sellPriceBuffer),
                spotUnbalanced ? 0 : (perpPrice * buyPriceBuffer),
                orders.length,
                market)

            for (const c of cancelOrders) {
                try {
                    tradeInstructions.push(await client.client.perpCancelOrderIx(group,
                        client.mangoAccount!,
                        perpMarket.perpMarketIndex,
                        c.orderId))
                } catch (x: any) {
                    console.log(x.message)
                }
            }
            tradeInstructions.push(...result.tradeInstructions)
            orderIds.push(...result.orderIds)
            addressLookupTables.push(...result.addressLookupTables)
        }
    }
    return { tradeInstructions, addressLookupTables, orderIds }
}

async function checkForPriceMismatch(
    accountDefinition: AccountDefinition,
    perpPrice: number,
    bestBid: number,
    bestAsk: number,
    market: "SOL-PERP" | "BTC-PERP" | "ETH-PERP",
    _buyPriceBuffer:number,
    _sellPriceBuffer:number) {
    const buyPriceBuffer = _buyPriceBuffer * perpPrice
    const sellPriceBuffer = _sellPriceBuffer * perpPrice

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const feedItems = feed.data.filter((item: any) => new Date(item.block_datetime) > today)
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
    db.tradeHistory.set(accountName, perpUsdc + swapUsdc)
}

async function doubleSwapLoop(UPDATE_GOOGLE_SHEET: boolean = true, SIMULATE_TRADES: boolean = false) {
    let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
    const googleClient: any = await authorize();
    const googleSheets = google.sheets({ version: 'v4', auth: googleClient });
    const accountDetailList: AccountDetail[] = []
    let lastGoogleUpdate = 0
    let lastFundingRate = 0
    const FUNDING_DIFF = 50
    const CHECK_FEES = false
    let feeEstimate = Math.min(DEFAULT_PRIORITY_FEE, MAX_FEE)

    while (true) {
        try {
            const tradingParameters = await getTradeData(googleSheets)
            const shouldTradeNow = tradingParameters?.tradingStatus || false
            const accountList = tradingParameters?.accountList
            const shortRateThreshold = tradingParameters?.shortRateThreshold || SHORT_FUNDING_RATE_THRESHOLD
            const longRateThreshold = tradingParameters?.longRateThreshold || LONG_FUNDING_RATE_THRESHOLD
            const sellPriceBuffer = tradingParameters?.sellPriceBuffer || 0.0027
            const buyPriceBuffer = tradingParameters?.buyPriceBuffer || 0.0027
    
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

            const fundingRates = await db.fetchFundingRate()
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

                    if (accountList?.includes(accountDefinition.name)) {
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
                    let orderIds: Array<number> = []

                    if (accountList?.includes(accountDefinition.name) && shouldTradeNow) {
                        if (accountDetails.walletSol < MIN_SOL_WALLET_BALANCE) {
                            const borrowAmount = SOL_RESERVE - accountDetails.walletSol
                            const mintPk = new PublicKey(SOL_MINT)
                            const borrowAmountBN = toNative(borrowAmount, client.group.getMintDecimals(mintPk));
                            await client.client.tokenWithdrawNative(client.group, client.mangoAccount!, mintPk, borrowAmountBN, true)
                        } else {
                            const ethTradeSize = getDefaultTradeSize('ETH-PERP', accountDefinition)
                            const btcTradeSize = getDefaultTradeSize('BTC-PERP', accountDefinition)
                            const solTradeSize = tradingParameters?.solTradeSize || getDefaultTradeSize('SOL-PERP', accountDefinition)

                            if (ethTradeSize > 0 && tradeInstructions.length <= 0) {
                                const result = await performSwap(client, accountDefinition,
                                    accountDetails, ethTradeSize, fundingRates.ethFundingRate, client.group, "ETH-PERP", shortRateThreshold, longRateThreshold,
                                    sellPriceBuffer, buyPriceBuffer)
                                tradeInstructions.push(...result.tradeInstructions)
                                addressLookupTables.push(...result.addressLookupTables)
                                orderIds.push(...result.orderIds)
                            }
                            if (btcTradeSize > 0 && tradeInstructions.length <= 0) {
                                const result = await performSwap(client, accountDefinition,
                                    accountDetails, btcTradeSize, fundingRates.btcFundingRate, client.group, "BTC-PERP", shortRateThreshold, longRateThreshold,
                                    sellPriceBuffer, buyPriceBuffer)
                                tradeInstructions.push(...result.tradeInstructions)
                                addressLookupTables.push(...result.addressLookupTables)
                                orderIds.push(...result.orderIds)
                            }
                            if (solTradeSize > 0 && tradeInstructions.length <= 0) {
                                const result = await performSwap(client, accountDefinition,
                                    accountDetails, solTradeSize, fundingRates.solFundingRate, client.group, "SOL-PERP", shortRateThreshold, longRateThreshold,
                                sellPriceBuffer, buyPriceBuffer)
                                tradeInstructions.push(...result.tradeInstructions)
                                addressLookupTables.push(...result.addressLookupTables)
                                orderIds.push(...result.orderIds)
                            }
                        }
                    } else {
                        const { usdcBank } = accountDetails;
                        db.setItem(DB_KEYS.USDC_BORROW_RATE, usdcBank.getBorrowRateUi() || 0)
                        db.setItem(DB_KEYS.USDC_DEPOSIT_RATE, usdcBank.getDepositRateUi() || 0)

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
                            false,
                            orderIds)
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
                if (shouldTradeNow && db.getOpenTransactions() > 0) {
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
    //    createKeypair();
    doubleSwapLoop(true, false);
} catch (error) {
    console.log(error);
}
