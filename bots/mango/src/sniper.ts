import {
    PerpOrderSide
} from '@blockworks-foundation/mango-v4';
import fs from 'fs';
import {
    CAN_TRADE,
    CHECK_OPEN_ORDERS,
    DEFAULT_PRIORITY_FEE,
    ENFORCE_BEST_PRICE,
    EXTRA_USDC_AMOUNT,
    FEE_DIFF_BUFFER,
    FEE_MULTIPLIER,
    FILTER_TO_ACCOUNTS,
    MAX_FEE,
    MAX_LONG_PERP,
    MAX_PERP_TRADE_SIZE,
    MAX_SHORT_PERP,
    MAX_SPOT_TRADE_SIZE,
    MINUS_THRESHOLD,
    MIN_DIFF_SIZE,
    MIN_SIZE,
    MIN_SOL_WALLET_AMOUNT,
    MIN_SOL_WALLET_BALANCE,
    MIN_USDC_WALLET_AMOUNT,
    NO_TRADE_TIMEOUT,
    PERP_PRICE_BUFFER,
    PLUS_THRESHOLD,
    QUOTE_BUFFER,
    SLEEP_MAIN_LOOP_IN_MINUTES,
    SOL_RESERVE,
    TRADE_SIZE,
    TRANSACTION_EXPIRATION
} from './constants';
import * as db from './db';
import { DB_KEYS } from './db';
import { authorize, updateGoogleSheet } from './googleUtils';
import {
    doDeposit,
    doJupiterTrade,
    doSolWithdrawal,
} from './jupiterUtils';
import {
    getTradePossibilities,
    spotAndPerpSwap,
    spotTrade
} from './mangoSpotUtils';
import {
    perpTrade, sleep, toFixedFloor
} from './mangoUtils';
import {
    AccountDefinition,
    AccountDetail,
    Client,
    PendingTransaction,
    SnipeResponse
} from './types';

const { google } = require('googleapis');
type TradeStrategy = "BUY_PERP_SELL_SPOT" | "SELL_PERP_BUY_SPOT" | "NONE"

function roundToNearestHalf(num: number) {
    return Math.floor(num * 2) / 2;
}

async function getOpenOrders(client: Client, accountDetails: AccountDetail) {
    if (!client.mangoAccount) return 0;
    const orders = await client.mangoAccount.loadPerpOpenOrdersForMarket(
        client.client,
        client.group,
        accountDetails.perpMarket.perpMarketIndex,
        true
    )
    const numOpenOrders = orders.filter(order => !order.isExpired).length
    return numOpenOrders
}

