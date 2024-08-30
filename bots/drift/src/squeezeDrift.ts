import { Keypair, Connection } from "@solana/web3.js";
import {
    Wallet, DriftClient, BN, MarketType,
    BASE_PRECISION, PRICE_PRECISION,
    PositionDirection, OrderType, PostOnlyParams, User, decodeName
} from "@drift-labs/sdk";
import fs from 'fs';
import axios from 'axios';
import pkg from 'bs58';
const { decode } = pkg;
import { authorize } from './googleUtils';
import { CONNECTION_URL, SPREADSHEET_ID } from '../../mango/src/constants';

const DRIFT_ENV = 'mainnet-beta';
const QUOTES_URL = 'https://dlob.drift.trade/l2?depth=3&includeOracle=true&includeVamm=false&marketName=';
const keyPairFile = `./secrets/wallet.txt`;

const BASELINE_PNL = 180;
const UPDATE_GOOGLE = true

const base64String = fs.readFileSync(keyPairFile, 'utf-8');
const privateKeyUint8Array = decode(base64String);
const keyPair = Keypair.fromSecretKey(privateKeyUint8Array);
const wallet = new Wallet(keyPair)

const PRICE_NUM_DECIMALS = 6;
const PRICE_DECIMALS = 10 ** PRICE_NUM_DECIMALS;
const AMOUNT_DECIMALS = 10 ** 9;

const PLACE_ORDERS = true

const MARKETS = [{
    symbol: 'JUP',
    side: 'SHORT',
    spread: 0.0005,
    marketIndex: 24,
    disabled: false
}, {
    symbol: 'ETH',
    side: 'LONG',
    spread: 1,
    marketIndex: 2,
    disabled: false
}, {
    symbol: 'BTC',
    side: 'LONG',
    spread: 25,
    marketIndex: 1,
    disabled: false
}, {
    symbol: 'SOL',
    side: 'LONG',
    spread: 0,
    marketIndex: 0,
    disabled: true
}]

const MAX_LONG = 0
const MAX_TRADE_AMOUNT = 250
const MIN_TRADE_VALUE = 10

