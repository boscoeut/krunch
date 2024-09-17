import {
    Group,
    HealthType,
    MANGO_V4_ID,
    MangoAccount,
    MangoClient,
    PerpOrderSide,
    PerpOrderType,
    PerpSelfTradeBehavior
} from '@blockworks-foundation/mango-v4';
import { AnchorProvider, Wallet as CoralWallet } from '@coral-xyz/anchor';
import {
    BASE_PRECISION,
    BN,
    DriftClient,
    MarketType,
    OrderType,
    PRICE_PRECISION,
    PositionDirection,
    PostOnlyParams, User, decodeName,
    Wallet
} from "@drift-labs/sdk";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import pkg from 'bs58';
import fs from 'fs';
import { CONNECTION_URL, SPREADSHEET_ID } from '../../mango/src/constants';
const { decode } = pkg;
import { authorize, toGoogleSheetsDate } from '../../mango/src/googleUtils';
import { getFundingRate } from '../../mango/src/mangoUtils';
import { checkBalances } from '../../mango/src/getWalletBalances';

const DRIFT_ENV = 'mainnet-beta';
const SIX_PUBLIC_KEY = 'HpBSY6mP4khefkaDaWHVBKN9q4w7DMfV1PkCwPQudUMw'

interface SolanaTransaction {
    signature: string,
    exchange: 'DRIFT' | 'MANGO',
    market: string,
    error: string
}

interface DBItem {
    MARKET: string,
    PNL: number,
    VALUE: number,
    ADJUSTED_VALUE: number,
    ORDER: number,
    EXCHANGE: string,
    PRICE: number,
    BASELINE: number,
    PLACE_ORDERS: boolean
}

const dbPositions: Array<DBItem> = []
const solTransactions: Array<SolanaTransaction> = []
const dbStatus = {
    DRIFT_HEALTH: 0,
    MANGO_HEALTH: 0,
    DRIFT_FUNDING: 0,
    MANGO_FUNDING: 0,
    SOL_FUNDING: 0,
    MANGO_SOL_FUNDING_RATE: 0,
    MANGO_ETH_FUNDING_RATE: 0,
    MANGO_BTC_FUNDING_RATE: 0,
    DRIFT_SOL_FUNDING_RATE: 0,
    DRIFT_ETH_FUNDING_RATE: 0,
    DRIFT_BTC_FUNDING_RATE: 0,
    MANGO_ETH_FUNDING: 0,
    MANGO_SOL_FUNDING: 0,
    MANGO_BTC_FUNDING: 0,
    LAST_UPDATED: new Date(),
    DRIFT_VALUE: 0,
    MANGO_VALUE: 0,
    DRIFT_PRICE: 0,
    SOL_PRICE: 0,
    JUP_PRICE: 0,
    DRIFT_USDC: 0,
    MANGO_USDC: 0
}

function getKeyPair(file: string) {
    const base64String = fs.readFileSync(`./secrets/${file}.txt`, 'utf-8');
    const privateKeyUint8Array = decode(base64String);
    return Keypair.fromSecretKey(privateKeyUint8Array);
}

const PRICE_NUM_DECIMALS = 6;
const PRICE_DECIMALS = 10 ** PRICE_NUM_DECIMALS;
const AMOUNT_DECIMALS = 10 ** 9;

const DRIFT_MARKETS = {
    JUP: 24,
    ETH: 2,
    BTC: 1,
    SOL: 0,
    DRIFT: 30
}

interface Market {
    symbol: string,
    exchange: 'DRIFT' | 'MANGO',
    spread: number,
    baseline: number
}

interface AnalyzeProps {
    driftUser: any,
    transactionInstructions: Array<any>,
    maxTradeAmount: number,
    minTradeValue: number,
    driftClient: DriftClient,
    market: Market,
    mangoAccount: MangoAccount,
    mangoClient: MangoClient,
    mangoGroup: Group
}

