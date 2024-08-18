import {
    PerpOrderSide,
    PerpOrderType
} from '@blockworks-foundation/mango-v4';
import fs from 'fs';
import { placePerpOrder, postTrades, cancelOpenOrders } from './mangoEasyUtils';
import { setupClient } from './mangoUtils';
import { AccountDefinition } from './types';

const updateDrift = async () => {
    const priorityFee = 1;
    const accounts: Array<string> = ["SIX"]
    let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
    let transactionInstructions: Array<any> = [];
    const promises: Array<Promise<any>> = []
    for (const accountName of accounts) {
        const user = accountDefinitions.find(account => account.name === accountName)
        const client = await setupClient(user!, priorityFee);

        const values = client.group.perpMarketsMapByMarketIndex.values()
        const valuesArray = Array.from(values)
        const markets = [
            {
                market: "SOL-PERP",
                orderSize: 10,
                maxOrders: 6,
                spread: 0.32,
                placeTrades: true,
                maxShort: 220,
                maxLong: 10,
                maxPending: 60
            },
            {
                market: "BTC-PERP",
                orderSize: 0.01,
                maxOrders: 6,
                spread: 175,
                placeTrades: true,
                maxShort: 0.09,
                maxLong: 0.03,
                maxPending:  0.08
            }, {
                market: "ETH-PERP",
                orderSize: 0.65,
                maxOrders: 7,
                spread: 1.75,
                placeTrades: true,
                maxShort: 11,
                maxLong: 2,
                maxPending: 7
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
            for (const order of orders) {
                if (order.side === PerpOrderSide.bid) {
                    longSize += order.uiSize
                    size += order.uiSize
                    longPrice += order.uiPrice * order.uiSize
                } else {
                    shortSize += order.uiSize
                    size -= order.uiSize
                    shortPrice += order.uiPrice * order.uiSize
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
                | Avg Price = ${price / uiSize}`)
            console.log(' - - - - - - - - ')
            if (market.placeTrades) {
                const price = perpMarket.uiPrice
                // check if we should place trade
                const exceedsSize = (longSize+positions > market.maxLong) || (shortSize+positions*-1 > market.maxShort)
                const exceedsMaxPending = longSize+positions > market.maxPending || shortSize > market.maxPending

                if (exceedsSize){
                    console.log(`Max size exceeded.  Position = ${positions}.  MaxLong=${market.maxLong}  MaxShort=${market.maxShort} Long=${longSize+positions} | Short= ${shortSize+positions*-1}`)
                }
                if (exceedsMaxPending){
                    console.log(`Max Pending exceeded.  Position = ${positions}.  MaxPending=${market.maxPending}  Long=${longSize} | Short= ${shortSize}`)
                }

                if (!exceedsMaxPending && !exceedsSize){
                    console.log(`Placing order for ${market.market} @ ${price}.  Buy ${market.orderSize} @ ${price - market.spread}.  Sell ${market.orderSize} @ ${price + market.spread}`)
                    if (orders.length >= market.maxOrders){
                        transactionInstructions.push(await cancelOpenOrders(market.market, client.client, client.mangoAccount!, client.group,20));     
                        if (longSize>0){
                            const avgPrice = longPrice/ longSize
                            transactionInstructions.push(await placePerpOrder(market.market, client.client, client.mangoAccount!, 
                                client.group, PerpOrderSide.bid, longSize, avgPrice, new Date().getTime(), PerpOrderType.postOnly));        
                        }
                        if (shortSize>0){
                            const avgPrice = shortPrice/ shortSize
                            transactionInstructions.push(await placePerpOrder(market.market, client.client, client.mangoAccount!, 
                                client.group, PerpOrderSide.ask, shortSize, avgPrice, new Date().getTime(), PerpOrderType.postOnly));        
                        }                        
                    }
                    transactionInstructions.push(await placePerpOrder(market.market, client.client, client.mangoAccount!, 
                        client.group, PerpOrderSide.bid, market.orderSize, price - market.spread, new Date().getTime(), PerpOrderType.postOnly));
                    transactionInstructions.push(await placePerpOrder(market.market, client.client, client.mangoAccount!, 
                        client.group, PerpOrderSide.ask, market.orderSize, price + market.spread, new Date().getTime(), PerpOrderType.postOnly));
                }
            }
        }

        console.log(`Total Orders = ${totalOrders}`)

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
