import {
    HealthType,
    PerpMarket,
    PerpOrderSide,
    PerpOrderType
} from '@blockworks-foundation/mango-v4';

import fs from 'fs';
import { CONNECTION_URL, SPREADSHEET_ID } from './constants';
import { authorize } from './googleUtils';
import { cancelOpenOrders, placePerpOrder, postTrades } from './mangoEasyUtils';
import { setupClient } from './mangoUtils';
import { AccountDefinition } from './types';

interface AnalyzeProps {
    client: any,
    transactionInstructions: Array<any>
}

const MAKE_TRADES = true; 
const INCREASE_LONG = true
const DECREASE_LONG = false
const INCREASE_SHORT = true
const DECREASE_SHORT = false


async function buySell(side: "BUY" | "SELL", spread: number, maxTradeAmount: number, symbol: "SOL-PERP" | "BTC-PERP" | "ETH-PERP",
    market: PerpMarket, priceSpread: number, client: any, transactionInstructions: Array<any>, minTradeValue: number = 5) {

    const minTradeSize = Math.min(spread, maxTradeAmount)
    let tradeSize = minTradeSize / market.uiPrice
    const price = market.uiPrice + (side === "BUY" ? -1 : 1) * priceSpread
    let tradeValue = tradeSize * price

    if (tradeValue < minTradeValue) {
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

    const markets = [{
        symbol: 'SOL-PERP',
        side: 'SHORT',
        spread: 0.20
    }, {
        symbol: 'ETH-PERP',
        side: 'LONG',
        spread: 1.5
    }, {
        symbol: 'BTC-PERP',
        side: 'LONG',
        spread: 40
    }]

    let shortPnl = 0
    let longPnl = 0
    let longValue = 0
    let shortValue = 0

    const positions: Array<any> = []
    for (const market of markets) {
        const perpMarket: any = valuesArray.find((perpMarket: any) => perpMarket.name === market.symbol);

        const perpPosition = client.mangoAccount!
            .perpActive()
            .find((pp: any) => pp.marketIndex === perpMarket!.perpMarketIndex);
        const entryPrice = perpPosition?.getAverageEntryPriceUi(perpMarket) || 0
        const positionSize = perpPosition?.getBasePositionUi(perpMarket) || 0
        const pnl = perpPosition?.getUnRealizedPnlUi(perpMarket) || 0
        const side = market.side
        const value = positionSize * perpMarket.uiPrice
        const adjustedValue = value + pnl * (side === "LONG" ? 1 : -1)
        const price = perpMarket.uiPrice
        if (side === "SHORT") {
            shortPnl += pnl
            shortValue += value;
        } else {
            longPnl += pnl
            longValue += value;
        }

        positions.push({
            symbol: market.symbol,
            pnl,
            entryPrice,
            positionSize,
            side,
            value,
            price,
            perpMarket,
            perpPosition,
            spread: market.spread,
            adjustedValue
        })
        console.log(`${market.symbol} ${side} PNL: ${pnl} Value: ${value} Price: ${price} Entry Price: ${entryPrice} Position Size: ${positionSize}`)
    }

    const totalPnl = shortPnl + longPnl

    const maxLong = 0
    const totalLongValue = longValue + longPnl - maxLong 
    const totalShortValue = shortValue - shortPnl

    const maxTradeAmount = 255
    const minTradeValue = 10
    const shouldCancel = true;

    const totalSpread = totalLongValue + totalShortValue

    console.log(`
        total spread:  ${totalSpread}
        maxTradeAmount: ${maxTradeAmount}

        TOTAL PNL: ${totalPnl}

        Short Pnl: ${shortPnl}
        Long Pnl: ${longPnl}

        Total Long Value: ${totalLongValue}
        Total Short Value: ${totalShortValue}
        Diff : ${totalSpread}        
        `)

    if (shouldCancel) {
        for (const market of markets) {
            transactionInstructions.push(await cancelOpenOrders(market.symbol, client.client, client.mangoAccount!, client.group));
        }
    }

    if (totalSpread > 0) {
        // longs exceed shorts -- SELL
        const amt = totalSpread
        const maxAmount = Math.min(amt, maxTradeAmount)
        if (longPnl > 0 && DECREASE_LONG) {
            const market = positions.sort((a, b) => b.adjustedValue - a.adjustedValue).find(a => a.side === "LONG" && a.pnl > 0)
            await buySell("SELL", amt, maxAmount, market.symbol, market.perpMarket, market.spread, client, transactionInstructions, minTradeValue)
        } else if (INCREASE_SHORT) {
            const market = positions.sort((a, b) => b.adjustedValue - a.adjustedValue).find(a => a.side === "SHORT")
            await buySell("SELL", amt, maxAmount, market.symbol, market.perpMarket, market.spread, client, transactionInstructions, minTradeValue)
        }
    } else {
        // shorts exceeds long -- buy        
        const amt = totalSpread * -1
        const market = positions.sort((a, b) => a.adjustedValue - b.adjustedValue).find(a => a.pnl > 0 && Math.abs(a.value) > minTradeValue && a.side === "SHORT")
        if (market && DECREASE_SHORT) {
            const maxAmount = Math.min(Math.abs(market.value), maxTradeAmount, amt)
            await buySell("BUY", amt, maxAmount, market.symbol, market.perpMarket, market.spread, client, transactionInstructions, minTradeValue)
        } else if (INCREASE_LONG) {
            const longMarket = positions.find(a => a.side === "LONG")
            await buySell("BUY", amt, maxTradeAmount, longMarket.symbol, longMarket.perpMarket, longMarket.spread, client, transactionInstructions, minTradeValue)
        }
    }

    return {
        totalPnl,
        totalLongValue,
        totalShortValue,
        positions
    }
}

(async () => {
    try {
        const priorityFee = 1;
        const accountName = "SIX"
        let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
        let transactionInstructions: Array<any> = [];
        const user = accountDefinitions.find(account => account.name === accountName)

        const client = await setupClient(user!, priorityFee, CONNECTION_URL);
        console.log(`Total Instructions = ${transactionInstructions.length}`)

        // Get health
        const mangoHealth = client.mangoAccount!.getHealthRatioUi(client.group, HealthType.maint);
        console.log('Mango Health:', mangoHealth);

        // Get account value
        const accountValue = (client.mangoAccount!.getEquity(client.group!).toNumber()) / 10 ** 6
        console.log(`Account Value:  ${accountValue}`)

        const results = await analyzeMarket({ client, transactionInstructions })

        if (transactionInstructions.length > 3 && MAKE_TRADES) {
            console.log("# of transactionInstructions:", transactionInstructions.length)
            await postTrades(client.client, client.group, transactionInstructions, []);
        }


        /// GOOGOLE
        const updateGoogle = true
        if (updateGoogle) {
            const { google } = require('googleapis');

            const googleClient: any = await authorize();
            const googleSheets = google.sheets({ version: 'v4', auth: googleClient });
            const sheetName = "Phone"
            console.log(`Updating Google`)

            const getValues = (positions: Array<any>, symbol: string) => {
                const position = positions.find((p: any) => p.symbol === symbol);
                if (position) {
                    return [position.value, position.pnl, position.adjustedValue, position.price];
                }
                return [0, 0, 0, 0]; // Default values if position not found
            }

            await googleSheets.spreadsheets.values.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                resource: {
                    valueInputOption: 'RAW',
                    data: [
                        {
                            range: `${sheetName}!O7:R9`,
                            values: [
                                getValues(results.positions, "SOL-PERP"),
                                getValues(results.positions, "BTC-PERP"),
                                getValues(results.positions, "ETH-PERP"),
                            ]
                        },
                        {
                            range: `${sheetName}!O5`,
                            values: [[mangoHealth]]
                        },
                        {
                            range: `${sheetName}!R5`,
                            values: [[accountValue]]
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
