import {
    PerpOrderSide,
    PerpOrderType,
} from '@blockworks-foundation/mango-v4';
import fs from 'fs';
import { cancelOpenOrders, placePeggedPerpOrder, placePerpOrder, postTrades,makeDeposits, borrow } from './mangoEasyUtils';
import { setupClient } from './mangoUtils';
import { AccountDefinition } from './types';
import { BTC_WORMHOLE_MINT, ETH_WORMHOLE_MINT, SOL_MINT ,USDC_MINT} from './constants';


async function refreshOrders() {
    const cancelOrders = false
    const actions = [{
        market: 'SOL-PERP',
        oracle: 170,
        size: 2,
        side: PerpOrderSide.ask,
        offset: 0.0,
        offsetPercent: 0.05,
        account: "FIVE",
        useOffset: false,
        cancelOrders
    }, {
        market: 'BTC-PERP',
        size: 0.02,
        oracle: 70000,
        side: PerpOrderSide.ask,
        offset: 0,
        account: "FIVE",
        offsetPercent: 0.05,
        useOffset: false,
        cancelOrders
    }, {
        market: 'ETH-PERP',
        size: 0.2,
        oracle: 4000,
        side: PerpOrderSide.ask,
        offset: 0.0,
        account: "FIVE",
        offsetPercent: 0.05,
        useOffset: false,
        cancelOrders
    }, {
        market: 'RENDER-PERP',
        size: 80,
        oracle: 10.5,
        side: PerpOrderSide.ask,
        offset: 0.0,
        account: "PRIVATE3",
        offsetPercent: 0.15,
        useOffset: true,
        cancelOrders
    }]

    // const includeMarkets:Array<string> = ['ETH-PERP']//['SOL-PERP', 'BTC-PERP', 'ETH-PERP', 'RENDER-PERP']
    const includeMarkets: Array<string> = ['SOL-PERP', 'BTC-PERP', 'ETH-PERP', 'RENDER-PERP']
    // const includeMarkets: Array<string> = [ 'ETH-PERP']
    const filteredActions = actions.filter(value => includeMarkets.includes(value.market))

    // get a list of distinct accounts from actions
    const accounts = filteredActions.map(action => action.account).filter((value, index, self) => self.indexOf(value) === index)

    for (const accountName of accounts) {
        let transactionInstructions: Array<any> = [];

        let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
        const priorityFee = 20000;
        const user = accountDefinitions.find(account => account.name === accountName)
        const client = await setupClient(user!, priorityFee);
        const values = client.group.perpMarketsMapByMarketIndex.values()
        const valuesArray = Array.from(values)

        for (const action of filteredActions.filter(value => value.account === accountName)) {
            const perpMarket: any = valuesArray.find((perpMarket: any) => perpMarket.name === action.market);
            const orders = await client.mangoAccount!.loadPerpOpenOrdersForMarket(
                client.client,
                client.group,
                perpMarket.perpMarketIndex,
                true
            )

            if (orders.length === 0 || action.cancelOrders) {
                let offset = action.offsetPercent / 100 * action.oracle
                if (action.useOffset) {
                    offset = action.offset
                }
                console.log(`Placing order for ${action.market}. OracleOffset= ${offset} Size= ${action.size} Side= ${action.side != PerpOrderSide.ask ? 'Buy' : 'Sell'}  Offset= ${action.offset}`)
                transactionInstructions.push(await cancelOpenOrders(action.market, client.client, client.mangoAccount!, client.group));
                transactionInstructions.push(await placePeggedPerpOrder(
                    action.market, client.client, client.mangoAccount!,
                    client.group, action.side, action.size, offset, new Date().getTime()));
            } else {
                console.log(`${orders.length} Order(s) for ${action.market} already exists`)
            }
        }

        if (transactionInstructions.length > 0) {
            await postTrades(client.client, client.group, transactionInstructions, [])
        }
    }
}

