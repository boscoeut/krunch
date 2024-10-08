import {
    Group,
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
    PostOnlyParams, User,
    Wallet
} from "@drift-labs/sdk";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import pkg from 'bs58';
import fs from 'fs';
import { CONNECTION_URL, SPREADSHEET_ID } from '../../mango/src/constants';
const { decode } = pkg;
import { authorize } from '../../mango/src/googleUtils';

const DRIFT_ENV = 'mainnet-beta';
const PLACE_ORDERS = false

const db: any = {
    MANGO: {
        BTC: {
            PNL: 0,
            VALUE: 0,
            ADJUSTED_VALUE: 0,
            ORDERS: 0,
            SIDE: 'LONG',
            PRICE: 0
        },
        ETH: {
            PNL: 0,
            VALUE: 0,
            ADJUSTED_VALUE: 0,
            ORDERS: 0,
            SIDE: 'LONG',
            PRICE: 0
        },
        SOL: {
            PNL: 0,
            VALUE: 0,
            ADJUSTED_VALUE: 0,
            ORDERS: 0,
            SIDE: 'LONG',
            PRICE: 0
        },
        JUP: {
            PNL: 0,
            VALUE: 0,
            ADJUSTED_VALUE: 0,
            ORDERS: 0,
            SIDE: 'LONG',
            PRICE: 0
        },
    },
    DRIFT: {
        JUP: {
            PNL: 0,
            VALUE: 0,
            ADJUSTED_VALUE: 0,
            ORDERS: 0,
            SIDE: 'LONG',
            PRICE: 0
        },
        BTC: {
            PNL: 0,
            VALUE: 0,
            ADJUSTED_VALUE: 0,
            ORDERS: 0,
            SIDE: 'LONG',
            PRICE: 0
        },
        ETH: {
            PNL: 0,
            VALUE: 0,
            ADJUSTED_VALUE: 0,
            ORDERS: 0,
            SIDE: 'LONG',
            PRICE: 0
        },
        SOL: {
            PNL: 0,
            VALUE: 0,
            ADJUSTED_VALUE: 0,
            ORDERS: 0,
            SIDE: 'LONG',
            PRICE: 0
        }
    }
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
    SOL: 0
}

interface Market {
    symbol: string,
    side: 'LONG' | 'SHORT',
    exchange: 'DRIFT' | 'MANGO',
    spread: number,
    baseValue: number,
    basePnl: number,
    canIncrease: boolean,
    canDecrease: boolean,
    isPerp: boolean,
    spotValue: number,
    spotBasis: number
}

interface AnalyzeProps {
    driftUser: any,
    transactionInstructions: Array<any>,
    maxTradeAmount: number,
    minTradeValue: number,
    driftClient: DriftClient,
    markets: Array<Market>,
    mangoAccount: MangoAccount,
    mangoClient: MangoClient,
    mangoGroup: Group,
    multiplier: number
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
        db[exchange][symbol].ORDERS = price * tradeSize * (side === "BUY" ? 1 : -1)
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

async function getDriftPosition(user: User, marketIndex: number,
    symbol: string,
    driftClient: DriftClient, isPerp: boolean = true, spotValue: number = 0,
    spotBasis:number=0) {


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

    if (!isPerp) {
        baseAsset = spotBasis
        entryPrice = spotValue / spotBasis
        breakEvenPrice = entryPrice
        currentAmount = oracle * baseAsset
        pnl = currentAmount - spotValue
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
    const { driftUser, transactionInstructions, minTradeValue, maxTradeAmount, driftClient, multiplier } = props;
    let shortPnl = 0
    let longPnl = 0
    let longValue = 0
    let shortValue = 0

    const positions: Array<any> = []
    for (const market of props.markets) {
        const marketIndex = (DRIFT_MARKETS as any)[market.symbol]
        const position = market.exchange === 'DRIFT' ?
            await getDriftPosition(driftUser, marketIndex, market.symbol, driftClient, market.isPerp, market.spotValue, market.spotBasis) :
            await getMangoPosition(marketIndex, market.symbol, props.mangoGroup, props.mangoClient, props.mangoAccount)
        const entryPrice = position.entryPrice || 0
        const positionSize = position.baseAsset || 0
        const pnl = (position.pnl || 0) - market.basePnl
        const side = market.side
        const value = (position.value || 0) - market.baseValue
        const adjustedValue = value + pnl * (side === "LONG" ? 1 : -1)
        const price = position.price
        if (side === "SHORT") {
            shortPnl += pnl
            shortValue += value;
        } else if (side === "LONG") {
            longPnl += pnl
            longValue += value;
        }

        db[market.exchange][market.symbol].PNL = pnl
        db[market.exchange][market.symbol].VALUE = value
        db[market.exchange][market.symbol].ADJUSTED_VALUE = adjustedValue
        db[market.exchange][market.symbol].PRICE = price
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
            existingOrders: position.existingOrders,
            canIncrease: market.canIncrease,
            canDecrease: market.canDecrease
        })
        console.log(`${market.exchange}: ${market.symbol} ${side} PNL: ${pnl} Value: ${value} Price: ${price} Entry Price: ${entryPrice} Position Size: ${positionSize}`)
    }

