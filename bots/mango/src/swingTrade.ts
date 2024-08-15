import {
    HealthType,
    PerpOrderSide,
    PerpOrderType,
    PerpSelfTradeBehavior
} from '@blockworks-foundation/mango-v4';
import {
    BASE_PRECISION,
    BN,
    BulkAccountLoader,
    DRIFT_PROGRAM_ID,
    DriftClient,
    MarketType,
    OrderType,
    PRICE_PRECISION,
    PerpMarkets,
    PositionDirection,
    PostOnlyParams,
    Wallet
} from "@drift-labs/sdk";
import {
    Connection,
    PublicKey
} from '@solana/web3.js';
import fs from 'fs';
import { HELIUS_JANE_CONNECTION_URL } from "./constants";
import { getFundingRate, getUser, setupClient, toFixedFloor } from './mangoUtils';
import { calculateAllEstimatedFundingRate } from './sniper';
import { AccountDefinition } from './types';

const perpMarketAccount = {}
const env = 'mainnet-beta';


type ExchangeOrder = {
    price: number,
    amount: number,
    side: "BUY" | "SELL",
    filled?: number,
    offset?: number
    type?: "LIMIT" | "ORACLE" | "IOC"
}
type ExchangeInfo = {
    oraclePrice: number,
    health: number,
    amount: number,
    breakEven: number,
    fundingAmount: number,
    orders: Array<ExchangeOrder>,
    fundingRate: number
}

type SwingParameters = {
    market: string,
    mangoAccount: string,
    maxAmount: number,
    additionalAmount: number,
    removeOffset: number,
    addOffset: number,
    tickSize: number,
    priorityFee: number,
    initialAmount: number,
    shouldExecute: boolean,
    clearOldOrders: boolean,
    side: "BUY" | "SELL",
    minOffset: number,
    maxBulkTrade: number,
    shouldAdd: boolean
}


export async function getDriftClient(account: string) {
    // Set up the Drift Client
    const env = 'mainnet-beta';
    const URL = HELIUS_JANE_CONNECTION_URL
    const key = account.toLowerCase() + "Key";
    const wallet = new Wallet(getUser("./secrets/" + key + ".json"))
    const connection = new Connection(URL);

    const driftPublicKey = new PublicKey(DRIFT_PROGRAM_ID);
    const bulkAccountLoader = new BulkAccountLoader(
        connection,
        'confirmed',
        1000
    );
    const driftClient = new DriftClient({
        connection: connection,
        wallet: wallet,
        programID: driftPublicKey,
        accountSubscription: {
            type: 'polling',
            accountLoader: bulkAccountLoader,
        },
    });

    // Subscribe to the Drift Account
    await driftClient.subscribe();
    const user = driftClient.getUser();
    const userAccount = driftClient.getUserAccount()
    return {
        driftClient,
        user,
        userAccount
    }
}

export async function placeDriftTrade(driftClient: DriftClient, marketIndex: number) {
    const newPrice = new BN(10).mul(PRICE_PRECISION)
    const priceOffset = PRICE_PRECISION.div(new BN(2));
    // const baseAssetAmount = new BN(Math.abs(trade.amount)).mul(BASE_PRECISION)
    const baseAssetAmount = new BN(2).mul(BASE_PRECISION)
    const direction = PositionDirection.LONG
    const orderParams = {
        orderType: OrderType.LIMIT,
        marketIndex: marketIndex,
        marketType: MarketType.PERP,
        postOnly: PostOnlyParams.MUST_POST_ONLY,
        direction,
        baseAssetAmount,
        price: newPrice
    }
    const tradesToProcess: any = []
    tradesToProcess.push(orderParams)
    driftClient.cancelOrders(MarketType.PERP, marketIndex, PositionDirection.LONG)
    await driftClient.placeOrders(tradesToProcess)
}
function formatUsdc(usdc: any) {
    return usdc / BASE_PRECISION.toNumber()
}
function formatPrice(price: any) {
    return price / PRICE_PRECISION.toNumber()
}

