import {
    Group,
    MangoAccount,
    MangoClient,
    PerpOrderSide,
    PerpOrderType,
    PerpSelfTradeBehavior,
    toNative
} from '@blockworks-foundation/mango-v4';
import {
    PublicKey
} from '@solana/web3.js';
import fs from 'fs';
import { setupClient, toFixedFloor } from './mangoUtils';
import { AccountDefinition } from './types';


export async function borrow(borrowAmount: number, mint: string, client: MangoClient,
    mangoAccount: MangoAccount, group: Group, borrow:boolean=false) {
    const mintPk = new PublicKey(mint)
    const borrowAmountBN = toNative(borrowAmount, group.getMintDecimals(mintPk));
    const result = await client.tokenWithdrawNativeIx(group, mangoAccount!, mintPk, borrowAmountBN, borrow)
    return result;
}

export async function deposit(depositAmount: number, mint: string, client: MangoClient,
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

export async function cancelOpenOrders(market: string, client: MangoClient,
    mangoAccount: MangoAccount, group: Group, limit: number = 10) {
    const values = group.perpMarketsMapByMarketIndex.values()
    const perpMarket: any = Array.from(values).find((perpMarket: any) => perpMarket.name === market);
    return await client.perpCancelAllOrdersIx(group, mangoAccount!, perpMarket.perpMarketIndex, limit)
}

export async function placePeggedPerpOrder(market: string, client: MangoClient,
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

export async function placePerpOrder(market: string, client: MangoClient,
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

export async function settleFunds(client: MangoClient,
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


export async function postTrades(client: MangoClient, group: Group, tradeInstructions: any, addressLookupTables: any) {
    const result = await client.sendAndConfirmTransactionForGroup(
        group,
        tradeInstructions,
        { alts: [...group.addressLookupTablesList, ...addressLookupTables] },
    );
    console.log('Transaction Complete', result);
}

export async function cancelAllOrders(transactionInstructions: Array<any> = [], client: any, limit: number = 10) {
    transactionInstructions.push(await cancelOpenOrders("SOL-PERP", client.client, client.mangoAccount!, client.group, limit));
    transactionInstructions.push(await cancelOpenOrders("BTC-PERP", client.client, client.mangoAccount!, client.group, limit));
    transactionInstructions.push(await cancelOpenOrders("ETH-PERP", client.client, client.mangoAccount!, client.group, limit));
    transactionInstructions.push(await cancelOpenOrders("RENDER-PERP", client.client, client.mangoAccount!, client.group, limit));
}

export async function makeDeposits(depositDefinitions: Array<{ amount: number, mint: string, user: string }>) {
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