async function buySell(
    side: "BUY" | "SELL",
    spread: number,
    maxTradeAmount: number,
    symbol: string,
    marketIndex: number,
    priceSpread: number,
    transactionInstructions: Array<any>,
    oraclePrice: number,
    minTradeValue: number = 20,
    exchange: 'DRIFT' | 'MANGO' = 'DRIFT'
) {

    const minTradeSize = Math.min(spread, maxTradeAmount)
    let tradeSize = minTradeSize / oraclePrice
    const price = oraclePrice + (side === "BUY" ? -1 : 1) * priceSpread
    let tradeValue = tradeSize * price

    if (tradeValue < minTradeValue) {
        console.log(`${symbol} ${side} Trade Value = ${tradeValue}  Min Trade Value = ${minTradeValue} trade value is too small`)
    }
    else if (tradeSize < 0) {
        console.log(`${symbol} ${side} ${tradeSize} is too small`)
    } else {
        console.log(`${exchange} ${symbol} ${side} ${tradeSize} for ${price} Total = ${tradeSize * price}.  Oracle = ${oraclePrice} \n`)
        const orderParams = {
            marketIndex: marketIndex,
            side,
            exchange,
            symbol,
            tradeSize,
            price
        }
        transactionInstructions.push(orderParams)
    }
}

const convertPrice = (price: number) => {
    return price / PRICE_DECIMALS;
}

const convertAmount = (price: number) => {
    return price / AMOUNT_DECIMALS;
}

async function getDriftMakretPrice(driftClient: DriftClient, marketIndex: number) {
    const marketAccount = driftClient.getPerpMarketAccount(marketIndex);
    if (!marketAccount) throw new Error('Market not found');
    const oraclePrice = marketAccount.amm.lastOracleNormalisedPrice;
    const oracle = oraclePrice.toNumber() / PRICE_PRECISION.toNumber();
    return oracle;
}

async function getDriftPosition(user: User, marketIndex: number, symbol: string, driftClient: DriftClient) {
    const perpPosition = user.getPerpPosition(marketIndex);
    const baseAssetAmount = perpPosition?.baseAssetAmount?.toNumber() || 0
    let baseAsset = convertAmount(baseAssetAmount);

    const quoteBreakEvenAmount = perpPosition?.quoteBreakEvenAmount?.toNumber() || 0
    const quoteEntryAmount = perpPosition?.quoteEntryAmount?.toNumber() || 0

    let breakEvenPrice = convertPrice(AMOUNT_DECIMALS * Math.abs(quoteBreakEvenAmount / baseAssetAmount));
    let entryPrice = convertPrice(AMOUNT_DECIMALS * Math.abs(quoteEntryAmount / baseAssetAmount || 0));
    const baseAmount = entryPrice * baseAsset

    const marketAccount = driftClient.getPerpMarketAccount(marketIndex);
    if (!marketAccount) throw new Error('Market not found');

    const oraclePrice = marketAccount.amm.lastOracleNormalisedPrice;
    const oracle = oraclePrice.toNumber() / PRICE_PRECISION.toNumber();
    let currentAmount = oracle * baseAsset

    let pnl = currentAmount - baseAmount
    if (baseAsset < 0) {
        pnl = baseAmount * -1 + currentAmount
    }
    const perpMarketAccount = driftClient.getPerpMarketAccount(marketIndex);
    const fundingRate24H = perpMarketAccount!.amm.last24HAvgFundingRate.toNumber()

    if (symbol === "ETH") {
        dbStatus.DRIFT_ETH_FUNDING_RATE = fundingRate24H * 24 * 365 / 10 ** 11
        console.log(symbol + ' fundingRate24H', dbStatus.DRIFT_ETH_FUNDING_RATE)
    } else if (symbol === "SOL") {
        dbStatus.DRIFT_SOL_FUNDING_RATE = fundingRate24H * 24 * 365 / 10 ** 9
        console.log(symbol + ' fundingRate24H', dbStatus.DRIFT_SOL_FUNDING_RATE)
    } else if (symbol === "BTC") {
        dbStatus.DRIFT_BTC_FUNDING_RATE = fundingRate24H * 24 * 365 / 10 ** 11
        console.log(symbol + ' fundingRate24H', dbStatus.DRIFT_BTC_FUNDING_RATE)
    }

    console.log('--');
    console.log('*** Break Even Price:', breakEvenPrice);
    console.log('*** Entry Price:', entryPrice);
    console.log('*** Oracle Price:', oracle);
    console.log('*** Pnl:', pnl);
    console.log('*** Base Asset:', baseAsset);
    console.log('*** value:', currentAmount);

    return {
        price: oracle,
        baseAsset,
        breakEvenPrice,
        entryPrice,
        pnl,
        marketIndex,
        symbol,
        value: currentAmount,
        existingOrders: []
    }
}

