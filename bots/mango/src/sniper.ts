import {
    PerpOrderSide
} from '@blockworks-foundation/mango-v4';
import fs from 'fs';
import { authorize, updateGoogleSheet } from './googleUtils';
import {
    getAccountData,
    getFundingRate, perpTrade, setupClient, sleep, spotTrade
} from './mangoUtils';
import {
    AccountDefinition,
    AccountDetail,
    Client,
    PendingTransaction,
    SnipeResponse
} from './types';
import { TRADE_SIZE, MINUS_THRESHOLD, 
    MIN_SIZE, MAX_SPOT_TRADE,
    PLUS_THRESHOLD, MIN_PERP, MAX_PERP } from './constants';

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
        await client.mangoAccount.reload(client.client);
        accountDetails = await getAccountData(accountDefinition,
            client.client,
            client.group,
            client.mangoAccount)

        if (openTransactions.length > 0 || !canTrade) {
            console.log(`Skipping ${accountDefinition.name} due to openTx=${openTransactions.length} or canTrade=${canTrade}`)
        } else {
            await client.group.reloadBanks(client.client, client.ids);
            await client.group.reloadPerpMarkets(client.client, client.ids);
            await client.group.reloadPerpMarketOraclePrices(client.client);

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
            let increaseExposure = (hourlyRateAPR > aprMaxThreshold || hourlyRateAPR < aprMinThreshold) && tradeSize > MIN_SIZE
            if (action === "BUY" && increaseExposure && solAmount >= maxPerp) {
                increaseExposure = false
            }
            if (action === "SELL" && increaseExposure && solAmount <= minPerp) {
                increaseExposure = false
            }
            const spotVsPerpDiff = solBalance + solAmount
            const MIN_DIFF_SIZE = 0.02
            const EXTRA_USDC_AMOUNT = 0.02
            const QUOTE_BUFFER = 0.04
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
    const CAN_TRADE = false
    const NUM_MINUTES = CAN_TRADE ? 0.5 : 2
    const names = ['BIRD', 'SIX']
    const accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
    // .filter((f: any) => names.includes(f.name));
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
                        MIN_PERP,
                        MAX_PERP,
                        client,
                        openTxs,
                        CAN_TRADE)
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
            console.log('Sleeping for', NUM_MINUTES > 1 ? NUM_MINUTES : NUM_MINUTES * 60, NUM_MINUTES > 1 ? 'minutes' : 'seconds')
            await sleep(NUM_MINUTES * 1000 * 60)
        } catch (e: any) {
            console.error(e.message + ", sleeping for 5 seconds")
            await sleep(5000)
        }
    }
}

try {
    main();
} catch (error) {
    console.log(error);
}
