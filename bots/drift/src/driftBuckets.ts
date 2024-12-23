import {
    BASE_PRECISION,
    AMM_RESERVE_PRECISION,ZERO,
    FUNDING_RATE_BUFFER_PRECISION,
    BN,
    DriftClient,
    MarketType,
    OraclePriceData,
    OrderType,
    PRICE_PRECISION,
    PerpMarketAccount,
    PositionDirection,
    PostOnlyParams,
    SpotMarketAccount,
    User,
    Wallet,PerpPosition,
    calculateAllEstimatedFundingRate,
    calculateLongShortFundingRate,
    calculateLongShortFundingRateAndLiveTwaps,
    calculateClaimablePnl,
    decodeName
} from "@drift-labs/sdk";
import { Connection, Keypair } from "@solana/web3.js";
import pkg from 'bs58';
import fs from 'fs';
import { CONNECTION_URL, SPREADSHEET_ID } from '../../mango/src/constants';
import { authorize, toGoogleSheetsDate } from '../../mango/src/googleUtils';
import { checkBalances } from "../../mango/src/getWalletBalances";
const { decode } = pkg;

const DRIFT_ENV = 'mainnet-beta';
const DRIFT_SPOT_INDEX = 15; // Define the constant
const JUP_SPOT_INDEX = 11; // Define the constant
const SOL_SPOT_INDEX = 1; // Define the constant
const W_SPOT_INDEX = 13;
const ETH_SPOT_INDEX = 4;
const BTC_SPOT_INDEX = 3;
const JLP_SPOT_INDEX = 19;
const CLOUD_SPOT_INDEX = 21;

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
    PLACE_ORDERS: boolean,
    FEES: number
}

const dbPositions: Array<DBItem> = []
const solTransactions: Array<SolanaTransaction> = []
const dbStatus = {
    DRIFT_UNSETTLED_PNL: 0,
    DRIFT_HEALTH: 0,
    DRIFT_FUNDING: 0,
    SOL_FUNDING: 0,
    DRIFT_SOL_FUNDING_RATE: 0,
    DRIFT_ETH_FUNDING_RATE: 0,
    DRIFT_BTC_FUNDING_RATE: 0,
    DRIFT_JUP_FUNDING_RATE: 0,
    DRIFT_W_FUNDING_RATE: 0,
    DRIFT_DRIFT_FUNDING_RATE: 0,
    DRIFT_RLB_FUNDING_RATE: 0,
    DRIFT_CLOUD_FUNDING_RATE: 0,
    DRIFT_DBR_FUNDING_RATE: 0,
    LAST_UPDATED: new Date(),
    DRIFT_VALUE: 0,
    DRIFT_PRICE: 0,
    SOL_PRICE: 0,
    JUP_PRICE: 0,
    ETH_PRICE: 0,
    BTC_PRICE: 0,
    W_PRICE: 0,
    DRIFT_USDC: 0,
    DRIFT_SPOT_VALUE: 0,
    SOL_SPOT_VALUE: 0,
    ETH_SPOT_VALUE: 0,
    CLOUD_SPOT_VALUE: 0,
    BTC_SPOT_VALUE: 0,
    JUP_SPOT_VALUE: 0,
    W_SPOT_VALUE: 0,
    JLP_SPOT_VALUE: 0,
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
    DRIFT: 30,
    W: 27,
    CLOUD: 31,
    DBR: 47,
    RLB: 17
}

interface Market {
    symbol: string,
    exchange: 'DRIFT',
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
    multiplier: number,
    canReduce: boolean
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
    exchange: 'DRIFT'
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

    const markPrice = marketAccount.amm.lastMarkPriceTwap;
    const mark = markPrice.toNumber() / PRICE_PRECISION.toNumber();

    const settledPnl = (perpPosition?.settledPnl?.toNumber() || 0) / PRICE_PRECISION.toNumber();

    const oraclePrice = marketAccount.amm.lastOracleNormalisedPrice;
    const oracle = oraclePrice.toNumber() / PRICE_PRECISION.toNumber();

    const bestBid = marketAccount.amm.lastBidPriceTwap.toNumber() / PRICE_PRECISION.toNumber();
    const bestAsk = marketAccount.amm.lastAskPriceTwap.toNumber() / PRICE_PRECISION.toNumber();
    const midPrice = (bestBid + bestAsk) / 2
    const bestPrice = oracle

    console.log(`bestBid:`, bestBid)
    console.log(`bestAsk: ${bestAsk}`)
    console.log(`oracle: ${oracle}`)
    console.log(`mark: ${mark}`)

    console.log(`Mid" ${midPrice} Oracle: ${oracle}   Mark: ${mark}`)