    const totalPnl = shortPnl + longPnl
    const totalLongValue = longValue + longPnl
    const totalShortValue = shortValue - shortPnl
    const totalSpreadWithoutMultiplier = (totalLongValue + totalShortValue)
    const totalSpread = totalSpreadWithoutMultiplier * multiplier

    console.log(`
        total spread:  ${totalSpread}
        maxTradeAmount: ${maxTradeAmount}
        multiplier: ${multiplier}

        TOTAL PNL: ${totalPnl}

        Short Pnl: ${shortPnl}
        Long Pnl: ${longPnl}

        Total Long Value: ${totalLongValue}
        Total Short Value: ${totalShortValue}
        Diff without multiplier : ${totalSpreadWithoutMultiplier}   
        Diff: ${totalSpread}   
    `)

    const enabledPositions = positions
    
    if (totalSpread > 0) {
        // longs exceed shorts -- SELL
        const amt = totalSpread
        const maxAmount = Math.min(amt, maxTradeAmount)
        const longMarket = enabledPositions.sort((a, b) => b.adjustedValue - a.adjustedValue).find(a => a.side === "LONG" && a.value > minTradeValue && a.pnl > 0)
        const shortMarket = enabledPositions.sort((a, b) => b.adjustedValue - a.adjustedValue).find(a => a.side === "SHORT")
        if (longPnl > 0 && longMarket?.canDecrease) {
            await buySell("SELL", amt, maxAmount, longMarket.symbol, longMarket.marketIndex, longMarket.spread, transactionInstructions, longMarket.price, minTradeValue, longMarket.exchange)
        } else if (shortMarket?.canIncrease) {
            await buySell("SELL", amt, maxAmount, shortMarket.symbol, shortMarket.marketIndex, shortMarket.spread, transactionInstructions, shortMarket.price, minTradeValue, shortMarket.exchange)
        }
    } else {
        // shorts exceeds long -- buy        
        const amt = totalSpread * -1
        const shortMarket = enabledPositions.sort((a, b) => a.adjustedValue - b.adjustedValue).find(a => a.pnl > 0 && Math.abs(a.value) > minTradeValue && a.side === "SHORT")
        const longMarket = enabledPositions.sort((a, b) => a.adjustedValue - b.adjustedValue).find(a => a.side === "LONG")
        if (shortMarket?.canDecrease && shortPnl > 0) {
            const maxAmount = Math.min(Math.abs(shortMarket.value), maxTradeAmount, amt)
            await buySell("BUY", amt, maxAmount, shortMarket.symbol, shortMarket.marketIndex, shortMarket.spread, transactionInstructions, shortMarket.price, minTradeValue, shortMarket.exchange)
        } else if (longMarket?.canIncrease) {
            await buySell("BUY", amt, maxTradeAmount, longMarket.symbol, longMarket.marketIndex, longMarket.spread, transactionInstructions, longMarket.price, minTradeValue, longMarket.exchange)
        }
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
                console.log('New Orders Tx:', `https://solscan.io/tx/${tx}`);
                return tx;
            }
        } catch (error: any) {
            if (error.message.includes('Blockhash not found') && attempt < maxRetries) {
                console.log(`Attempt ${attempt} failed: Blockhash not found. Retrying...`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
            } else {
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

    console.time('Get Unrealized PNL');
    const pnl = user.getUnrealizedPNL(true);
    console.timeEnd('Get Unrealized PNL');
    console.log('Unrealized PNL:', pnl.toString());

    const usdValue = user.getNetUsdValue();
    console.log('Net USD Value:', formatUsdc(usdValue));
    const totalValue = user.getTotalAssetValue();
    console.log('Total Value:', formatUsdc(totalValue));

    const health = user.getHealth()
    console.log('Health:', health)
    const funding = user.getUnrealizedFundingPNL()
    console.log('Funding:', formatUsdc(funding))

    console.time('Get Open Orders');
    const orders = user.getOpenOrders();
    console.timeEnd('Get Open Orders');
    console.log('# Open Orders:', orders.length);

    return {
        driftClient,
        cancelOrders: orders, user,
        usdValue, health, funding
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
        console.log('New Orders Tx:', `https://solscan.io/tx/${result.signature}`);
    } catch (x: any) {
        console.error('Transaction Failed', x)
    }
}

async function placeDriftOrders(
    newOrders: any,
    driftClient: DriftClient,
    markets: Array<Market>,
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
        const marketIndex = (DRIFT_MARKETS as any)[markets[0].symbol]
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
    markets: Array<Market>,
    hasExistingMangoOrders: boolean
) {
    try {
        console.time('Place MANGO Orders');
        const mangoOrders = newOrders.filter((a: any) => a.exchange === 'MANGO')
        const transactionInstructions: Array<any> = []
        if (hasExistingMangoOrders) {
            transactionInstructions.push(await cancelOpenOrders(`${markets[0].symbol}-PERP`, mangoClient, mangoAccount!, mangoGroup));
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
    markets,
    placeOrders,
    minTradeValue,
    maxTradeAmount,
    driftOrders,
    multiplier = 1

}: {
    driftUser: User,
    driftClient: DriftClient,
    mangoClient: MangoClient,
    mangoAccount: MangoAccount,
    mangoGroup: Group,
    markets: Array<Market>,
    placeOrders: boolean,
    minTradeValue: number,
    maxTradeAmount: number,
    driftOrders: any,
    multiplier: number
}) {
    const newOrders: any = []
    const { hasExistingMangoOrders } = await analyzeMarket({
        driftUser,
        transactionInstructions: newOrders,
        maxTradeAmount,
        minTradeValue,
        driftClient,
        markets,
        mangoAccount,
        mangoClient,
        mangoGroup,
        multiplier
    })
    if (placeOrders && newOrders.length > 0) {
        await Promise.all([
            placeDriftOrders(newOrders, driftClient, markets, driftOrders),
            placeMangoOrders(newOrders, mangoClient, mangoAccount, mangoGroup, markets, hasExistingMangoOrders)
        ])
    }
}

async function updateGoogleSheet(db: any) {
    const { google } = require('googleapis');

    const googleClient: any = await authorize();
    const googleSheets = google.sheets({ version: 'v4', auth: googleClient });
    const sheetName = "Squeeze"
    console.log(`Updating Google`)

    await googleSheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
            valueInputOption: 'RAW',
            data: [
                {
                    range: `${sheetName}!B2:E10`,
                    values: [
                        [db.DRIFT.BTC.VALUE, db.DRIFT.ETH.VALUE, db.DRIFT.SOL.VALUE, db.DRIFT.JUP.VALUE],
                        [db.MANGO.BTC.VALUE, db.MANGO.ETH.VALUE, db.MANGO.SOL.VALUE, db.MANGO.JUP.VALUE],
                        [db.DRIFT.BTC.ADJUSTED_VALUE, db.DRIFT.ETH.ADJUSTED_VALUE, db.DRIFT.SOL.ADJUSTED_VALUE, db.DRIFT.JUP.ADJUSTED_VALUE],
                        [db.MANGO.BTC.ADJUSTED_VALUE, db.MANGO.ETH.ADJUSTED_VALUE, db.MANGO.SOL.ADJUSTED_VALUE, db.MANGO.JUP.ADJUSTED_VALUE],
                        [db.DRIFT.BTC.PNL, db.DRIFT.ETH.PNL, db.DRIFT.SOL.PNL, db.DRIFT.JUP.PNL],
                        [db.MANGO.BTC.PNL, db.MANGO.ETH.PNL, db.MANGO.SOL.PNL, db.MANGO.JUP.PNL],
                        [db.DRIFT.BTC.ORDERS, db.DRIFT.ETH.ORDERS, db.DRIFT.SOL.ORDERS, db.DRIFT.JUP.ORDERS],
                        [db.MANGO.BTC.ORDERS, db.MANGO.ETH.ORDERS, db.MANGO.SOL.ORDERS, db.MANGO.JUP.ORDERS],
                        [db.DRIFT.BTC.PRICE, db.DRIFT.ETH.PRICE, db.DRIFT.SOL.PRICE, db.DRIFT.JUP.PRICE],
                    ]
                }
            ]
        }
    });
}

