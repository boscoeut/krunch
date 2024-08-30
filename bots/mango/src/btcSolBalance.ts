import axios from 'axios';
import {
    PerpOrderSide,
    PerpOrderType
} from '@blockworks-foundation/mango-v4';
import fs from 'fs';
import { cancelOpenOrders, placePerpOrder, postTrades } from './mangoEasyUtils';
import { setupClient } from './mangoUtils';
import { AccountDefinition } from './types';
import { authorize, getBotRunDetails, updateBotRunDetails } from './googleUtils';
import { SPREADSHEET_ID } from './constants';

// Define the interface for your CSV data
interface CsvData {
    // Replace with your actual column names and types
    date: Date;
    activity: string;
    credit: number;
    debit: number;
    fee: number;
    value: number;
    signature: number;
    creditSide: string;
    debitSide: string;
    type: 'buy' | 'sell'
}

async function getTransactions(mangoAccount: string, limit: number = 1000) {
    const url = `https://api.mngo.cloud/data/v4/stats/trade-history?mango-account=${mangoAccount}&limit=${limit}&offset=0`
    const response = await axios.get(url);
    return response.data
}

function processTransactions(transactions: any, account: string) {
    let items: Array<CsvData> = []
    for (const t of transactions) {
        let security = 'SOL-PERP'
        if (t.activity_details.market_index === 0) {
            security = 'BTC-PERP'
        } else if (t.activity_details.market_index === 3) {
            security = 'ETH-PERP'
        }
        const isTaker = t.activity_details.taker === account
        let type: 'buy' | 'sell' = 'buy'
        if (isTaker) {
            type = t.activity_details.taker_side === 'bid' ? 'buy' : 'sell'
        } else {
            type = t.activity_details.taker_side === 'bid' ? 'sell' : 'buy'
        }
        const value = t.activity_details.price * t.activity_details.quantity
        const fee = (isTaker ? t.activity_details.taker_fee : t.activity_details.maker_fee) * t.activity_details.price * t.activity_details.quantity
        const credit = type === 'buy' ? t.activity_details.quantity : value
        const debit = type === 'sell' ? t.activity_details.quantity : value

        const item = {
            date: new Date(t.block_datetime),
            activity: t.trade_type,
            credit,
            debit,
            fee,
            value,
            type,
            signature: t.activity_details.signature,
            creditSide: type === 'sell' ? 'USDC' : security,
            debitSide: type === 'buy' ? 'USDC' : security
        }
        items.push(item)
    }
    return items;
}

interface AnalyzeProps {
    client: any,
    transactionInstructions: Array<any>
}

