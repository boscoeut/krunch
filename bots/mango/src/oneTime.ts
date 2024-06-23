import {
    Group,
    MangoAccount,
    MangoClient,
    toNative,
    PerpOrderSide,
    PerpOrderType,
    PerpSelfTradeBehavior
} from '@blockworks-foundation/mango-v4';
import {
    PublicKey
} from '@solana/web3.js';
import {
    HELIUS_JANE_CONNECTION_URL,
    JUP_MINT,
    SOL_MINT,
    USDC_MINT
} from './constants';
import fs from 'fs';
import { AccountDefinition } from './types';
import { getClient, getUser, setupClient, toFixedFloor, sleep } from './mangoUtils';


async function borrow(borrowAmount: number, mint: string, client: MangoClient,
    mangoAccount: MangoAccount, group: Group) {
    const mintPk = new PublicKey(mint)
    const borrowAmountBN = toNative(borrowAmount, group.getMintDecimals(mintPk));
    const result = await client.tokenWithdrawNativeIx(group, mangoAccount!, mintPk, borrowAmountBN, false)
    return result;
}

async function deposit(depositAmount: number, mint: string, client: MangoClient,
    mangoAccount: MangoAccount, group: Group, user: string) {
    const mintPk = new PublicKey(mint)
    const decimals = group.getMintDecimals(mintPk);
    const depositAmountBN = toNative(depositAmount, decimals);
    console.log("Depositing for user", user, "amount", depositAmountBN.toString())

    try {
        return await client.tokenDepositNative(group, mangoAccount!, mintPk, depositAmountBN)
    } catch (e) {
        console.log("Error depositing for user ", user, e)
        throw e;
    }
}

async function cancelOpenOrders(market: string, client: MangoClient,
    mangoAccount: MangoAccount, group: Group, limit: number = 10) {
    const values = group.perpMarketsMapByMarketIndex.values()
    const perpMarket: any = Array.from(values).find((perpMarket: any) => perpMarket.name === market);
    return await client.perpCancelAllOrdersIx(group, mangoAccount!, perpMarket.perpMarketIndex, limit)
}

async function placePeggedPerpOrder(market: string, client: MangoClient,
    mangoAccount: MangoAccount, group: Group, side: PerpOrderSide,
    size: number, priceOffset: number, clientOrderId: number,
    expiryTimestamp?: number) {
    const values = group.perpMarketsMapByMarketIndex.values()
    const perpMarket: any = Array.from(values).find((perpMarket: any) => perpMarket.name === market);

    // if (size > 20) throw new Error("Size must be less than 20")

    const buffer = side === PerpOrderSide.bid ? -1 * priceOffset : priceOffset
    return await client.perpPlaceOrderPeggedV2Ix(
        group,
        mangoAccount!,
        perpMarket.perpMarketIndex,
        side,
        buffer,// price Offset
        toFixedFloor(size),// size
        undefined, //piglimit
        undefined,//maxQuoteQuantity,
        clientOrderId,//clientOrderId,
        PerpOrderType.limit,
        PerpSelfTradeBehavior.cancelProvide,
        false, //reduceOnly
        expiryTimestamp, //expiryTimestamp,
        undefined // limit
    )
}

async function placePerpOrder(market: string, client: MangoClient,
    mangoAccount: MangoAccount, group: Group, side: PerpOrderSide,
    size: number, price: number, clientOrderId: number, perpOrderType: PerpOrderType = PerpOrderType.postOnly,
    expiryTimestamp?: number) {
    const values = group.perpMarketsMapByMarketIndex.values()
    const perpMarket: any = Array.from(values).find((perpMarket: any) => perpMarket.name === market);

    // if (size > 20) throw new Error("Size must be less than 5")

    return await client.perpPlaceOrderV2Ix(
        group,
        mangoAccount!,
        perpMarket.perpMarketIndex,
        side,
        price,// price Offset
        toFixedFloor(size),// size
        undefined,//maxQuoteQuantity,
        clientOrderId,//clientOrderId,
        perpOrderType,
        PerpSelfTradeBehavior.cancelProvide,
        false, //reduceOnly
        expiryTimestamp, //expiryTimestamp,
        undefined // limit
    )
}