async function getMangoPosition(marketIndex: number, symbol: string, mangoGroup: Group, mangoClient: MangoClient, mangoAccount: MangoAccount) {
    const values = mangoGroup.perpMarketsMapByMarketIndex.values()
    const valuesArray = Array.from(values)
    const perpMarket: any = valuesArray.find((perpMarket: any) => perpMarket.name === `${symbol}-PERP`);
    const perpPosition = mangoAccount
        .perpActive()
        .find((pp: any) => pp.marketIndex === perpMarket!.perpMarketIndex);
    const entryPrice = perpPosition?.getAverageEntryPriceUi(perpMarket) || 0
    const positionSize = perpPosition?.getBasePositionUi(perpMarket) || 0
    const pnl = perpPosition?.getUnRealizedPnlUi(perpMarket) || 0
    const value = positionSize * perpMarket.uiPrice
    const price = perpMarket.uiPrice

    const funding = perpPosition?.getCumulativeFunding(perpMarket)
    if (value !== 0) {
        const fundingAmount = ((funding?.cumulativeShortFunding || 0) - (funding!.cumulativeLongFunding || 0)) / 10 ** 6
        dbStatus.MANGO_FUNDING += fundingAmount
        if (symbol === "ETH") {
            dbStatus.MANGO_ETH_FUNDING = fundingAmount
        } else if (symbol === "SOL") {
            dbStatus.MANGO_SOL_FUNDING = fundingAmount
        } else if (symbol === "BTC") {
            dbStatus.MANGO_BTC_FUNDING = fundingAmount
        }
    }

    const existingOrders = await mangoAccount!.loadPerpOpenOrdersForMarket(
        mangoClient,
        mangoGroup,
        perpMarket.perpMarketIndex,
        true
    )

    console.log('--');
    console.log('*** Break Even Price:', entryPrice);
    console.log('*** Entry Price:', entryPrice);
    console.log('*** Oracle Price:', price);
    console.log('*** Pnl:', pnl);
    console.log('*** Base Asset:', positionSize);
    console.log('*** value:', value);

    return {
        price,
        baseAsset: positionSize,
        breakEvenPrice: entryPrice,
        entryPrice,
        pnl,
        marketIndex,
        symbol,
        value,
        existingOrders
    }
}