async function analyzeMarket(props: AnalyzeProps) {

    const { client, transactionInstructions } = props;

    const values = client.group.perpMarketsMapByMarketIndex.values()
    const valuesArray = Array.from(values)
    const solPerpMarket: any = valuesArray.find((perpMarket: any) => perpMarket.name === 'SOL-PERP');
    const ethPerpMarket: any = valuesArray.find((perpMarket: any) => perpMarket.name === 'ETH-PERP');
    const btcPerpMarket: any = valuesArray.find((perpMarket: any) => perpMarket.name === 'BTC-PERP');
    const solPerpPosition = client.mangoAccount!
        .perpActive()
        .find((pp: any) => pp.marketIndex === solPerpMarket!.perpMarketIndex);
    const ethPerpPosition = client.mangoAccount!
        .perpActive()
        .find((pp: any) => pp.marketIndex === ethPerpMarket!.perpMarketIndex);
    const btcPerpPosition = client.mangoAccount!
        .perpActive()
        .find((pp: any) => pp.marketIndex === btcPerpMarket!.perpMarketIndex);

    const solEntryPrice = solPerpPosition?.getAverageEntryPriceUi(solPerpMarket) || 0
    const solPositionSize = solPerpPosition?.getBasePositionUi(solPerpMarket) || 0
    const solPnl = solPerpPosition?.getUnRealizedPnlUi(solPerpMarket) || 0

    const ethEntryPrice = ethPerpPosition?.getAverageEntryPriceUi(ethPerpMarket) || 0
    const ethPositionSize = ethPerpPosition?.getBasePositionUi(ethPerpMarket) || 0
    const ethPnl = ethPerpPosition?.getUnRealizedPnlUi(ethPerpMarket) || 0

    const btcEntryPrice = btcPerpPosition?.getAverageEntryPriceUi(btcPerpMarket) || 0
    const btcPositionSize = btcPerpPosition?.getBasePositionUi(btcPerpMarket) || 0
    const btcPnl = btcPerpPosition?.getUnRealizedPnlUi(btcPerpMarket) || 0


    const totalPnl = solPnl + ethPnl + btcPnl

    const solValue = solPositionSize * solPerpMarket.uiPrice
    const btcValue = btcPositionSize * btcPerpMarket.uiPrice
    const ethValue = ethPositionSize * ethPerpMarket.uiPrice

    const totalLongValue = solValue
    const totalShortValue = btcValue + ethValue

    const maxTradeAmount = 1750
    const maxShort = 45000
    const maxLong = 45000

    const solSpread = 0.10
    const ethSpread = 1.5
    const btcSpread = 50
    const shouldCancel = true;

    const minSpread = 50
    const minSellBack = 50
    const minBuyBack = 50
    const buyBackShorts = true

    let shortSpread = maxShort - Math.abs(totalShortValue)
    let longSpread = maxLong - totalLongValue


    console.log(`
        spread:      ${totalLongValue + totalShortValue}
        shortSpread: ${shortSpread}
        longSpread:  ${longSpread}

        maxTradeAmount: ${maxTradeAmount}

        min Spread: ${minSpread}

        SOL PNL  : ${solPnl}
        ETH PNL  : ${ethPnl}
        BTC PNL  : ${btcPnl}
        TOTAL PNL: ${totalPnl}

        Sol Price: ${solPerpMarket.uiPrice}
        Eth Price: ${ethPerpMarket.uiPrice}
        Btc Price: ${btcPerpMarket.uiPrice}

        Sol Value: ${solValue}
        Btc Value: ${btcValue}
        Eth Value: ${ethValue}

        Total Long Value: ${totalLongValue}
        Total Short Value: ${totalShortValue}`)

    if (shouldCancel) {
        transactionInstructions.push(await cancelOpenOrders('SOL-PERP', client.client, client.mangoAccount!, client.group));
        transactionInstructions.push(await cancelOpenOrders('BTC-PERP', client.client, client.mangoAccount!, client.group));
        transactionInstructions.push(await cancelOpenOrders('ETH-PERP', client.client, client.mangoAccount!, client.group));
    }

    if (Math.abs(totalShortValue) < maxShort) {
        // INCREASE SHORT
        if (ethValue > btcValue) {
            const shortTradeSize = Math.min(shortSpread, maxTradeAmount)

            const tradeSize = shortTradeSize / ethPerpMarket.uiPrice
            const sellPrice = ethPerpMarket.uiPrice + ethSpread
            console.log(`${'ETH-PERP'} SELL ${tradeSize} for ${sellPrice}  Total = ${tradeSize * sellPrice}
                `)
            transactionInstructions.push(await placePerpOrder('ETH-PERP', client.client, client.mangoAccount!,
                client.group, PerpOrderSide.ask, tradeSize, sellPrice, new Date().getTime(), PerpOrderType.postOnly));
        } else {
            const shortTradeSize = Math.min(shortSpread, maxTradeAmount)
            const tradeSize = shortTradeSize / btcPerpMarket.uiPrice
            const sellPrice = btcPerpMarket.uiPrice + btcSpread
            console.log(`${'BTC-PERP'} SELL ${tradeSize} for ${sellPrice}  Total = ${tradeSize * sellPrice}
                `)
            transactionInstructions.push(await placePerpOrder('BTC-PERP', client.client, client.mangoAccount!,
                client.group, PerpOrderSide.ask, tradeSize, sellPrice, new Date().getTime(), PerpOrderType.postOnly));
        }
    } else {
        // DECREASE SHORT
        const spread = Math.abs(totalShortValue) - maxShort
        console.log(`BUY BACK BTC/ETH EVEN OUT: spread: ${spread}.   MinBuyBack=${minBuyBack} buyBackShorts=${buyBackShorts}
            `)
        if (spread >= minBuyBack && buyBackShorts) {
            if (ethValue < btcValue) {
                const tradeSize = Math.min(spread, maxTradeAmount) / ethPerpMarket.uiPrice
                const buyPrice = ethPerpMarket.uiPrice - ethSpread
                console.log(`${'ETH-PERP'} BUY ${tradeSize} for ${buyPrice}  Total = ${tradeSize * buyPrice}
                    `)
                transactionInstructions.push(await placePerpOrder('ETH-PERP', client.client, client.mangoAccount!,
                    client.group, PerpOrderSide.bid, tradeSize, buyPrice, new Date().getTime(), PerpOrderType.postOnly));
            } else {
                const tradeSize = Math.min(spread, maxTradeAmount) / btcPerpMarket.uiPrice
                const buyPrice = btcPerpMarket.uiPrice - btcSpread
                console.log(`${'BTC-PERP'} BUY ${tradeSize} for ${buyPrice}  Total = ${tradeSize * buyPrice}
                    `)
                transactionInstructions.push(await placePerpOrder('BTC-PERP', client.client, client.mangoAccount!,
                    client.group, PerpOrderSide.bid, tradeSize, buyPrice, new Date().getTime(), PerpOrderType.postOnly));
            }
        }
    }


    if (Math.abs(totalLongValue) <  maxShort) {
        // INCREASE LONG
        // BUY
        const spread =  maxShort - totalLongValue
        const longTradeSize = Math.min(spread, maxTradeAmount)
        let tradeSize = longTradeSize / solPerpMarket.uiPrice
        const buyPrice = solPerpMarket.uiPrice - solSpread
        console.log(`${'SOL-PERP'} BUY ${tradeSize} for ${buyPrice} Total = ${tradeSize * buyPrice}
            `)
        transactionInstructions.push(await placePerpOrder('SOL-PERP', client.client, client.mangoAccount!,
            client.group, PerpOrderSide.bid, tradeSize, buyPrice, new Date().getTime(), PerpOrderType.postOnly));
    } else {
        // DECREASE LONG
        const spread = totalLongValue - maxShort
        console.log(`SELL BACK SOL TO EVEN OUT: spread: ${spread}.   MinSellBack=${minSellBack} spread=${spread}
            `)
        if (spread >= minSellBack) {
            // SELL BACK SOL
            const tradeSize = Math.min(spread, maxTradeAmount) / solPerpMarket.uiPrice
            const sellPrice = solPerpMarket.uiPrice + solSpread
            console.log(`${'SOL-PERP'} SELL ${tradeSize} for ${sellPrice} Total = ${tradeSize * sellPrice}
                `)
            transactionInstructions.push(await placePerpOrder('SOL-PERP', client.client, client.mangoAccount!,
                client.group, PerpOrderSide.ask, tradeSize, sellPrice, new Date().getTime(), PerpOrderType.postOnly));
        }
    }

    return {
        solPnl,
        ethPnl,
        btcPnl,
        totalPnl,
        totalLongValue,
        totalShortValue
    }

}