async function settleFunds(client: MangoClient,
    mangoAccount: MangoAccount, group: Group, market: string) {
    const values = group.perpMarketsMapByMarketIndex.values()
    const perpMarket: any = Array.from(values).find((perpMarket: any) => perpMarket.name === market);
    const perpPosition = mangoAccount.getPerpPosition(perpMarket.perpMarketIndex)
    const mangoAccountPnl = perpPosition?.getEquityUi(perpMarket)

    if (mangoAccountPnl === undefined)
        throw new Error('Unable to get account P&L')

    const allMangoAccounts = await client.getAllMangoAccounts(group, true)

    let settleCandidates: any = []
    let index = 0
    let indexAmount = 25
    while (true) {
        try {
            settleCandidates = await perpMarket.getSettlePnlCandidates(
                client,
                group,
                allMangoAccounts.slice(index, indexAmount),
                mangoAccountPnl < 0 ? 'positive' : 'negative',
                2,
            )
        } catch (e: any) {
            console.error('Error finding settle Candidate : ' + index)
        }
        if (settleCandidates.length > 0 || index > allMangoAccounts.length) break;
        index += indexAmount

        console.log(market + ' index', index, "# of items", allMangoAccounts.length)
    }

    if (settleCandidates.length === 0) {
        throw new Error('No settle candidates found')
    }

    const profitableAccount =
        mangoAccountPnl < 0 ? settleCandidates[0].account : mangoAccount
    const unprofitableAccount =
        mangoAccountPnl > 0 ? settleCandidates[0].account : mangoAccount

    const { signature: txid, slot } = await client.perpSettlePnlAndFees(
        group,
        profitableAccount,
        unprofitableAccount,
        mangoAccount,
        mangoAccount,
        perpMarket.perpMarketIndex,
    )

    console.log('Transaction Complete', txid, slot)
}


async function postTrades(client: MangoClient, group: Group, tradeInstructions: any, addressLookupTables: any) {
    const result = await client.sendAndConfirmTransactionForGroup(
        group,
        tradeInstructions,
        { alts: [...group.addressLookupTablesList, ...addressLookupTables] },
    );
    console.log('Transaction Complete', result);
}

async function cancelAllOrders(transactionInstructions: Array<any> = [], client: any, limit: number = 10) {
    transactionInstructions.push(await cancelOpenOrders("SOL-PERP", client.client, client.mangoAccount!, client.group, limit));
    transactionInstructions.push(await cancelOpenOrders("BTC-PERP", client.client, client.mangoAccount!, client.group, limit));
    transactionInstructions.push(await cancelOpenOrders("ETH-PERP", client.client, client.mangoAccount!, client.group, limit));
    transactionInstructions.push(await cancelOpenOrders("RENDER-PERP", client.client, client.mangoAccount!, client.group, limit));
}

