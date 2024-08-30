import {
    PerpMarket,
    PerpOrderSide,
    PerpOrderType
} from '@blockworks-foundation/mango-v4';

import fs from 'fs';
import { SPREADSHEET_ID } from './constants';
import { authorize } from './googleUtils';
import { cancelOpenOrders, placePerpOrder, postTrades } from './mangoEasyUtils';
import { setupClient } from './mangoUtils';
import { AccountDefinition } from './types';

interface AnalyzeProps {
    client: any,
    transactionInstructions: Array<any>
}

async function buySell(side: "BUY" | "SELL", spread: number, maxTradeAmount: number, symbol: "SOL-PERP" | "BTC-PERP" | "ETH-PERP",
    market: PerpMarket, priceSpread: number, client: any, transactionInstructions: Array<any>, minTradeValue:number=5) {

    const minTradeSize = Math.min(spread, maxTradeAmount)
    let tradeSize = minTradeSize / market.uiPrice
    const price = market.uiPrice + (side === "BUY" ? -1 : 1) * priceSpread
    let tradeValue = tradeSize * price

    if (tradeValue < minTradeValue){
        console.log(`${symbol} ${side} Trade Value = ${tradeValue}  Min Trade Value = ${minTradeValue} trade value is too small`)
    }
    else if (tradeSize < 0) {
        console.log(`${symbol} ${side} ${tradeSize} is too small`)
    } else {        
        const perpMarketSide = side == "BUY" ? PerpOrderSide.bid : PerpOrderSide.ask
        console.log(`${symbol} ${side} ${tradeSize} for ${price} Total = ${tradeSize * price}.  Oracle = ${market.uiPrice} \n`)
        transactionInstructions.push(await placePerpOrder(symbol, client.client, client.mangoAccount!,
            client.group, perpMarketSide,
            tradeSize, price, new Date().getTime(), PerpOrderType.postOnly));
    }
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


    const shortPnl = ethPnl + btcPnl
    const longPnl = solPnl
    const totalPnl = solPnl + ethPnl + btcPnl

    const solValue = solPositionSize * solPerpMarket.uiPrice
    const btcValue = btcPositionSize * btcPerpMarket.uiPrice
    const ethValue = ethPositionSize * ethPerpMarket.uiPrice

    const totalLongValue = solValue + solPnl
    const totalShortValue = btcValue + ethValue + btcPnl + ethPnl

    const maxTradeAmount = 1000
    const maxLong = 1000
    const minTradeValue = 5

    const solSpread = 0.0
    const ethSpread = 1.5
    const btcSpread = 50
    const shouldCancel = true;

    const minSpread = 50
    const totalSpread = totalLongValue + totalShortValue

    console.log(`
        total spread:  ${totalSpread}
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

        Short Pnl: ${shortPnl}
        Long Pnl: ${longPnl}

        Total Long Value: ${totalLongValue}
        Total Short Value: ${totalShortValue}`)

    if (shouldCancel) {
        transactionInstructions.push(await cancelOpenOrders('SOL-PERP', client.client, client.mangoAccount!, client.group));
        transactionInstructions.push(await cancelOpenOrders('BTC-PERP', client.client, client.mangoAccount!, client.group));
        transactionInstructions.push(await cancelOpenOrders('ETH-PERP', client.client, client.mangoAccount!, client.group));
    }

    if (totalLongValue > maxLong) {
        // longs exceed shorts -- SELL
        const maxAmount = Math.min(solValue-maxLong, maxTradeAmount)
        if (longPnl > 0) {
            // sell long            
            await buySell("SELL", totalSpread, maxAmount, "SOL-PERP", solPerpMarket, solSpread, client, transactionInstructions,minTradeValue)
        } else {
            // sell short
            if (ethPnl > btcPnl) {
                // sell btc
                await buySell("SELL", totalSpread, maxAmount, "BTC-PERP", btcPerpMarket, btcSpread, client, transactionInstructions,minTradeValue)
            } else {
                // sell eth
                await buySell("SELL", totalSpread, maxAmount, "ETH-PERP", ethPerpMarket, ethSpread, client, transactionInstructions,minTradeValue)
            }
        }
    } else{
        // shorts exceeds long -- buy        
        const amt = maxLong - totalLongValue
        if (shortPnl > 0 && ethPnl > 0 && ethPnl > btcPnl) {
            // buy eth
            const maxAmount = Math.min(Math.abs(ethValue), maxTradeAmount, amt)
            await buySell("BUY", totalSpread, maxAmount, "ETH-PERP", ethPerpMarket, ethSpread, client, transactionInstructions,minTradeValue)
        } else if (shortPnl > 0 && btcPnl > 0 && btcPnl > ethPnl) {
            // buy btc
            const maxAmount = Math.min(Math.abs(btcValue), maxTradeAmount, amt)
            await buySell("BUY", totalSpread, maxAmount, "BTC-PERP", btcPerpMarket, btcSpread, client, transactionInstructions,minTradeValue)
        }else if (totalLongValue < maxLong) {
            // buy long
            const maxAmount = maxLong - totalLongValue
            await buySell("BUY", maxLong, maxAmount, "SOL-PERP", solPerpMarket, solSpread, client, transactionInstructions,minTradeValue)
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
        // await checkDrift("DRIFT");

        let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
        let transactionInstructions: Array<any> = [];
        const user = accountDefinitions.find(account => account.name === accountName)

        const client = await setupClient(user!, priorityFee);
        console.log(`Total Instructions = ${transactionInstructions.length}`)

        const results = await analyzeMarket({ client, transactionInstructions })
        if (transactionInstructions.length > 3 && makeTrades) {
            console.log("# of transactionInstructions:", transactionInstructions.length)
            await postTrades(client.client, client.group, transactionInstructions, []);
        }


        /// GOOGOLE
        const updateGoogle = false
        if (updateGoogle) {
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
        }
    } catch (error) {
        // Handle errors here
        console.error(`Error in main loop`, error)
    }
})();