function canIncreaseExposedPosition(hourlyRateAPR: number,
    aprMinThreshold: number,
    aprMaxThreshold: number,
    tradeSize: number,
    action: 'BUY' | 'SELL',
    solAmount: number,
    minPerp: number,
    maxPerp: number) {
    let increaseExposure = (hourlyRateAPR > aprMaxThreshold || hourlyRateAPR < aprMinThreshold) && tradeSize >= MIN_SIZE
    if (action === "BUY" && increaseExposure && solAmount >= maxPerp) {
        increaseExposure = false
    }
    if (action === "SELL" && increaseExposure && solAmount <= minPerp) {
        increaseExposure = false
    }
    return increaseExposure
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

async function determineBuyVsSell(client: Client, spotAmount: number, solPrice: number, usdcBank: any, solBank: any, fundingRate: number) {
    let strategy: TradeStrategy = "NONE"

    const possibilities = await getTradePossibilities(client.client, client.group, solPrice, spotAmount, usdcBank, solBank);
    if (possibilities.buyPerpSellSpot > 0 && fundingRate < 0) {
        strategy = "BUY_PERP_SELL_SPOT"
    } else if (possibilities.sellPerpBuySpot > 0 && fundingRate > 0) {
        strategy = "SELL_PERP_BUY_SPOT"
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
    fundingRate: number) {


    console.log('----- ')
    console.log("FUNDING RATE: ", fundingRate)

    const walletSol = accountDetails.walletSol - SOL_RESERVE
    const { solBalance, solAmount, solBank, usdcBank, solPrice } = accountDetails

    const INCLUDE_WALLET = false
    const MIN_DIFF_SIZE = 0.01

    const spotVsPerpDiff = solBalance + solAmount + (INCLUDE_WALLET ? walletSol : 0)
    const spotUnbalanced = Math.abs(spotVsPerpDiff) > MIN_DIFF_SIZE

    let balanceStrategy: TradeStrategy = "SELL_PERP_BUY_SPOT"
    if (fundingRate < 0) {
        balanceStrategy = "BUY_PERP_SELL_SPOT"
    } else if (fundingRate === 0) {
        balanceStrategy = "NONE"
    }

    const newTradeSize = getTradeSize(
        tradeSize, solAmount,
        balanceStrategy === "BUY_PERP_SELL_SPOT" ? "BUY" : "SELL", accountDetails.borrow,
        accountDefinition, solPrice, MAX_SHORT_PERP, MAX_LONG_PERP)
    console.log("New Trade Size", newTradeSize)

    let spotAmount = newTradeSize
    let perpAmount = newTradeSize

    if (spotUnbalanced) {
        if (balanceStrategy === "SELL_PERP_BUY_SPOT") {
            if (spotVsPerpDiff > 0) {
                spotAmount = 0
                perpAmount = Math.abs(spotVsPerpDiff)
            } else {
                spotAmount = Math.abs(spotVsPerpDiff)
                perpAmount = 0
            }
        } else {
            if (spotVsPerpDiff < 0) {
                spotAmount = 0
                perpAmount = Math.abs(spotVsPerpDiff)
            } else {
                spotAmount = Math.abs(spotVsPerpDiff)
                perpAmount = 0
            }
        }
        balanceStrategy
    }

    if (perpAmount > 0 || spotAmount > 0) {
        const { strategy, possibilities }: any = await determineBuyVsSell(
            client, newTradeSize, solPrice, usdcBank, solBank, fundingRate)

        let tradeStrategy = strategy
        if (spotUnbalanced && tradeStrategy === "NONE") {
            tradeStrategy = balanceStrategy
        }

        if (tradeStrategy === "BUY_PERP_SELL_SPOT") {
            // buy Perp and sell Spot
            console.log(`BUY_PERP_SELL_SPOT: ${possibilities.buyPerpSellSpot}`)
            const perpPrice = possibilities.sellSpotPrice - PERP_PRICE_BUFFER
            if (possibilities.maxBuySize < perpAmount && spotAmount > 0) {
                const diff = perpAmount - possibilities.maxBuySize
                perpAmount = possibilities.maxBuySize
                spotAmount = Math.max(spotAmount - diff, 0)
            }
            await spotAndPerpSwap(
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
                accountDetails.walletSol)
        } else if (tradeStrategy === "SELL_PERP_BUY_SPOT") {
            // sell Perp and buy Spot
            console.log(`SELL_PERP_BUY_SPOT: ${possibilities.sellPerpBuySpot}`)
            const perpPrice = possibilities.buySpotPrice + PERP_PRICE_BUFFER
            if (possibilities.maxSellSize < perpAmount && spotAmount > 0) {
                const diff = perpAmount - possibilities.maxSellSize
                perpAmount = possibilities.maxSellSize
                spotAmount = Math.max(spotAmount - diff, 0)
            }
            await spotAndPerpSwap(
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
                accountDetails.walletSol)
        }
    } else {
        console.log(`${accountDefinition.name}: SKIPPING TRADE DUE TO TRADE SIZE = 0`)
    }
}

async function syncPrices(
    client: Client,
    accountDefinition: AccountDefinition,
    tradeSize: number,
    fundingRate: number
) {
    try {
        if (!client.mangoAccount) {
            throw new Error('Mango account not found: ' + accountDefinition.name)
        }

        const accountDetails = await db.get<AccountDetail>(DB_KEYS.ACCOUNT_DETAILS, {
            cacheKey: accountDefinition.name, params: [
                accountDefinition,
                client.client,
                client.group,
                client.mangoAccount,
                client.user]
        })
        await performSpap(client, accountDefinition, accountDetails, tradeSize, fundingRate)
        return accountDetails
    } catch (e: any) {
        console.error(e.message)
    }
}

async function snipePrices(
    accountDefinition: AccountDefinition,
    requestedTradeSize: number,
    aprMinThreshold: number,
    aprMaxThreshold: number,
    hourlyRateAPR: number,
    minPerp: number,
    maxPerp: number,
    client: Client,
    canTrade: boolean
): Promise<SnipeResponse> {
    let accountDetails: AccountDetail | undefined
    const promises: Array<any> = [];
    try {
        if (!client.mangoAccount) {
            throw new Error('Mango account not found: ' + accountDefinition.name)
        }
        // remove reload because it doesn't seem to work
        // db.get<void>(DB_KEYS.RELOAD_CLIENT, { params: [client], cacheKey: accountDefinition.name, force: canTrade })
        accountDetails = await db.get<AccountDetail>(DB_KEYS.ACCOUNT_DETAILS, {
            cacheKey: accountDefinition.name, params: [
                accountDefinition,
                client.client,
                client.group,
                client.mangoAccount,
                client.user]
        })

        const openTransaction = db.getItem<PendingTransaction>(DB_KEYS.SWAP, { cacheKey: accountDefinition.name })
        const hasOpenTransaction = openTransaction && (openTransaction.status === 'PENDING' || openTransaction.status === 'ORDERED')

        if (hasOpenTransaction) {
            console.log(`Skipping ${accountDefinition.name} due to openTx: ${openTransaction.type} ${openTransaction.amount} ${openTransaction.status}`)
        } else if (!canTrade) {
            console.log(`Skipping ${accountDefinition.name} due to canTrade=${canTrade}`)
        } else if (CHECK_OPEN_ORDERS && await getOpenOrders(client, accountDetails) > 0) {
            console.log(`Skipping ${accountDefinition.name} due to # Open Orders > 0`)
        } else {
            const { solPrice, solBalance,
                borrow, solAmount,
                solBank, usdcBank, perpMarket } = accountDetails
            db.setItem(DB_KEYS.SOL_PRICE, solPrice)
            let action: 'BUY' | 'SELL' = 'BUY'
            if (hourlyRateAPR >= 0) {
                action = 'SELL'
            }

            let tradeSize = getTradeSize(requestedTradeSize, solAmount, action,
                borrow, accountDefinition, solPrice, minPerp, maxPerp)
            let increaseExposure = canIncreaseExposedPosition(hourlyRateAPR,
                aprMinThreshold, aprMaxThreshold, tradeSize,
                action, solAmount, minPerp, maxPerp)

            const walletSol = accountDetails.walletSol - SOL_RESERVE
            const spotVsPerpDiff = solBalance + solAmount + walletSol
            const spotUnbalanced = Math.abs(spotVsPerpDiff) > MIN_DIFF_SIZE

            // check for min wallet balance
            if (accountDetails.walletSol < MIN_SOL_WALLET_BALANCE) {
                // refresh wallet balance
                const borrowAmount = SOL_RESERVE - accountDetails.walletSol
                promises.push(doSolWithdrawal(
                    accountDefinition,
                    client,
                    borrowAmount))
            }

            else if (action === 'BUY') {
                if ((!spotUnbalanced && walletSol > MIN_SOL_WALLET_AMOUNT) || accountDetails.walletUsdc > MIN_USDC_WALLET_AMOUNT) {
                    promises.push(doDeposit(
                        accountDefinition,
                        client,
                        accountDetails.walletUsdc,
                        spotUnbalanced ? 0 : accountDetails.walletSol,
                    ))
                }
                else if ((spotVsPerpDiff < 0 && spotUnbalanced)) {
                    console.log('BUY BACK PERP', hourlyRateAPR, aprMinThreshold)
                    const bestAsk = solPrice - QUOTE_BUFFER
                    tradeSize = spotUnbalanced ? Math.min(MAX_PERP_TRADE_SIZE, Math.abs(spotVsPerpDiff)) : tradeSize
                    const midPrice = (bestAsk + solPrice) / 2

                    if (ENFORCE_BEST_PRICE && midPrice < accountDetails.bestAsk) {
                        console.log('**** SNIPING BUY NOT EXECUTED', `(midPrice)=${midPrice} (bestAsk=${accountDetails.bestAsk}) (Oracle=${solPrice})`)
                    } else {
                        console.log(`**** SNIPING BUY (midPrice)=${midPrice} (bestAsk=${accountDetails.bestAsk}) (Oracle=${solPrice}) (Trade Size=${tradeSize})`)
                        promises.push(perpTrade(client.client, client.group, client.mangoAccount, perpMarket, midPrice, tradeSize, PerpOrderSide.bid, accountDefinition, false))
                    }
                }
                else if (increaseExposure || (spotUnbalanced && spotVsPerpDiff > 0)) {
                    console.log('SELL SOL', tradeSize, spotVsPerpDiff)
                    let amount = Math.min(MAX_SPOT_TRADE_SIZE, Number(Math.abs(spotVsPerpDiff).toFixed(2)))
                    if (!spotUnbalanced) {
                        amount = tradeSize
                    }
                    if (accountDefinition.useMangoSpotTrades) {
                        promises.push(spotTrade(amount, solBank, usdcBank, client.client, client.mangoAccount, client.user, client.group, 'SELL', accountDefinition, solPrice))
                    } else {
                        promises.push(doJupiterTrade(accountDefinition,
                            client, solBank.mint.toString(),
                            usdcBank.mint.toString(),
                            amount, amount * solPrice,
                            accountDetails.walletUsdc,
                            accountDetails.walletSol,
                            solPrice))
                    }
                }



                console.log('BUY PERP:', accountDefinition.name, promises.length, 'new transaction(s)', `Increase Exposure: ${increaseExposure}`)
            }
            else if (action === 'SELL') {
                if ((!spotUnbalanced && accountDetails.walletUsdc > MIN_USDC_WALLET_AMOUNT) || walletSol > MIN_SOL_WALLET_AMOUNT) {
                    promises.push(doDeposit(
                        accountDefinition,
                        client,
                        spotUnbalanced ? 0 : accountDetails.walletUsdc,
                        accountDetails.walletSol,
                    ))
                }
                else if ((spotVsPerpDiff > 0 && spotUnbalanced)) {
                    console.log('SELL PERP', hourlyRateAPR, aprMaxThreshold)
                    const bestBid = solPrice + QUOTE_BUFFER
                    tradeSize = spotUnbalanced ? Math.min(MAX_PERP_TRADE_SIZE, Math.abs(spotVsPerpDiff)) : tradeSize
                    const midPrice = (bestBid + solPrice) / 2
                    if (ENFORCE_BEST_PRICE && midPrice > accountDetails.bestBid) {
                        console.log('**** SNIPING SELL NOT EXECUTED', `(midPrice)=${midPrice} (bestBid=${accountDetails.bestBid}) (Oracle=${solPrice})`)
                    } else {
                        console.log('**** SNIPING SELL', midPrice, "Oracle", solPrice, 'Trade Size', `${tradeSize}`)
                        promises.push(perpTrade(client.client, client.group, client.mangoAccount, perpMarket, midPrice, tradeSize, PerpOrderSide.ask, accountDefinition, false))
                    }
                }
                else if (increaseExposure || (spotUnbalanced && spotVsPerpDiff < 0)) {
                    console.log('BUY SOL', spotVsPerpDiff)
                    const buySize = Math.min(MAX_SPOT_TRADE_SIZE, Math.abs(spotVsPerpDiff))
                    let amount = Number((buySize * solPrice + EXTRA_USDC_AMOUNT).toFixed(2))
                    if (!spotUnbalanced) {
                        amount = Number((tradeSize * solPrice + EXTRA_USDC_AMOUNT).toFixed(2))
                    }

                    if (accountDefinition.useMangoSpotTrades) {
                        promises.push(spotTrade(amount, usdcBank, solBank, client.client, client.mangoAccount, client.user, client.group, 'BUY', accountDefinition, solPrice))
                    } else {
                        promises.push(doJupiterTrade(accountDefinition,
                            client, usdcBank.mint.toString(), solBank.mint.toString(),
                            amount, buySize,
                            accountDetails.walletUsdc,
                            accountDetails.walletSol,
                            solPrice))
                    }
                }


                console.log('SELL PERP', accountDefinition.name, promises.length, 'new transaction(s)', `Increase Exposure: ${increaseExposure}.  TradeSize=${tradeSize}`)
            }
        }
    } catch (e) {
        console.error(`${accountDefinition.name} SNIPE PROCESS ERROR`, e)
    }
    return {
        accountDetails
    }
}

function getActiveTransactions(accountDefinition: AccountDefinition) {
    const transaction = db.getItem<PendingTransaction>(DB_KEYS.SWAP, { cacheKey: accountDefinition.name })
    let numOpenTransactions = 0
    const expiresON = Date.now() - TRANSACTION_EXPIRATION
    if (transaction?.timestamp > expiresON) {
        numOpenTransactions++
    }
    return numOpenTransactions
}

async function doubleSwapLoop() {
    let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
    const googleClient: any = await authorize();
    const googleSheets = google.sheets({ version: 'v4', auth: googleClient });
    const googleUpdateInterval = 60 * 1000
    const accountDetailList: AccountDetail[] = []
    let lastGoogleUpdate = Date.now()
    const UPDATE_GOOGLE_SHEET = false

    const CAN_TRADE_NOW = false

    while (true) {
        try {
            accountDetailList.length = 0
            let feeEstimate = Math.min(DEFAULT_PRIORITY_FEE, MAX_FEE)

            const fundingRate = await db.get<number>(DB_KEYS.FUNDING_RATE)
            if (fundingRate === 0) {
                console.log('FUNDING RATE IS 0, SLEEPING FOR 5 SECONDS')
                await sleep(5 * 1000)
            } else {
                const tradeSize = 2;
                const newItems = accountDefinitions.map(async (accountDefinition) => {
                    let client = await db.get<Client>(DB_KEYS.GET_CLIENT, {
                        params: [accountDefinition, DEFAULT_PRIORITY_FEE],
                        cacheKey: accountDefinition.name,
                        force: true
                    })

                    if (accountDefinition.canTrade && CAN_TRADE_NOW && accountDefinition.name === "DRIFT") {
                        const accountDetails: any = await syncPrices(client, accountDefinition, tradeSize, fundingRate)
                        return accountDetails
                    } else {
                        return db.get<AccountDetail>(DB_KEYS.ACCOUNT_DETAILS, {
                            cacheKey: accountDefinition.name, params: [
                                accountDefinition,
                                client.client,
                                client.group,
                                client.mangoAccount,
                                client.user]
                        })
                    }
                });
                accountDetailList.push(...await Promise.all(newItems))

                const now = Date.now()
                if (UPDATE_GOOGLE_SHEET &&
                    (now - lastGoogleUpdate > googleUpdateInterval) &&
                    accountDetailList.length === accountDefinitions.length) {
                    // update google sheet
                    const openTransactions: PendingTransaction[] = db.getItems([DB_KEYS.SWAP])
                    let numOpenTransactions = 0
                    for (const transaction of openTransactions) {
                        const expiresON = Date.now() - TRANSACTION_EXPIRATION
                        if (transaction.timestamp < expiresON && transaction.status === 'PENDING') {
                            transaction.status = 'EXPIRED'
                            db.incrementItem(DB_KEYS.NUM_TRADES_FAIL, { cacheKey: transaction.type + '-EXPIRED' })
                        }
                        if (transaction.status === 'PENDING' || transaction.status === 'ORDERED') {
                            numOpenTransactions++
                        }
                    }

                    await updateGoogleSheet(googleSheets, accountDetailList, feeEstimate)
                    // end google sheet update
                    lastGoogleUpdate = now
                }
                console.log(`Sleeping for ${SLEEP_MAIN_LOOP_IN_MINUTES} minutes`)
                if (CAN_TRADE_NOW) {
                    await sleep(SLEEP_MAIN_LOOP_IN_MINUTES * 1000 * 60)
                } else {
                    await sleep(1 * 1000 * 60)
                }
            }
        } catch (e: any) {
            console.error(`Error in main loop: ${e.message}`)
            // sleep for 5 seconds  
            await sleep(5000)
        }
    }
}

async function snipePriceLoop(): Promise<void> {
    let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
    if (FILTER_TO_ACCOUNTS.length > 0) {
        accountDefinitions = accountDefinitions.filter((f: any) => FILTER_TO_ACCOUNTS.includes(f.name))
    }
    const googleClient: any = await authorize();
    const googleSheets = google.sheets({ version: 'v4', auth: googleClient });

    let checkAccounts = true
    let feeEstimate = Math.min(DEFAULT_PRIORITY_FEE, MAX_FEE)

    let timeout: NodeJS.Timeout | undefined
    while (true) {
        console.log('Sniping Bot', new Date().toTimeString())
        try {
            const hourlyRateAPR = await db.get<number>(DB_KEYS.FUNDING_RATE)
            const rateInRange = hourlyRateAPR < MINUS_THRESHOLD || hourlyRateAPR > PLUS_THRESHOLD


            if (checkAccounts || rateInRange) {
                let newFeeEstimate = DEFAULT_PRIORITY_FEE
                try {
                    newFeeEstimate = await db.get<number>(DB_KEYS.FEE_ESTIMATE)
                } catch (e: any) {
                    console.error('Error getting fee estimate', e.message)
                }
                const newFee = Math.floor(Math.min(newFeeEstimate * FEE_MULTIPLIER, MAX_FEE))
                const feeDiff = Math.abs(newFee - feeEstimate) > FEE_DIFF_BUFFER
                console.log(`New Fee: ${newFee} New Fee Estimate:${newFeeEstimate} FeeDiff: ${feeDiff} OldFee=${feeEstimate}, FeeMultiplier=${FEE_MULTIPLIER}`)

                for (const accountDefinition of accountDefinitions) {
                    try {
                        const activeTransactions = getActiveTransactions(accountDefinition)
                        const forceNewClient = feeDiff && CAN_TRADE && accountDefinition.canTrade && rateInRange
                        let client = await db.get<Client>(DB_KEYS.GET_CLIENT, {
                            params: [accountDefinition, newFee],
                            cacheKey: accountDefinition.name,
                            force: forceNewClient || activeTransactions > 0
                        })
                        await snipePrices(accountDefinition,
                            TRADE_SIZE,
                            MINUS_THRESHOLD,
                            PLUS_THRESHOLD,
                            hourlyRateAPR,
                            MAX_SHORT_PERP,
                            MAX_LONG_PERP,
                            client,
                            CAN_TRADE && accountDefinition.canTrade)
                    } catch (e) {
                        console.error(`${accountDefinition.name} SNIPE ERROR`, e)
                    }
                }
                if (feeDiff) {
                    console.log(`*** Updating Fee Estimate to ${newFee}.  Old Fee = ${feeEstimate}`)
                    feeEstimate = newFee
                }
            }

            // update google sheet
            const openTransactions: PendingTransaction[] = db.getItems([DB_KEYS.SWAP])
            let numOpenTransactions = 0
            for (const transaction of openTransactions) {
                const expiresON = Date.now() - TRANSACTION_EXPIRATION
                if (transaction.timestamp < expiresON && transaction.status === 'PENDING') {
                    transaction.status = 'EXPIRED'
                    db.incrementItem(DB_KEYS.NUM_TRADES_FAIL, { cacheKey: transaction.type + '-EXPIRED' })
                }
                if (transaction.status === 'PENDING' || transaction.status === 'ORDERED') {
                    numOpenTransactions++
                }
            }

            const accountDetails = db.getItems([DB_KEYS.ACCOUNT_DETAILS])
            await updateGoogleSheet(googleSheets, accountDetails, feeEstimate)

            const solDiff = db.getItems([DB_KEYS.ACCOUNT_DETAILS])
                .filter((f: AccountDetail) =>
                    Math.abs(f.solDiff) > MIN_DIFF_SIZE
                    || f.walletUsdc > MIN_USDC_WALLET_AMOUNT
                    || f.walletSol > MIN_SOL_WALLET_AMOUNT)

            const shouldNotTrade = hourlyRateAPR > MINUS_THRESHOLD && hourlyRateAPR < PLUS_THRESHOLD
                && numOpenTransactions === 0 && solDiff.length === 0
            if (shouldNotTrade && !timeout) {
                checkAccounts = false
                timeout = setTimeout(() => {
                    checkAccounts = true
                    timeout = undefined
                }, NO_TRADE_TIMEOUT * 1000 * 60)
            }

            let sleepAmount = SLEEP_MAIN_LOOP_IN_MINUTES
            console.log('Sleeping for', sleepAmount > 1 ? sleepAmount : sleepAmount * 60, sleepAmount > 1 ? 'minutes' : 'seconds')
            await sleep(sleepAmount * 1000 * 60)
        } catch (e: any) {
            console.error(e.message + ", sleeping for 5 seconds")
            await sleep(5000)
        } finally {
            console.log('  ---------- ')
        }
    }
}

try {
    // snipePriceLoop();
    doubleSwapLoop();
} catch (error) {
    console.log(error);
}