(async () => {
    try {
        const priorityFee = 1;
        const accountName = "SIX"
        const makeTrades = true

        let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
        let transactionInstructions: Array<any> = [];
        const user = accountDefinitions.find(account => account.name === accountName)

        const client = await setupClient(user!, priorityFee);
        console.log(`Total Instructions = ${transactionInstructions.length}`)

        const results = await analyzeMarket({ client, transactionInstructions })
        if (transactionInstructions. length > 3 && makeTrades) {
            console.log("# of transactionInstructions:", transactionInstructions.length)
            await postTrades(client.client, client.group, transactionInstructions, []);
        }


        /// GOOGOLE
        const { google } = require('googleapis');

        const googleClient: any = await authorize();
        const googleSheets = google.sheets({ version: 'v4', auth: googleClient });
        const sheetName = "Phone"
        console.log(`Updating Google`)
        await googleSheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                valueInputOption: 'RAW',
                data: [
                    {
                        range: `${sheetName}!H9:H12`,
                        values: [
                            [results.solPnl],
                            [results.ethPnl],
                            [results.btcPnl],
                            [results.totalPnl]],
                    },
                    {
                        range: `${sheetName}!K9:K10`,
                        values: [
                            [results.totalLongValue],
                            [results.totalShortValue]
                        ]
                    }
                ]
            }
        });
        console.log(`Updating Google Complete`)
    } catch (error) {
        // Handle errors here
        console.error(`Error in main loop`, error)
    }
})();