async function executeTrade() {
    try {
        const priorityFee = 30_000;
        // const accounts: Array<string> = ["ACCOUNT2", "BIRD", "BUCKET", "DRIFT", "FIVE", "SEVEN", "SIX", "SOL_FLARE", "PRIVATE3"]
        // const accounts: Array<string> = [ "BIRD", "BUCKET", "DRIFT", "FIVE", "SEVEN", "SIX", "SOL_FLARE", "PRIVATE3"]
        // const accounts:Array<string> = ["BIRD","ACCOUNT2","SOL_FLARE","BUCKET"]
        // const accounts: Array<string> = ["PRIVATE3","BIRD","DRIFT","FIVE","SIX","SOL_FLARE"]
        const accounts: Array<string> = ["SIX"]
        let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)

        const promises: Array<Promise<any>> = []
        for (const accountName of accounts) {
            const user = accountDefinitions.find(account => account.name === accountName)
            const client = await setupClient(user!, priorityFee);
            // const client = await setupClient(user!, priorityFee, HELIUS_JANE_CONNECTION_URL);

            let transactionInstructions: Array<any> = [];
          
            // transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 1,  142.95,   new Date().getTime(),PerpOrderType.immediateOrCancel));        
            // transactionInstructions.push(await cancelOpenOrders("SOL-PERP", client.client, client.mangoAccount!, client.group));
            // transactionInstructions.push(await cancelOpenOrders("BTC-PERP", client.client, client.mangoAccount!, client.group,20));
            // transactionInstructions.push(await cancelOpenOrders("RENDER-PERP", client.client, client.mangoAccount!, client.group,20));


            // SELL PLACE HOLDERS
            // transactionInstructions.push(await placePeggedPerpOrder("ETH-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,3.25, 0, new Date().getTime()));            
            // transactionInstructions.push(await placePeggedPerpOrder("ETH-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask,0.5, 0, new Date().getTime()));            
            // transactionInstructions.push(await placePeggedPerpOrder("BTC-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask,0.01, 10, new Date().getTime()));            
            // transactionInstructions.push(await placePeggedPerpOrder("RENDER-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,60, 0.0, new Date().getTime()));            
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask,17.5, -.2, new Date().getTime()));            

            // transactionInstructions.push(await placePeggedPerpOrder("BTC-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,0.06, 10, new Date().getTime()));            

            //  transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask,0.01, 0.5, new Date().getTime()));            
            //  transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,30, 0.15, new Date().getTime()));            
            //  transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,30, 0.1, new Date().getTime()));            
            //  transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,30, 0.2, new Date().getTime()));            
             
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,0.01, 0.1, new Date().getTime()));            
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,0.01, 0.2, new Date().getTime()));            
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,0.01, 0.3, new Date().getTime()));            
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,0.01, 0.4, new Date().getTime()));            
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,0.01, 0.5, new Date().getTime()));            
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,0.01, 0.6, new Date().getTime()));            

            // BUY SOL
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,10, 0, new Date().getTime(), new Date().getTime()/1000+90));
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,25, -0.2, new Date().getTime(), new Date().getTime()/1000+90));
            // transactionInstructions.push(await placePeggedPerpOrder("ETH-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,0.95, -0.5, new Date().getTime()));
            // transactionInstructions.push(await placePeggedPerpOrder("BTC-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,0.023, -0.5, new Date().getTime()));

            /// HOW TO BORROW
            //  transactionInstructions.push(...await borrow(0.125,ETH_WORMHOLE_MINT,client.client,client.mangoAccount!,client.group, true))
            //  transactionInstructions.push(...await borrow(0.002,BTC_WORMHOLE_MINT,client.client,client.mangoAccount!,client.group, true))
            //  transactionInstructions.push(...await borrow(600,USDC_MINT,client.client,client.mangoAccount!,client.group,true))
            //  transactionInstructions.push(...await borrow(60.50226285,RENDER_MINT,client.client,client.mangoAccount!,client.group, false))

            // DEPOSIT
            // promises.push(makeDeposits([{ amount: 16058.630583, mint: USDC_MINT, user: accountName }]))
            // promises.push(makeDeposits([{ amount:0.98777865, mint: ETH_WORMHOLE_MINT, user: accountName }]))
            // promises.push(makeDeposits([{ amount: 5, mint: SOL_MINT, user: accountName }]))
            // promises.push(makeDeposits([{ amount:0.01005165, mint: BTC_WORMHOLE_MINT, user: accountName }]))
            // transactionInstructions.push(await cancelOpenOrders("BTC-PERP", client.client, client.mangoAccount!, client.group));
            // transactionInstructions.push(await placePerpOrder("BTC-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 0.0267,  68500,   new Date().getTime(),PerpOrderType.limit));        
            // transactionInstructions.push(await cancelOpenOrders("BTC-PERP", client.client, client.mangoAccount!, client.group));
            // transactionInstructions.push(await placePerpOrder("BTC-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 0.03,  60850,   new Date().getTime(),PerpOrderType.postOnly));        
            // transactionInstructions.push(await cancelOpenOrders("BTC-PERP", client.client, client.mangoAccount!, client.group));     
            // transactionInstructions.push(await placePerpOrder("BTC-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 0.03,  60645,   new Date().getTime(),PerpOrderType.limit));   
            // transactionInstructions.push(await cancelOpenOrders("BTC-PERP", client.client, client.mangoAccount!, client.group));     
            // transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 5,  153.20,   new Date().getTime(),PerpOrderType.postOnly));        
            // transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 20,  153.60,   new Date().getTime(),PerpOrderType.postOnly));        
            // transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 30,  145.0,   new Date().getTime(),PerpOrderType.postOnly));        

            // transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 10,  139,  new Date().getTime(),PerpOrderType.postOnly));        
            // transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.gr'oup, PerpOrderSide.bid, 13,  143.1,  new Date().getTime(),PerpOrderType.postOnly));        

            // transactionInstructions.push(await cancelOpenOrders("ETH-PERP", client.client, client.mangoAccount!, client.group));   
            // transactionInstructions.push(await cancelOpenOrders("BTC-PERP", client.client, client.mangoAccount!, client.group));   
            // transactionInstructions.push(await cancelOpenOrders("SOL-PERP", client.client, client.mangoAccount!, client.group));               
            // transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 92.67, 148.5,   new Date().getTime(),PerpOrderType.postOnly));        
            // transactionInstructions.push(...await borrow(25,SOL_MINT,client.client,client.mangoAccount!,client.group, false))
            // promises.push(makeDeposits([{ amount: 1576.56, mint: USDC_MINT, user: accountName }]))
            // transactionInstructions.push(await placePerpOrder("ETH-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 0.2965, 2243,   new Date().getTime(),PerpOrderType.postOnly));        
            // transactionInstructions.push(await placePerpOrder("BTC-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 0.1967, 61950,   new Date().getTime(),PerpOrderType.postOnly));        
            // await settleFunds(client.client,client.mangoAccount!,client.group,"SOL-PERP");

            // transactionInstructions.push(await cancelOpenOrders("ETH-PERP", client.client, client.mangoAccount!, client.group));   
            // transactionInstructions.push(await cancelOpenOrders("BTC-PERP", client.client, client.mangoAccount!, client.group));   
            // transactionInstructions.push(await placePerpOrder("BTC-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 0.0369, 53991,   new Date().getTime(),PerpOrderType.postOnly));        
            // transactionInstructions.push(await placePerpOrder("ETH-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 0.4391,  2267.56,   new Date().getTime(),PerpOrderType.postOnly));        
            

            if (transactionInstructions.length > 0) {
                console.log("# of transactionInstructions:", transactionInstructions.length)
                promises.push(postTrades(client.client, client.group, transactionInstructions, []));
            }
        }

        await Promise.all(promises)
    } catch (error) {
        console.log(error);
    }
}


(async () => {
    // await keepPricesRefreshed();
    await executeTrade();
})();
