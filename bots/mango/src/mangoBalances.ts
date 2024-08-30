import axios from 'axios';
import fs from 'fs';
import {
    ACTIVITY_FEED_URL,
    GOOGLE_UPDATE_INTERVAL,
    MAX_FEE
} from './constants';
import * as db from './db';
import { authorize, getTradingParameters, updateGoogleSheet } from './googleUtils';
import {
    getBestPrice,
    postTrades
} from './mangoSpotUtils';
import {
    sleep
} from './mangoUtils';
import { postToSlackFunding } from './slackUtils';
import {
    AccountDefinition,
    AccountDetail,
    Side
} from './types';

const { google } = require('googleapis');



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

export async function getMangoData(UPDATE_GOOGLE_SHEET: boolean = true, SIMULATE_TRADES: boolean = false, SKIP_ZERO_FUNDING: boolean = true, UPDATE_DRIFT = false) {
    let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
    const googleClient: any = await authorize();
    const googleSheets = google.sheets({ version: 'v4', auth: googleClient });
    const accountDetailList: AccountDetail[] = []
    let lastGoogleUpdate = 0
    let lastFundingRate = 0
    const FUNDING_DIFF = 50
    const CHECK_FEES = false

    try {
        const tradingParameters = await getTradingParameters(googleSheets)
        // AUTO TRADING TURNED OFF
        const accountList = tradingParameters?.accountList
        const jupiterSpotSlippage = tradingParameters?.jupiterSpotSlippage || 5
        const priorityFee = tradingParameters?.priorityFee || 10_000
        
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


            let private3: any;
            let main: any;
            let drift: any;
           
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
                if (main) {
                    driftUpdates.push(main)
                }
                await updateGoogleSheet(fundingRates, googleSheets,
                    accountDetailList, feeEstimate,
                    db.getTransactionCache(), bestBuyPrice,
                    bestSellPrice, solPrice, driftUpdates)
                // end google sheet update
                console.log('Google Sheet Updated', new Date().toTimeString())
                lastGoogleUpdate = now
            }

        }
    } catch (e: any) {
        console.error(`Error in main loop: ${e.message}`)
        // sleep for 5 seconds  
        await sleep(5000)
    }
}