    let currentAmount = oracle * baseAsset

    let pnl = currentAmount - baseAmount
    if (baseAsset < 0) {
        pnl = baseAmount * -1 + currentAmount
    }

    const feesAndFunding = settledPnl;
    console.log(`feesAndFunding: ${feesAndFunding}  `)

    const perpMarketAccount = driftClient.getPerpMarketAccount(marketIndex);
    // const fundingRate24H = perpMarketAccount!.amm.last24HAvgFundingRate.toNumber()
    const fundingRate24H = perpMarketAccount!.amm.lastFundingRate.toNumber()

    if (symbol === "ETH") {
        dbStatus.DRIFT_ETH_FUNDING_RATE = fundingRate24H * 24 * 365 / 10 ** 11
        console.log(symbol + ' fundingRate24H', dbStatus.DRIFT_ETH_FUNDING_RATE)
    } else if (symbol === "SOL") {
        dbStatus.DRIFT_SOL_FUNDING_RATE = fundingRate24H * 24 * 365 / 10 ** 9
        console.log(symbol + ' fundingRate24H', dbStatus.DRIFT_SOL_FUNDING_RATE)
    } else if (symbol === "BTC") {
        dbStatus.DRIFT_BTC_FUNDING_RATE = fundingRate24H * 24 * 365 / 10 ** 12
        console.log(symbol + ' fundingRate24H', dbStatus.DRIFT_BTC_FUNDING_RATE)
    }
    else if (symbol === "JUP") {
        dbStatus.DRIFT_JUP_FUNDING_RATE = fundingRate24H * 24 * 365 / 10 ** 7
        console.log(symbol + ' fundingRate24H', dbStatus.DRIFT_JUP_FUNDING_RATE)
    } else if (symbol === "W") {
        dbStatus.DRIFT_W_FUNDING_RATE = fundingRate24H * 24 * 365 / 10 ** 7
        console.log(symbol + ' fundingRate24H', dbStatus.DRIFT_W_FUNDING_RATE)
    } else if (symbol === "DRIFT") {
        dbStatus.DRIFT_DRIFT_FUNDING_RATE = fundingRate24H * 24 * 365 / 10 ** 7
        console.log(symbol + ' fundingRate24H', dbStatus.DRIFT_DRIFT_FUNDING_RATE)
    }else if (symbol === "RLB") {
        dbStatus.DRIFT_RLB_FUNDING_RATE = fundingRate24H * 24 * 365 / 10 ** 7
        console.log(symbol + ' fundingRate24H', dbStatus.DRIFT_DRIFT_FUNDING_RATE)
    } else if (symbol === "DBR") {
        dbStatus.DRIFT_DBR_FUNDING_RATE = fundingRate24H * 24 * 365 / 10 ** 7
        console.log(symbol + ' fundingRate24H', dbStatus.DRIFT_DBR_FUNDING_RATE)
    } else if (symbol === "CLOUD") {
        dbStatus.DRIFT_CLOUD_FUNDING_RATE = fundingRate24H * 24 * 365 / 10 ** 7
        console.log(symbol + ' fundingRate24H', dbStatus.DRIFT_CLOUD_FUNDING_RATE)
    }

    console.log('--');
    console.log('*** Break Even Price:', breakEvenPrice);
    console.log('*** Entry Price:', entryPrice);
    console.log('*** Oracle Price:', oracle);
    console.log('*** Pnl:', pnl);
    console.log('*** Base Asset:', baseAsset);
    console.log('*** value:', currentAmount);

    return {
        price: bestPrice,
        baseAsset,
        breakEvenPrice,
        entryPrice,
        pnl,
        marketIndex,
        symbol,
        value: currentAmount,
        existingOrders: [],
        feesAndFunding
    }
}

