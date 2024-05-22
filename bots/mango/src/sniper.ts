import {
    Bank, Group,
    PerpOrderSide,
    toNative
} from '@blockworks-foundation/mango-v4';
import {
    BulkAccountLoader,
    DRIFT_PROGRAM_ID,
    DriftClient,
    FUNDING_RATE_BUFFER_PRECISION,
    PerpMarkets,
    User,
    Wallet,
    convertToNumber,
    AMM_RESERVE_PRECISION,
	PRICE_PRECISION,
	QUOTE_PRECISION,
	ZERO,
	ONE,
	FUNDING_RATE_OFFSET_DENOMINATOR,
    PerpMarketAccount,
    BN,
    isVariant,
    OraclePriceData,
    calculateBidAskPrice,
    calculateLiveOracleTwap,
    calculateDepositRate,
    calculateBorrowRate,
    SpotMarkets,clampBN
} from "@drift-labs/sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import axios from 'axios';
import fs from 'fs';
import {
    ACTIVITY_FEED_URL,
    GOOGLE_UPDATE_INTERVAL,
    HELIUS_ROBO_CONNECTION_URL,
    MAX_FEE,
    MAX_PERP_TRADE_SIZE,
    MIN_SOL_WALLET_BALANCE,
    SHOULD_CANCEL_ORDERS,
    SLEEP_MAIN_LOOP_IN_MINUTES,
    SOL_MINT,
    SOL_RESERVE
} from './constants';
import * as db from './db';
import { DB_KEYS } from './db';
import { authorize, getTradingParameters, updateGoogleSheet } from './googleUtils';
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
    getUser,
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


function shrinkStaleTwaps(
	market: PerpMarketAccount,
	markTwapWithMantissa: BN,
	oracleTwapWithMantissa: BN,
	now?: BN
) {
	now = now || new BN((Date.now() / 1000).toFixed(0));
	let newMarkTwap = markTwapWithMantissa;
	let newOracleTwap = oracleTwapWithMantissa;
	if (
		market.amm.lastMarkPriceTwapTs.gt(
			market.amm.historicalOracleData.lastOraclePriceTwapTs
		)
	) {
		// shrink oracle based on invalid intervals
		const oracleInvalidDuration = BN.max(
			ZERO,
			market.amm.lastMarkPriceTwapTs.sub(
				market.amm.historicalOracleData.lastOraclePriceTwapTs
			)
		);
		const timeSinceLastOracleTwapUpdate = now.sub(
			market.amm.historicalOracleData.lastOraclePriceTwapTs
		);
		const oracleTwapTimeSinceLastUpdate = BN.max(
			ONE,
			BN.min(
				market.amm.fundingPeriod,
				BN.max(ONE, market.amm.fundingPeriod.sub(timeSinceLastOracleTwapUpdate))
			)
		);
		newOracleTwap = oracleTwapTimeSinceLastUpdate
			.mul(oracleTwapWithMantissa)
			.add(oracleInvalidDuration.mul(markTwapWithMantissa))
			.div(oracleTwapTimeSinceLastUpdate.add(oracleInvalidDuration));
	} else if (
		market.amm.lastMarkPriceTwapTs.lt(
			market.amm.historicalOracleData.lastOraclePriceTwapTs
		)
	) {
		// shrink mark to oracle twap over tradless intervals
		const tradelessDuration = BN.max(
			ZERO,
			market.amm.historicalOracleData.lastOraclePriceTwapTs.sub(
				market.amm.lastMarkPriceTwapTs
			)
		);
		const timeSinceLastMarkTwapUpdate = now.sub(market.amm.lastMarkPriceTwapTs);
		const markTwapTimeSinceLastUpdate = BN.max(
			ONE,
			BN.min(
				market.amm.fundingPeriod,
				BN.max(ONE, market.amm.fundingPeriod.sub(timeSinceLastMarkTwapUpdate))
			)
		);
		newMarkTwap = markTwapTimeSinceLastUpdate
			.mul(markTwapWithMantissa)
			.add(tradelessDuration.mul(oracleTwapWithMantissa))
			.div(markTwapTimeSinceLastUpdate.add(tradelessDuration));
	}

	return [newMarkTwap, newOracleTwap];
}