async function makeDeposits(depositDefinitions: Array<{ amount: number, mint: string, user: string }>) {
    const priorityFee = 1;
    let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
    const promises: Array<Promise<any>> = []
    for (const depositDefinition of depositDefinitions) {
        const user = accountDefinitions.find(account => account.name === depositDefinition.user)
        const client = await setupClient(user!, priorityFee);
        const p = deposit(depositDefinition.amount, depositDefinition.mint, client.client, client.mangoAccount!, client.group, depositDefinition.user)
        promises.push(p)
    }
    await Promise.all(promises)
}

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
        const priorityFee = 40_000;
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
            // transactionInstructions.push(await cancelOpenOrders("SOL-PERP", client.client, client.mangoAccount!, client.group));
            // transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 1,  142.95,   new Date().getTime(),PerpOrderType.immediateOrCancel));
            // // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,1, 0, new Date().getTime()));
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask,1, 0.6, new Date().getTime()));
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask,1, 1, new Date().getTime()));
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask,10, 3, new Date().getTime()));
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask,10, 4, new Date().getTime()));
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask,10, 5, new Date().getTime()));
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask,96, 7, new Date().getTime()));
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 0.1, 0.15, new Date().getTime()));
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 0.1, 0.25, new Date().getTime()));
            // transactionInstructions.push(await placePeggedPerpOrder( "SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 1, 0.20, new Date().getTime()));
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 20, 8, new Date().getTime()));
            // transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 91.37, 153,   new Date().getTime(),PerpOrderType.limit));

            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 86.37, 0.50 + 153.10 - 144.67, new Date().getTime()));

            // transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 20,  147.87,   new Date().getTime(),PerpOrderType.limit));
            // transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 1,  148.75,   new Date().getTime(),PerpOrderType.limit));
            // transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 80,  158,   new Date().getTime(),PerpOrderType.limit));
            // transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 0.24,  147.75,   new Date().getTime(),PerpOrderType.limit));
         
            //    transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,1, -0.2, new Date().getTime(), new Date().getTime()/1000+20));


            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,1, -0.15, new Date().getTime()));
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask,5, 0.5, new Date().getTime()));

            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,  1, -0.2, new Date().getTime(), new Date().getTime()/1000+180));
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask,10, 0.2, new Date().getTime(), new Date().getTime()/1000+70));
            // transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 1,  146.75,   new Date().getTime(),PerpOrderType.limit));
            // transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 0.87,  146.5,   new Date().getTime(),PerpOrderType.limit));
            //  transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 0.87,  147.15,   new Date().getTime(),PerpOrderType.limit));


            // await settleFunds(client.client, client.mangoAccount!, client.group, "ETH-PERP");
            // await settleFunds(client.client, client.mangoAccount!, client.group, "SOL-PERP");
            // await settleFunds(client.client, client.mangoAccount!, client.group,"BTC-PERP");

            // await cancelAllOrders(transactionInstructions, client, 5);
            // transactionInstructions.push(await placePeggedPerpOrder("BTC-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 0.0075, 10, new Date().getTime()));
            // promises.push(makeDeposits([{ amount: 150, mint: USDC_MINT, user: accountName }]))

            // transactionInstructions.push(await placePerpOrder("RENDER-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 200,  9.1769,   new Date().getTime(),PerpOrderType.immediateOrCancel));

            // transactionInstructions.push(await cancelOpenOrders("BTC-PERP", client.client, client.mangoAccount!, client.group));
            // transactionInstructions.push(await placePerpOrder("ETH-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 0.1,    3732.59,  new Date().getTime()));
            // transactionInstructions.push(await placePerpOrder("BTC-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 0.007,  71300,   new Date().getTime(),PerpOrderType.immediateOrCancel));


            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask,64.43, 0.0, new Date().getTime()));
            // transactionInstructions.push(await placePeggedPerpOrder("BTC-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 0.0005, 0.0, new Date().getTime()));
            // transactionInstructions.push(await cancelOpenOrders("ETH-PERP", client.client, client.mangoAccount!, client.group));

            // transactionInstructions.push(await placePerpOrder("ETH-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 2,  3545,   new Date().getTime(),PerpOrderType.limit));

            // transactionInstructions.push(await placePeggedPerpOrder("ETH-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 1, 0.1, new Date().getTime()));
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 153, .375, new Date().getTime()));
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 1, 0.1, new Date().getTime()));
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 40,1.25, new Date().getTime()));

            // transactionInstructions.push(await placePeggedPerpOrder("RENDER-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 320, 0.01, new Date().getTime()));
            if (accountName === "DRIFT") {
                // transactionInstructions.push(await cancelOpenOrders("ETH-PERP", client.client, client.mangoAccount!, client.group));
                // transactionInstructions.push(await cancelOpenOrders("BTC-PERP", client.client, client.mangoAccount!, client.group));
                // transactionInstructions.push(await placePerpOrder("BTC-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 0.0001, 71000,  new Date().getTime(), PerpOrderType.limit));
                // transactionInstructions.push(await placePerpOrder("ETH-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 0.001, 3850,  new Date().getTime(), PerpOrderType.limit));

                // await cancelAllOrders(transactionInstructions, client, 10);
                // transactionInstructions.push(await cancelOpenOrders("ETH-PERP", client.client, client.mangoAccount!, client.group));
                // transactionInstructions.push(await cancelOpenOrders("SOL-PERP", client.client, client.mangoAccount!, client.group));
                // transactionInstructions.push(await cancelOpenOrders("ETH-PERP", client.client, client.mangoAccount!, client.group));
                // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 1.85, 0, new Date().getTime()));
                // transactionInstructions.push(await placePeggedPerpOrder("ETH-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 0.063, 0, new Date().getTime()));
            }

            if (accountName === "PRIVATE3") {
                // await refreshOrders(client.mangoAccount!, client.client, client.group);
                // await cancelAllOrders(transactionInstructions, client, 10);
                // transactionInstructions.push(await placePerpOrder("RENDER-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,30, 10.87, new Date().getTime(), PerpOrderType.immediateOrCancel));
                // transactionInstructions.push(await placePeggedPerpOrder("RENDER-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 0.005, 0.1, new Date().getTime()));
                // transactionInstructions.push(await placePeggedPerpOrder("ETH-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 0.001, 0.75, new Date().getTime()));
                // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 0.01, .05, new Date().getTime()));
                // transactionInstructions.push(await placePeggedPerpOrder("BTC-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 0.0001, 20, new Date().getTime()));
            }

            // promises.push(makeDeposits([{ amount: 2745.3422, mint: USDC_MINT, user: accountName }]))
            // promises.push(makeDeposits([{ amount: 0.00048988, mint: "6DNSN2BJsaPFdFFc1zP37kkeNe4Usc1Sqkzr9C9vPWcU", user: accountName }]))
            // transactionInstructions.push(...await borrow(0.00004232,"7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",client.client,client.mangoAccount!,client.group))
            // transactionInstructions.push(...await borrow(88.297064,USDC_MINT,client.client,client.mangoAccount!,client.group))
            // transactionInstructions.push(await cancelOpenOrders("RENDER-PERP", client.client, client.mangoAccount!, client.group));
            // transactionInstructions.push(await cancelOpenOrders("SOL-PERP", client.client, client.mangoAccount!, client.group));
            // transactionInstructions.push(await cancelOpenOrders("ETH-PERP", client.client, client.mangoAccount!, client.group));

            if (transactionInstructions.length > 0) {
                promises.push(postTrades(client.client, client.group, transactionInstructions, []));
            }
        }

        await Promise.all(promises)
    } catch (error) {
        console.log(error);
    }
}

async function keepPricesRefreshed() {
    try {
        while (true) {
            await refreshOrders();
            await sleep(1000 * 60 * 3);
        }
    } catch (error) {
        console.log(error);
    }
}

(async () => {
    // await keepPricesRefreshed();
    await executeTrade();
})();