async function analyzeMarket(props: AnalyzeProps) {
    const { driftUser, transactionInstructions, minTradeValue, maxTradeAmount, driftClient, market } = props;
    let shortPnl = 0
    let longPnl = 0
    let longValue = 0
    let shortValue = 0
    let baseline = 0

    const positions: Array<any> = []

    const marketIndex = (DRIFT_MARKETS as any)[market.symbol]
    const position = market.exchange === 'DRIFT' ?
        await getDriftPosition(driftUser, marketIndex, market.symbol, driftClient) :
        await getMangoPosition(marketIndex, market.symbol, props.mangoGroup, props.mangoClient, props.mangoAccount)

    const entryPrice = position.entryPrice || 0
    const positionSize = position.baseAsset || 0
    const pnl = (position.pnl || 0)
    const side = baseline > 0 ? "LONG" : "SHORT"
    const value = (position.value || 0)
    const adjustedValue = value + pnl * (side === "LONG" ? 1 : -1)
    baseline += market.baseline
    const price = position.price
    if (side === "SHORT") {
        shortPnl += pnl
        shortValue += value;
    } else if (side === "LONG") {
        longPnl += pnl
        longValue += value;
    }

    dbPositions.push({
        MARKET: market.symbol,
        PNL: pnl,
        VALUE: value,
        ADJUSTED_VALUE: adjustedValue,
        ORDER: 0,
        EXCHANGE: market.exchange,
        PRICE: price,
        BASELINE: market.baseline,
        PLACE_ORDERS: false
    })
    positions.push({
        symbol: market.symbol,
        pnl,
        entryPrice,
        positionSize,
        side,
        value,
        price,
        spread: market.spread,
        adjustedValue,
        marketIndex,
        exchange: market.exchange,
        existingOrders: position.existingOrders
    })
    console.log(`${market.exchange}: ${market.symbol} ${side} PNL: ${pnl} Value: ${value} Price: ${price} Entry Price: ${entryPrice} Position Size: ${positionSize}`)

    const totalPnl = shortPnl + longPnl
    const totalLongValue = longValue + longPnl
    const totalShortValue = shortValue - shortPnl
    let totalSpread = (longValue + shortValue)
    if (baseline < 0) {
        totalSpread += totalPnl * -2
    }

    console.log(`
        total spread:  ${totalSpread}
        maxTradeAmount: ${maxTradeAmount}

        TOTAL PNL: ${totalPnl}

        Short Pnl: ${shortPnl}
        Long Pnl: ${longPnl}

        Total Long Value: ${totalLongValue}
        Total Short Value: ${totalShortValue}
        Diff: ${totalSpread}   
    `)

    const enabledPositions = positions

    if (totalSpread > baseline) {
        // longs exceed shorts -- SELL
        const amt = totalSpread - baseline
        const maxAmount = Math.min(amt, maxTradeAmount)
        const market = enabledPositions[0]
        const canTrade = baseline < 0 || totalPnl > 0
        // if (canTrade) {
        await buySell("SELL", amt, maxAmount, market.symbol, market.marketIndex, market.spread, transactionInstructions, market.price, minTradeValue, market.exchange)
        // }
    } else {
        // shorts exceeds long -- buy        
        const amt = baseline - totalSpread
        const market = enabledPositions[0]
        const canTrade = baseline > 0 || totalPnl > 0
        // if (canTrade) {
        await buySell("BUY", amt, maxTradeAmount, market.symbol, market.marketIndex, market.spread, transactionInstructions, market.price, minTradeValue, market.exchange)
        // }
    }

    const hasExistingMangoOrders = positions.some((a: any) => a.exchange === 'MANGO' && a.existingOrders.length > 0)
    return {
        totalPnl,
        totalLongValue,
        totalShortValue,
        positions,
        hasExistingMangoOrders
    }
}

async function retryTransaction(driftClient: DriftClient, newOrders: any[],
    maxRetries = 3, marketIndex: number, oldDriftOrders: any) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            if (oldDriftOrders.length > 0) {
                console.log('orders cancelled');
                const tx = await driftClient.cancelOrdersByIds(oldDriftOrders.map((a: any) => a.orderId));
                oldDriftOrders.length = 0
            }
            if (newOrders.length > 0) {
                const tx = await driftClient.placeOrders(newOrders);
                console.log('SUCCESSS: New Orders Placed:', newOrders.length);
                const market = Object.entries(DRIFT_MARKETS).find(([key, value]) => value === marketIndex)
                solTransactions.push({
                    signature: `https://solscan.io/tx/${tx}`,
                    exchange: 'DRIFT',
                    market: market ? market[0] : '',
                    error: ''
                })
                console.log('New Orders Tx:', `https://solscan.io/tx/${tx}`);
                return tx;
            }
        } catch (error: any) {
            if (error.message.includes('Blockhash not found') && attempt < maxRetries) {
                console.log(`Attempt ${attempt} failed: Blockhash not found. Retrying...`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
            } else {
                const market = Object.entries(DRIFT_MARKETS).find(([key, value]) => value === marketIndex)
                if (!error.transactionMessage.includes('Blockhash not found') && attempt < maxRetries) {
                    solTransactions.push({
                        signature: ``,
                        exchange: 'DRIFT',
                        market: market ? market[0] : '',
                        error: error.message
                    })
                }
                throw error; // Rethrow if it's not a blockhash error or we've exhausted retries
            }
        }
    }
    throw new Error('Transaction failed after maximum retries');
}

function formatUsdc(usdc: any) {
    return usdc / 10 ** 6
}

