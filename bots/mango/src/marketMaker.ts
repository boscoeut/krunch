import {
    PerpOrderSide,
    PerpOrderType
} from '@blockworks-foundation/mango-v4';
import fs from 'fs';
import { cancelOpenOrders, placePerpOrder, postTrades } from './mangoEasyUtils';
import { setupClient } from './mangoUtils';
import { AccountDefinition } from './types';

const updateDrift = async () => {
    const priorityFee = 1;
    const accounts: Array<string> = ["SIX"]
    let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
    let transactionInstructions: Array<any> = [];
    for (const accountName of accounts) {
        const user = accountDefinitions.find(account => account.name === accountName)
        const client = await setupClient(user!, priorityFee);

        const values = client.group.perpMarketsMapByMarketIndex.values()
        const valuesArray = Array.from(values)
        const markets = [
            {
                market: "SOL-PERP",
                orderSize: 15,
                maxOrders: 6,
                spread: 0.3,
                placeTrades: true,
                maxShort: 250,
                maxPending: 100,
                shortMultiplier: 2.5,
                longMultiplier: 2.5,
                maxLong: -125,
                longBase: 1,
                shortBase: 1
            },
            {
                market: "BTC-PERP",
                orderSize: 0.01,
                maxOrders: 6,
                spread: 125,
                placeTrades: true,
                maxShort: 0.05,
                maxPending: 0.08,
                shortMultiplier: 2.5,
                longMultiplier: 2.5,
                maxLong: -0.025,
                longBase: 1,
                shortBase: 1
            }, {
                market: "ETH-PERP",
                orderSize: 0.80,
                maxOrders: 7,
                spread: 2,
                placeTrades: true,
                maxShort: 7.5,
                maxPending: 7,
                shortMultiplier: 2.5,
                longMultiplier: 2.5,
                maxLong: -3,
                longBase: 1,
                shortBase: 1
            }
        ]
        let totalOrders = 0
        for (const market of markets) {
            const perpMarket: any = valuesArray.find((perpMarket: any) => perpMarket.name === market.market);
            const perpPosition = client.mangoAccount!
                .perpActive()
                .find((pp: any) => pp.marketIndex === perpMarket!.perpMarketIndex);

            const entryPrice = perpPosition?.getAverageEntryPriceUi(perpMarket) || 0
            const positions = perpPosition?.getBasePositionUi(perpMarket) || 0

            const orders = await client.mangoAccount!.loadPerpOpenOrdersForMarket(
                client.client,
                client.group,
                perpMarket.perpMarketIndex,
                true
            )
            totalOrders += orders.length
            let size = 0
            let uiSize = 0
            let longSize = 0
            let shortSize = 0
            let shortPrice = 0
            let longPrice = 0
            let price = 0
            let minLongOrderPrice = 0
            let maxLongOrderPrice = 0
            let minShortOrderPrice = 0
            let maxShortOrderPrice = 0
            for (const order of orders) {
                if (order.side === PerpOrderSide.bid) {
                    longSize += order.uiSize
                    size += order.uiSize
                    longPrice += order.uiPrice * order.uiSize
                    minLongOrderPrice = minLongOrderPrice ? Math.min(minLongOrderPrice, order.uiPrice) : order.uiPrice
                    maxLongOrderPrice = Math.max(maxLongOrderPrice, order.uiPrice)
                } else {
                    shortSize += order.uiSize
                    size -= order.uiSize
                    shortPrice += order.uiPrice * order.uiSize
                    minShortOrderPrice = minShortOrderPrice ? Math.min(minShortOrderPrice, order.uiPrice) : order.uiPrice
                    maxShortOrderPrice = Math.max(maxShortOrderPrice, order.uiPrice)
                }
                uiSize += order.uiSize

                price += order.uiPrice * order.uiSize
                console.log(`${order.uiSize} | ${order.uiPrice} | ${order.side === PerpOrderSide.bid ? "BUY" : "SELL"}`)
            }
            console.log(`${market.market} 
                | placeTrades=${market.placeTrades} 
                | # Orders = ${orders.length} 
                | Size = ${size} 
                | Position = ${positions} 
                | ShortSize = ${shortSize} | Avg ShortPrice = ${shortPrice / shortSize} 
                | LongSize = ${longSize} | Avg LongPrice = ${longPrice / longSize}
                | Entry Price = ${entryPrice}
                | Avg Price = ${price / uiSize}`)
            console.log(' - - - - - - - - ')
            if (market.placeTrades) {
                const price = perpMarket.uiPrice
                // check if we should place trade
                const exceedsShort = (shortSize + positions * -1) > market.maxShort
                const exceedsLong = (longSize + positions) > market.maxLong
                const exceedsMaxPending = Math.abs(longSize - shortSize) > market.maxPending
                let shortMultiplier = market.shortBase
                let longMultiplier = market.longBase

                if (exceedsShort) {
                    console.log(`Max Short exceeded.  Position = ${positions}.  MaxShort=${market.maxShort} Long=${longSize + positions} | Short= ${shortSize + positions * -1}`)
                    shortMultiplier = market.shortMultiplier
                } else if (exceedsLong) {
                    console.log(`Max Long exceeded.  Position = ${positions}.  MaxShort=${market.maxShort} Long=${longSize + positions} | Short= ${shortSize + positions * -1}`)
                    longMultiplier = market.longMultiplier
                }
                if (exceedsMaxPending) {
                    console.log(`Max Pending exceeded.  Position = ${positions}.  MaxPending=${market.maxPending}  Long=${longSize + positions} | Short= ${shortSize + positions * -1}`)
                }

                if (!exceedsMaxPending || longSize === 0 || shortSize === 0) {
                    console.log(`Placing order for ${market.market} @ ${price}.  
                            Buy ${market.orderSize} @ ${price - market.spread * longMultiplier}.  
                            Sell ${market.orderSize} @ ${price + market.spread * shortMultiplier}
                            ShortMultiplier = ${shortMultiplier}
                            LongMultiplier = ${longMultiplier}
                            `)
                    if (orders.length > market.maxOrders) {
                        transactionInstructions.push(await cancelOpenOrders(market.market, client.client, client.mangoAccount!, client.group, 20));

                        let avg = shortPrice - longPrice
                        const size = longSize - shortSize
                        avg = Math.abs(avg / size)

                        console.log(`Avg = ${avg} . Size = ${size}`)
                        if (size > 0) {
                            transactionInstructions.push(await placePerpOrder(market.market, client.client, client.mangoAccount!,
                                client.group, PerpOrderSide.bid, size, avg, new Date().getTime(), PerpOrderType.limit));
                        } else if (size < 0) {
                            transactionInstructions.push(await placePerpOrder(market.market, client.client, client.mangoAccount!,
                                client.group, PerpOrderSide.ask, Math.abs(size), avg, new Date().getTime(), PerpOrderType.limit));
                        }
                    }
                    transactionInstructions.push(await placePerpOrder(market.market, client.client, client.mangoAccount!,
                        client.group, PerpOrderSide.bid, market.orderSize, price - (market.spread * longMultiplier), new Date().getTime(), PerpOrderType.limit));
                    transactionInstructions.push(await placePerpOrder(market.market, client.client, client.mangoAccount!,
                        client.group, PerpOrderSide.ask, market.orderSize, price + (market.spread * shortMultiplier), new Date().getTime(), PerpOrderType.limit));
                }
            }
        }

        console.log(`Total Orders = ${totalOrders}.  Total Instructions = ${transactionInstructions.length}`)

        if (transactionInstructions.length > 0) {
            console.log("# of transactionInstructions:", transactionInstructions.length)
            await postTrades(client.client, client.group, transactionInstructions, []);
        }
    }
}

(async () => {
    try {
        await updateDrift()
    } catch (error) {
        console.log(error);
    }
})();
