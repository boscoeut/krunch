import {
    PerpOrderSide
} from '@blockworks-foundation/mango-v4';
import fs from 'fs';
import { authorize, updateGoogleSheet } from './googleUtils';
import {
    getAccountData, fetchRefreshKey,
    getFundingRate, perpTrade, setupClient, sleep, 
    fetchJupPrice
} from './mangoUtils';
import {
    spotTrade
} from './mangoSpotUtils';
import {
    doJupiterTrade, doDeposit
} from './jupiterUtils';
import {
    AccountDefinition,
    AccountDetail,
    Client,
    JupiterSwap,
    PendingTransaction,
    SnipeResponse
} from './types';
import {
    ENFORCE_BEST_PRICE,
    TRADE_SIZE, MINUS_THRESHOLD,
    MIN_SIZE, MAX_SPOT_TRADE_SIZE,
    CAN_TRADE, SLEEP_MAIN_LOOP,
    PLUS_THRESHOLD, MAX_SHORT_PERP, MAX_LONG_PERP,
    MIN_DIFF_SIZE, EXTRA_USDC_AMOUNT, QUOTE_BUFFER,
    FILTER_TO_ACCOUNTS,
    TRANSACTION_EXPIRATION,
    MAX_PERP_TRADE_SIZE,
    SOL_RESERVE,
    MIN_SOL_WALLET_AMOUNT,
    MIN_USDC_WALLET_AMOUNT,
    NO_TRADE_TIMEOUT
} from './constants';
import { getItem } from './db'
import { DB_KEYS, incrementItem } from './db';

const { google } = require('googleapis');