(async () => {
    try {
        console.time('Connection to Solana');
        const connection = new Connection(CONNECTION_URL);
        console.timeEnd('Connection to Solana');

        const { driftClient, user: driftUser, cancelOrders } = await getDriftClient(connection, 'driftWallet')
        const { client: mangoClient, group, mangoAccount } = await getMangoClient(connection, 'sixWallet', 'HpBSY6mP4khefkaDaWHVBKN9q4w7DMfV1PkCwPQudUMw')

        await Promise.all([
            checkPair({
                driftUser,
                driftClient,
                mangoClient,
                mangoAccount,
                mangoGroup: group,
                placeOrders: false,
                minTradeValue: 20,
                maxTradeAmount: 1000,
                multiplier: 1.0,
                driftOrders: cancelOrders,
                markets: [{
                    symbol: 'ETH',
                    side: 'LONG',
                    exchange: 'DRIFT',
                    spread: 0.05,
                    baseValue: 0,
                    basePnl: 0,
                    canIncrease: true,
                    canDecrease: true,
                    isPerp: true,
                    spotValue: 0,
                    spotBasis:0 
                },{
                    symbol: 'ETH',
                    side: 'SHORT',
                    exchange: 'MANGO',
                    spread: 1,
                    baseValue: 0,
                    basePnl: 0,
                    canIncrease: true,
                    canDecrease: true,
                    isPerp: true,
                    spotValue: 0,
                    spotBasis:0 
                }]
            }),

            checkPair({
                driftUser,
                driftClient,
                mangoClient,
                mangoAccount,
                mangoGroup: group,
                placeOrders: false,
                minTradeValue: 20,
                maxTradeAmount: 1000,
                driftOrders: cancelOrders,
                multiplier: 1.0,
                markets: [{
                    symbol: 'BTC',
                    side: 'LONG',
                    exchange: 'DRIFT',
                    spread: 40,
                    baseValue: 0,
                    basePnl: 0,
                    canIncrease: true,
                    canDecrease: true,
                    isPerp: true,
                    spotValue: 0,
                    spotBasis:0 
                }, {
                    symbol: 'BTC',
                    side: 'SHORT',
                    exchange: 'MANGO',
                    spread: 75,
                    baseValue: 0,
                    basePnl: 0,
                    canIncrease: true,
                    canDecrease: true,
                    isPerp: true,
                    spotValue: 0,
                    spotBasis:0 
                }]
            }),

            checkPair({
                driftUser,
                driftClient,
                mangoClient,
                mangoAccount,
                mangoGroup: group,
                placeOrders: PLACE_ORDERS,
                minTradeValue: 100,
                maxTradeAmount: 3000,
                driftOrders: cancelOrders,
                multiplier: 1.0,
                markets: [{
                    symbol: 'SOL',
                    side: 'SHORT',
                    exchange: 'MANGO',
                    spread: 0.25,
                    baseValue: 0,
                    basePnl: 0,
                    canIncrease: true,
                    canDecrease: true,
                    isPerp: true,
                    spotValue: 0,
                    spotBasis:0 
                }, {
                    symbol: 'SOL',
                    side: 'LONG',
                    exchange: 'DRIFT',
                    spread: 0.05,
                    baseValue: 53681.08 + -744.06,
                    basePnl: -9099.07 + -5.73,
                    canIncrease: true,
                    canDecrease: true,
                    isPerp: true,
                    spotValue: 0,
                    spotBasis:0 
                }]
            }),

            checkPair({
                driftUser,
                driftClient,
                mangoClient,
                mangoAccount,
                mangoGroup: group,
                placeOrders: false,
                minTradeValue: 10,
                maxTradeAmount: 1000,
                driftOrders: cancelOrders,
                multiplier: 1.0,
                markets: [{
                    symbol: 'JUP',
                    side: 'SHORT',
                    exchange: 'DRIFT',
                    spread: 0.001,
                    baseValue: 8000 * 0.6970,
                    basePnl: 0,
                    canIncrease: true,
                    canDecrease: true,
                    isPerp: true,
                    spotValue: 0,
                    spotBasis:0 
                },{
                    symbol: 'JUP',
                    side: 'LONG',
                    exchange: 'DRIFT',
                    spread: 0.001,
                    baseValue:0,
                    basePnl: 0,
                    canIncrease: true,
                    canDecrease: false,
                    isPerp: false,
                    spotValue: 8000 * 0.6970,
                    spotBasis: 8000 
                }]
            })
        ])

        console.log(db)
        await updateGoogleSheet(db)

        console.log(`Closing Drift Client`)
        await driftClient.unsubscribe()
        console.log(`Drift Client Closed`)
    } catch (error) {
        // Handle errors here
        console.error(`Error in main loop`, error)
    } finally {
        console.log(`Exiting`)
    }
})();