export async function getDriftData(account: string, symbol: string): Promise<ExchangeInfo> {
    // DRIFT DATA
    const { driftClient, user, userAccount } = await getDriftClient(account)
    const marketInfo = PerpMarkets[env].find(
        (market: any) => market.baseAssetSymbol === symbol
    );
    const marketIndex = marketInfo!.marketIndex;
    const perpMarketAccount = driftClient.getPerpMarketAccount(marketIndex);
    const ordacleData = driftClient.getOracleDataForPerpMarket(marketIndex);
    const oraclePrice = formatPrice(ordacleData.price.toNumber())
    const activePerpPositions = user.getActivePerpPositions()
    const userPosition = activePerpPositions.find(x => x.marketIndex === marketIndex)
    const breakEven = userPosition!.quoteBreakEvenAmount.toNumber() / userPosition!.baseAssetAmount.toNumber() * 1000
    const baseAssetAmount = formatUsdc(userPosition?.baseAssetAmount.toNumber())
    const health = user.getHealth()
    let exchangeOrders: Array<ExchangeOrder> = []

    const fundingAmount = formatUsdc(user.getUnrealizedFundingPNL().toNumber())

    const allFundingRateData = await calculateAllEstimatedFundingRate(perpMarketAccount!, ordacleData)
    const orders = user.getOpenOrders();
    for (const order of orders) {
        console.log(order.direction, order.marketIndex, order.price, order.baseAssetAmount.toNumber(), order.baseAssetAmountFilled.toNumber())
        exchangeOrders.push({
            price: formatPrice(order.price.toNumber()),
            amount: formatUsdc(order.baseAssetAmount.toNumber()),
            filled: formatUsdc(order.baseAssetAmountFilled.toNumber()),
            side: order.direction === PositionDirection.LONG ? "BUY" : "SELL",
        })
    }
    return {
        oraclePrice,
        health,
        breakEven,
        fundingRate: allFundingRateData[4].toNumber() / 100,
        amount: baseAssetAmount,
        fundingAmount,
        orders: exchangeOrders
    }
}
export async function getMangoData(account: string, symbol: string, priorityFee: number = 10000) {
    // MANGO DATA
    const market = `${symbol}-PERP`
    let accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
    const mangoUser = accountDefinitions.find(a => a.name === account)
    const client = await setupClient(mangoUser!, priorityFee);
    const values = client.group.perpMarketsMapByMarketIndex.values()
    const valuesArray = Array.from(values)

    const fundingRates = await getFundingRate()
    const perpMarket: any = valuesArray.find((perpMarket: any) => perpMarket.name === market);
    const orders = await client.mangoAccount!.loadPerpOpenOrdersForMarket(
        client.client,
        client.group,
        perpMarket.perpMarketIndex,
        true
    )
    let exchangeOrders: Array<ExchangeOrder> = []
    for (const order of orders) {
        exchangeOrders.push({
            price: order.price,
            amount: order.size,
            filled: order.size,
            side: order.side == PerpOrderSide.bid ? "BUY" : "SELL",
        })
    }
    const health = client.mangoAccount!.getHealthRatio(client.group, HealthType.maint)!.toNumber()
    const perpPosition = client.mangoAccount!
        .perpActive()
        .find((pp: any) => pp.marketIndex === perpMarket!.perpMarketIndex);

    let breakEven = 0
    let pricePrecision = 1000
    if (symbol === "ETH") {
        pricePrecision = 1
    }
    const oraclePrice = perpMarket.price.toNumber() * pricePrecision
    let amount = 0
    let fundingAmount = 0

    let basePrecision = 100
    if (symbol === "ETH") {
        basePrecision = 100 * 100
    }
    if (perpPosition) {
        amount = perpPosition!.basePositionLots.toNumber() / basePrecision
        const btcFunding = perpPosition?.getCumulativeFunding(perpMarket)
        fundingAmount = ((btcFunding?.cumulativeShortFunding || 0) - (btcFunding!.cumulativeLongFunding || 0)) / 10 ** 6
        // breakEven = perpPosition.getBreakEvenPriceUi(perpMarket)
        breakEven = perpPosition.getAverageEntryPriceUi(perpMarket)
    }
    return {
        exchangeInfo: {
            oraclePrice,
            health,
            breakEven,
            amount,
            fundingAmount,
            fundingRate: fundingRates.solFundingRate,
            orders: exchangeOrders
        }, client, perpMarket
    }
}