function roundToNearestHalf(num: number) {
    return Math.floor(num * 2) / 2;
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
    openTransactions: Array<PendingTransaction>,
    canTrade: boolean
): Promise<SnipeResponse> {
    let accountDetails: AccountDetail | undefined
    const promises: Array<PendingTransaction> = [];
    try {
        if (!client.mangoAccount) {
            throw new Error('Mango account not found: ' + accountDefinition.name)
        }

        const lastRefresh = new Date()
        const needsRefresh = fetchRefreshKey(accountDefinition.name, lastRefresh) != lastRefresh
        if (canTrade || needsRefresh) {
            console.log('Reloading Mango Account', accountDefinition.name)
            await Promise.all([
                client.mangoAccount.reload(client.client),
                client.group.reloadBanks(client.client, client.ids),
                client.group.reloadPerpMarkets(client.client, client.ids),
                client.group.reloadPerpMarketOraclePrices(client.client),
            ]);
        }

        accountDetails = await getAccountData(accountDefinition,
            client.client,
            client.group,
            client.mangoAccount,
            client.user)

        const orders = await client.mangoAccount.loadPerpOpenOrdersForMarket(
            client.client,
            client.group,
            accountDetails.perpMarket.perpMarketIndex,
            true
        )
        const numOpenOrders = orders.filter(order => !order.isExpired).length


        if (openTransactions.length > 0) {
            console.log(`Skipping ${accountDefinition.name} due to openTx=${openTransactions.length}`)
        } else if (numOpenOrders > 0) {
            console.log(`Skipping ${accountDefinition.name} due to # Open Orders=${numOpenOrders}`)
        } else if (!canTrade) {
            console.log(`Skipping ${accountDefinition.name} due to canTrade=${canTrade}`)
        } else {
            const { solPrice, solBalance,
                borrow, solAmount,
                solBank, usdcBank, perpMarket } = accountDetails
            let action: 'HOLD' | 'BUY' | 'SELL' = 'HOLD'
            if (hourlyRateAPR < 0) {
                action = 'BUY'
            } else {
                action = 'SELL'
            }

            const freeCash = borrow - accountDefinition.healthThreshold
            let maxSize = freeCash > 0 ? (freeCash / solPrice) / 2.1 : 0
            maxSize = roundToNearestHalf(maxSize)

            if (action === 'BUY' && solAmount < maxPerp) {
                maxSize = Math.min(maxSize, maxPerp - solAmount)
            }
            if (action === 'SELL' && solAmount > minPerp) {
                maxSize = Math.min(maxSize, Math.abs(minPerp) + solAmount)
            }

            const optimalSize = maxSize

            let tradeSize = requestedTradeSize

            if (solAmount > 0 && action === "BUY") {
                tradeSize = Math.min(requestedTradeSize, optimalSize)
            } else if (solAmount < 0 && action === "BUY") {
                tradeSize = Math.min(requestedTradeSize, Math.abs(solAmount))
            } else if (solAmount < 0 && action === "SELL") {
                tradeSize = Math.min(requestedTradeSize, optimalSize)
            } else if (solAmount > 0 && action === "SELL") {
                tradeSize = Math.min(requestedTradeSize, Math.abs(solAmount))
            }
            let increaseExposure = (hourlyRateAPR > aprMaxThreshold || hourlyRateAPR < aprMinThreshold) && tradeSize >= MIN_SIZE
            if (action === "BUY" && increaseExposure && solAmount >= maxPerp) {
                increaseExposure = false
            }
            if (action === "SELL" && increaseExposure && solAmount <= minPerp) {
                increaseExposure = false
            }
            const walletSol = accountDetails.walletSol - SOL_RESERVE
            const spotVsPerpDiff = solBalance + solAmount + walletSol

            const spotUnbalanced = Math.abs(spotVsPerpDiff) > MIN_DIFF_SIZE

            if (action === 'BUY') {
                if (!spotUnbalanced && (walletSol > MIN_SOL_WALLET_AMOUNT || accountDetails.walletUsdc > MIN_USDC_WALLET_AMOUNT)) {
                    promises.push({
                        type: 'JUPSWAP',
                        accountName: accountDefinition.name,
                        side: 'SELL',
                        oracle: solPrice,
                        amount: walletSol,
                        timestamp: new Date().getTime(),
                        price: solPrice,
                        promise: doDeposit(
                            accountDefinition,
                            client, 
                            accountDetails.walletUsdc,
                            accountDetails.walletSol,
                        )
                    })
                } else if (spotUnbalanced && spotVsPerpDiff > 0) {
                    console.log('SELL SOL', tradeSize, spotVsPerpDiff)
                    const amount = Math.min(MAX_SPOT_TRADE_SIZE, Number(Math.abs(spotVsPerpDiff).toFixed(2)))
                    if (accountDefinition.useMangoSpotTrades) {
                        promises.push({
                            type: 'SWAP',
                            accountName: accountDefinition.name,
                            side: 'SELL',
                            oracle: solPrice,
                            timestamp: new Date().getTime(),
                            amount,
                            price: solPrice,
                            promise: spotTrade(amount, solBank, usdcBank, client.client, client.mangoAccount, client.user, client.group, 'SELL', accountDefinition)
                        })
                    } else {
                        promises.push({
                            type: 'JUPSWAP',
                            accountName: accountDefinition.name,
                            side: 'SELL',
                            timestamp: new Date().getTime(),
                            oracle: solPrice,
                            amount,
                            price: solPrice,
                            promise: doJupiterTrade(accountDefinition,
                                client, solBank.mint.toString(),
                                usdcBank.mint.toString(),
                                amount, amount * solPrice,
                                accountDetails.walletUsdc,
                                accountDetails.walletSol,
                                solPrice)
                        })
                    }
                }
                else if (increaseExposure || (spotVsPerpDiff < 0 && spotUnbalanced)) {
                    console.log('BUY BACK PERP', hourlyRateAPR, aprMinThreshold)
                    const bestAsk = solPrice - QUOTE_BUFFER
                    tradeSize = spotUnbalanced ? Math.min(MAX_PERP_TRADE_SIZE, Math.abs(spotVsPerpDiff)) : tradeSize
                    const midPrice = (bestAsk + solPrice) / 2

                    if (ENFORCE_BEST_PRICE && midPrice < accountDetails.bestAsk) {
                        console.log('**** SNIPING BUY NOT EXECUTED', `(midPrice)=${midPrice} (bestAsk=${accountDetails.bestAsk}) (Oracle=${solPrice})`)
                    } else {
                        console.log(`**** SNIPING BUY (midPrice)=${midPrice} (bestAsk=${accountDetails.bestAsk}) (Oracle=${solPrice}) (Trade Size=${tradeSize})`)
                        promises.push({
                            type: 'PERP',
                            side: 'BUY',
                            timestamp: new Date().getTime(),
                            oracle: solPrice,
                            amount: tradeSize,
                            price: midPrice,
                            accountName: accountDefinition.name,
                            promise: perpTrade(client.client, client.group, client.mangoAccount, perpMarket, midPrice, tradeSize, PerpOrderSide.bid, accountDefinition, false)
                        })
                    }
                }
                console.log('BUY PERP:', promises.length, 'new transaction(s)')
            }
            if (action === 'SELL') {
                if (!spotUnbalanced && (walletSol > MIN_SOL_WALLET_AMOUNT || accountDetails.walletUsdc > MIN_USDC_WALLET_AMOUNT)) {
                    promises.push({
                        type: 'JUPSWAP',
                        accountName: accountDefinition.name,
                        side: 'BUY',
                        oracle: solPrice,
                        amount: accountDetails.walletUsdc,
                        timestamp: new Date().getTime(),
                        price: solPrice,
                        promise: doDeposit(
                            accountDefinition,
                            client, 
                            accountDetails.walletUsdc,
                            accountDetails.walletSol,
                        )
                    })
                } else if (spotUnbalanced && spotVsPerpDiff < 0) {
                    console.log('BUY SOL', spotVsPerpDiff)
                    const buySize = Math.min(MAX_SPOT_TRADE_SIZE, Math.abs(spotVsPerpDiff))
                    const amount = Number((buySize * solPrice + EXTRA_USDC_AMOUNT).toFixed(2))
                    if (accountDefinition.useMangoSpotTrades) {
                        promises.push({
                            type: 'SWAP',
                            accountName: accountDefinition.name,
                            side: 'BUY',
                            oracle: solPrice,
                            timestamp: new Date().getTime(),
                            amount,
                            price: solPrice,
                            promise: spotTrade(amount, usdcBank, solBank, client.client, client.mangoAccount, client.user, client.group, 'BUY', accountDefinition)
                        })
                    } else {
                        promises.push({
                            type: 'JUPSWAP',
                            accountName: accountDefinition.name,
                            side: 'BUY',
                            oracle: solPrice,
                            amount,
                            timestamp: new Date().getTime(),
                            price: solPrice,
                            promise: doJupiterTrade(accountDefinition,
                                client, usdcBank.mint.toString(), solBank.mint.toString(),
                                amount, buySize,
                                accountDetails.walletUsdc,
                                accountDetails.walletSol,
                                solPrice)
                        })
                    }
                }
                else if (increaseExposure || (spotVsPerpDiff > 0 && spotUnbalanced)) {
                    console.log('SELL PERP', hourlyRateAPR, aprMaxThreshold)
                    const bestBid = solPrice + QUOTE_BUFFER
                    tradeSize = spotUnbalanced ? Math.min(MAX_PERP_TRADE_SIZE, Math.abs(spotVsPerpDiff)) : tradeSize
                    const midPrice = (bestBid + solPrice) / 2
                    if (ENFORCE_BEST_PRICE && midPrice > accountDetails.bestBid) {
                        console.log('**** SNIPING SELL NOT EXECUTED', `(midPrice)=${midPrice} (bestBid=${accountDetails.bestBid}) (Oracle=${solPrice})`)
                    } else {
                        console.log('**** SNIPING SELL', midPrice, "Oracle", solPrice, 'Trade Size', `${tradeSize}`)
                        promises.push({
                            type: 'PERP',
                            oracle: solPrice,
                            amount: tradeSize,
                            price: midPrice,
                            side: 'SELL',
                            timestamp: new Date().getTime(),
                            accountName: accountDefinition.name,
                            promise: perpTrade(client.client, client.group, client.mangoAccount, perpMarket, midPrice, tradeSize, PerpOrderSide.ask, accountDefinition, false)
                        })
                    }
                }
                console.log('SELL PERP', promises.length, 'new transaction(s)')
            }
        }
    } catch (e) {
        console.error(`${accountDefinition.name} SNIPE PROCESS ERROR`, e)
    }
    return {
        promises,
        accountDetails
    }
}