async function analyzeMarket(props: AnalyzeProps) {
    const {
        driftUser,
        transactionInstructions,
        minTradeValue,
        maxTradeAmount,
        driftClient,
        market,
        multiplier,
        canReduce } = props;
    let shortPnl = 0
    let longPnl = 0
    let longValue = 0
    let shortValue = 0
    let baseline = 0

    const positions: Array<any> = []

    const marketIndex = (DRIFT_MARKETS as any)[market.symbol]
    const position = await getDriftPosition(driftUser, marketIndex, market.symbol, driftClient)

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
        PLACE_ORDERS: false,
        FEES: position.feesAndFunding
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
        totalSpread += totalPnl * -2 * multiplier
    } else {
        totalSpread += totalPnl * 1 * multiplier
    }

    console.log(`
        market: ${market.symbol}
        total spread:  ${totalSpread}
        maxTradeAmount: ${maxTradeAmount}

        TOTAL PNL: ${totalPnl}

        Short Pnl: ${shortPnl}
        Long Pnl: ${longPnl}

        Multiplier: ${multiplier}
        Baseline: ${baseline}

        Total Long Value: ${totalLongValue}
        Total Short Value: ${totalShortValue}
        Diff: ${totalSpread}   
    `)

    const enabledPositions = positions

    const canSell = canReduce || baseline < 0
    const canBuy = canReduce || baseline > 0

    if (totalSpread > baseline && canSell) {
        // longs exceed shorts -- SELL
        const amt = (totalSpread - baseline)
        const maxAmount = Math.min(amt, maxTradeAmount)
        const market = enabledPositions[0]
        await buySell("SELL", amt, maxAmount, market.symbol, market.marketIndex, market.spread, transactionInstructions, market.price, minTradeValue, market.exchange)
    } else if (canBuy) {
        // shorts exceeds long -- buy        
        const amt = (baseline - totalSpread)
        const market = enabledPositions[0]
        await buySell("BUY", amt, maxTradeAmount, market.symbol, market.marketIndex, market.spread, transactionInstructions, market.price, minTradeValue, market.exchange)
    }
    return {
        totalPnl,
        totalLongValue,
        totalShortValue,
        positions
    }
}

async function retryTransaction(driftClient: DriftClient, newOrders: any[], maxRetries = 10) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            if (newOrders.length > 0) {
                const tx = await driftClient.placeOrders(newOrders);
                console.log('SUCCESSS: New Orders Placed:', newOrders.length);
                solTransactions.push({
                    signature: `https://solscan.io/tx/${tx}`,
                    exchange: 'DRIFT',
                    market: '',
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
                if (!error.transactionMessage) {
                    console.log(`Error ${error.message}.  Retrying`, error);
                    await new Promise(resolve => setTimeout(resolve, 1000))
                } else if (!error.transactionMessage.includes('Blockhash not found') && attempt < maxRetries) {
                    solTransactions.push({
                        signature: ``,
                        exchange: 'DRIFT',
                        market: '',
                        error: error.message
                    })
                }
                throw error; // Rethrow if it's not a blockhash error or we've exhausted retries
            }
        }
    }
    throw new Error('Transaction failed after maximum retries');
}

