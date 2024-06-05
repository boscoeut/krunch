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
    JUP_MINT,
    SOL_MINT,
    USDC_MINT
} from './constants';
import fs from 'fs';
import { AccountDefinition } from './types';
import { getClient, getUser, setupClient, toFixedFloor } from './mangoUtils';


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

(async () => {
    try {
        const priorityFee = 20000;
        // const accounts: Array<string> = ["ACCOUNT2", "BIRD", "BUCKET", "DRIFT", "FIVE", "SEVEN", "SIX", "SOL_FLARE", "PRIVATE3"]
        // const accounts: Array<string> = [ "BIRD", "BUCKET", "DRIFT", "FIVE", "SEVEN", "SIX", "SOL_FLARE", "PRIVATE3"]
        // const accounts:Array<string> = ["BIRD","ACCOUNT2","SOL_FLARE","BUCKET"]
        const accounts: Array<string> = ["PRIVATE3","DRIFT"]
        // const accounts: Array<string> = ["DRIFT"]
        let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)

        const promises: Array<Promise<any>> = []
        for (const accountName of accounts) {
            const user = accountDefinitions.find(account => account.name === accountName)
            const client = await setupClient(user!, priorityFee);

            let transactionInstructions: Array<any> = [];

            // promises.push(makeDeposits([{ amount: 150, mint: USDC_MINT, user: accountName }]))

            await cancelAllOrders(transactionInstructions, client, 10);
            // transactionInstructions.push(await cancelOpenOrders("BTC-PERP", client.client, client.mangoAccount!, client.group));
            // transactionInstructions.push(await placePerpOrder("ETH-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 0.1,    3732.59,  new Date().getTime()));
            // transactionInstructions.push(await placePerpOrder("BTC-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 0.001,  69075,   new Date().getTime(),PerpOrderType.immediateOrCancel));
            // transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 5.89, 173.30,  new Date().getTime(), PerpOrderType.immediateOrCancel));
            // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 1, 0, new Date().getTime()));
            if (accountName === "DRIFT"){
                // transactionInstructions.push(await cancelOpenOrders("ETH-PERP", client.client, client.mangoAccount!, client.group));
                // transactionInstructions.push(await cancelOpenOrders("BTC-PERP", client.client, client.mangoAccount!, client.group));
                // transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 1, 168.5,  new Date().getTime(), PerpOrderType.limit));
                // transactionInstructions.push(await placePerpOrder("BTC-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 0.0001, 71000,  new Date().getTime(), PerpOrderType.limit));
                // transactionInstructions.push(await placePerpOrder("ETH-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 0.001, 3850,  new Date().getTime(), PerpOrderType.limit));

                // transactionInstructions.push(await placePeggedPerpOrder("ETH-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 0.001, 25, new Date().getTime()));
                // transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 0.01, 0.3, new Date().getTime()));
                // transactionInstructions.push(await placePeggedPerpOrder("BTC-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 0.0001, 100, new Date().getTime()));
                // transactionInstructions.push(await placePeggedPerpOrder("BTC-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 0.005, 5, new Date().getTime()));
            }
            
            if (accountName === "PRIVATE3") {
                // await cancelAllOrders(transactionInstructions, client, 10);
                // transactionInstructions.push(await placePerpOrder("RENDER-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,20, 10.3155, new Date().getTime(), PerpOrderType.immediateOrCancel));
                // transactionInstructions.push(await placePeggedPerpOrder("RENDER-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask, 1, 0.1, new Date().getTime()));                
            } 
            
            // promises.push(makeDeposits([{ amount: 250, mint: USDC_MINT, user: accountName }]))
            // transactionInstructions.push(...await borrow(150,USDC_MINT,client.client,client.mangoAccount!,client.group))
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

})();
