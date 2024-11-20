import {
    toUiDecimals
} from '@blockworks-foundation/mango-v4';
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
    decodeName,
    User
} from "@drift-labs/sdk";
import { TokenInstructions } from '@project-serum/serum';
import { Connection, Keypair } from "@solana/web3.js";
import pkg from 'bs58';
import fs from 'fs';
import { CONNECTION_URL, SPREADSHEET_ID } from '../../mango/src/constants';
import { checkBalances } from "../../mango/src/getWalletBalances";
import { authorize } from '../../mango/src/googleUtils';

const { decode } = pkg;
export class TokenAccount {
    publicKey!: PublicKey
    mint!: PublicKey
    owner!: PublicKey
    amount!: number
    decimals!: number
    uiAmount: number

    constructor(
        publicKey: PublicKey,
        decoded: {
            mint: PublicKey
            owner: PublicKey
            amount: number
            decimals: number
            uiAmount: number
        },
    ) {
        this.publicKey = publicKey
        this.uiAmount = 0
        Object.assign(this, decoded)
    }
}
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

async function getDriftClient(connection: Connection, wallet: string, subAccountId?: number) {
    console.time('New Drift Client');
    const keyPair = getKeyPair(wallet)
    const driftWallet = new Wallet(keyPair)
    const driftClient = new DriftClient({
        connection,
        wallet: driftWallet,
        env: DRIFT_ENV,
        activeSubAccountId: subAccountId,
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
    account: string,
    fundingRatePercent: number
}
export async function getTokenAccountsByOwnerWithWrappedSol(
    connection: Connection,
    owner: PublicKey,
): Promise<TokenAccount[]> {
    const solReq = connection.getAccountInfo(owner)
    const tokenReq = connection.getParsedTokenAccountsByOwner(owner, {
        programId: TokenInstructions.TOKEN_PROGRAM_ID,
    })

    // fetch data
    const [solResp, tokenResp] = await Promise.all([solReq, tokenReq])

    // parse token accounts
    const tokenAccounts = tokenResp.value.map((t) => {
        return {
            publicKey: t.pubkey,
            mint: t.account.data.parsed.info.mint,
            owner: t.account.data.parsed.info.owner,
            amount: t.account.data.parsed.info.tokenAmount.amount,
            uiAmount: t.account.data.parsed.info.tokenAmount.uiAmount,
            decimals: t.account.data.parsed.info.tokenAmount.decimals,
        }
    })
    // create fake wrapped sol account to reflect sol balances in user's wallet
    const lamports = solResp?.lamports || 0
    const solAccount = new TokenAccount(owner, {
        mint: TokenInstructions.WRAPPED_SOL_MINT,
        owner,
        amount: lamports,
        uiAmount: toUiDecimals(lamports, 9),
        decimals: 9,
    })

    // prepend SOL account to beginning of list
    return [solAccount].concat(tokenAccounts)
}

async function withdraw(connection: Connection, publicKey: PublicKey, driftClient: DriftClient) {
    const tokens = await getTokenAccountsByOwnerWithWrappedSol(connection, publicKey)
    const CLOUD_MINT = "CLoUDKc4Ane7HeQcPpE3YHnznRxhMimJ4MyaUqyHFzAu"
    const cloudToken = tokens.find((t) => t.mint.toString() === CLOUD_MINT)

    await driftClient.withdraw(new BN(1), 21, cloudToken?.publicKey!, true)
}

async function getTotals() {
    const connection = new Connection(CONNECTION_URL);
    const { driftClient, publicKey } = await getDriftClient(connection, 'driftWallet')

    const userAccounts = await driftClient.getUserAccountsForAuthority(publicKey)
    let perpRecords: Array<PerpRecord> = []
    let spotPositions: Array<SpotPosition> = []
    let driftUser: User = driftClient.getUser()

    let mainHealth = 0
    let mainFunding = 0
    let mainValue = 0

    let renderHealth = 0
    let renderFunding = 0
    let renderValue = 0

    // perp markets
    let subAccountId = 0;
    for (const userAccount of userAccounts) {
        driftClient.switchActiveUser(subAccountId)
        driftUser = driftClient.getUser()
        subAccountId++
        const perpPositions = driftUser.getActivePerpPositions()
        const perpMarkets = driftClient.getPerpMarketAccounts()
        const accountName = decodeName(userAccount.name)

        const funding = driftUser.getUnrealizedFundingPNL()
        const unrealizedFunding = formatUsdc(funding)
        const cumulativePerpFunding = userAccount?.cumulativePerpFunding?.toNumber() ?? 0
        const formattedFunding = formatUsdc(cumulativePerpFunding)

        const driftFunding = unrealizedFunding + formattedFunding
        const driftValue = formatUsdc(driftUser.getNetUsdValue())
        const driftHealth = driftUser.getHealth()

        if (accountName === "Main Account") {
            mainHealth = driftHealth
            mainFunding = driftFunding
            mainValue = driftValue
        } else {
            renderHealth = driftHealth
            renderFunding = driftFunding
            renderValue = driftValue
        }

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
            const tickSize = marketAccount!.amm.orderTickSize.toNumber()
            const orderStepSize = marketAccount!.amm.orderStepSize.toNumber()
            // const fundingRatePercent = fundingRate24H * 24 * 365 / orderStepSize

            const fundingRatePercent = marketAccount!.amm.last24HAvgFundingRate.toNumber() / tickSize / 100
            console.log(`-- ${marketName} --`);
            console.log('*** Break Even Price:', breakEvenPrice);
            console.log('*** Entry Price:', entryPrice);
            console.log('*** Oracle Price:', oracle);
            console.log('*** Pnl:', pnl);
            console.log('*** Base Asset:', baseAsset);
            console.log('*** value:', currentAmount);
            console.log('*** fees and funding:', feesAndFunding.toNumber() / 10 ** 6);
            console.log('*** fundingRatePercent:', fundingRatePercent);

            const unrealizedFunding = driftUser.getUnrealizedFundingPNL()
            const funding = formatUsdc(userAccount.cumulativePerpFunding.toNumber())
            console.log(' unrealizedFunding ', formatUsdc(unrealizedFunding.toNumber()))
            console.log(' funding ', funding)
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
                    account: accountName,
                    fundingRatePercent
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
        spotPositions,
        mainHealth,
        mainFunding,
        mainValue,
        renderHealth,
        renderFunding,
        renderValue
    }
}

async function updateGoogleSheet(perpRecords: Array<PerpRecord>,
    spotPositions: Array<SpotPosition>,
    mainFunding: number, mainHealth: number, mainValue: number,
    renderFunding: number, renderHealth: number, renderValue: number) {
    const { google } = require('googleapis');
    const googleClient: any = await authorize();
    const googleSheets = google.sheets({ version: 'v4', auth: googleClient });
    const sheetName = "DriftValue"

    // Sort perpRecords and spotPositions by name
    const sortedPerpRecords = [...perpRecords].sort((a, b) => a.name.localeCompare(b.name));
    const sortedSpotPositions = [...spotPositions].sort((a, b) => a.name.localeCompare(b.name));

    await googleSheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
            valueInputOption: 'RAW',
            data: [{
                range: `${sheetName}!A4:J${perpRecords.length + 3}`,
                values: sortedPerpRecords.map(p => {
                    return [p.account, p.name, p.fundingRatePercent, p.entryPrice, p.breakEvenPrice, p.oraclePrice, p.pnl, p.baseAsset, p.value, p.feesAndFunding]
                })
            },
            {
                range: `${sheetName}!N4:S${spotPositions.length + 3}`,
                values: sortedSpotPositions.map(p => {
                    return [p.account, p.name, p.balance, p.price, p.value, p.diff]
                })
            },
            {
                range: `${sheetName}!V4:V9`,
                values: [[mainFunding], [mainHealth], [mainValue], [renderFunding], [renderHealth], [renderValue]]
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
        const { perpRecords, spotPositions, mainHealth, mainFunding, mainValue, renderHealth, renderFunding, renderValue } = await getTotals()
        await updateGoogleSheet(perpRecords, spotPositions, mainFunding, mainHealth, mainValue, renderFunding, renderHealth, renderValue)
        console.log(`DRIFT LONG SHORT (Count=${count}) >> Sleeping for ${timeout / 1000} seconds. ${new Date().toLocaleTimeString()}`)
        await new Promise(resolve => setTimeout(resolve, timeout));
    } while (SHOULD_RUN)

    await checkBalances('../mango/secrets/accounts.json')
})();
