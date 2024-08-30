import {
    BulkAccountLoader,
    DRIFT_PROGRAM_ID,
    DriftClient,
    FUNDING_RATE_BUFFER_PRECISION,
    PRICE_PRECISION,
    PerpMarkets,
    SpotMarkets,
    User,
    Wallet,
    calculateAllEstimatedFundingRate,
    calculateBorrowRate,
    calculateDepositRate,
    convertToNumber
} from "@drift-labs/sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import { HELIUS_WALLET_5 } from './constants';
import { getUser } from './mangoUtils';

interface AnalyzeProps {
    client: any,
    transactionInstructions: Array<any>
}

function isDeposit(balanceType: any) {
    return !!balanceType?.deposit
}

function formatUsdc(usdc: any) {
    return usdc / 10 ** 6
}

function formatPerp(usdc: any) {
    return usdc / 10 ** 9
}

async function getPerpInfo(env: "mainnet-beta" | "devnet", symbol: string, driftClient: DriftClient, user: User) {
    console.log('PerpMarkets[env', PerpMarkets[env])
    const marketInfo = PerpMarkets[env].find(
        (market: any) => market.baseAssetSymbol === symbol
    );
    const marketIndex = marketInfo!.marketIndex;
    const ordacleData = driftClient.getOracleDataForPerpMarket(marketIndex);
    console.log(ordacleData)

    const perpMarketAccount = driftClient.getPerpMarketAccount(marketIndex);
    const fundingRate = perpMarketAccount!.amm.lastFundingRate.toNumber()
    const fundingPeriod = perpMarketAccount!.amm.fundingPeriod.toNumber()
    const fundingRate24H = perpMarketAccount!.amm.last24HAvgFundingRate.toNumber()
    const activePerpPositions = user.getActivePerpPositions()

    const userPosition = activePerpPositions.find(x => x.marketIndex === marketIndex)
    const perpPosition = formatPerp(userPosition?.baseAssetAmount) || 0
    const CONVERSION_SCALE = FUNDING_RATE_BUFFER_PRECISION.mul(PRICE_PRECISION);
    const lastFundingRate = convertToNumber(
        perpMarketAccount!.amm.last24HAvgFundingRate,
        CONVERSION_SCALE
    );
    const ammAccountState = perpMarketAccount!.amm;
    const priceSpread =
        ammAccountState.lastMarkPriceTwap.toNumber() /
        PRICE_PRECISION.toNumber() -
        ammAccountState.historicalOracleData.lastOraclePriceTwap.toNumber() /
        PRICE_PRECISION.toNumber();
    const peroidicity = perpMarketAccount!.amm.fundingPeriod;
    const frontEndFundingCalc =
        priceSpread / ((24 * 3600) / Math.max(1, peroidicity.toNumber()));
    console.log('PERP INFO:' + symbol);
    console.log('fundingRate:', fundingRate);
    console.log('fundingPeriod:', fundingPeriod);
    console.log('fundingRate24H:', fundingRate24H);
    console.log('perpPosition:', perpPosition)
    console.log('frontEndFundingCalc:', frontEndFundingCalc);
    console.log('last funding rate:', lastFundingRate);
    console.log('PRICE_PRECISION:', PRICE_PRECISION.toNumber());
    console.log('perpMarketAccount!.amm.last24HAvgFundingRate:', perpMarketAccount!.amm.last24HAvgFundingRate.toNumber());
    const oraclePriceData = driftClient.getOracleDataForPerpMarket(marketIndex);
    const allFundingRateData = await calculateAllEstimatedFundingRate(perpMarketAccount!, oraclePriceData)
    console.log('allFundingRateData:', allFundingRateData);
    return {
        fundingRate,
        perpPosition,
        fundingRate24H,
        fundingPeriod,
        lastFundingRate: allFundingRateData[4].toNumber()
    }
}