async function getDriftClient(connection: Connection, wallet: string) {
    console.time('New Drift Client');
    const driftWallet = new Wallet(getKeyPair(wallet))
    const driftClient = new DriftClient({
        connection,
        wallet: driftWallet,
        env: DRIFT_ENV,

        accountSubscription: {
            resubTimeoutMs: 15000,
            type: 'websocket'

        }
    });
    console.timeEnd('New Drift Client');
    if (driftClient.isSubscribed) {
        console.time('unsubscribe');
        await driftClient.unsubscribe();
        console.timeEnd('unsubscribe');
    }

    console.time('Subscribe');
    await driftClient.subscribe();
    console.timeEnd('Subscribe');

    console.time('Get User');
    const user = driftClient.getUser();
    console.timeEnd('Get User');

    return {
        driftClient, user
    }
}

async function getMangoClient(connection: Connection, wallet: string, accountPublicKey: string) {
    const SOL_GROUP_PK = '78b8f4cGCwmZ9ysPFMWLaLTkkaYnUjwMJYStWe5RTSSX'
    const options = AnchorProvider.defaultOptions();
    options.skipPreflight = false
    const mangoWallet = new CoralWallet(getKeyPair(wallet))
    const provider = new AnchorProvider(connection, mangoWallet, options);
    try {
        const client = MangoClient.connect(provider, 'mainnet-beta', MANGO_V4_ID['mainnet-beta'], {
            idsSource: 'api',
        });
        const group = await client.getGroup(new PublicKey(SOL_GROUP_PK));
        const ids = await client.getIds(group.publicKey);
        const mangoAccount = await client.getMangoAccount(new PublicKey(accountPublicKey));

        return {
            client, group, ids, mangoAccount
        }
    } catch (e: any) {
        throw e
    }
}

function toFixedFloor(num: number, fixed: number = 4): number {
    const power = Math.pow(10, fixed);
    const val = (Math.floor(num * power) / power).toFixed(fixed);
    return Number(val)
}