function roundUp(num: number, decimals: number) {
    const factor = Math.pow(10, decimals);
    return Math.ceil(num * factor) / factor;
}

export async function swingMangoTrade({
    mangoAccount,
    market,
    priorityFee,
    initialAmount,
    additionalAmount,
    maxAmount,
    addOffset,
    removeOffset,
    tickSize,
    shouldExecute = false,
    clearOldOrders = false,
    side,
    minOffset,
    maxBulkTrade,
    shouldAdd = true }: SwingParameters
) {
    const { exchangeInfo: mangoData, client, perpMarket } = await getMangoData(mangoAccount, market, priorityFee)
    console.log("MANGO DATA", mangoData)

    let addSide: "BUY" | "SELL" = side
    let removeSide: "BUY" | "SELL" = side === "BUY" ? "SELL" : "BUY"

    let removeExistingOrders: Array<any> = []
    let addExistingOrders: Array<any> = []

    // should add more
    let removeMangoOrders: Array<ExchangeOrder> = []
    let addMangoOrders: Array<ExchangeOrder> = []
    if (Math.abs(mangoData.amount) < maxAmount && shouldAdd) {
        const amount = mangoData.amount === 0 ? initialAmount : roundUp(Math.min(additionalAmount, maxAmount - Math.abs(mangoData.amount)), tickSize)
        const existingOrder = mangoData.orders.find(x => x.side === addSide && x.amount === amount)
        if (existingOrder) {
            addExistingOrders.push(existingOrder)
        }

        if (amount > 0) {
            const offset = mangoData.oraclePrice * addOffset / 100
            addMangoOrders.push({
                price: mangoData.oraclePrice + (addSide === "BUY" ? -offset : offset),
                amount: Math.abs(amount),
                offset,
                side: addSide,
                type: "IOC"
            })
        }

    }

    // get exit order
    if (Math.abs(mangoData.amount) > 0) {
        const profitPercent = mangoData.amount < 0 ? -1 * (removeOffset / 100) : (removeOffset / 100)

        const steps = [
            {
                size: 0.01,
                offset: 0.5
            },
            {
                size: 0.01,
                offset: 0.60
            }, {
                size: 0.01,
                offset: 0.70
            }, {
                size: 0.01,
                offset: 0.80
            },
            {
                size: 0.01,
                offset: 1
            }, {
                size: 1,
                offset: 2
            }, {
                size: 1,
                offset: 3
            }, {
                size: 1,
                offset: 4
            }]
        // get sum of steps.size
        let stepSum = 0
        for (const step of steps) {
            stepSum += step.size
        }

        let orderPrice = mangoData.breakEven * (1 + profitPercent) * (removeSide === "BUY" ? -1 : 1)
        orderPrice = roundUp(orderPrice, tickSize)
        let amount = Math.abs(mangoData.amount) - stepSum
        amount = Math.min(amount, maxBulkTrade)
        let offset = (removeSide === "BUY" ? mangoData.oraclePrice - orderPrice : orderPrice - mangoData.oraclePrice)
        offset = Math.max(offset, minOffset)
        let existingOrder = mangoData.orders.find(x => x.side === removeSide && x.amount === amount)
        if (existingOrder) {
            removeExistingOrders.push(existingOrder)
        }

        removeMangoOrders.push({
            price: orderPrice,
            amount,
            offset,
            side: removeSide,
            type: "ORACLE"
        })


        for (const step of steps) {
            existingOrder = mangoData.orders.find(x => x.side === removeSide && x.amount === step.size)
            if (existingOrder) {
                removeExistingOrders.push(existingOrder)
            }

            removeMangoOrders.push({
                price: orderPrice,
                amount: step.size,
                offset: step.offset,
                side: removeSide,
                type: "ORACLE"
            })

        }
    }

    if (removeMangoOrders.length != removeExistingOrders.length || addMangoOrders.length != addExistingOrders.length || clearOldOrders) {
        console.log(market + ' New Mango Orders', removeMangoOrders)


        // execute trades
        const limit = 10
        let tradeInstructions: Array<any> = []


        if (clearOldOrders) {
            tradeInstructions.push(await client.client.perpCancelAllOrdersIx(
                client.group, client.mangoAccount!,
                perpMarket.perpMarketIndex, limit))
        }


        let newOrders = [...addMangoOrders]
        if (removeMangoOrders.length !== removeExistingOrders.length) {
            if (!clearOldOrders) {
                tradeInstructions.push(await client.client.perpCancelAllOrdersIx(
                    client.group, client.mangoAccount!,
                    perpMarket.perpMarketIndex, limit))
            }
            newOrders.push(...removeMangoOrders)
        }

        for (const order of newOrders) {
            if (order.type === "ORACLE") {
                let expiryTimestamp: number | undefined = undefined
                let clientOrderId = new Date().getTime()
                tradeInstructions.push(await client.client.perpPlaceOrderPeggedV2Ix(
                    client.group,
                    client.mangoAccount!,
                    perpMarket.perpMarketIndex,
                    order.side === "BUY" ? PerpOrderSide.bid : PerpOrderSide.ask, //side
                    order.offset || 0,// price Offset
                    toFixedFloor(order.amount),// size
                    undefined, //piglimit
                    undefined,//maxQuoteQuantity,
                    clientOrderId,//clientOrderId,
                    PerpOrderType.limit,
                    PerpSelfTradeBehavior.cancelProvide,
                    false, //reduceOnly
                    expiryTimestamp, //expiryTimestamp,
                    undefined // limit
                ))
            }
            if (order.type === "LIMIT" || order.type === "IOC") {
                let expiryTimestamp: number | undefined = Date.now() / 1000 + 30
                let clientOrderId = new Date().getTime()
                console.log(`mangoData.oraclePrice ${mangoData.oraclePrice} 
                    Offset= ${mangoData.oraclePrice - order.price}
                    Amount= ${order.amount}
                    Side= ${order.side}
                    Price= ${order.price}
                    `)
                const orderType: PerpOrderType = order.type === "LIMIT" ? PerpOrderType.limit : PerpOrderType.immediateOrCancel
                tradeInstructions.push(await client.client.perpPlaceOrderV2Ix(
                    client.group,
                    client.mangoAccount!,
                    perpMarket.perpMarketIndex,
                    order.side === "BUY" ? PerpOrderSide.bid : PerpOrderSide.ask, //side
                    order.price,// price Offset
                    toFixedFloor(order.amount),// size
                    undefined,//maxQuoteQuantity,
                    clientOrderId,//clientOrderId,
                    orderType,
                    PerpSelfTradeBehavior.cancelProvide,
                    false, //reduceOnly
                    expiryTimestamp, //expiryTimestamp,
                    undefined // limit
                ))
            }
        }
        console.log(tradeInstructions)

        if (shouldExecute && tradeInstructions.length > 0) {
            console.log('Transaction Begin', tradeInstructions.length);
            const result = await client.client.sendAndConfirmTransactionForGroup(
                client.group,
                tradeInstructions,
                { alts: [...client.group.addressLookupTablesList] },
            )
            console.log('Transaction Complete', result);
        }
    }
    console.log("DONE")
}

(async () => {
    const priorityFee = 55_000
    if (priorityFee > 100_000) {
        throw new Error("Priority fee must be less than 100,000")
    }
    // SOL
    await swingMangoTrade({
        mangoAccount: "SIX",
        market: "SOL",
        priorityFee,
        initialAmount: 5,
        additionalAmount: 0,
        maxAmount: 551,
        addOffset: -0.9,
        // addOffset: -0.0,
        removeOffset: 1,
        tickSize: 2,
        shouldExecute: true,
        clearOldOrders: false,
        side: "BUY",
        minOffset: 8,
        maxBulkTrade: 10,
        shouldAdd: true
    })

})();