function getTradeSize(requestedTradeSize: number, solAmount: number, action: Side,
    borrow: number, oraclePrice: number,
    minPerp: number, maxPerp: number, health: number, market: "SOL-PERP" | "BTC-PERP" | "ETH-PERP",
    account: string, freeCashLimit: number, minHealth: number
) {
    const freeCash = borrow * freeCashLimit
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
        if (health < minHealth) {
            tradeSize = 0
        }
    } else if (solAmount < 0 && action === Side.BUY) {
        const amt = Math.max(Math.abs(solAmount), maxSize)
        tradeSize = Math.min(requestedTradeSize, amt)
    } else if (solAmount <= 0 && action === Side.SELL) {
        tradeSize = Math.min(requestedTradeSize, maxSize)
        if (health < minHealth) {
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
    shortRateThreshold: number,
    longRateThreshold: number,
    sellPriceBuffer: number,
    buyPriceBuffer: number,
    jupiterSpotSlippage: number,
    freeCashLimit: number,
    minHealth: number
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
        accountDefinition.name, freeCashLimit, minHealth)
    let sellPerpTradeSize = getTradeSize(
        tradeSize, perpAmount,
        Side.SELL, accountDetails.borrow,
        oraclePrice, getMaxShortPerpSize(market, accountDefinition), getMaxLongPerpSize(market, accountDefinition), accountDetails.health, market,
        accountDefinition.name, freeCashLimit, minHealth)

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
        const result = await checkForPriceMismatch(accountDefinition, oraclePrice, bestBid, bestAsk, market, buyPriceBuffer, sellPriceBuffer)
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
                market,
                jupiterSpotSlippage)

            if (SHOULD_CANCEL_ORDERS) {
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
    _buyPriceBuffer: number,
    _sellPriceBuffer: number) {
    const buyPriceBuffer = _buyPriceBuffer * perpPrice
    const sellPriceBuffer = _sellPriceBuffer * perpPrice

    const buySpread = perpPrice - bestAsk
    const sellSpread = bestBid - perpPrice
    console.log(`------ ${accountDefinition.name} PRICE MISMATCH --------`)
    console.log(`BUY  PRICE MISMATCH: BestAsk=${bestAsk.toFixed(2)} Oracle=${perpPrice.toFixed(2)}  Diff=${buySpread.toFixed(2)}`)
    console.log(`SELL PRICE MISMATCH: BestBid=${bestBid.toFixed(2)} Oracle=${perpPrice.toFixed(2)}  Diff=${sellSpread.toFixed(2)}`)
    if (buySpread > buyPriceBuffer * perpPrice && bestAsk > 0) {
        await postToSlackPriceAlert(perpPrice, bestBid, bestAsk, buySpread, sellSpread)
    }
    if (sellSpread > sellPriceBuffer * perpPrice && bestBid > 0) {
        await postToSlackPriceAlert(perpPrice, bestBid, bestAsk, buySpread, sellSpread)
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

async function doubleSwapLoop(UPDATE_GOOGLE_SHEET: boolean = true, SIMULATE_TRADES: boolean = false, SKIP_ZERO_FUNDING:boolean = true) {
    let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
    const googleClient: any = await authorize();
    const googleSheets = google.sheets({ version: 'v4', auth: googleClient });
    const accountDetailList: AccountDetail[] = []
    let lastGoogleUpdate = 0
    let lastFundingRate = 0
    const FUNDING_DIFF = 50
    const CHECK_FEES = false


    while (true) {
        try {
            const drift = await checkDrift("DRIFT");

            const tradingParameters = await getTradingParameters(googleSheets)
            const shouldTradeNow = tradingParameters?.tradingStatus || false
            const accountList = tradingParameters?.accountList
            const shortRateThreshold = tradingParameters?.shortRateThreshold || 100
            const longRateThreshold = tradingParameters?.longRateThreshold || -25
            const sellPriceBuffer = tradingParameters?.sellPriceBuffer || 0.0027
            const buyPriceBuffer = tradingParameters?.buyPriceBuffer || 0.0027
            const jupiterSpotSlippage = tradingParameters?.jupiterSpotSlippage || 5
            const priorityFee = tradingParameters?.priorityFee || 10_000
            const minHealthFactor = tradingParameters?.minHealthFactor || 135
            const driftHealthFactor = tradingParameters?.driftHealthFactor || 175
            const freeCashLimit = tradingParameters?.freeCashLimit || 0.075

            let feeEstimate = Math.min(priorityFee, MAX_FEE)

            accountDetailList.length = 0
            if (CHECK_FEES) {
                let newFeeEstimate = feeEstimate
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
                await postToSlackFunding(fundingRates.solFundingRate)
                lastFundingRate = fundingRates.solFundingRate
            }
            console.log('SOL FUNDING RATE: ', fundingRates.solFundingRate)
            if (fundingRates.solFundingRate === 0 && SKIP_ZERO_FUNDING) {
                console.log('FUNDING RATE IS 0, SLEEPING FOR 5 SECONDS')
                await sleep(10 * 1000)
            } else {
                const newItems = accountDefinitions.map(async (accountDefinition) => {
                    let client = await db.getClient(accountDefinition, feeEstimate)

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

                    const minHealth = accountDefinition.name === "DRIFT" ? driftHealthFactor : minHealthFactor

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
                                    sellPriceBuffer, buyPriceBuffer, jupiterSpotSlippage, freeCashLimit, minHealth)
                                tradeInstructions.push(...result.tradeInstructions)
                                addressLookupTables.push(...result.addressLookupTables)
                                orderIds.push(...result.orderIds)
                            }
                            if (btcTradeSize > 0 && tradeInstructions.length <= 0) {
                                const result = await performSwap(client, accountDefinition,
                                    accountDetails, btcTradeSize, fundingRates.btcFundingRate, client.group, "BTC-PERP", shortRateThreshold, longRateThreshold,
                                    sellPriceBuffer, buyPriceBuffer, jupiterSpotSlippage, freeCashLimit, minHealth)
                                tradeInstructions.push(...result.tradeInstructions)
                                addressLookupTables.push(...result.addressLookupTables)
                                orderIds.push(...result.orderIds)
                            }
                            if (solTradeSize > 0 && tradeInstructions.length <= 0) {
                                const result = await performSwap(client, accountDefinition,
                                    accountDetails, solTradeSize, fundingRates.solFundingRate, client.group, "SOL-PERP", shortRateThreshold, longRateThreshold,
                                    sellPriceBuffer, buyPriceBuffer, jupiterSpotSlippage, freeCashLimit, minHealth)
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
                    const sellRoute = await getBestPrice(Side.SELL, 1, inBank, outBank, jupiterSpotSlippage)
                    const buyRoute = await getBestPrice(Side.BUY, solPrice, outBank, inBank, jupiterSpotSlippage)
                    bestBuyPrice = buyRoute.price
                    bestSellPrice = sellRoute.price
                    if (sellRoute.price > solPrice) {
                        console.log('sell opportunity', sellRoute.price - solPrice)
                    }
                    if (buyRoute.price < solPrice) {
                        console.log('buy opportunity', solPrice - buyRoute.price)
                    }
                }

                
                const private3 = await checkDrift("PRIVATE3");

                const now = Date.now()
                if ((UPDATE_GOOGLE_SHEET || db.getOpenTransactions() > 0) &&
                    (now - lastGoogleUpdate > GOOGLE_UPDATE_INTERVAL) &&
                    accountDetailList.length === accountDefinitions.length) {
                    // update google sheet
                    const driftUpdates: Array<any> = []
                    if (drift) {
                        driftUpdates.push(drift)
                    }
                    if (private3) {
                        driftUpdates.push(private3)
                    }
                    await updateGoogleSheet(fundingRates, googleSheets,
                        accountDetailList, feeEstimate,
                        db.getTransactionCache(), bestBuyPrice,
                        bestSellPrice, solPrice, driftUpdates)
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

function formatUsdc(usdc: any) {
    return usdc / 10 ** 6
}

function formatPerp(usdc: any) {
    return usdc / 10 ** 9
}

function formatSpot(usdc: any) {
    return usdc / 10 ** 6
}

function isDeposit(balanceType: any) {
    return !!balanceType?.deposit
}

function getMaxPriceDivergenceForFundingRate(
	market: PerpMarketAccount,
	oracleTwap: BN
) {
	if (isVariant(market.contractTier, 'a')) {
		return oracleTwap.divn(33);
	} else if (isVariant(market.contractTier, 'b')) {
		return oracleTwap.divn(33);
	} else if (isVariant(market.contractTier, 'c')) {
		return oracleTwap.divn(20);
	} else {
		return oracleTwap.divn(10);
	}
}

function calculateLiveMarkTwap(
	market: PerpMarketAccount,
	oraclePriceData: OraclePriceData,
	markPrice?: BN,
	now?: BN,
	period = new BN(3600)
): BN {
	now = now || new BN((Date.now() / 1000).toFixed(0));

	const lastMarkTwapWithMantissa = market.amm.lastMarkPriceTwap;
	const lastMarkPriceTwapTs = market.amm.lastMarkPriceTwapTs;

	const timeSinceLastMarkChange = now.sub(lastMarkPriceTwapTs);
	const markTwapTimeSinceLastUpdate = BN.max(
		period,
		BN.max(ZERO, period.sub(timeSinceLastMarkChange))
	);

	if (!markPrice) {
		const [bid, ask] = calculateBidAskPrice(market.amm, oraclePriceData);
		markPrice = bid.add(ask).div(new BN(2));
	}

	const markTwapWithMantissa = markTwapTimeSinceLastUpdate
		.mul(lastMarkTwapWithMantissa)
		.add(timeSinceLastMarkChange.mul(markPrice))
		.div(timeSinceLastMarkChange.add(markTwapTimeSinceLastUpdate));

	return markTwapWithMantissa;
}


/**
 *
 * @param market
 * @returns Estimated fee pool size
 */
export function calculateFundingPool(market: PerpMarketAccount): BN {
	// todo
	const totalFeeLB = market.amm.totalExchangeFee.div(new BN(2));
	const feePool = BN.max(
		ZERO,
		market.amm.totalFeeMinusDistributions
			.sub(totalFeeLB)
			.mul(new BN(1))
			.div(new BN(3))
	);
	return feePool;
}

export async function calculateAllEstimatedFundingRate(
	market: PerpMarketAccount,
	oraclePriceData: OraclePriceData,
	markPrice?: BN,
	now?: BN
): Promise<[BN, BN, BN, BN, BN]> {
	if (isVariant(market.status, 'uninitialized')) {
		return [ZERO, ZERO, ZERO, ZERO, ZERO];
	}

	// todo: sufficiently differs from blockchain timestamp?
	now = now || new BN((Date.now() / 1000).toFixed(0));

	// calculate real-time mark and oracle twap
	const liveMarkTwap = calculateLiveMarkTwap(
		market,
		oraclePriceData,
		markPrice,
		now,
		market.amm.fundingPeriod
	);
	const liveOracleTwap = calculateLiveOracleTwap(
		market.amm.historicalOracleData,
		oraclePriceData,
		now,
		market.amm.fundingPeriod
	);
	const [markTwap, oracleTwap] = shrinkStaleTwaps(
		market,
		liveMarkTwap,
		liveOracleTwap,
		now
	);

	// if(!markTwap.eq(liveMarkTwap)){
	// 	console.log('shrink mark:', liveMarkTwap.toString(), '->', markTwap.toString());
	// }

	// if(!oracleTwap.eq(liveOracleTwap)){
	// 	console.log('shrink orac:', liveOracleTwap.toString(), '->', oracleTwap.toString());
	// }

	const twapSpread = markTwap.sub(oracleTwap);
	const twapSpreadWithOffset = twapSpread.add(
		oracleTwap.abs().div(FUNDING_RATE_OFFSET_DENOMINATOR)
	);
	const maxSpread = getMaxPriceDivergenceForFundingRate(market, oracleTwap);

	const clampedSpreadWithOffset = clampBN(
		twapSpreadWithOffset,
		maxSpread.mul(new BN(-1)),
		maxSpread
	);

	const twapSpreadPct = clampedSpreadWithOffset
		.mul(PRICE_PRECISION)
		.mul(new BN(100))
		.div(oracleTwap);

	const secondsInHour = new BN(3600);
	const hoursInDay = new BN(24);
	const timeSinceLastUpdate = now.sub(market.amm.lastFundingRateTs);

	const lowerboundEst = twapSpreadPct
		.mul(market.amm.fundingPeriod)
		.mul(BN.min(secondsInHour, timeSinceLastUpdate))
		.div(secondsInHour)
		.div(secondsInHour)
		.div(hoursInDay);

	const interpEst = twapSpreadPct.div(hoursInDay);

	const interpRateQuote = twapSpreadPct
		.div(hoursInDay)
		.div(PRICE_PRECISION.div(QUOTE_PRECISION));

	let feePoolSize = calculateFundingPool(market);
	if (interpRateQuote.lt(new BN(0))) {
		feePoolSize = feePoolSize.mul(new BN(-1));
	}

	let cappedAltEst: BN;
	let largerSide: BN;
	let smallerSide: BN;
	if (
		market.amm.baseAssetAmountLong.gt(market.amm.baseAssetAmountShort.abs())
	) {
		largerSide = market.amm.baseAssetAmountLong.abs();
		smallerSide = market.amm.baseAssetAmountShort.abs();
		if (twapSpread.gt(new BN(0))) {
			return [markTwap, oracleTwap, lowerboundEst, interpEst, interpEst];
		}
	} else if (
		market.amm.baseAssetAmountLong.lt(market.amm.baseAssetAmountShort.abs())
	) {
		largerSide = market.amm.baseAssetAmountShort.abs();
		smallerSide = market.amm.baseAssetAmountLong.abs();
		if (twapSpread.lt(new BN(0))) {
			return [markTwap, oracleTwap, lowerboundEst, interpEst, interpEst];
		}
	} else {
		return [markTwap, oracleTwap, lowerboundEst, interpEst, interpEst];
	}

	if (largerSide.gt(ZERO)) {
		// funding smaller flow
		cappedAltEst = smallerSide.mul(twapSpread).div(hoursInDay);
		const feePoolTopOff = feePoolSize
			.mul(PRICE_PRECISION.div(QUOTE_PRECISION))
			.mul(AMM_RESERVE_PRECISION);
		cappedAltEst = cappedAltEst.add(feePoolTopOff).div(largerSide);

		cappedAltEst = cappedAltEst
			.mul(PRICE_PRECISION)
			.mul(new BN(100))
			.div(oracleTwap);

		if (cappedAltEst.abs().gte(interpEst.abs())) {
			cappedAltEst = interpEst;
		}
	} else {
		cappedAltEst = interpEst;
	}

	return [markTwap, oracleTwap, lowerboundEst, cappedAltEst, interpEst];
}

async function getPerpInfo(env: "mainnet-beta" | "devnet", symbol: string, driftClient: DriftClient, user: User) {
    const marketInfo = PerpMarkets[env].find(
        (market: any) => market.baseAssetSymbol === symbol
    );
    const marketIndex = marketInfo!.marketIndex;
    const ordacleData = driftClient.getOracleDataForPerpMarket(marketIndex);
    console.log(ordacleData)

    const perpMarketAccount = driftClient.getPerpMarketAccount(marketIndex);
    const fundingRate = perpMarketAccount!.amm.lastFundingRate.toNumber()
    const fundingPeriod = perpMarketAccount!.amm.fundingPeriod.toNumber()
    const fundingRate24H = perpMarketAccount!.amm.last24HAvgFundingRate.toNumber()
    const activePerpPositions = user.getActivePerpPositions()

    const userPosition = activePerpPositions.find(x => x.marketIndex === marketIndex)
    const perpPosition = formatPerp(userPosition?.baseAssetAmount) || 0
    const CONVERSION_SCALE = FUNDING_RATE_BUFFER_PRECISION.mul(PRICE_PRECISION);
    const lastFundingRate = convertToNumber(
        perpMarketAccount!.amm.last24HAvgFundingRate,
        CONVERSION_SCALE
    );

    const ammAccountState = perpMarketAccount!.amm;
    const priceSpread =
        ammAccountState.lastMarkPriceTwap.toNumber() /
        PRICE_PRECISION.toNumber() -
        ammAccountState.historicalOracleData.lastOraclePriceTwap.toNumber() /
        PRICE_PRECISION.toNumber();
    const peroidicity = perpMarketAccount!.amm.fundingPeriod;
    const frontEndFundingCalc =
        priceSpread / ((24 * 3600) / Math.max(1, peroidicity.toNumber()));
    console.log('PERP INFO:'+symbol);
    console.log('fundingRate:', fundingRate);
    console.log('fundingPeriod:', fundingPeriod);
    console.log('fundingRate24H:', fundingRate24H);
    console.log('perpPosition:', perpPosition)
    console.log('frontEndFundingCalc:', frontEndFundingCalc);
    console.log('last funding rate:', lastFundingRate);
    console.log('PRICE_PRECISION:', PRICE_PRECISION.toNumber());
    console.log('perpMarketAccount!.amm.last24HAvgFundingRate:', perpMarketAccount!.amm.last24HAvgFundingRate.toNumber());
    const oraclePriceData = driftClient.getOracleDataForPerpMarket(marketIndex);
    const allFundingRateData = await calculateAllEstimatedFundingRate(perpMarketAccount!,oraclePriceData)
    console.log('allFundingRateData:', allFundingRateData);
    return {
        fundingRate,
        perpPosition,
        fundingRate24H,
        fundingPeriod,
        lastFundingRate:allFundingRateData[4].toNumber()
    }
}


async function checkDrift(account: string) {
    try {
        const env = 'mainnet-beta';
        const URL = HELIUS_ROBO_CONNECTION_URL
        const key = account.toLowerCase() + "Key";
        const wallet = new Wallet(getUser("./secrets/" + key + ".json"))
        const connection = new Connection(URL);

        // Set up the Drift Client
        const driftPublicKey = new PublicKey(DRIFT_PROGRAM_ID);
        const bulkAccountLoader = new BulkAccountLoader(
            connection,
            'confirmed',
            1000
        );
        const driftClient = new DriftClient({
            connection: connection,
            wallet: wallet,
            programID: driftPublicKey,
            accountSubscription: {
                type: 'polling',
                accountLoader: bulkAccountLoader,
            },
        });

        // Subscribe to the Drift Account
        await driftClient.subscribe();
        const user = driftClient.getUser();
        const userAccount = driftClient.getUserAccount()

        const cumulativePerpFunding = userAccount?.cumulativePerpFunding.toNumber() / 10**6
        const cumulativeSpotFees = userAccount?.cumulativeSpotFees.toNumber() / 10**6

        console.log('DRIFT Account:', account);
        const pnl = user.getUnrealizedPNL(true);
        console.log('Unrealized PNL:', formatUsdc(pnl));

        const usdValue = user.getNetUsdValue();
        console.log('Net USD Value:', formatUsdc(usdValue));
        const totalValue = user.getTotalAssetValue();
        console.log('Total Value:', formatUsdc(totalValue));

        const health = user.getHealth()
        console.log('Health:', health)
        const funding = user.getUnrealizedFundingPNL()
        console.log('Funding:', formatUsdc(funding))

        const freeCollateral = user.getFreeCollateral();
        console.log('freeCollateral:', formatUsdc(freeCollateral))

        const totalAllTimePnl = user.getTotalAllTimePnl()
        console.log('Total All Time PNL:', formatUsdc(totalAllTimePnl))
        const perpPositionValue = user.getTotalPerpPositionValue()
        console.log('Total Perp Position Value:', formatUsdc(perpPositionValue))

        let spotPositions = user.getUserAccount().spotPositions
        console.log('Spot Positions:', spotPositions)

        const solPerp = await getPerpInfo(env, 'SOL', driftClient, user)
        const btcPerp = await getPerpInfo(env, 'BTC', driftClient, user)
        const ethPerp = await getPerpInfo(env, 'ETH', driftClient, user)
        const jupPerp =await  getPerpInfo(env, 'JUP', driftClient, user)
        const wPerp = await getPerpInfo(env, 'W', driftClient, user)
        const renderPerp =await getPerpInfo(env, 'RNDR', driftClient, user)

        console.log(SpotMarkets[env])
        const marketInfo = SpotMarkets[env].find(
            (market: any) => market.symbol === "USDC"
        );
        const marketIndex = marketInfo!.marketIndex;
        const usdcSpotMarket = driftClient.getSpotMarketAccount(marketIndex);
        const usdcDepositRate = calculateDepositRate(usdcSpotMarket!)
        const usdcBorrowRate = calculateBorrowRate(usdcSpotMarket!)
        console.log('USDC Deposit Rate:', usdcDepositRate.toNumber());
        console.log('USDC Borrow Rate:', usdcBorrowRate.toNumber());

        const result = {
            account,
            pnl: formatUsdc(pnl),
            usdValue: formatUsdc(usdValue),
            totalValue: formatUsdc(totalValue),
            health: health,
            funding: formatUsdc(funding),
            freeCollateral: formatUsdc(freeCollateral),
            totalAllTimePnl: formatUsdc(totalAllTimePnl),
            perpPositionValue: formatUsdc(perpPositionValue),
            solPerp: solPerp.perpPosition,
            ethPerp: ethPerp.perpPosition,
            jupPerp: jupPerp.perpPosition,
            wPerp: wPerp.perpPosition,
            usdc: formatPerp(spotPositions.find(x => x.marketIndex === 0)?.scaledBalance) * (isDeposit(spotPositions.find(x => x.marketIndex === 0)?.balanceType) ? 1 : -1) || 0,
            w: formatPerp(spotPositions.find(x => x.marketIndex === 13)?.scaledBalance) * (isDeposit(spotPositions.find(x => x.marketIndex === 13)?.balanceType) ? 1 : -1) || 0,
            jup: formatPerp(spotPositions.find(x => x.marketIndex === 11)?.scaledBalance) * (isDeposit(spotPositions.find(x => x.marketIndex === 11)?.balanceType) ? 1 : -1) || 0,
            sol: formatPerp(spotPositions.find(x => x.marketIndex === 1)?.scaledBalance) * (isDeposit(spotPositions.find(x => x.marketIndex === 1)?.balanceType) ? 1 : -1) || 0,
            solFundingRate: solPerp.lastFundingRate,
            ethFundingRate: ethPerp.lastFundingRate,
            jupFundingRate: jupPerp.lastFundingRate,
            wFundingRate: wPerp.lastFundingRate,
            cumulativePerpFunding,
            cumulativeSpotFees,
            renderPerp: renderPerp.perpPosition,
            renderFundingRate: renderPerp.lastFundingRate,
            btcPerp: btcPerp.perpPosition,
            btcFundingRate: btcPerp.lastFundingRate,
            usdcDepositRate:usdcDepositRate.toNumber(),
            usdcBorrowRate:usdcBorrowRate.toNumber()
        }
        console.log(result)
        return result
    } catch (x) {
        console.error(x);
        return null;
    }
}

(async () => {
    try {
        await doubleSwapLoop(true, false, false);
    } catch (error) {
        console.log(error);
    }

})();