async function retrCancelyTransaction(driftClient: DriftClient, oldDriftOrders: any, maxRetries = 10) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            if (oldDriftOrders.length > 0) {
                console.log('orders cancelled');
                const tx = await driftClient.cancelOrdersByIds(oldDriftOrders.map((a: any) => a.orderId));
                oldDriftOrders.length = 0
                return tx
            }
        } catch (error: any) {
            if (error.message.includes('Blockhash not found') && attempt < maxRetries) {
                console.log(`Attempt ${attempt} failed: Blockhash not found. Retrying...`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
            } else {
                if ((error.message.includes("timeout") || !error.transactionMessage.includes('Blockhash not found')) && attempt < maxRetries) {
                    solTransactions.push({
                        signature: ``,
                        exchange: 'DRIFT',
                        market: '',
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

function toFixedFloor(num: number, fixed: number = 4): number {
    const power = Math.pow(10, fixed);
    const val = (Math.floor(num * power) / power).toFixed(fixed);
    return Number(val)
}


async function placeDriftOrders(
    newOrders: any,
    driftClient: DriftClient,
    driftOrders: any,
    cancelAll: boolean
) {
    try {
        console.time('Place Drift Orders');
        const transactionInstructions: Array<any> = []
        const newDriftOrders = newOrders.filter((a: any) => a.exchange === 'DRIFT')
        if (newDriftOrders.length > 0) {
            console.log('Placing Drift Orders #', newOrders.length);
            for (const order of newOrders) {
                console.log(`  >> ${order.side} ${order.symbol} for ${(order.tradeSize * order.price).toFixed(2)} price: ${order.price.toFixed(4)} size: ${order.tradeSize.toFixed(2)}`)
            }
            for (const order of newDriftOrders) {
                const baseAssetAmount = new BN(order.tradeSize * BASE_PRECISION.toNumber())
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

        const marketIndexes = newOrders.map((a: any) => a.marketIndex)
        const existingOrders = driftOrders.filter((a: any) => marketIndexes.includes(a.marketIndex) || cancelAll)

        if (transactionInstructions.length + existingOrders.length > 0) {
            if (existingOrders.length > 0) {
                console.log(`Cancelling ${existingOrders.length} existing orders`)
                await retrCancelyTransaction(driftClient, existingOrders, 10)
            }
            if (transactionInstructions.length > 0) {
                console.log(`Placing ${transactionInstructions.length} new orders`)
                await retryTransaction(driftClient, transactionInstructions, 10)
            }
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

async function checkPair({
    driftUser,
    driftClient,
    market,
    placeOrders,
    minTradeValue,
    maxTradeAmount,
    multiplier,
    canReduce

}: {
    driftUser: User,
    driftClient: DriftClient,
    market: Market,
    placeOrders: boolean,
    minTradeValue: number,
    maxTradeAmount: number,
    multiplier: number,
    canReduce: boolean
}) {
    const newOrders: any = []
    await analyzeMarket({
        driftUser,
        transactionInstructions: newOrders,
        maxTradeAmount,
        minTradeValue,
        driftClient,
        market,
        multiplier,
        canReduce
    })
    for (let order of newOrders) {
        const dbItem = dbPositions.find((a: DBItem) => a.MARKET === order.symbol && a.EXCHANGE === order.exchange)
        if (dbItem) {
            dbItem.ORDER = order.price * order.tradeSize * (order.side === "BUY" ? 1 : -1)
            dbItem.PLACE_ORDERS = placeOrders
        }
    }
    return placeOrders ? newOrders : []
}

async function shouldRun() {
    const { google } = require('googleapis');
    const googleClient: any = await authorize();
    const googleSheets = google.sheets({ version: 'v4', auth: googleClient });
    const sheetName = "DriftBuckets"
    try {
        const response = await googleSheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!C11`, // Specify the range for C11
        });

        const value = response.data.values ? response.data.values[0][0] : null; // Get the value from the response
        console.log(`Value from C11: ${value}`);
        return value; // Return the value
    } catch (error) {
        console.error('Error fetching value from Google Sheets:', error);
        return "FALSE"
    }
}

async function updateGoogleSheet(db: any, driftClient: DriftClient) {
    const { google } = require('googleapis');
    const googleClient: any = await authorize();
    const googleSheets = google.sheets({ version: 'v4', auth: googleClient });
    const sheetName = "DriftBuckets"
    console.log(`Updating Google`)

    const solPosition = db.find((a: DBItem) => a.MARKET === 'SOL')
    const cloudPosition = db.find((a: DBItem) => a.MARKET === 'CLOUD')
    const dbrPosition = db.find((a: DBItem) => a.MARKET === 'DBR')
    const jupPosition = db.find((a: DBItem) => a.MARKET === 'JUP')
    const ethPosition = db.find((a: DBItem) => a.MARKET === 'ETH')
    const btcPosition = db.find((a: DBItem) => a.MARKET === 'BTC')
    const rlbPosition = db.find((a: DBItem) => a.MARKET === 'RLB')
    const driftPosition = db.find((a: DBItem) => a.MARKET === 'DRIFT')
    const wPosition = db.find((a: DBItem) => a.MARKET === 'W')
    const driftPrice = await getDriftMakretPrice(driftClient, (DRIFT_MARKETS as any)["DRIFT"])
    const wPrice = await getDriftMakretPrice(driftClient, (DRIFT_MARKETS as any)["W"])

    const transValues = solTransactions.map((a: SolanaTransaction) => [a.exchange, a.market, a.signature, a.error])
    for (let i = 0; i < (8 - transValues.length); i++) {
        transValues.push(["", "", "", ""])
    }

    await googleSheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
            valueInputOption: 'RAW',
            data: [
                {
                    range: `${sheetName}!A2:I${db.length + 1}`,
                    values: [[
                        jupPosition.MARKET, dbStatus.DRIFT_JUP_FUNDING_RATE, jupPosition.VALUE, jupPosition.PNL, jupPosition.FEES,
                        jupPosition.BASELINE, jupPosition.ORDER, jupPosition.PRICE, jupPosition.PLACE_ORDERS
                    ], [
                        cloudPosition.MARKET, dbStatus.DRIFT_CLOUD_FUNDING_RATE, cloudPosition.VALUE, cloudPosition.PNL, cloudPosition.FEES,
                        cloudPosition.BASELINE, cloudPosition.ORDER, cloudPosition.PRICE, cloudPosition.PLACE_ORDERS
                    ], [
                        ethPosition.MARKET, dbStatus.DRIFT_ETH_FUNDING_RATE, ethPosition.VALUE, ethPosition.PNL, ethPosition.FEES,
                        ethPosition.BASELINE, ethPosition.ORDER, ethPosition.PRICE, ethPosition.PLACE_ORDERS
                    ], [
                        solPosition.MARKET, dbStatus.DRIFT_SOL_FUNDING_RATE, solPosition.VALUE, solPosition.PNL, solPosition.FEES,
                        solPosition.BASELINE, solPosition.ORDER, solPosition.PRICE, solPosition.PLACE_ORDERS
                    ], [
                        driftPosition.MARKET, dbStatus.DRIFT_DRIFT_FUNDING_RATE, driftPosition.VALUE, driftPosition.PNL, driftPosition.FEES,
                        driftPosition.BASELINE, driftPosition.ORDER, driftPosition.PRICE, driftPosition.PLACE_ORDERS
                    ], [
                        btcPosition.MARKET, dbStatus.DRIFT_BTC_FUNDING_RATE, btcPosition.VALUE, btcPosition.PNL, btcPosition.FEES,
                        btcPosition.BASELINE, btcPosition.ORDER, btcPosition.PRICE, btcPosition.PLACE_ORDERS
                    ]]

                },
                {
                    range: `${sheetName}!F12`,
                    values: [[dbStatus.DRIFT_HEALTH]]
                },
                {
                    range: `${sheetName}!I13`,
                    values: [[toGoogleSheetsDate(dbStatus.LAST_UPDATED)]]
                },
                {
                    range: `${sheetName}!F12:F14`,
                    values: [
                        [dbStatus.DRIFT_HEALTH],
                        [dbStatus.DRIFT_USDC],
                        [dbStatus.DRIFT_UNSETTLED_PNL],
                    ]
                },
                {
                    range: `${sheetName}!F16`,
                    values: [[dbStatus.DRIFT_VALUE]]
                },
                {
                    range: `${sheetName}!F19:F24`,
                    values: [[dbStatus.DRIFT_SPOT_VALUE], [dbStatus.JUP_SPOT_VALUE], [dbStatus.SOL_SPOT_VALUE], [dbStatus.W_SPOT_VALUE], [dbStatus.CLOUD_SPOT_VALUE], [dbStatus.JLP_SPOT_VALUE]]
                },
                {
                    range: `${sheetName}!C13`,
                    values: [[dbStatus.DRIFT_FUNDING]]
                },
                {
                    range: `${sheetName}!A35:D${transValues.length + 35}`,
                    values: transValues
                },
                {
                    range: `Market_Data!D_SOL_PRICE`,
                    values: [[solPosition.PRICE]]
                },
                {
                    range: `Market_Data!D_JUP_PRICE`,
                    values: [[jupPosition.PRICE]]
                },
                {
                    range: `Market_Data!D_DRIFT_PRICE`,
                    values: [[driftPrice]]
                },
                {
                    range: `Market_Data!D_ETH_PRICE`,
                    values: [[ethPosition.PRICE]]
                },
                {
                    range: `Market_Data!D_BTC_PRICE`,
                    values: [[btcPosition.PRICE]]
                },
                {
                    range: `Market_Data!D_W_PRICE`,
                    values: [[wPrice]]
                }
            ]
        }
    });
}

async function placeOracleOrder(driftClient:DriftClient) {
    const baseAssetAmount = new BN(1000 * BASE_PRECISION.toNumber())
    const result = await driftClient.placePerpOrder({
        orderType:OrderType.ORACLE,
        marketIndex:DRIFT_MARKETS.CLOUD,
        oraclePriceOffset: -0.01 * PRICE_PRECISION.toNumber(),
        direction:PositionDirection.LONG,
        baseAssetAmount
    })
    console.log(result)
}
async function checkTrades(shouldTrade = true) {
    try {

        console.time('Connection to Solana');
        const connection = new Connection(CONNECTION_URL);
        console.timeEnd('Connection to Solana');

        const { driftClient, user: driftUser } = await getDriftClient(connection, 'driftWallet')

        // get unsettled pnl   
        const perpMarketAndOracleData: {
            [marketIndex: number]: {
                marketAccount: PerpMarketAccount;
                oraclePriceData: OraclePriceData;
            };
        } = {};
        const spotMarketAndOracleData: {
            [marketIndex: number]: {
                marketAccount: SpotMarketAccount;
                oraclePriceData: OraclePriceData;
            };
        } = {};

        for (const perpMarket of driftClient.getPerpMarketAccounts()) {
            perpMarketAndOracleData[perpMarket.marketIndex] = {
                marketAccount: perpMarket,
                oraclePriceData: driftClient.getOracleDataForPerpMarket(
                    perpMarket.marketIndex
                ),
            };
        }
        for (const spotMarket of driftClient.getSpotMarketAccounts()) {
            spotMarketAndOracleData[spotMarket.marketIndex] = {
                marketAccount: spotMarket,
                oraclePriceData: driftClient.getOracleDataForSpotMarket(
                    spotMarket.marketIndex
                ),
            };
        }

        const spotMarketIdx = 0
        let unsettledPnl = 0;
        for (const perpMarketIdx of Object.values(DRIFT_MARKETS)) {
            const settleePositionWithLp = driftUser.getActivePerpPositions().find(a => a.marketIndex === perpMarketIdx)
            const feesAndFunding = calculateFeesAndFundingPnl( perpMarketAndOracleData[perpMarketIdx].marketAccount, 
                    settleePositionWithLp!, false)

            const currentMarkPrice=perpMarketAndOracleData[perpMarketIdx].marketAccount.amm.lastMarkPriceTwap
            const oraclePriceData = perpMarketAndOracleData[perpMarketIdx].oraclePriceData
            const results  =
            await calculateLongShortFundingRateAndLiveTwaps(
                perpMarketAndOracleData[perpMarketIdx].marketAccount,
                oraclePriceData,
                currentMarkPrice,
                new BN(new Date().getTime())
            );

            const fRate = await calculateAllEstimatedFundingRate(perpMarketAndOracleData[perpMarketIdx].marketAccount, oraclePriceData)
            for(const item of fRate){
                console.log(`fRate ${decodeName(perpMarketAndOracleData[perpMarketIdx].marketAccount.name)}:  ${item.toNumber()}`)
            }
            
            for(const item of results){
                console.log(`SPOT ${decodeName(perpMarketAndOracleData[perpMarketIdx].marketAccount.name)}:  ${item.toNumber()}`)
            }
        
            console.log(feesAndFunding.toNumber()/10**6);
            if (perpMarketAndOracleData[perpMarketIdx] && settleePositionWithLp) {
                const userUnsettledPnl = calculateClaimablePnl(
                    perpMarketAndOracleData[perpMarketIdx].marketAccount,
                    spotMarketAndOracleData[spotMarketIdx].marketAccount, // always liquidating the USDC spot market
                    settleePositionWithLp,
                    perpMarketAndOracleData[perpMarketIdx].oraclePriceData
                );
                console.log(`unsettled  ${perpMarketIdx}:`, userUnsettledPnl.toNumber())
                unsettledPnl += userUnsettledPnl.toNumber()
            }
        }

        console.log(`unsettledPnl:`, unsettledPnl)
        dbStatus.DRIFT_UNSETTLED_PNL = unsettledPnl / PRICE_PRECISION.toNumber()

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

        dbStatus.DRIFT_VALUE = formatUsdc(driftUser.getNetUsdValue())

        let usdcAmount = driftUser.getTokenAmount(0)
        dbStatus.DRIFT_USDC = usdcAmount.toNumber() / 10 ** 6
        for (const acct of driftClient.getPerpMarketAccounts()) {
            console.log(`PERP ${decodeName(acct.name)}:  ${acct.marketIndex}`)
        }

        for (const acct of driftClient.getSpotMarketAccounts()) {
            console.log(`SPOT ${decodeName(acct.name)}:  ${acct.marketIndex}`)
        }
        let driftTokenValue = driftUser.getSpotMarketAssetValue(DRIFT_SPOT_INDEX);
        dbStatus.DRIFT_SPOT_VALUE = driftTokenValue.toNumber() / 10 ** 6

        let jupTokenValue = driftUser.getSpotMarketAssetValue(JUP_SPOT_INDEX);
        dbStatus.JUP_SPOT_VALUE = jupTokenValue.toNumber() / 10 ** 6

        let solTokenValue = driftUser.getSpotMarketAssetValue(SOL_SPOT_INDEX);
        dbStatus.SOL_SPOT_VALUE = solTokenValue.toNumber() / 10 ** 6

        let wTokenValue = driftUser.getSpotMarketAssetValue(W_SPOT_INDEX);
        dbStatus.W_SPOT_VALUE = wTokenValue.toNumber() / 10 ** 6

        let ethTokenValue = driftUser.getSpotMarketAssetValue(ETH_SPOT_INDEX);
        dbStatus.ETH_SPOT_VALUE = ethTokenValue.toNumber() / 10 ** 6

        let cloudTokenValue = driftUser.getSpotMarketAssetValue(CLOUD_SPOT_INDEX);
        dbStatus.CLOUD_SPOT_VALUE = cloudTokenValue.toNumber() / 10 ** 6

        let btcTokenValue = driftUser.getSpotMarketAssetValue(BTC_SPOT_INDEX);
        dbStatus.BTC_SPOT_VALUE = btcTokenValue.toNumber() / 10 ** 6

        let jlpTokenValue = driftUser.getSpotMarketAssetValue(JLP_SPOT_INDEX);
        dbStatus.JLP_SPOT_VALUE = jlpTokenValue.toNumber() / 10 ** 6

        const defaultParams = {
            driftUser,
            driftClient,
            placeOrders: true,
            minTradeValue: 50,
            maxTradeAmount: 5000,
            multiplier: 1.0,
            canReduce: true
        }

        // PEROFRM TRADES
        const ALLOW_TRADES = shouldTrade
        const allOrders = await Promise.all([
            checkPair({
                ...defaultParams,
                placeOrders: false && ALLOW_TRADES,
                market: {
                    symbol: 'ETH',
                    exchange: 'DRIFT',
                    spread: 0.0001,
                    baseline: -0
                }
            }),
            checkPair({
                ...defaultParams,
                placeOrders: false && ALLOW_TRADES,
                market: {
                    symbol: 'CLOUD',
                    exchange: 'DRIFT',
                    spread: 0.0001,
                    baseline: 0
                }
            }),
            checkPair({
                ...defaultParams,
                placeOrders: false && ALLOW_TRADES,
                market: {
                    symbol: 'JUP',
                    exchange: 'DRIFT',
                    spread: 0.0001,
                    baseline: 0
                }
            }),
            checkPair({
                ...defaultParams,
                placeOrders: false && ALLOW_TRADES,
                market: {
                    symbol: 'DRIFT',
                    exchange: 'DRIFT',
                    spread: 0.0001,
                    baseline: 0
                }
            }),
            checkPair({
                ...defaultParams,
                placeOrders: false && ALLOW_TRADES,
                market: {
                    symbol: 'W',
                    exchange: 'DRIFT',
                    spread: 0.0001,
                    baseline: 0
                }
            }),
            checkPair({
                ...defaultParams,
                placeOrders: false && ALLOW_TRADES,
                market: {
                    symbol: 'SOL',
                    exchange: 'DRIFT',
                    spread: 0.05,
                    baseline: 0
                }
            }),
            checkPair({
                ...defaultParams,
                canReduce: false,
                placeOrders: false && ALLOW_TRADES,
                market: {
                    symbol: 'ETH',
                    exchange: 'DRIFT',
                    spread: 0.40,
                    baseline: 0
                }
            }),
            checkPair({
                ...defaultParams,
                placeOrders: false && ALLOW_TRADES,
                market: {
                    symbol: 'BTC',
                    exchange: 'DRIFT',
                    spread: 10,
                    baseline: 0
                }
            }),
        ])

        const matchPairs = false;
        if (matchPairs) {
            const solPosition = dbPositions.find((a: DBItem) => a.MARKET === 'SOL')
            const jupPosition = dbPositions.find((a: DBItem) => a.MARKET === 'JUP')

            const sol = (solPosition?.VALUE || 0) + (solPosition?.PNL || 0)
            const solBaseline = solPosition?.BASELINE || 0
            const solDiff = sol - solBaseline
            const jup = (jupPosition?.VALUE || 0) + (jupPosition?.PNL || 0) * -2
            const jupBaseline = jupPosition?.BASELINE || 0
            const jupDiff = jup - jupBaseline

            console.log(`solDiff: ${solDiff}  jupDiff: ${jupDiff}`)
            console.log(`sol: ${sol}  jup: ${jup}`)

            const diff = sol + jup
            let direction: 'LONG' | 'SHORT' = 'LONG'
            let symbol: 'JUP' | 'SOL' = 'JUP'
            let price: number = 0
            if (diff > 0) {
                // sell jup or sell sol
                if (Math.abs(jup) < Math.abs(jupBaseline)) {
                    // buy jup
                    symbol = 'JUP'
                    direction = 'SHORT'
                    price = jupPosition?.PRICE || 0
                } else {
                    // sell sol
                    symbol = 'SOL'
                    direction = 'SHORT'
                    price = solPosition?.PRICE || 0
                }
            } else {
                // buy jup or buy sol
                if (Math.abs(sol) < Math.abs(solBaseline)) {
                    // buy sol
                    symbol = 'SOL'
                    direction = 'LONG'
                    price = solPosition?.PRICE || 0
                } else {
                    // buy jup
                    symbol = 'JUP'
                    direction = 'LONG'
                    price = jupPosition?.PRICE || 0
                }
            }

            const amount = Math.abs(diff)        
            const minTradeAmount = 50
            const maxAmount = 1000
            console.log(`POSSIBLE TRADE
                Symbol: ${symbol}  
                Direction: ${direction}                  
                Amount: ${amount}
                Price: ${price}
                SOL Total: ${sol}
                JUP Total: ${jup}
                Diff: ${diff} 
                Should Trade: ${ALLOW_TRADES}
                Min Trade Amount: ${minTradeAmount}
                Exceeds Minimum: ${amount>minTradeAmount}
                `)
            const marketIndex = (DRIFT_MARKETS as any)[symbol]
            const spread = symbol === "SOL" ? 0.05 : 0.0001
            if (amount > minTradeAmount) {
                const transactionInstructions: any = []
                console.log(`Possible Trade: 
                        amount=${amount}
                        symbol=${symbol}
                        marketIndex=${marketIndex}
                        spread=${spread}
                        price=${price}
                        direction=${direction}
                `)
                await buySell(direction === "LONG" ? "BUY" : "SELL",
                    amount,
                    maxAmount,
                    symbol,
                    marketIndex,
                    spread,
                    transactionInstructions,
                    price,
                    minTradeAmount,
                    "DRIFT")
                allOrders.push(transactionInstructions)
                const position = dbPositions.find((a: DBItem) => a.MARKET === symbol)
                for (let p of dbPositions){
                    p.PLACE_ORDERS = false
                    p.ORDER = 0
                }
                if (position){
                    position.PLACE_ORDERS = true
                    position.ORDER = direction === "LONG" ? amount : -amount
                }
            }
        }
        await updateGoogleSheet(dbPositions, driftClient)

        // place drift orders
        const newOrders = allOrders.flat()
        if (ALLOW_TRADES && newOrders.length > 0) {
            for(const trade of newOrders){
                console.log(`>>> Placing Trade: 
                    amount=${trade.tradeSize * trade.price}
                    symbol=${trade.symbol}
                    marketIndex=${trade.marketIndex}                    
                    price=${trade.price}
                    direction=${trade.side}`)
            }
            await placeDriftOrders(newOrders, driftClient, cancelOrders, true)
        }

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

/**
 * Returns unsettled funding pnl for the position
 *
 * To calculate all fees and funding pnl including settled, use calculateFeesAndFundingPnl
 *
 * @param market
 * @param PerpPosition
 * @returns // QUOTE_PRECISION
 */
export function calculateUnsettledFundingPnl(
	market: PerpMarketAccount,
	perpPosition: PerpPosition
): BN {
	if (perpPosition.baseAssetAmount.eq(ZERO)) {
		return ZERO;
	}

	let ammCumulativeFundingRate: BN;
	if (perpPosition.baseAssetAmount.gt(ZERO)) {
		ammCumulativeFundingRate = market.amm.cumulativeFundingRateLong;
	} else {
		ammCumulativeFundingRate = market.amm.cumulativeFundingRateShort;
	}

	const perPositionFundingRate = ammCumulativeFundingRate
		.sub(perpPosition.lastCumulativeFundingRate)
		.mul(perpPosition.baseAssetAmount)
		.div(AMM_RESERVE_PRECISION)
		.div(FUNDING_RATE_BUFFER_PRECISION)
		.mul(new BN(-1));

	return perPositionFundingRate;
}

/**
 * Returns total fees and funding pnl for a position
 *
 * @param market
 * @param PerpPosition
 * @param includeUnsettled include unsettled funding in return value (default: true)
 * @returns — // QUOTE_PRECISION
 */
export function calculateFeesAndFundingPnl(
	market: PerpMarketAccount,
	perpPosition: PerpPosition,
	includeUnsettled = true
): BN {
    if(!perpPosition) return new BN(0)
	const settledFundingAndFeesPnl = perpPosition.quoteBreakEvenAmount.sub(
		perpPosition.quoteEntryAmount
	);

	if (!includeUnsettled) {
		return settledFundingAndFeesPnl;
	}

	const unsettledFundingPnl = calculateUnsettledFundingPnl(
		market,
		perpPosition
	);

	return settledFundingAndFeesPnl.add(unsettledFundingPnl);
}

(async () => {
    console.log('RUNNING DRIFT BUCKETS')
    const timeout = 60 * 1000 * 1
    // update wallets
    await checkBalances('../mango/secrets/accounts.json')
    let count = 0;
    const runEveryNumberOfMinutes = 3
    while (true) {
        const shouldExecute = await shouldRun() && false;    // disable trade executions by setting to false    
        console.log(`count: ${count}.   count % ${runEveryNumberOfMinutes} = ${count % runEveryNumberOfMinutes}  shouldExecute = ${shouldExecute}`)
        await checkTrades(count % runEveryNumberOfMinutes === 0 && shouldExecute)
        count++
        console.log(`DRIFT BUCKETS (Count=${count}) >> Sleeping for ${timeout / 1000} seconds. ${new Date().toLocaleTimeString()}`)
        await new Promise(resolve => setTimeout(resolve, timeout));
    }
})();