interface AnalyzeProps {
    user: any,
    transactionInstructions: Array<any>,
    maxLong: number,
    maxTradeAmount: number,
    minTradeValue: number
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
    minTradeValue: number = 5) {

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
        const baseAssetAmount = new BN(tradeSize * BASE_PRECISION.toNumber())
        console.log(`baseAssetAmount: ${baseAssetAmount.toNumber()}`)
        const direction = side === "BUY" ? PositionDirection.LONG : PositionDirection.SHORT
        const newPrice = new BN(price * PRICE_PRECISION.toNumber())
        console.log(`newPrice: ${newPrice.toNumber()}`)
        console.log(`${symbol} ${side} ${tradeSize} for ${price} Total = ${tradeSize * price}.  Oracle = ${oraclePrice} \n`)
        const orderParams = {
            orderType: OrderType.LIMIT,
            marketIndex: marketIndex,
            marketType: MarketType.PERP,
            postOnly: PostOnlyParams.MUST_POST_ONLY,
            direction,
            baseAssetAmount,
            price: newPrice
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
async function fetchQuotes(market: string) {
    console.log(`QUOTES URL = `, `${QUOTES_URL}${market}-PERP`)
    const response = await axios.get(`${QUOTES_URL}${market}-PERP`);
    const data = response.data;
    const bidPrice = convertPrice(Number(data.bids[0].price));
    const bidPrice2 = convertPrice(Number(data.bids[1].price));
    const askPrice = convertPrice(Number(data.asks[0].price));
    const askPrice2 = convertPrice(Number(data.asks[1].price));
    const oracle = Number(data.oracleData.price);
    const oraclePrice = convertPrice(oracle);
    return {
        oraclePrice,
        bidPrice: bidPrice > askPrice ? bidPrice2 : bidPrice,
        askPrice: askPrice < bidPrice ? askPrice2 : askPrice
    }
}

async function getPosition(user: User, marketIndex: number, symbol: string) {
    const perpPosition = user.getPerpPosition(marketIndex);
    const baseAssetAmount = perpPosition?.baseAssetAmount?.toNumber() || 0
    const baseAsset = convertAmount(baseAssetAmount);

    const quoteBreakEvenAmount = perpPosition?.quoteBreakEvenAmount?.toNumber() || 0
    const quoteEntryAmount = perpPosition?.quoteEntryAmount?.toNumber() || 0

    const breakEvenPrice = convertPrice(AMOUNT_DECIMALS * Math.abs(quoteBreakEvenAmount / baseAssetAmount));
    const entryPrice = convertPrice(AMOUNT_DECIMALS * Math.abs(quoteEntryAmount / baseAssetAmount || 0));
    const quotes = await fetchQuotes(symbol);
    const bid = Math.min(quotes.oraclePrice, quotes.askPrice);
    const ask = Math.max(quotes.bidPrice, quotes.askPrice);
    const price = (bid + ask) / 2
    const baseAmount = entryPrice * baseAsset
    const currentAmount = price * baseAsset
    let pnl = currentAmount - baseAmount
    if (baseAsset < 0) {
        pnl = baseAmount * -1 + currentAmount
    }


    console.log('--');
    console.log(symbol, quotes);
    console.log('*** Break Even Price:', breakEvenPrice);
    console.log('*** Entry Price:', entryPrice);
    console.log('*** Price:', price);
    console.log('*** Oracle Price:', quotes.oraclePrice);
    console.log('*** Pnl:', pnl);
    console.log('*** Base Asset:', baseAsset);
    console.log('*** value:', currentAmount);


    return {
        price,
        baseAsset,
        breakEvenPrice,
        entryPrice,
        pnl,
        marketIndex,
        symbol,
        value: currentAmount,
        oracle: quotes.oraclePrice
    }
}

async function analyzeMarket(props: AnalyzeProps) {

    const { user, transactionInstructions, minTradeValue, maxLong, maxTradeAmount } = props;
    let shortPnl = 0
    let longPnl = 0
    let longValue = 0
    let shortValue = 0

    const positions: Array<any> = []
    for (const market of MARKETS) {
        const position = await getPosition(user, market.marketIndex, market.symbol)
        const entryPrice = position.entryPrice || 0
        const positionSize = position.baseAsset || 0
        const pnl = position.pnl || 0
        const side = market.side
        const value = position.value || 0
        const adjustedValue = value + pnl * (side === "LONG" ? 1 : -1)
        const price = position.price
        if (!market.disabled) {
            if (side === "SHORT") {
                shortPnl += pnl
                shortValue += value;
            } else if (side === "LONG") {
                longPnl += pnl
                longValue += value;
            }
        }

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
            marketIndex: market.marketIndex,
            disabled: market.disabled
        })
        console.log(`${market.symbol} ${side} PNL: ${pnl} Value: ${value} Price: ${price} Entry Price: ${entryPrice} Position Size: ${positionSize}`)
    }

    const totalPnl = shortPnl + longPnl
    const totalLongValue = longValue + longPnl - maxLong
    const totalShortValue = shortValue - shortPnl
    const totalSpread = totalLongValue + totalShortValue

    console.log(`
        total spread:  ${totalSpread}
        maxTradeAmount: ${maxTradeAmount}

        TOTAL PNL: ${totalPnl}

        Short Pnl: ${shortPnl}
        Long Pnl: ${longPnl}

        Total Long Value: ${totalLongValue}
        Total Short Value: ${totalShortValue}
        Diff : ${totalSpread}       
        PNL vs Baseline: ${totalPnl - BASELINE_PNL}
        
        
        `)

    const enabledPositions = positions.filter(a => !a.disabled)
    if (totalSpread > 0) {
        // longs exceed shorts -- SELL
        const amt = totalSpread
        const maxAmount = Math.min(amt, maxTradeAmount)
        const market = enabledPositions.sort((a, b) => b.adjustedValue - a.adjustedValue).find(a => a.side === "SHORT")
        // SELL
        await buySell("SELL", amt, maxAmount, market.symbol, market.marketIndex, market.spread, transactionInstructions, market.price, minTradeValue)
    } else {
        // shorts exceeds long -- buy        
        const amt = totalSpread * -1
        const market = enabledPositions.sort((a, b) => a.adjustedValue - b.adjustedValue).find(a => a.pnl > 0 && a.value > minTradeValue && a.side === "SHORT")
        if (market) {
            const maxAmount = Math.min(Math.abs(market.value), maxTradeAmount, amt)
            await buySell("BUY", amt, maxAmount, market.symbol, market.marketIndex, market.spread, transactionInstructions, market.price, minTradeValue)
        } else {
            const longMarket = enabledPositions.find(a => a.side === "LONG")
            await buySell("BUY", amt, maxTradeAmount, longMarket.symbol, longMarket.marketIndex, longMarket.spread, transactionInstructions, longMarket.price, minTradeValue)
        }
    }
    return {
        totalPnl,
        totalLongValue,
        totalShortValue,
        positions
    }
}

