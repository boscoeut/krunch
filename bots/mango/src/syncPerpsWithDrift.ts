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
    Wallet,
    PostOnlyParams
} from "@drift-labs/sdk";
import {
    Connection,
    PublicKey
} from '@solana/web3.js';
import { HELIUS_ALEX_CONNECTION_URL } from "./constants";
import { authorize, getDiffs } from './googleUtils';
import { getUser, sleep } from "./mangoUtils";

(async () => {
    const { google } = require('googleapis');

    const googleClient: any = await authorize();
    const googleSheets = google.sheets({ version: 'v4', auth: googleClient });
    while (true) {
        try {
            console.log("Sync Perps With DRIFT")
            // // update mango data
            // await getMangoData(true, false, false, false)
            // await checkDrift("PRIVATE3");

            const diffs = await getDiffs(googleSheets);
            console.log(diffs)
            const [sol, eth, btc, render] = diffs.values.map((x: any) => x[0] * 1)
            console.log(sol, eth, btc, render)

            const cancels: any = []
            const tradesToProcess: any = []

            let trades: any = []
            // if (Math.abs(sol) > 0.1) {
            //     trades.push({
            //         market: "SOL",
            //         amount: sol,
            //         side: sol > 0 ? "buy" : "sell"
            //     })
            // }
            // if (Math.abs(eth) > 0.005) {
            //     trades.push({
            //         market: "ETH",
            //         amount: eth,
            //         side: eth > 0 ? "buy" : "sell"
            //     })
            // }
            // if (Math.abs(btc) > 0.0003) {
            //     trades.push({
            //         market: "BTC",
            //         amount: btc,
            //         side: btc > 0 ? "buy" : "sell"
            //     })
            // }
            if (Math.abs(render) > 2) {
                trades.push({
                    market: "RNDR",
                    amount: render,
                    side: render < 0 ? "buy" : "sell"
                })
            }

            if (trades.length > 0) {
                // Set up the Drift Client
                const env = 'mainnet-beta';
                const URL = HELIUS_ALEX_CONNECTION_URL
                const account = "MAIN"
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

                for (const trade of trades) {
                    const symbol = trade.market
                    const marketInfo = PerpMarkets[env].find(
                        (market: any) => market.baseAssetSymbol === symbol
                    );
                    const marketIndex = marketInfo!.marketIndex;
                    const ordacleData = driftClient.getOracleDataForPerpMarket(marketIndex);
                    console.log(ordacleData)

                    const perpMarketAccount = driftClient.getPerpMarketAccount(marketIndex);
                    const activePerpPositions = user.getActivePerpPositions()

                    const userPosition = activePerpPositions.find(x => x.marketIndex === marketIndex)

                    const orders = user.getOpenOrders();

                    console.log(orders)
                    const priceOffset = PRICE_PRECISION.div(new BN(2));
                    // const baseAssetAmount = new BN(Math.abs(trade.amount)).mul(BASE_PRECISION)
                    const baseAssetAmount = new BN(2).mul(BASE_PRECISION)
                    const direction = trade.side === "buy" ? PositionDirection.LONG : PositionDirection.SHORT
                    const newPrice = new BN(10).mul(PRICE_PRECISION)
                    const orderParams2 = {
                        orderType: OrderType.ORACLE,
                        marketIndex,
                        baseAssetAmount,
                        marketType: MarketType.PERP,
                        oraclePriceOffset: priceOffset.toNumber(),
                        reduceOnly: true,
                        direction
                    }

                    const orderParams = {
                        orderType: OrderType.LIMIT,
                        marketIndex: marketIndex,
                        marketType: MarketType.PERP,
                        postOnly: PostOnlyParams.MUST_POST_ONLY,
                        direction,
                        baseAssetAmount,
                        price: newPrice
                    }
                    cancels.push(driftClient.cancelOrders(MarketType.PERP, marketIndex, PositionDirection.LONG))
                    tradesToProcess.push(orderParams)
                }
                // await Promise.all(cancels)
                await driftClient.placeOrders(tradesToProcess)
            }
            
            console.log("Done")
        } catch (error) {
            console.log(error);
        } finally {
            await sleep(0.2 * 1000 * 60)
        }
    }
})();
