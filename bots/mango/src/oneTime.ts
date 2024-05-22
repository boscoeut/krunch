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

async function deposit(borrowAmount: number, mint: string, client: MangoClient,
    mangoAccount: MangoAccount, group: Group) {
    const mintPk = new PublicKey(mint)
    const borrowAmountBN = toNative(borrowAmount, group.getMintDecimals(mintPk));
    return await client.tokenDepositNative(group, mangoAccount!, mintPk, borrowAmountBN, true)
}

async function cancelOpenOrders(market: string, client: MangoClient,
    mangoAccount: MangoAccount, group: Group) {
    const values = group.perpMarketsMapByMarketIndex.values()
    const perpMarket: any = Array.from(values).find((perpMarket: any) => perpMarket.name === market);
    return await client.perpCancelAllOrdersIx(group, mangoAccount!, perpMarket.perpMarketIndex, 10)
}

async function placePeggedPerpOrder(market: string, client: MangoClient,
    mangoAccount: MangoAccount, group: Group, side: PerpOrderSide,
    size: number, priceOffset: number, clientOrderId: number) {
    const values = group.perpMarketsMapByMarketIndex.values()
    const perpMarket: any = Array.from(values).find((perpMarket: any) => perpMarket.name === market);

    if (size > 20) throw new Error("Size must be less than 20")

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
        undefined, //expiryTimestamp,
        undefined // limit
    )
}

async function placePerpOrder(market: string, client: MangoClient,
    mangoAccount: MangoAccount, group: Group, side: PerpOrderSide,
    size: number, price: number, clientOrderId: number) {
    const values = group.perpMarketsMapByMarketIndex.values()
    const perpMarket: any = Array.from(values).find((perpMarket: any) => perpMarket.name === market);

    if (size > 15) throw new Error("Size must be less than 5")

    return await client.perpPlaceOrderV2Ix(
        group,
        mangoAccount!,
        perpMarket.perpMarketIndex,
        side,
        price,// price Offset
        toFixedFloor(size),// size
        undefined,//maxQuoteQuantity,
        clientOrderId,//clientOrderId,
        PerpOrderType.postOnly,
        PerpSelfTradeBehavior.cancelProvide,
        false, //reduceOnly
        undefined, //expiryTimestamp,
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

(async () => {
    try {
        const priorityFee = 100;
        let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
        const user = accountDefinitions.find(account => account.name === "BIRD")
        const client = await setupClient(user!, priorityFee);

        let transactionInstructions: Array<any> = [];
        //  await deposit( 7.801777255, SOL_MINT, client.client, client.mangoAccount!, client.group);
        transactionInstructions.push(...(await borrow(1000, USDC_MINT, client.client, client.mangoAccount!, client.group)));
        //  transactionInstructions.push(await cancelOpenOrders("SOL-PERP", client.client, client.mangoAccount!, client.group));
        // transactionInstructions.push(await cancelOpenOrders("RENDER-PERP", client.client, client.mangoAccount!, client.group));
        //    transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask,5,178.450,new Date().getTime()));
        //    transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask,5,178.55,new Date().getTime()));
        //    transactionInstructions.push(await placePerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask,5,178.5,new Date().getTime()));
        //    transactionInstructions.push(await placePerpOrder("RENDER-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask,10,11.0,new Date().getTime()));

        //  transactionInstructions.push(await placePeggedPerpOrder("SOL-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.ask,5, 0.05 ,new Date().getTime()));
        //  transactionInstructions.push(await placePeggedPerpOrder("RENDER-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid,15, 0.01 ,new Date().getTime()));

        // transactionInstructions.push(await placePeggedPerpOrder("BTC-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 0.005, 30, new Date().getTime()));
        // transactionInstructions.push(await placePeggedPerpOrder("ETH-PERP", client.client, client.mangoAccount!, client.group, PerpOrderSide.bid, 0.1, 1.5, new Date().getTime()));

        if (transactionInstructions.length > 0) {
            await postTrades(client.client, client.group, transactionInstructions, []);
        }

    } catch (error) {
        console.log(error);
    }

})();
