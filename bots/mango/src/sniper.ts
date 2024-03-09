import {
    PerpOrderSide
} from '@blockworks-foundation/mango-v4';
import fs from 'fs';
import {
    CAN_TRADE,
    ENFORCE_BEST_PRICE,
    EXTRA_USDC_AMOUNT,
    FILTER_TO_ACCOUNTS,
    MAX_LONG_PERP,
    MAX_PERP_TRADE_SIZE,
    MAX_SHORT_PERP,
    MAX_SPOT_TRADE_SIZE,
    MINUS_THRESHOLD,
    MIN_DIFF_SIZE,
    MIN_SIZE,
    MIN_SOL_WALLET_AMOUNT,
    MIN_USDC_WALLET_AMOUNT,
    NO_TRADE_TIMEOUT,
    PLUS_THRESHOLD,
    QUOTE_BUFFER,
    SLEEP_MAIN_LOOP,
    SOL_RESERVE,
    TRADE_SIZE
} from './constants';
import * as db from './db';
import { DB_KEYS } from './db';
import { authorize, updateGoogleSheet } from './googleUtils';
import {
    doDeposit,
    doJupiterTrade
} from './jupiterUtils';
import {
    spotTrade
} from './mangoSpotUtils';
import {
    getAccountData,
    perpTrade, sleep
} from './mangoUtils';
import {
    AccountDefinition,
    AccountDetail,
    Client,
    PendingTransaction,
    SnipeResponse
} from './types';

const { google } = require('googleapis');

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

    return tradeSize

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
    const promises: Array<PendingTransaction> = [];
    try {
        if (!client.mangoAccount) {
            throw new Error('Mango account not found: ' + accountDefinition.name)
        }

        db.get<void>(DB_KEYS.RELOAD_CLIENT, { params: [client], cacheKey: accountDefinition.name, force: canTrade })

        accountDetails = await db.get<AccountDetail>(DB_KEYS.ACCOUNT_DETAILS, {
            cacheKey: accountDefinition.name, params: [
                accountDefinition,
                client.client,
                client.group,
                client.mangoAccount,
                client.user]
        })

        const hasOpenTransaction = db.getItem<PendingTransaction>(DB_KEYS.SWAP, { cacheKey: accountDefinition.name })?.status !== 'COMPLETE'

        if (hasOpenTransaction) {
            console.log(`Skipping ${accountDefinition.name} due to openTx`)
        } else if (!canTrade) {
            console.log(`Skipping ${accountDefinition.name} due to canTrade=${canTrade}`)
        } else if (await getOpenOrders(client, accountDetails) > 0) {
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

            if (action === 'BUY') {
                if (!spotUnbalanced && (walletSol > MIN_SOL_WALLET_AMOUNT || accountDetails.walletUsdc > MIN_USDC_WALLET_AMOUNT)) {
                    doDeposit(
                        accountDefinition,
                        client,
                        accountDetails.walletUsdc,
                        accountDetails.walletSol,
                    )
                } else if (spotUnbalanced && spotVsPerpDiff > 0) {
                    console.log('SELL SOL', tradeSize, spotVsPerpDiff)
                    const amount = Math.min(MAX_SPOT_TRADE_SIZE, Number(Math.abs(spotVsPerpDiff).toFixed(2)))
                    if (accountDefinition.useMangoSpotTrades) {
                        spotTrade(amount, solBank, usdcBank, client.client, client.mangoAccount, client.user, client.group, 'SELL', accountDefinition)
                    } else {
                        doJupiterTrade(accountDefinition,
                            client, solBank.mint.toString(),
                            usdcBank.mint.toString(),
                            amount, amount * solPrice,
                            accountDetails.walletUsdc,
                            accountDetails.walletSol,
                            solPrice)
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
                        perpTrade(client.client, client.group, client.mangoAccount, perpMarket, midPrice, tradeSize, PerpOrderSide.bid, accountDefinition, false)
                    }
                }
                console.log('BUY PERP:', accountDefinition.name, promises.length, 'new transaction(s)')
            }
            if (action === 'SELL') {
                if (!spotUnbalanced && (walletSol > MIN_SOL_WALLET_AMOUNT || accountDetails.walletUsdc > MIN_USDC_WALLET_AMOUNT)) {
                    doDeposit(
                        accountDefinition,
                        client,
                        accountDetails.walletUsdc,
                        accountDetails.walletSol,
                    )
                } else if (spotUnbalanced && spotVsPerpDiff < 0) {
                    console.log('BUY SOL', spotVsPerpDiff)
                    const buySize = Math.min(MAX_SPOT_TRADE_SIZE, Math.abs(spotVsPerpDiff))
                    const amount = Number((buySize * solPrice + EXTRA_USDC_AMOUNT).toFixed(2))
                    if (accountDefinition.useMangoSpotTrades) {
                        spotTrade(amount, usdcBank, solBank, client.client, client.mangoAccount, client.user, client.group, 'BUY', accountDefinition)
                    } else {
                        doJupiterTrade(accountDefinition,
                            client, usdcBank.mint.toString(), solBank.mint.toString(),
                            amount, buySize,
                            accountDetails.walletUsdc,
                            accountDetails.walletSol,
                            solPrice)
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
                        perpTrade(client.client, client.group, client.mangoAccount, perpMarket, midPrice, tradeSize, PerpOrderSide.ask, accountDefinition, false)
                    }
                }
                console.log('SELL PERP', accountDefinition.name, promises.length, 'new transaction(s)')
            }
        }
    } catch (e) {
        console.error(`${accountDefinition.name} SNIPE PROCESS ERROR`, e)
    }
    return {
        accountDetails
    }
}

async function main(): Promise<void> {
    let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
    if (FILTER_TO_ACCOUNTS.length > 0) {
        accountDefinitions = accountDefinitions.filter((f: any) => FILTER_TO_ACCOUNTS.includes(f.name))
    }
    const googleClient: any = await authorize();
    const googleSheets = google.sheets({ version: 'v4', auth: googleClient });

    while (true) {
        console.log('Sniping Bot', new Date().toTimeString())
        try {
            const hourlyRateAPR = await db.get<number>(DB_KEYS.FUNDING_RATE)            
            
            for (const accountDefinition of accountDefinitions) {
                try {
                    let client = await db.get<Client>(DB_KEYS.GET_CLIENT, { params: [accountDefinition], cacheKey: accountDefinition.name })
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

            // update google sheet
            const accountDetails = db.getItems([DB_KEYS.ACCOUNT_DETAILS])
            await updateGoogleSheet(googleSheets, accountDetails)
            const openTransactions: PendingTransaction[] = db.getItems([DB_KEYS.SWAP]).filter((f: any) => f.status === 'PENDING')
            const solDiff = db.getItems([DB_KEYS.ACCOUNT_DETAILS])
                .filter((f: AccountDetail) => 
                    Math.abs(f.solDiff) > MIN_DIFF_SIZE 
                    || f.walletUsdc > MIN_USDC_WALLET_AMOUNT 
                    || f.walletSol > MIN_SOL_WALLET_AMOUNT)

            const shouldNotTrade = hourlyRateAPR > MINUS_THRESHOLD && hourlyRateAPR < PLUS_THRESHOLD 
                && openTransactions.length === 0 && solDiff.length === 0

            let sleepAmount = shouldNotTrade? NO_TRADE_TIMEOUT: SLEEP_MAIN_LOOP
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
