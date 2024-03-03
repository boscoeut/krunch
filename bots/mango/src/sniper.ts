import {
    PerpOrderSide
} from '@blockworks-foundation/mango-v4';
import fs from 'fs';
import { authorize, updateGoogleSheet } from './googleUtils';
import {
    getAccountData, fetchRefreshKey,
    getFundingRate, perpTrade, setupClient, sleep, spotTrade
} from './mangoUtils';
import {
    AccountDefinition,
    AccountDetail,
    Client,
    PendingTransaction,
    SnipeResponse
} from './types';
import {
    ENFORCE_BEST_PRICE,
    TRADE_SIZE, MINUS_THRESHOLD,
    ORDER_EXPIRATION,
    MIN_SIZE, MAX_SPOT_TRADE,
    CAN_TRADE, SLEEP_MAIN_LOOP,
    PLUS_THRESHOLD, MAX_SHORT_PERP, MAX_LONG_PERP,
    MIN_DIFF_SIZE, EXTRA_USDC_AMOUNT, QUOTE_BUFFER,
    FILTER_TO_ACCOUNTS
} from './constants';

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
        if (canTrade || fetchRefreshKey(accountDefinition.name, lastRefresh) != lastRefresh) {
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
            client.mangoAccount)

        // check existing orders
        const orders = await client.mangoAccount.loadPerpOpenOrdersForMarket(
            client.client,
            client.group,
            accountDetails.perpMarket.perpMarketIndex,
        )
        const now = new Date()
        let hasExpiredOrders = false
        let hasOpenOrders = orders.length > 0
        const tenMinutes = ORDER_EXPIRATION
        for (const order of orders) {
            const side = order.side === PerpOrderSide.bid ? 'BUY' : 'SELL'
            const size = order.uiSize
            const price = order.uiPrice
            const timestamp = new Date(1000 * order.timestamp)
            const elapsedTime = now.getTime() - timestamp.getTime()
            if (elapsedTime > tenMinutes) {
                console.log('order expired', elapsedTime, 'ms')
                hasExpiredOrders = true
                break
            }
        }

        if (hasExpiredOrders) {
            // cancel open orders
            await client.client.perpCancelAllOrdersIx(
                client.group,
                client.mangoAccount,
                accountDetails.perpMarket.perpMarketIndex,
                10,
            )
            hasOpenOrders = false
        }

        if (hasOpenOrders) {
            console.log('hasOpenOrders', accountDefinition.name, orders.length)
        } else if (openTransactions.length > 0 || !canTrade) {
            console.log(`Skipping ${accountDefinition.name} due to openTx=${openTransactions.length} or canTrade=${canTrade}`)
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
            const spotVsPerpDiff = solBalance + solAmount

            const spotUnbalanced = Math.abs(spotVsPerpDiff) > MIN_DIFF_SIZE

            if (action === 'BUY') {
                if (spotVsPerpDiff > 0 && spotUnbalanced) {
                    console.log('SELL SOL', tradeSize, spotVsPerpDiff)
                    const amount = Math.min(MAX_SPOT_TRADE, requestedTradeSize, Number(Math.abs(spotVsPerpDiff).toFixed(2)))
                    promises.push({
                        type: 'SWAP',
                        accountName: accountDefinition.name,
                        side: 'SELL',
                        oracle: solPrice,
                        amount,
                        price: solPrice,
                        promise: spotTrade(amount, solBank, usdcBank, client.client, client.mangoAccount, client.user, client.group, 'SELL', accountDefinition)
                    })
                }
                else if (spotUnbalanced || increaseExposure) {
                    console.log('BUY BACK PERP', hourlyRateAPR, aprMinThreshold)
                    const bestAsk = solPrice - QUOTE_BUFFER
                    tradeSize = spotUnbalanced ? Math.min(tradeSize, Math.abs(spotVsPerpDiff)) : tradeSize
                    const midPrice = (bestAsk + solPrice) / 2

                    if (ENFORCE_BEST_PRICE && midPrice < accountDetails.bestAsk) {
                        console.log('**** SNIPING BUY NOT EXECUTED', `(midPrice)=${midPrice} (bestAsk=${accountDetails.bestAsk}) (Oracle=${solPrice})`)
                    } else {
                        console.log('**** SNIPING BUY', midPrice, "Oracle", solPrice, 'Trade size', `${tradeSize}`)
                        promises.push({
                            type: 'PERP',
                            side: 'BUY',
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
                if (spotVsPerpDiff < 0 && spotUnbalanced) {
                    console.log('BUY SOL', spotVsPerpDiff)
                    const buySize = Math.min(MAX_SPOT_TRADE, requestedTradeSize, Math.abs(spotVsPerpDiff))
                    const amount = Number((buySize * solPrice + EXTRA_USDC_AMOUNT).toFixed(2))
                    promises.push({
                        type: 'SWAP',
                        accountName: accountDefinition.name,
                        side: 'BUY',
                        oracle: solPrice,
                        amount,
                        price: solPrice,
                        promise: spotTrade(amount, usdcBank, solBank, client.client, client.mangoAccount, client.user, client.group, 'BUY', accountDefinition)
                    })
                }
                else if (spotUnbalanced || increaseExposure) {
                    console.log('SELL PERP', hourlyRateAPR, aprMaxThreshold)
                    const bestBid = solPrice + QUOTE_BUFFER
                    tradeSize = spotUnbalanced ? Math.min(tradeSize, Math.abs(spotVsPerpDiff)) : tradeSize
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

    const openTransactions: Array<PendingTransaction> = []
    let successfulTransactions = 0
    let failedTransactions = 0
    while (true) {
        console.log('Sniping Bot', new Date().toTimeString())
        try {
            let numberOfTransactions = 0
            const hourlyRate = await getFundingRate()
            const hourlyRateAPR = Number((hourlyRate * 100 * 24 * 365).toFixed(3))

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
            const results = await Promise.all(run)
            for (const snipeResponses of results) {
                // promises
                numberOfTransactions += snipeResponses?.promises.length || 0
                for (const transaction of snipeResponses.promises) {
                    openTransactions.push(transaction)
                    transaction.promise.then((result: any) => {
                        successfulTransactions++
                    }).catch((error: any) => {
                        failedTransactions++
                    }).finally(() => {
                        openTransactions.splice(openTransactions.indexOf(transaction), 1)
                    })
                }
            }

            for (const tx of openTransactions) {
                console.log(` > ${tx.accountName} ${tx.type} ${tx.side} AMT=${tx.amount} PRICE=${tx.price} ORACLE=${tx.oracle}`)
            }

            // update google sheet
            const accountDetails: AccountDetail[] = results.map((result) => result.accountDetails).filter((f) => f !== undefined) as AccountDetail[]
            await updateGoogleSheet(googleSheets, accountDetails, hourlyRate, accountDetails[0].solPrice, openTransactions)
            console.log('Sleeping for', SLEEP_MAIN_LOOP > 1 ? SLEEP_MAIN_LOOP : SLEEP_MAIN_LOOP * 60, SLEEP_MAIN_LOOP > 1 ? 'minutes' : 'seconds')
            await sleep(SLEEP_MAIN_LOOP * 1000 * 60)
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
