import { Keypair, Connection } from "@solana/web3.js";
import { Wallet, DriftClient, BN, MarketType, PositionDirection, OrderType, PostOnlyParams, User } from "@drift-labs/sdk";
import fs from 'fs';
import axios from 'axios';
import pkg from 'bs58';
const { decode } = pkg;

const DRIFT_ENV = 'mainnet-beta';
const QUOTES_URL = 'https://dlob.drift.trade/l2?depth=3&includeOracle=true&includeVamm=false&marketName=';
const CONNECTION_URL = 'https://solana-mainnet.g.alchemy.com/v2/odv67ZxOsKsh9lMdK-_SDDpwj4dmC9P8';
const keyPairFile = `./secrets/wallet.txt`;

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
    accountSubscription: {
        resubTimeoutMs: 15000,
        type: 'websocket'

    }
});
console.timeEnd('New Drift Client');

function logOrders(title: string, orders: any, markets: Array<Market>) {
    console.log(title);
    for (const order of orders) {
        const symbol = markets.find(m => m.marketIndex === order.marketIndex)?.symbol || 'UNKNOWN';
        const amount = order.amount || convertAmount(order.baseAssetAmount.toNumber())
        const price = order.price.toNumber ? convertPrice(order.price.toNumber()) : order.price
        const direction = order.direction ? (order.direction === PositionDirection.LONG ? 'LONG' : 'SHORT') : 'UNKNOWN';
        console.log(`
            Symbol=${symbol}
            Price=${price}
            Amount=${amount}
            Direction=${direction}
        `);
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

function buySell(marketIndex: number, amount: number, newPrice: number) {
    const orderParams = {
        orderType: OrderType.LIMIT,
        marketIndex: marketIndex,
        marketType: MarketType.PERP,
        postOnly: PostOnlyParams.MUST_POST_ONLY,
        direction: PositionDirection.LONG,
        baseAssetAmount: new BN(amount * AMOUNT_DECIMALS),
        price: invertPrice(newPrice)
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

    for (const order of orders) {
        cancelOrders.push(order.orderId);
    }

    const solPosition = await getPosition(user, 0, "SOL")
    const solPnl = solPosition.pnl
    const ethPosition = await getPosition(user, 2, "ETH")
    const ethPnl = ethPosition.pnl
    const btcPosition = await getPosition(user, 1, "BTC")
    const btcPnl = btcPosition.pnl

    const shortPnl = ethPnl + btcPnl
    const longPnl = solPnl
    const totalPnl = solPnl + ethPnl + btcPnl

    const solValue = solPosition.value
    const btcValue = btcPosition.value
    const ethValue = ethPosition.value

    const totalLongValue = solValue + solPnl
    const totalShortValue = (-1 * btcValue) + (-1 * ethValue) + btcPnl + ethPnl
    const maxTradeAmount = 1000
    const minSpread = 50
    const totalSpread = totalLongValue - totalShortValue

    console.log(`
        total spread:  ${totalSpread}
        maxTradeAmount: ${maxTradeAmount}

        min Spread: ${minSpread}

        SOL PNL  : ${solPnl}
        ETH PNL  : ${ethPnl}
        BTC PNL  : ${btcPnl}
        TOTAL PNL: ${totalPnl}

        Sol Price: ${solPosition.price}
        Eth Price: ${ethPosition.price}
        Btc Price: ${btcPosition.price}

        Sol Value: ${solValue}
        Btc Value: ${btcValue}
        Eth Value: ${ethValue}

        Short Pnl: ${shortPnl}
        Long Pnl: ${longPnl}

        Total Long Value: ${totalLongValue}
        Total Short Value: ${totalShortValue}
        Diff: ${totalSpread}
        `)

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