async function main(): Promise<void> {
    let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
    if (FILTER_TO_ACCOUNTS.length > 0) {
        accountDefinitions = accountDefinitions.filter((f: any) => FILTER_TO_ACCOUNTS.includes(f.name))
    }
    const clients: Map<string, any> = new Map()
    const googleClient: any = await authorize();
    const googleSheets = google.sheets({ version: 'v4', auth: googleClient });

    let openTransactions: Array<PendingTransaction> = []
    let successfulTransactions = 0
    let failedTransactions = 0
    while (true) {
        console.log('Sniping Bot', new Date().toTimeString())
        try {
            let numberOfTransactions = 0
            const hourlyRate = await getFundingRate()
            const hourlyRateAPR = Number((hourlyRate * 100 * 24 * 365).toFixed(3))
            console.log(`hourlyRateAPR = ${hourlyRateAPR}%`)

            const prices = await fetchJupPrice()

            const run: any = []
            for (const accountDefinition of accountDefinitions) {
                // check for open transactions
                const openTxs = openTransactions.filter((transaction) => transaction.accountName === accountDefinition.name)

                try {
                    let client = clients.get(accountDefinition.name)
                    if (!client) {
                        client = await setupClient(accountDefinition)
                        clients.set(accountDefinition.name, client)
                    }
                    const result = await snipePrices(accountDefinition,
                        TRADE_SIZE,
                        MINUS_THRESHOLD,
                        PLUS_THRESHOLD,
                        hourlyRateAPR,
                        MAX_SHORT_PERP,
                        MAX_LONG_PERP,
                        client,
                        openTxs,
                        CAN_TRADE && accountDefinition.canTrade)
                    run.push(result)
                } catch (e) {
                    console.error(`${accountDefinition.name} SNIPE ERROR`, e)
                }
            }

            for (const snipeResponses of run) {
                // promises
                numberOfTransactions += snipeResponses?.promises.length || 0
                for (const transaction of snipeResponses.promises) {
                    openTransactions.push(transaction)
                    transaction.promise.then((result: any) => {
                        successfulTransactions++
                        const cacheKey = 'JUPSWAP' + transaction.accountName
                        const jupSwap: JupiterSwap = getItem(cacheKey)
                        const key = transaction.type === 'JUPSWAP' ? 'JUP-' + jupSwap.stage : transaction.type
                        let name = DB_KEYS.NUM_TRADES_SUCCESS
                        if (transaction.type === 'JUPSWAP' && !jupSwap.failed) {
                            name = DB_KEYS.NUM_TRADES_FAIL
                        }
                        failedTransactions++
                        incrementItem(key + '_' + name, 1)
                    }).catch((error: any) => {
                        const cacheKey = 'JUPSWAP' + transaction.accountName
                        const jupSwap: JupiterSwap = getItem(cacheKey)
                        const key = transaction.type === 'JUPSWAP' ? 'JUP-' + jupSwap.stage : transaction.type
                        failedTransactions++
                        incrementItem(key + '_' + DB_KEYS.NUM_TRADES_FAIL, 1)
                    }).finally(() => {
                        openTransactions.splice(openTransactions.indexOf(transaction), 1)
                    })
                }
            }

            // update google sheet
            const accountDetails: AccountDetail[] = run.map((result: any) => result.accountDetails).filter((f: any) => f !== undefined) as AccountDetail[]
            await updateGoogleSheet(googleSheets, accountDetails, hourlyRate, accountDetails[0].solPrice, openTransactions, prices.jupPrice, prices.solPrice)

            let sleepAmount = SLEEP_MAIN_LOOP
            if (hourlyRateAPR > MINUS_THRESHOLD && hourlyRateAPR < PLUS_THRESHOLD) {
                sleepAmount = NO_TRADE_TIMEOUT
            }
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
    main();
} catch (error) {
    console.log(error);
}