async function placePerpOrder(market: string, client: MangoClient,
    mangoAccount: MangoAccount, group: Group, side: PerpOrderSide,
    size: number, price: number, clientOrderId: number, perpOrderType: PerpOrderType = PerpOrderType.postOnly,
    expiryTimestamp?: number) {
    const values = group.perpMarketsMapByMarketIndex.values()
    const perpMarket: any = Array.from(values).find((perpMarket: any) => perpMarket.name === market);

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

export async function cancelOpenOrders(market: string, client: MangoClient,
    mangoAccount: MangoAccount, group: Group, limit: number = 10) {
    const values = group.perpMarketsMapByMarketIndex.values()
    const perpMarket: any = Array.from(values).find((perpMarket: any) => perpMarket.name === market);
    return await client.perpCancelAllOrdersIx(group, mangoAccount!, perpMarket.perpMarketIndex, limit)
}

export async function postTrades(client: MangoClient, group: Group, tradeInstructions: any, addressLookupTables: any) {
    try {
        const result = await client.sendAndConfirmTransactionForGroup(
            group,
            tradeInstructions,
            { alts: [...group.addressLookupTablesList, ...addressLookupTables] },
        );
        solTransactions.push({
            signature: `https://solscan.io/tx/${result.signature}`,
            exchange: 'MANGO',
            market: 'SOL',
            error: ''
        })
        console.log('New Orders Tx:', `https://solscan.io/tx/${result.signature}`);
    } catch (x: any) {
        console.error('Transaction Failed', x)
    }
}

async function placeDriftOrders(
    newOrders: any,
    driftClient: DriftClient,
    market: Market,
    driftOrders: any
) {
    try {
        console.time('Place Drift Orders');
        const transactionInstructions: Array<any> = []
        const newDriftOrders = newOrders.filter((a: any) => a.exchange === 'DRIFT')
        if (newDriftOrders.length > 0) {
            console.log('Placing Drift Orders #', newOrders.length);
            for (const order of newDriftOrders) {
                const baseAssetAmount = new BN(order.tradeSize * BASE_PRECISION.toNumber())
                console.log(`baseAssetAmount: ${baseAssetAmount.toNumber()}`)
                const direction = order.side === "BUY" ? PositionDirection.LONG : PositionDirection.SHORT
                const newPrice = new BN(order.price * PRICE_PRECISION.toNumber())
                transactionInstructions.push({
                    orderType: OrderType.LIMIT,
                    marketIndex: order.marketIndex,
                    marketType: MarketType.PERP,
                    postOnly: PostOnlyParams.MUST_POST_ONLY,
                    direction,
                    baseAssetAmount,
                    price: newPrice
                });
            }

        }
        const marketIndex = (DRIFT_MARKETS as any)[market.symbol]
        const existingOrders = driftOrders.filter((a: any) => a.marketIndex === marketIndex)
        if (transactionInstructions.length + existingOrders.length > 0) {
            await retryTransaction(driftClient, transactionInstructions, 5, marketIndex, existingOrders);
        }
    } catch (x: any) {
        console.log('Error Creating Orders:', x)
        if (x?.logs?.length > 0) {
            console.log('Logs:', x.logs);
        }
        console.log(`Place Orders failed`)
    } finally {
        console.timeEnd('Place Drift Orders');
    }

}

async function placeMangoOrders(
    newOrders: any,
    mangoClient: MangoClient,
    mangoAccount: MangoAccount,
    mangoGroup: Group,
    market: Market,
    hasExistingMangoOrders: boolean
) {
    try {
        console.time('Place MANGO Orders');
        const mangoOrders = newOrders.filter((a: any) => a.exchange === 'MANGO')
        const transactionInstructions: Array<any> = []
        if (hasExistingMangoOrders) {
            transactionInstructions.push(await cancelOpenOrders(`${market.symbol}-PERP`, mangoClient, mangoAccount!, mangoGroup));
        }
        if (mangoOrders.length > 0) {
            console.log('Placing MANGO Orders #', newOrders.length);
            for (const order of mangoOrders) {
                transactionInstructions.push(await placePerpOrder(
                    `${order.symbol}-PERP`,
                    mangoClient,
                    mangoAccount!,
                    mangoGroup,
                    order.side === "BUY" ? PerpOrderSide.bid : PerpOrderSide.ask,
                    order.tradeSize,
                    order.price,
                    new Date().getTime(), PerpOrderType.postOnly));
            }
        }
        if (transactionInstructions.length > 0) {
            await postTrades(mangoClient, mangoGroup, transactionInstructions, []);
        }
    } catch (x: any) {
        console.log('Error Creating Orders:', x)
        if (x?.logs?.length > 0) {
            console.log('Logs:', x.logs);
        }
        console.log(`Place MANGO failed`)
    } finally {
        console.timeEnd('Place MANGO Orders');
    }

}

async function checkPair({
    driftUser,
    driftClient,
    mangoClient,
    mangoAccount,
    mangoGroup,
    market,
    placeOrders,
    minTradeValue,
    maxTradeAmount,
    driftOrders

}: {
    driftUser: User,
    driftClient: DriftClient,
    mangoClient: MangoClient,
    mangoAccount: MangoAccount,
    mangoGroup: Group,
    market: Market,
    placeOrders: boolean,
    minTradeValue: number,
    maxTradeAmount: number,
    driftOrders: any
}) {
    const newOrders: any = []
    const { hasExistingMangoOrders } = await analyzeMarket({
        driftUser,
        transactionInstructions: newOrders,
        maxTradeAmount,
        minTradeValue,
        driftClient,
        market,
        mangoAccount,
        mangoClient,
        mangoGroup
    })
    for (let order of newOrders) {
        const dbItem = dbPositions.find((a: DBItem) => a.MARKET === order.symbol && a.EXCHANGE === order.exchange)
        if (dbItem) {
            dbItem.ORDER = order.price * order.tradeSize * (order.side === "BUY" ? 1 : -1)
            dbItem.PLACE_ORDERS = placeOrders
        }
    }
    if (placeOrders && newOrders.length > 0) {
        await Promise.all([
            placeDriftOrders(newOrders, driftClient, market, driftOrders),
            placeMangoOrders(newOrders, mangoClient, mangoAccount, mangoGroup, market, hasExistingMangoOrders)
        ])
    }
}

async function updateGoogleSheet(db: any, driftClient: DriftClient) {
    const { google } = require('googleapis');
    const googleClient: any = await authorize();
    const googleSheets = google.sheets({ version: 'v4', auth: googleClient });
    const sheetName = "Buckets"
    console.log(`Updating Google`)

    const solPrice = db.find((a: DBItem) => a.MARKET === 'SOL' && a.PRICE > 0)?.PRICE || 0
    const jupPrice = db.find((a: DBItem) => a.MARKET === 'JUP' && a.PRICE > 0)?.PRICE || 0
    const driftPrice = await getDriftMakretPrice(driftClient, (DRIFT_MARKETS as any)["DRIFT"])

    const transValues = solTransactions.map((a: SolanaTransaction) => [a.exchange, a.market, a.signature, a.error])
    for (let i = 0; i < (6 - transValues.length); i++) {
        transValues.push(["", "", "", ""])
    }

    await googleSheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
            valueInputOption: 'RAW',
            data: [
                {
                    range: `${sheetName}!A2:I${db.length + 1}`,
                    values: db.sort((a: DBItem, b: DBItem) => {
                        if (a.MARKET !== b.MARKET) {
                            return a.MARKET.localeCompare(b.MARKET);
                        }
                        return a.EXCHANGE.localeCompare(b.EXCHANGE);
                    }).map((a: DBItem) => [
                        a.MARKET, a.EXCHANGE, a.VALUE, a.PNL,
                        a.ADJUSTED_VALUE, a.BASELINE, a.ORDER, a.PRICE, a.PLACE_ORDERS
                    ])
                },
                {
                    range: `${sheetName}!O1:O6`,
                    values: [[dbStatus.DRIFT_HEALTH],
                    [dbStatus.DRIFT_FUNDING],
                    [dbStatus.MANGO_HEALTH],
                    [dbStatus.MANGO_FUNDING],
                    [dbStatus.MANGO_SOL_FUNDING_RATE],
                    [toGoogleSheetsDate(dbStatus.LAST_UPDATED)]]
                },


                {
                    range: `${sheetName}!C18:E19`,
                    values: [
                        [dbStatus.DRIFT_SOL_FUNDING_RATE, dbStatus.DRIFT_ETH_FUNDING_RATE, dbStatus.DRIFT_BTC_FUNDING_RATE],
                        [dbStatus.MANGO_SOL_FUNDING_RATE, dbStatus.MANGO_ETH_FUNDING_RATE, dbStatus.MANGO_BTC_FUNDING_RATE]
                    ]
                },

                {
                    range: `${sheetName}!C23:E23`,
                    values: [
                        [dbStatus.MANGO_SOL_FUNDING, dbStatus.MANGO_ETH_FUNDING, dbStatus.MANGO_BTC_FUNDING]
                    ]
                },

                {
                    range: `${sheetName}!O9:O10`,
                    values: [[dbStatus.DRIFT_VALUE],
                    [dbStatus.MANGO_VALUE]]
                },
                {
                    range: `${sheetName}!A28:D${transValues.length + 28}`,
                    values: transValues
                },
                {
                    range: `Market_Data!D_SOL_PRICE`,
                    values: [[solPrice]]
                },
                {
                    range: `Market_Data!D_JUP_PRICE`,
                    values: [[jupPrice]]
                },
                {
                    range: `Market_Data!D_DRIFT_PRICE`,
                    values: [[driftPrice]]
                },
                {
                    range: `${sheetName}!R9:R10`,
                    values: [[dbStatus.DRIFT_USDC], [dbStatus.MANGO_USDC]]
                },

            ]
        }
    });
}