async function retryTransaction(driftClient: DriftClient, newOrders: any[], maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const tx = await driftClient.cancelAndPlaceOrders({}, newOrders);
            console.log('SUCCESSS: New Orders Placed:', newOrders.length);
            console.log('New Orders Tx:', `https://explorer.solana.com/tx/${tx}`);
            return tx;
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

(async () => {
    try {
        console.time('Connection to Solana');
        const connection = new Connection(CONNECTION_URL);
        console.timeEnd('Connection to Solana');

        console.time('New Drift Client');
        const driftClient = new DriftClient({
            connection,
            wallet,
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

        // const markets = driftClient.getPerpMarketAccounts()
        // for(const m of markets){
        //     console.log(`Name = ${decodeName(m.name)}.  Index=${m.marketIndex}`)
        // }

        const newOrders: any = []
        const cancelOrders: any[] = []

        for (const order of orders) {
            cancelOrders.push(order);
        }

        const results = await analyzeMarket({
            user,
            transactionInstructions: newOrders,
            maxLong: MAX_LONG,
            maxTradeAmount: MAX_TRADE_AMOUNT,
            minTradeValue: MIN_TRADE_VALUE
        })
        if (PLACE_ORDERS && (newOrders.length + cancelOrders.length) > 0) {
            try {
                console.time('Place Orders');
                console.log('Placing Orders #', newOrders.length);
                console.log('Cancelling Orders #', cancelOrders.length);
                const tx = await retryTransaction(driftClient, newOrders, 5);
            } catch (x: any) {
                console.log('Error Creating Orders:', x)
                if (x?.logs?.length > 0) {
                    console.log('Logs:', x.logs);
                }
                console.log(`Place Orders failed`)
            } finally {
                console.timeEnd('Place Orders');
            }
        }

        /// GOOGOLE         
        if (UPDATE_GOOGLE) {
            const { google } = require('googleapis');

            const googleClient: any = await authorize();
            const googleSheets = google.sheets({ version: 'v4', auth: googleClient });
            const sheetName = "Phone"
            const dashSheetName = "DashboardDM"
            console.log(`Updating Google`)
            const jupPosition = results.positions.find(a => a.symbol === "JUP")
            const ethPosition = results.positions.find(a => a.symbol === "ETH")
            const btcPosition = results.positions.find(a => a.symbol === "BTC")
            const solPosition = results.positions.find(a => a.symbol === "SOL")
            await googleSheets.spreadsheets.values.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                resource: {
                    valueInputOption: 'RAW',
                    data: [
                        {
                            range: `${sheetName}!I7:L10`,
                            values: [
                                [jupPosition.value, jupPosition.pnl, jupPosition.adjustedValue, jupPosition.price],
                                [btcPosition.value, btcPosition.pnl, btcPosition.adjustedValue, btcPosition.price],
                                [ethPosition.value, ethPosition.pnl, ethPosition.adjustedValue, ethPosition.price],
                                [solPosition.value, solPosition.pnl, solPosition.adjustedValue, solPosition.price]
                            ]
                        },
                        {
                            range: `${sheetName}!J11`,
                            values: [
                                [BASELINE_PNL]
                            ],
                        },
                        {
                            range: `${dashSheetName}!B4`,
                            values: [
                                [formatUsdc(usdValue)]
                            ],
                        }, {
                            range: `${sheetName}!I5`,
                            values: [
                                [health]
                            ],
                        }, {
                            range: `${sheetName}!K5`,
                            values: [
                                [formatUsdc(funding)]
                            ],
                        }
                    ]
                }
            });
            console.log(`Updating Google Complete`)
        }

    } catch (error) {
        // Handle errors here
        console.error(`Error in main loop`, error)
    }
})();
