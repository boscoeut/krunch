import { Keypair, Connection } from "@solana/web3.js";
import { Wallet, DriftClient, BN, MarketType, PositionDirection, OrderType, PostOnlyParams } from "@drift-labs/sdk";
import fs from 'fs';
import axios from 'axios';
import pkg from 'bs58';
const { decode } = pkg;

const DRIFT_ENV = 'mainnet-beta';
const QUOTES_URL = 'https://dlob.drift.trade/l2?depth=3&includeOracle=true&includeVamm=false&marketName=';
const CONNECTION_URL = 'https://solana-mainnet.g.alchemy.com/v2/YgL0vPVzbS8fh9y5l-eb35JE2emITsv0';
const keyPairFile = `${process.env.ANCHOR_WALLET}`;

const base64String = fs.readFileSync(keyPairFile, 'utf-8');
const privateKeyUint8Array = decode(base64String);
const keyPair = Keypair.fromSecretKey(privateKeyUint8Array);
const wallet = new Wallet(keyPair)

const PRICE_NUM_DECIMALS = 6;
const PRICE_DECIMALS = 10 ** PRICE_NUM_DECIMALS;
const AMOUNT_DECIMALS = 10 ** 9;
type Market = {
    symbol: string,
    direction: PositionDirection,
    marketIndex: number,
    tradeSize: number,
    openAdjustSize: number,
    closeAdjustSize: number,
    priceDiff: number
}
const MARKETS: Array<Market> = [
    {
        direction: PositionDirection.LONG,
        symbol: "AVAX",
        marketIndex: 22,
        tradeSize: 0.6,
        openAdjustSize: 0.01,
        closeAdjustSize: 0.1,
        priceDiff: 0.1
    },
    {
        direction: PositionDirection.LONG,
        symbol: "BTC",
        marketIndex: 1,
        tradeSize: 0.0005,
        openAdjustSize: 10,
        closeAdjustSize: 15,
        priceDiff: 50
    },
    {
        direction: PositionDirection.LONG,
        symbol: "ETH",
        marketIndex: 2,
        tradeSize: 0.01,
        openAdjustSize: 1.5,
        closeAdjustSize: 5,
        priceDiff: 5
    },
    {
        direction: PositionDirection.LONG,
        symbol: "BNB",
        marketIndex: 8,
        tradeSize: 0.07,
        openAdjustSize: 0.25,
        closeAdjustSize: 1.5,
        priceDiff: 1
    }, {
        direction: PositionDirection.SHORT,
        symbol: "XRP",
        marketIndex: 13,
        tradeSize: 50,
        openAdjustSize: 0.0001,
        closeAdjustSize: 0.0005,
        priceDiff: 0.0005
    }, {
        direction: PositionDirection.SHORT,
        symbol: "DOGE",
        marketIndex: 7,
        tradeSize: 50,
        openAdjustSize: 0.0001,
        closeAdjustSize: 0.0003,
        priceDiff: 0.0003
    },
    {
        symbol: "JUP",
        direction: PositionDirection.SHORT,
        marketIndex: 24,
        tradeSize: 50,
        openAdjustSize: 0.0000,
        closeAdjustSize: 0.0005,
        priceDiff: 0.0005
    },
    {
        direction: PositionDirection.SHORT,
        symbol: "SOL",
        marketIndex: 0,
        tradeSize: 0.2,
        openAdjustSize: 0.01,
        closeAdjustSize: 0.05,
        priceDiff: 0.20
    },
]
const PLACE_ORDERS = true;

