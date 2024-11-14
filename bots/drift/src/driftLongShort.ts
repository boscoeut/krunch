import {
    AMM_RESERVE_PRECISION,
    BN,
    DriftClient,
    FUNDING_RATE_BUFFER_PRECISION,
    PRICE_PRECISION,
    PerpMarketAccount,
    PerpPosition,
    PublicKey,
    SpotBalanceType,
    Wallet,
    ZERO,
    decodeName
} from "@drift-labs/sdk";
import { Connection, Keypair } from "@solana/web3.js";
import pkg from 'bs58';
import fs from 'fs';
import { CONNECTION_URL, SPREADSHEET_ID } from '../../mango/src/constants';
import { authorize } from '../../mango/src/googleUtils';
import { checkBalances } from "../../mango/src/getWalletBalances";
const { decode } = pkg;

const DRIFT_ENV = 'mainnet-beta';


function getKeyPair(file: string) {
    const base64String = fs.readFileSync(`./secrets/${file}.txt`, 'utf-8');
    const privateKeyUint8Array = decode(base64String);
    return Keypair.fromSecretKey(privateKeyUint8Array);
}

const PRICE_NUM_DECIMALS = 6;
const PRICE_DECIMALS = 10 ** PRICE_NUM_DECIMALS;
const AMOUNT_DECIMALS = 10 ** 9;

const convertPrice = (price: number) => {
    return price / PRICE_DECIMALS;
}

const convertAmount = (price: number) => {
    return price / AMOUNT_DECIMALS;
}


function formatUsdc(usdc: any) {
    return usdc / 10 ** 6
}

async function getDriftClient(connection: Connection, wallet: string) {
    console.time('New Drift Client');
    const keyPair=getKeyPair(wallet)
    const driftWallet = new Wallet(keyPair)
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
        driftClient, user, publicKey: keyPair.publicKey
    }
}

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


