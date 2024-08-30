import axios from 'axios';
import {
    PerpOrderSide,
    PerpOrderType
} from '@blockworks-foundation/mango-v4';
import fs from 'fs';
import { cancelOpenOrders, placePerpOrder, postTrades } from './mangoEasyUtils';
import { setupClient } from './mangoUtils';
import { AccountDefinition } from './types';

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
    symbol: string,
    processedData: CsvData[],
    transactionInstructions: Array<any>,
    client: any,
    littleTradeSize: number,
    spread: number,
    tradeSize: number,
    numberOfHours: number,
    maxAmount: number,
    minAmount: number
}

async function analyzeMarket(props: AnalyzeProps) {
    const { symbol, processedData, transactionInstructions,
        client, littleTradeSize, spread, tradeSize, numberOfHours,
        maxAmount, minAmount } = props

    let value = 0
    let fee = 0
    let longs = 0
    let shorts = 0
    let totalLongs = 0
    let totalShorts = 0
    const currentDate = new Date();
    const yesterdayDate = new Date(currentDate.getTime() - (numberOfHours * 60 * 60 * 1000));

    for (const data of processedData) {
        if (data.date >= yesterdayDate && (data.creditSide.indexOf(symbol) > -1 || data.debitSide.indexOf(symbol) > -1)) {
            fee += data.fee
            value += data.value
            if (data.type === "sell") {
                shorts += data.debit
                totalShorts += data.credit
            } else {
                longs += data.credit
                totalLongs += data.debit
            }
        }
    }

    const shortAvg = totalShorts / shorts
    const longAvg = totalLongs / longs

    const values = client.group.perpMarketsMapByMarketIndex.values()
    const valuesArray = Array.from(values)
    const perpMarket: any = valuesArray.find((perpMarket: any) => perpMarket.name === symbol);
    const perpPosition = client.mangoAccount!
        .perpActive()
        .find((pp: any) => pp.marketIndex === perpMarket!.perpMarketIndex);

    const entryPrice = perpPosition?.getAverageEntryPriceUi(perpMarket) || 0
    const positionSize = perpPosition?.getBasePositionUi(perpMarket) || 0
    console.log(`
        symbol:  ${symbol}
        longs:   ${longs} 
        shorts:  ${shorts} 
        Value:   ${value} 
        Fee:     ${fee}  
        Longs:   ${totalLongs} 
        Shorts:  ${totalShorts} 
        ShortAvg:${shortAvg}
        LongAvg: ${longAvg} 
        entryPrice: ${entryPrice}
        positionSize: ${positionSize}
    `)


    let buyPrice = entryPrice - spread
    if (perpMarket.uiPrice < entryPrice) {
        buyPrice = perpMarket.uiPrice - spread
    }

    let sellPrice = entryPrice + spread
    if (perpMarket.uiPrice > entryPrice) {
        sellPrice = perpMarket.uiPrice + spread
    }

    console.log(`CURR PRICE  ${perpMarket.uiPrice} LongAvg=${longAvg.toFixed(2)} ShortAvg=${shortAvg.toFixed(2)}`)

    transactionInstructions.push(await cancelOpenOrders(symbol, client.client, client.mangoAccount!, client.group));
    if ((positionSize + tradeSize) < minAmount) {
        console.log(`${symbol} BUY ${tradeSize} for ${buyPrice}`)
        transactionInstructions.push(await placePerpOrder(symbol, client.client, client.mangoAccount!,
            client.group, PerpOrderSide.bid, tradeSize, buyPrice, new Date().getTime(), PerpOrderType.limit));
    }
    if ((positionSize - tradeSize) > maxAmount) {
        console.log(`${symbol} SELL ${tradeSize} for ${sellPrice}`)
        transactionInstructions.push(await placePerpOrder(symbol, client.client, client.mangoAccount!,
            client.group, PerpOrderSide.ask, tradeSize, sellPrice, new Date().getTime(), PerpOrderType.limit));
    }
    if (littleTradeSize > 0) {
        const littleTradeBuyPrice = perpMarket.uiPrice - spread
        const littleTradeSellPrice = perpMarket.uiPrice + spread
        console.log(`${symbol} BUY LITTLE ${littleTradeSize} for ${littleTradeBuyPrice}`)
        transactionInstructions.push(await placePerpOrder(symbol, client.client, client.mangoAccount!,
            client.group, PerpOrderSide.bid, littleTradeSize, littleTradeBuyPrice, new Date().getTime(), PerpOrderType.limit));
        console.log(`${symbol} SELL LITTLE ${littleTradeSize} for ${littleTradeSellPrice}`)
        transactionInstructions.push(await placePerpOrder(symbol, client.client, client.mangoAccount!,
            client.group, PerpOrderSide.ask, littleTradeSize, littleTradeSellPrice, new Date().getTime(), PerpOrderType.limit));

    }

    return {
        symbol,
        longs,
        shorts,
        value,
        fee,
        totalLongs,
        totalShorts,
        shortAvg: totalShorts / shorts,
        longAvg: totalLongs / longs
    }
}

(async () => {
    try {
        const mangoAccount = 'HpBSY6mP4khefkaDaWHVBKN9q4w7DMfV1PkCwPQudUMw'
        const limit = 1000
        const transactions = await getTransactions(mangoAccount, limit)
        console.log(transactions)
        const processedData = processTransactions(transactions, mangoAccount);

        const priorityFee = 1;
        const accountName = "SIX"
        let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
        let transactionInstructions: Array<any> = [];
        const user = accountDefinitions.find(account => account.name === accountName)

        // Now you can work with the processed CSV data
        const client = await setupClient(user!, priorityFee);
        const numberOfHours = 36
        await analyzeMarket({
            symbol: 'SOL-PERP',
            processedData,
            transactionInstructions,
            client,
            littleTradeSize: 0,
            spread: 0.35,
            tradeSize: 10,
            numberOfHours,
            maxAmount: -175,
            minAmount: -10
        })

        await analyzeMarket({
            symbol: 'BTC-PERP',
            processedData,
            transactionInstructions,
            client,
            littleTradeSize: 0,
            spread: 175,
            tradeSize: 0.01,
            numberOfHours,
            maxAmount: -0.06,
            minAmount: -0.01
        })

        await analyzeMarket({
            symbol: 'ETH-PERP',
            processedData,
            transactionInstructions,
            client,
            littleTradeSize: 0,
            spread: 2,
            tradeSize: 1,
            numberOfHours,
            maxAmount: -8,
            minAmount: -2
        })

        console.log(`Total Instructions = ${transactionInstructions.length}`)

        const makeTrades = false
        if (transactionInstructions.length > 0 && makeTrades) {
            console.log("# of transactionInstructions:", transactionInstructions.length)
            await postTrades(client.client, client.group, transactionInstructions, []);
        }

    } catch (error) {
        // Handle errors here
        console.error(`Error in main loop`, error)
    }
})();