async function fetchQuotes(market: string) {
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

const invertPrice = (price: number) => {
    try {
        return new BN(Number(price.toFixed(PRICE_NUM_DECIMALS)) * PRICE_DECIMALS);
    } catch (e) {
        console.log("Error inverting price:", e)
        throw e
    }
}

const convertPrice = (price: number) => {
    return price / PRICE_DECIMALS;
}

const convertAmount = (price: number) => {
    return price / AMOUNT_DECIMALS;
}

console.time('Connection to Solana');
const connection = new Connection(CONNECTION_URL);
console.timeEnd('Connection to Solana');

console.time('New Drift Client');
const driftClient = new DriftClient({
    connection,
    wallet,
    env: DRIFT_ENV,
});
console.timeEnd('New Drift Client');

function logOrders(title: string, orders: any, markets: Array<Market>) {
    console.log(title);
    for (const order of orders) {
        const symbol = markets.find(m => m.marketIndex === order.marketIndex)?.symbol || 'UNKNOWN';
        const amount = order.amount || convertAmount(order.baseAssetAmount.toNumber())
        const price = order.price.toNumber? convertPrice(order.price.toNumber()) : order.price 
        const direction = order.direction ? (order.direction === PositionDirection.LONG ? 'LONG' : 'SHORT') : 'UNKNOWN';
        console.log(`
            Symbol=${symbol}
            Price=${price}
            Amount=${amount}
            Direction=${direction}
        `);
    }
}

async function checkTrades(markets: Array<Market>) {

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

    console.time('Get Open Orders');
    const orders = user.getOpenOrders();
    console.timeEnd('Get Open Orders');
    console.log('# Open Orders:', orders.length);

    const newOrders: any = []
    const cancelOrders: any[] = []

    for (const market of markets) {
        const perpPosition = user.getPerpPosition(market.marketIndex);
        const baseAssetAmount = perpPosition?.baseAssetAmount;
        const baseAsset = convertAmount(baseAssetAmount?.toNumber() || 0);
        const breakEvenPrice = convertPrice(AMOUNT_DECIMALS * Math.abs(perpPosition?.quoteBreakEvenAmount.toNumber() / baseAssetAmount?.toNumber() || 0));
        const entryPrice = convertPrice(AMOUNT_DECIMALS * Math.abs(perpPosition?.quoteEntryAmount.toNumber() / baseAssetAmount?.toNumber() || 0));

       

        const quotes = await fetchQuotes(market.symbol);
        console.log('--');
        console.log(market.symbol, quotes);
        console.log('*** Break Even Price:', breakEvenPrice);
        console.log('*** Entry Price:', entryPrice);
        console.log('*** Base Asset:', baseAsset);

        const direction = baseAsset === 0 ? market.direction : baseAsset < 0 ? PositionDirection.LONG : PositionDirection.SHORT;
        const amount = baseAsset !== 0 ? Math.abs(baseAsset) : market.tradeSize;
        const closePrice = baseAsset < 0 ? breakEvenPrice - market.closeAdjustSize : breakEvenPrice + market.closeAdjustSize;
        const bid = Math.min(quotes.bidPrice, quotes.askPrice);
        const ask = Math.max(quotes.bidPrice, quotes.askPrice);
        const openPrice = market.direction === (PositionDirection.LONG || baseAsset < 0) ? bid - market.openAdjustSize : ask + market.openAdjustSize;
        let newPrice = openPrice
        if (baseAsset < 0) {
            if (closePrice < openPrice) {
                newPrice = closePrice
            }
        } else if (baseAsset > 0) {
            if (closePrice > openPrice) {
                newPrice = closePrice
            }
        }


        const newOrder = {
            orderId: -1,
            price: 0,
            amount: 0,
            filled: 0,
            marketIndex: market.marketIndex,
        }
        for (const order of orders) {
            if (order.marketIndex === market.marketIndex) {
                const existingLong = order.direction === PositionDirection.LONG && baseAsset > 0 && order.orderId !== -1
                const existingShort = order.direction === PositionDirection.SHORT && baseAsset < 0 && order.orderId !== -1
                if (newOrder.orderId !== -1 || existingLong || existingShort) {
                    console.log('*** Multiple orders for the same market');
                    console.log('*** Cancelling:', order.orderId);
                    cancelOrders.push({...order, symbol: market.symbol, direction: market.direction});
                } else {
                    newOrder.orderId = order.orderId;
                    newOrder.price = convertPrice(order.price.toNumber());
                    newOrder.amount = convertAmount(order.baseAssetAmount.toNumber());
                    newOrder.filled = convertAmount(order.baseAssetAmountFilled.toNumber());
                }

            }
        }

        const priceDiff = Math.abs(newPrice - newOrder.price);
        const shouldCancel = priceDiff > market.priceDiff && newOrder.orderId !== -1

        const orderParams = {
            orderType: OrderType.LIMIT,
            marketIndex: market.marketIndex,
            marketType: MarketType.PERP,
            postOnly: PostOnlyParams.MUST_POST_ONLY,
            direction,
            baseAssetAmount: new BN(amount * AMOUNT_DECIMALS),
            price: invertPrice(newPrice)
        }
        if (shouldCancel) {
            cancelOrders.push(newOrder);
        } else if (newOrder.orderId === -1) {   
            newOrders.push(orderParams);
        }
        console.log('*** priceDiff:', priceDiff);
        console.log('*** marketDiff:', market.priceDiff );
        console.log('*** shouldCancel:', shouldCancel);
        console.log('*** newPrice:', convertPrice(orderParams.price.toNumber()));     
    }

    if (newOrders.length === 0) {
        console.log('**** No new orders to place');
    } else {
        console.time('Place Orders');
        console.log(`**** ${PLACE_ORDERS ? 'EXECUTING' : 'MOCKING'} ${newOrders.length} orders`);
        console.log(`**** ${PLACE_ORDERS ? 'CANCELLING' : 'MOCKING CANCEL'} ${cancelOrders.length} orders`);
        logOrders('New Orders:', newOrders, markets);
        if (PLACE_ORDERS) {
            try {
                if (cancelOrders.length > 0) {
                    logOrders('Cancel Orders:', cancelOrders, markets);
                    const tx = await driftClient.cancelOrdersByIds(cancelOrders.map(o => o.orderId));
                    console.log('Cancel Orders Tx:', tx);
                }
                const tx = await driftClient.placeOrders(newOrders);
                console.log('New Orders Tx:', tx);
            } catch (x: any) {
                console.log('Error Creating Orders:', x)
                if (x?.logs?.length > 0) {
                    console.log('Logs:', x.logs);
                }
            } finally {
                console.timeEnd('Place Orders');
            }
        }
    }
}




function sleep(time: number) {
    return new Promise(resolve => setTimeout(resolve, time));
}

(async () => {
    const waitTime = 60

    while (true) {
        console.time('Check Trades');
        try {
            await checkTrades(MARKETS.filter(m => m.symbol));
        } catch (e) {
            console.log('Error checking trades:', e);
        } finally {
            console.log(`--- Waiting ${waitTime} seconds ---`);
            await sleep(waitTime * 1000);
        }
        console.timeEnd('Check Trades');
    }
})();