export function calculateFeesAndFundingPnl(
    market: PerpMarketAccount,
    perpPosition: PerpPosition,
    includeUnsettled = true
): BN {
    if (!perpPosition) return new BN(0)
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

interface SpotPosition {
    name: string,
    balance: number,
    account: string,
    price: number,
    value: number,
    diff: number
}

interface PerpRecord {
    name: string,
    breakEvenPrice: number,
    entryPrice: number,
    oraclePrice: number,
    pnl: number,
    baseAsset: number,
    value: number,
    feesAndFunding: number,
    account: string
}

async function getTotals() {
    const connection = new Connection(CONNECTION_URL);
    const { driftClient, user: driftUser,publicKey } = await getDriftClient(connection, 'driftWallet')

    const userAccounts = await driftClient.getUserAccountsForAuthority(publicKey)
    let perpRecords: Array<PerpRecord> = []
    let spotPositions: Array<SpotPosition> = []

    // perp markets
    for (const userAccount of userAccounts) {
        const perpPositions = driftUser.getActivePerpPositionsForUserAccount(userAccount)
        const perpMarkets = driftClient.getPerpMarketAccounts()
        const accountName = decodeName(userAccount.name)

        for (const perpPosition of perpPositions) {
            const marketAccount = perpMarkets.find(m => m.marketIndex === perpPosition.marketIndex)
            const feesAndFunding = calculateFeesAndFundingPnl(marketAccount!, perpPosition, false)
            const marketName = decodeName(marketAccount?.name!)

            const baseAssetAmount = perpPosition?.baseAssetAmount?.toNumber() || 0
            let baseAsset = convertAmount(baseAssetAmount);
            const quoteBreakEvenAmount = perpPosition?.quoteBreakEvenAmount?.toNumber() || 0
            const quoteEntryAmount = perpPosition?.quoteEntryAmount?.toNumber() || 0

            let breakEvenPrice = convertPrice(AMOUNT_DECIMALS * Math.abs(quoteBreakEvenAmount / baseAssetAmount));
            let entryPrice = convertPrice(AMOUNT_DECIMALS * Math.abs(quoteEntryAmount / baseAssetAmount || 0));
            const baseAmount = entryPrice * baseAsset
            const oraclePrice = marketAccount!.amm.lastOracleNormalisedPrice;
            const oracle = oraclePrice.toNumber() / PRICE_PRECISION.toNumber();
            let currentAmount = oracle * baseAsset

            let pnl = currentAmount - baseAmount
            if (baseAsset < 0) {
                pnl = baseAmount * -1 + currentAmount
            }
            const fundingRate24H = marketAccount!.amm.lastFundingRate.toNumber()
            const fundingRatePercent = fundingRate24H * 24 * 365 / 10 ** 7
            console.log(`-- ${marketName} --`);
            console.log('*** Break Even Price:', breakEvenPrice);
            console.log('*** Entry Price:', entryPrice);
            console.log('*** Oracle Price:', oracle);
            console.log('*** Pnl:', pnl);
            console.log('*** Base Asset:', baseAsset);
            console.log('*** value:', currentAmount);
            console.log('*** fees and funding:', feesAndFunding.toNumber() / 10 ** 6);
            console.log('*** fundingRatePercent:', fundingRatePercent);
            perpRecords.push(
                {
                    name: marketName,
                    breakEvenPrice,
                    entryPrice,
                    oraclePrice: oracle,
                    pnl,
                    baseAsset,
                    value: currentAmount,
                    feesAndFunding: feesAndFunding.toNumber() / 10 ** 6,
                    account: accountName
                })
        }

        // spot markets
        const spotMarketAccounts = driftClient.getSpotMarketAccounts()
        const balances = driftUser.getActiveSpotPositionsForUserAccount(userAccount)
        for (const spotMarket of balances) {
            let driftTokenValue = spotMarket.scaledBalance.toNumber() / 10 ** 9;
            if (spotMarket.balanceType === SpotBalanceType.DEPOSIT) {
                driftTokenValue * -1
            }
            const account = spotMarketAccounts.find(a => a.marketIndex === spotMarket.marketIndex)
            const accountName = decodeName(userAccount?.name!)
            const name = decodeName(account?.name!)
            console.log(`${name}:  Asset=${driftTokenValue}`)

            spotPositions.push(
                {
                    name,
                    balance: driftTokenValue,
                    account: accountName,
                    price: 0,
                    value: 0,
                    diff: 0
                }
            )
        }
    }

    for (const spotPosition of spotPositions) {
        const perp = perpRecords.find(p => (p.name.replace("-PERP", "") === spotPosition.name) || (p.name === "ETH-PERP" && spotPosition.name === "wETH"))
        if (perp) {
            spotPosition.price = perp.oraclePrice
            spotPosition.value = perp.oraclePrice * spotPosition.balance
            spotPosition.diff = spotPosition.balance + perp.baseAsset
        } else {
            spotPosition.price = 1
            spotPosition.value = spotPosition.balance
        }
    }
    return {
        perpRecords,
        spotPositions
    }

}

async function updateGoogleSheet(perpRecords: Array<PerpRecord>, spotPositions: Array<SpotPosition>) {
    const { google } = require('googleapis');
    const googleClient: any = await authorize();
    const googleSheets = google.sheets({ version: 'v4', auth: googleClient });
    const sheetName = "DriftValue"
    await googleSheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
            valueInputOption: 'RAW',
            data: [{
                range: `${sheetName}!A4:I${perpRecords.length + 3}`,
                values: perpRecords.map(p => {
                    return [p.account, p.name, p.entryPrice, p.breakEvenPrice, p.oraclePrice, p.pnl, p.baseAsset, p.value, p.feesAndFunding]
                })
            },
            {
                range: `${sheetName}!N4:S${spotPositions.length + 3}`,
                values: spotPositions.map(p => {
                    return [p.account, p.name, p.balance, p.price, p.value, p.diff]
                })
            }]
        }
    });

}

(async () => {
    console.log('RUNNING DRIFT LONG SHORT')
    const timeout = 60 * 1000 * 1
    let count = 0;
    const SHOULD_RUN = false

    do {
        const { perpRecords, spotPositions } = await getTotals()
        await updateGoogleSheet(perpRecords, spotPositions)
        console.log(`DRIFT LONG SHORT (Count=${count}) >> Sleeping for ${timeout / 1000} seconds. ${new Date().toLocaleTimeString()}`)
        await new Promise(resolve => setTimeout(resolve, timeout));
    } while (SHOULD_RUN)

    await checkBalances('../mango/secrets/accounts.json')
})();