export async function checkDrift(account: string) {
    try {
        const env = 'mainnet-beta';
        const URL = HELIUS_WALLET_5
        // const URL = CLUSTER_URL
        const key = account.toLowerCase() + "Key";
        const wallet = new Wallet(getUser("./secrets/" + key + ".json"))
        const connection = new Connection(URL);

        // Set up the Drift Client
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

        let cumulativePerpFunding=0
        if (userAccount && userAccount.cumulativePerpFunding){
            cumulativePerpFunding = userAccount?.cumulativePerpFunding?.toNumber() / 10 ** 6
        }
        let cumulativeSpotFees = 0
        if (userAccount && userAccount.cumulativeSpotFees){
            cumulativeSpotFees = userAccount?.cumulativeSpotFees?.toNumber() / 10 ** 6
        }
       
        console.log('DRIFT Account:', account);
        const pnl = user.getUnrealizedPNL(true);
        console.log('Unrealized PNL:', formatUsdc(pnl));

        const usdValue = user.getNetUsdValue();
        console.log('Net USD Value:', formatUsdc(usdValue));
        const totalValue = user.getTotalAssetValue();
        console.log('Total Value:', formatUsdc(totalValue));

        const health = user.getHealth()
        console.log('Health:', health)
        const funding = user.getUnrealizedFundingPNL()
        console.log('Funding:', formatUsdc(funding))

        const freeCollateral = user.getFreeCollateral();
        console.log('freeCollateral:', formatUsdc(freeCollateral))

        const totalAllTimePnl = user.getTotalAllTimePnl()
        console.log('Total All Time PNL:', formatUsdc(totalAllTimePnl))
        // const perpPositionValue = user.getTotalPerpPositionValue()
        // console.log('Total Perp Position Value:', formatUsdc(perpPositionValue))

        let spotPositions = user.getUserAccount().spotPositions
        console.log('Spot Positions:', spotPositions)

        const driftPerp = await getPerpInfo(env, 'DRIFT', driftClient, user)
        const solPerp = await getPerpInfo(env, 'SOL', driftClient, user)
        const btcPerp = await getPerpInfo(env, 'BTC', driftClient, user)
        const ethPerp = await getPerpInfo(env, 'ETH', driftClient, user)
        const jupPerp = await getPerpInfo(env, 'JUP', driftClient, user)
        const wPerp = await getPerpInfo(env, 'W', driftClient, user)
        const renderPerp = await getPerpInfo(env, 'RNDR', driftClient, user)

        console.log(SpotMarkets[env])
        const marketInfo = SpotMarkets[env].find(
            (market: any) => market.symbol === "USDC"
        );
        const marketIndex = marketInfo!.marketIndex;
        const usdcSpotMarket = driftClient.getSpotMarketAccount(marketIndex);
        const usdcDepositRate = calculateDepositRate(usdcSpotMarket!)
        const usdcBorrowRate = calculateBorrowRate(usdcSpotMarket!)
        console.log('USDC Deposit Rate:', usdcDepositRate.toNumber());
        console.log('USDC Borrow Rate:', usdcBorrowRate.toNumber());

        const result = {
            account,
            pnl: formatUsdc(pnl),
            usdValue: formatUsdc(usdValue),
            totalValue: formatUsdc(totalValue),
            health: health,
            funding: formatUsdc(funding),
            freeCollateral: formatUsdc(freeCollateral),
            totalAllTimePnl: formatUsdc(totalAllTimePnl),
            // perpPositionValue: formatUsdc(perpPositionValue),
            solPerp: solPerp.perpPosition,
            ethPerp: ethPerp.perpPosition,
            jupPerp: jupPerp.perpPosition,
            wPerp: wPerp.perpPosition,
            usdc: formatPerp(spotPositions.find(x => x.marketIndex === 0)?.scaledBalance) * (isDeposit(spotPositions.find(x => x.marketIndex === 0)?.balanceType) ? 1 : -1) || 0,
            w: formatPerp(spotPositions.find(x => x.marketIndex === 13)?.scaledBalance) * (isDeposit(spotPositions.find(x => x.marketIndex === 13)?.balanceType) ? 1 : -1) || 0,
            jup: formatPerp(spotPositions.find(x => x.marketIndex === 11)?.scaledBalance) * (isDeposit(spotPositions.find(x => x.marketIndex === 11)?.balanceType) ? 1 : -1) || 0,
            sol: formatPerp(spotPositions.find(x => x.marketIndex === 1)?.scaledBalance) * (isDeposit(spotPositions.find(x => x.marketIndex === 1)?.balanceType) ? 1 : -1) || 0,
            solFundingRate: solPerp.lastFundingRate,
            ethFundingRate: ethPerp.lastFundingRate,
            jupFundingRate: jupPerp.lastFundingRate,
            wFundingRate: wPerp.lastFundingRate,
            cumulativePerpFunding,
            cumulativeSpotFees,
            renderPerp: renderPerp.perpPosition,
            renderFundingRate: renderPerp.lastFundingRate,
            btcPerp: btcPerp.perpPosition,
            btcFundingRate: btcPerp.lastFundingRate,
            usdcDepositRate: usdcDepositRate.toNumber(),
            usdcBorrowRate: usdcBorrowRate.toNumber(),
            driftFundingRate: driftPerp.lastFundingRate,
            driftPerp: driftPerp.perpPosition,
            drift: formatPerp(spotPositions.find(x => x.marketIndex === 15)?.scaledBalance) * (isDeposit(spotPositions.find(x => x.marketIndex === 15)?.balanceType) ? 1 : -1) || 0,
        }
        console.log(result)
        return result
    } catch (x) {
        console.error(x);
        return null;
    }
}



(async () => {
    try {
        await checkDrift("DRIFT");

    } catch (error) {
        // Handle errors here
        console.error(`Error in main loop`, error)
    }
})();