function isDeposit(balanceType: any) {
    return !!balanceType?.deposit
}
function formatPerp(usdc: any) {
    return usdc / 10 ** 9
}

async function checkTrades() {
    try {

        console.time('Connection to Solana');
        const connection = new Connection(CONNECTION_URL);
        console.timeEnd('Connection to Solana');

        const { driftClient, user: driftUser } = await getDriftClient(connection, 'driftWallet')
        const { client: mangoClient, group, mangoAccount } = await getMangoClient(connection, 'sixWallet', SIX_PUBLIC_KEY)

        // update wallets
        await checkBalances('../mango/secrets/accounts.json')

        const cancelOrders = driftUser.getOpenOrders();
        console.log('# Open Orders:', cancelOrders.length);

        dbPositions.length = 0
        solTransactions.length = 0
        dbStatus.LAST_UPDATED = new Date()
        dbStatus.DRIFT_HEALTH = driftUser.getHealth()

        const funding = driftUser.getUnrealizedFundingPNL()
        const unrealizedFunding = formatUsdc(funding)
        const userAccount = driftClient.getUserAccount()
        const cumulativePerpFunding = userAccount?.cumulativePerpFunding?.toNumber() ?? 0
        const formattedFunding = formatUsdc(cumulativePerpFunding)
        dbStatus.DRIFT_FUNDING = unrealizedFunding + formattedFunding
        const mangoHealth = mangoAccount!.getHealthRatioUi(group, HealthType.maint);
        dbStatus.MANGO_HEALTH = mangoHealth
        dbStatus.MANGO_FUNDING = 0

        const currentFunding = await getFundingRate()
        console.log('CURRENT FUNDING:', currentFunding.solFundingRate)
        dbStatus.MANGO_SOL_FUNDING_RATE = currentFunding.solFundingRate
        dbStatus.MANGO_ETH_FUNDING_RATE = currentFunding.ethFundingRate
        dbStatus.MANGO_BTC_FUNDING_RATE = currentFunding.btcFundingRate

        const mangoValue = mangoAccount!.getEquity(group).toNumber() / 10 ** 6
        console.log('Mango Value:', mangoValue)
        dbStatus.MANGO_VALUE = mangoValue
        dbStatus.DRIFT_VALUE = formatUsdc(driftUser.getTotalAssetValue())

        let usdcAmount =  driftUser.getTokenAmount(0)
        dbStatus.DRIFT_USDC = usdcAmount.toNumber()/ 10 ** 6

        const banks = Array.from(group.banksMapByName.values()).flat();
        const usdcBank: any = banks.find((bank: any) => bank.name === 'USDC');
        const usdcBalance = usdcBank ? mangoAccount.getTokenBalanceUi(usdcBank) : 0;
        dbStatus.MANGO_USDC = usdcBalance
        const defaultParams = {
            driftUser,
            driftClient,
            mangoClient,
            mangoAccount,
            mangoGroup: group,
            placeOrders: false,
            minTradeValue: 100,
            maxTradeAmount: 1500,
            driftOrders: cancelOrders,
        }

        await Promise.all([
            checkPair({
                ...defaultParams,
                placeOrders: true,
                market: {
                    symbol: 'SOL',
                    exchange: 'DRIFT',
                    spread: 0.05,
                    baseline: 120_000
                }
            }),
            checkPair({
                ...defaultParams,
                placeOrders: true,
                market: {
                    symbol: 'SOL',
                    exchange: 'MANGO',
                    spread: 0.20,
                    baseline: -77_500

                }
            }),
            checkPair({
                ...defaultParams,
                placeOrders: false,
                market: {
                    symbol: 'JUP',
                    exchange: 'DRIFT',
                    spread: 0.0001,
                    baseline: 0
                }
            }),
            checkPair({
                ...defaultParams,
                placeOrders: false,
                market: {
                    symbol: 'BTC',
                    exchange: 'MANGO',
                    spread: 20,
                    baseline: 0
                }
            }),
            checkPair({
                ...defaultParams,
                placeOrders: true,
                market: {
                    symbol: 'BTC',
                    exchange: 'DRIFT',
                    spread: 15,
                    baseline: -0
                }
            }),
            checkPair({
                ...defaultParams,
                placeOrders: false,
                market: {
                    symbol: 'ETH',
                    exchange: 'MANGO',
                    spread: 0.25,
                    baseline: 0
                }
            }),

            checkPair({
                ...defaultParams,
                placeOrders: false,
                market: {
                    symbol: 'ETH',
                    exchange: 'DRIFT',
                    spread: 0.25,
                    baseline: -0
                }
            }),
        ])

        console.log(dbPositions)
        await updateGoogleSheet(dbPositions, driftClient)



        console.log(`Closing Drift Client`)
        await driftClient.unsubscribe()
        console.log(`Drift Client Closed`)
    } catch (error) {
        // Handle errors here
        console.error(`Error in main loop`, error)
    } finally {
        console.log(`Exiting`)
    }
}

(async () => {
    const timeout = 60 * 1000 * 3
    while (true) {
        await checkTrades()
        console.log(`Sleeping for ${timeout / 1000} seconds. ${new Date().toLocaleTimeString()}`)
        await new Promise(resolve => setTimeout(resolve, timeout));
    }
})();
