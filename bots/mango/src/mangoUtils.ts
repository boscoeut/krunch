import * as bip39 from 'bip39';

import {
    HealthType,
    MANGO_V4_ID,
    MangoAccount,
    MangoClient,
    PerpMarket,
    PerpOrder,
    PerpOrderSide,
    toUiDecimals,
    toUiDecimalsForQuote
} from '@blockworks-foundation/mango-v4';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { TokenInstructions } from '@project-serum/serum';
import {
    Connection, Keypair, PublicKey
} from '@solana/web3.js';
import axios from 'axios';
import * as bs58 from 'bs58';
import fs from 'fs';
import { groupBy, mapValues, maxBy, sampleSize } from 'lodash';
import {
    CLUSTER,
    CLUSTER_URL,
    COMMITTMENT,
    FEE_CONNECTION_URL,
    FUNDING_RATE_API,
    GET_BLOCK_CONNECTION_URL,
    GROUP_ADDRESS_LOOKUP_TABLE_KEY,
    GROUP_PK,
    JUP_PRICE_URL,
    LAVA_CONNECTION_URL,
    LITE_RPC_URL,
    MANGO_DATA_API_URL,
    MAX_PRIORITY_FEE_KEYS,
    SOL_GROUP_PK,
    SOL_MINT,
    SOL_RESERVE,
    USDC_MINT,
    USE_PRIORITY_FEE,
    W_MINT
} from './constants';
import * as db from './db';
import { DB_KEYS } from './db';
import {
    AccountDefinition,
    AccountDetail,
    Client,
    FundingRates,
    MarketKey,
    TokenAccount,
    TotalAccountFundingItem,
    TotalInterestDataItem
} from './types';

export function createKeypair() {
    let mnemonic = bip39.generateMnemonic(256);
    console.log(mnemonic);
    console.log(mnemonic.replace(/ /g, ''));
    const seed = bip39.mnemonicToSeedSync(mnemonic).slice(0, 32);
    const keypair = Keypair.fromSeed(seed);
    const publicKey = keypair.publicKey.toBase58()
    console.log(publicKey); // Print the public key
}

export const fetchInterestData = async (mangoAccountPk: string) => {
    try {
        const response = await axios.get(
            `${MANGO_DATA_API_URL}/stats/interest-account-total?mango-account=${mangoAccountPk}`,
        )
        const parsedResponse: Omit<TotalInterestDataItem, 'symbol'>[] | null = response.data
        if (parsedResponse) {
            const entries: [string, Omit<TotalInterestDataItem, 'symbol'>][] =
                Object.entries(parsedResponse).sort((a, b) => b[0].localeCompare(a[0]))

            const stats: TotalInterestDataItem[] = entries
                .map(([key, value]) => {
                    return { ...value, symbol: key }
                })
                .filter((x) => x)
            return stats
        } else return []
    } catch (e) {
        console.log('Failed to fetch account funding', e)
        return []
    }
}

export const fetchJupPrice = async () => {
    try {
        const url = JUP_PRICE_URL
        const response = await axios.get(url)
        console.log(response.data.data)
        const jupPrice = response.data.data.JUP.price
        const solPrice = response.data.data[SOL_MINT].price
        const btcPrice = response.data.data.TBTC.price
        const renderPrice = response.data.data.RENDER.price
        const ethPrice = response.data.data.ETH.price
        const driftPrice = response.data.data.DRIFT.price
        const wormholePrice = response.data.data[W_MINT].price
        return { jupPrice, solPrice, wormholePrice, ethPrice, btcPrice, driftPrice, renderPrice }
    } catch (e) {
        console.log('Failed to fetch jup price', e)
        return { jupPrice: 0, solPrice: 0, wormwholePrice: 0, ethPrice: 0, btcPrice: 0, renderPrice: 0 }
    }
}

export const getCurrentFundingRate = async () => {
    try {
        const url = `${MANGO_DATA_API_URL}/perp-historical-stats?mango-group=${SOL_GROUP_PK}`
        const response = await axios.get(url, { timeout: 10000 })
        const res: any = response.data
        const numHours = 1
        if (res) {
            const funding = res
                .filter((item: any) => item.perp_market === "SOL-PERP")
                .slice(0, numHours)
                .reduce((sum: number, item: any) => {
                    return (item.instantaneous_funding_rate + sum)
                }, 0)
            return funding / numHours
        } else return 0
    } catch (e: any) {
        console.log('Failed to fetch account funding', e.message)
        return 0
    }
}

export const fetchFundingData = async (mangoAccountPk: string) => {
    try {
        const url = `${MANGO_DATA_API_URL}/stats/funding-account-total?mango-account=${mangoAccountPk}`
        const response = await axios.get(url, { timeout: 10000 })
        const res: any = response.data
        if (res) {
            const entries: [string, Omit<TotalAccountFundingItem, 'market'>][] =
                Object.entries(res)

            const stats: TotalAccountFundingItem[] = entries
                .map(([key, value]) => {
                    return {
                        long_funding: value.long_funding * -1,
                        short_funding: value.short_funding * -1,
                        market: key,
                    }
                })
                .filter((x) => x)
            return stats
        } else return []
    } catch (e: any) {
        console.log('Failed to fetch account funding', e.message)
        return []
    }
}

export const getBidsAndAsks = async (perpMarket: PerpMarket, client: MangoClient) => {
    try {
        const [bids, asks] = await Promise.all([
            perpMarket.loadBids(client, true),
            perpMarket.loadAsks(client, true)
        ]);
        const item = {
            bestBid: bids.best()?.uiPrice || 0,
            bestBidSize: bids.best()?.uiSize || 0,
            bestAsk: asks.best()?.uiPrice || 0,
            bestAskSize: asks.best()?.uiSize || 0
        }
        return item
    } catch (e) {
        console.log('Failed to fetch bids and asks', e)
        return { bestBid: 0, bestAsk: 0, bestBidSize: 0, bestAskSize: 0 }
    }
}

export async function getFundingRate(): Promise<FundingRates> {
    try {
        const fundingRate = await axios.get(FUNDING_RATE_API, { timeout: 15000 })
        const data: any = fundingRate.data
        if (data?.find) {
            const solHourlyRate = data?.find((d: any) => d.name === 'SOL-PERP').funding_rate_hourly
            const ethHourlyRate = data?.find((d: any) => d.name === 'ETH-PERP').funding_rate_hourly
            const btcHourlyRate = data?.find((d: any) => d.name === 'BTC-PERP').funding_rate_hourly
            const rndrHourlyRate = data?.find((d: any) => d.name === 'RENDER-PERP').funding_rate_hourly

            return {
                solFundingRate: Number((solHourlyRate * 100 * 24 * 365).toFixed(3)),
                btcFundingRate: Number((btcHourlyRate * 100 * 24 * 365).toFixed(3)),
                ethFundingRate: Number((ethHourlyRate * 100 * 24 * 365).toFixed(3)),
                rndrFundingRate: Number((rndrHourlyRate * 100 * 24 * 365).toFixed(3))
            }
        } else {
            return {
                solFundingRate: 0,
                btcFundingRate: 0,
                ethFundingRate: 0,
                rndrFundingRate: 0
            }
        }
    } catch (x: any) {
        console.log('Failed to fetch funding rate', x.message)
        return {
            solFundingRate: 0,
            btcFundingRate: 0,
            ethFundingRate: 0,
            rndrFundingRate: 0
        }
    }
}

export const getUser = (accountKey: string): Keypair => {
    let file = fs.readFileSync(accountKey, 'utf8');
    if (!file.startsWith('[')) {
        const b = bs58.decode(fs.readFileSync(accountKey, 'utf8'));
        const j = new Uint8Array(b.buffer, b.byteOffset, b.byteLength / Uint8Array.BYTES_PER_ELEMENT);
        file = `[${j}]`
    }
    const user = Keypair.fromSecretKey(new Uint8Array(JSON.parse(file)));
    return user;
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

export function toFixedFloor(num: number, fixed: number = 4): number {
    const power = Math.pow(10, fixed);
    const val = (Math.floor(num * power) / power).toFixed(fixed);
    return Number(val)
}

export const getClient = async (user: Keypair, prioritizationFee: number, clusterUrl: string=CLUSTER_URL): Promise<Client> => {
    const options = AnchorProvider.defaultOptions();
    options.skipPreflight = false
    const connection = new Connection(clusterUrl!, {
        commitment: COMMITTMENT,
        // wsEndpoint: ALCHEMY_WS_URL
    });
    const backupConnections = [
        new Connection(LITE_RPC_URL),
        new Connection(LAVA_CONNECTION_URL),
        new Connection(GET_BLOCK_CONNECTION_URL),
    ];

    const wallet = new Wallet(user);
    const provider = new AnchorProvider(connection, wallet, options);
    try {
        const client = MangoClient.connect(provider, CLUSTER, MANGO_V4_ID[CLUSTER], {
            idsSource: 'api',
            prioritizationFee: USE_PRIORITY_FEE ? prioritizationFee : undefined,
            multipleConnections: backupConnections,
            postSendTxCallback: (txCallbackOptions: any) => {
                console.log('<<<<>>>> Transaction txCallbackOptions', `https://explorer.solana.com/tx/${txCallbackOptions.txid}`)
            }
        });
        const group = await client.getGroup(new PublicKey(GROUP_PK));
        const ids = await client.getIds(group.publicKey);
        return {
            client, user, group, ids, wallet
        }
    } catch (e: any) {
        throw e
    }
}

export const handleEstimateFeeWithAddressLookup = async () => {
    const addressLookupTable = GROUP_ADDRESS_LOOKUP_TABLE_KEY
    const connection = new Connection(FEE_CONNECTION_URL!, COMMITTMENT);
    const altResponse = await connection.getAddressLookupTable(addressLookupTable)
    const altKeys = altResponse.value?.state.addresses
    if (!altKeys) return

    const addresses = sampleSize(altKeys, MAX_PRIORITY_FEE_KEYS)

    const fees = await connection.getRecentPrioritizationFees({
        lockedWritableAccounts: addresses,
    })

    if (fees.length < 1) return

    // get max priority fee per slot (and sort by slot from old to new)
    const maxFeeBySlot = mapValues(groupBy(fees, 'slot'), (items) =>
        maxBy(items, 'prioritizationFee'),
    )
    const maximumFees: any = Object.values(maxFeeBySlot).sort(
        (a: any, b: any) => a!.slot - b!.slot,
    ) as []

    // get median of last 20 fees
    // Calculate the sum of prioritizationFee
    const sum = maximumFees.slice(Math.max(maximumFees.length - 20, 0)).reduce((acc: any, fee: any) => acc + fee.prioritizationFee, 0);
    const averageFee = sum / maximumFees.length;
    console.log('Average Fee', averageFee);

    const recentFees = maximumFees.slice(Math.max(maximumFees.length - 20, 0))
    const mid = Math.floor(recentFees.length / 2)
    const medianFee =
        recentFees.length % 2 !== 0
            ? recentFees[mid].prioritizationFee
            : (recentFees[mid - 1].prioritizationFee +
                recentFees[mid].prioritizationFee) /
            2
    const feeResult = Math.floor(medianFee)
    console.log('Median Fee', feeResult)
    return feeResult
}

export async function reloadClient(client: Client) {
    if (client.mangoAccount) {
        await client.mangoAccount.reload(client.client)
        await client.group.reloadBanks(client.client, client.ids)
        await client.group.reloadPerpMarkets(client.client, client.ids)
        await client.group.reloadPerpMarketOraclePrices(client.client)
        await client.group.reloadVaults(client.client)
    }
}


export const getDefaultTradeSize = (market: MarketKey, account: AccountDefinition) => {
    switch (market) {
        case 'BTC-PERP':
            return 0.0
        case 'SOL-PERP':
            return 2.5
        case 'ETH-PERP':
            return 0.0
    }
}

export const getMaxLongPerpSize = (market: MarketKey, account: AccountDefinition) => {
    const AMOUNT = 15000
    switch (market) {
        case 'BTC-PERP':
            return AMOUNT
        case 'SOL-PERP':
            return AMOUNT
        case 'ETH-PERP':
            return AMOUNT
        default:
            return 0
    }
}


export const getMaxShortPerpSize = (market: MarketKey, account: AccountDefinition) => {
    const AMOUNT = -15000
    switch (market) {
        case 'BTC-PERP':
            return AMOUNT
        case 'SOL-PERP':
            return AMOUNT
        case 'ETH-PERP':
            return AMOUNT
        default:
            return 0
    }
}

function getPerpOrderSize(orders: PerpOrder[]) {
    let size = 0
    orders.forEach(order => {
        if (order.side === PerpOrderSide.ask) {
            size -= order.uiSize
        } else {
            size += order.uiSize
        }
    })
    return size
}

export async function getAccountData(
    accountDefinition: AccountDefinition,
    client: any,
    group: any,
    mangoAccount: MangoAccount,
    user: Keypair
): Promise<AccountDetail> {
    const values = group.perpMarketsMapByMarketIndex.values()
    const valuesArray = Array.from(values)
    const perpMarket: any = valuesArray.find((perpMarket: any) => perpMarket.name === 'SOL-PERP');
    const btcPerpMarket: any = valuesArray.find((perpMarket: any) => perpMarket.name === 'BTC-PERP');
    const ethPerpMarket: any = valuesArray.find((perpMarket: any) => perpMarket.name === 'ETH-PERP');
    const renderPerpMarket: any = valuesArray.find((perpMarket: any) => perpMarket.name === 'RENDER-PERP');

    const tokens = await getTokenAccountsByOwnerWithWrappedSol(client.connection, user.publicKey)
    const usdcToken = tokens.find((t) => t.mint.toString() === USDC_MINT)
    const solToken = tokens.find((t) => t.mint.toString() === SOL_MINT)
    const usdc = usdcToken?.uiAmount || 0
    const sol = solToken?.uiAmount || 0

    const perpPosition = mangoAccount
        .perpActive()
        .find((pp: any) => pp.marketIndex === perpMarket!.perpMarketIndex);

    let btcAmount = 0
    let ethAmount = 0
    let renderAmount = 0
    let btcFundingAmount = 0
    let renderFundingAmount = 0
    let ethFundingAmount = 0
    let solFundingAmount = 0
    let ethBestBid = 0
    let ethBestAsk = 0
    let btcBestBid = 0
    let btcBestAsk = 0

    if (btcPerpMarket) {
        const btcBidAsks = await getBidsAndAsks(btcPerpMarket, client)
        btcBestBid = btcBidAsks.bestBid
        btcBestAsk = btcBidAsks.bestAsk
        const btcPerpPosition = mangoAccount
            .perpActive()
            .find((pp: any) => pp.marketIndex === btcPerpMarket!.perpMarketIndex);
        if (btcPerpPosition) {
            btcAmount = btcPerpPosition!.basePositionLots.toNumber() / 10000
            const btcFunding = btcPerpPosition?.getCumulativeFunding(btcPerpMarket)
            btcFundingAmount = ((btcFunding?.cumulativeShortFunding || 0) - (btcFunding!.cumulativeLongFunding || 0)) / 10 ** 6
        }
        const orders = await mangoAccount!.loadPerpOpenOrdersForMarket(
            client,
            group,
            btcPerpMarket.perpMarketIndex,
            true
        )
        db.setItem(DB_KEYS.OPEN_ORDERS, getPerpOrderSize(orders), { cacheKey: accountDefinition.name + '_' + 'BTC-PERP' })

    }
    if (renderPerpMarket) {
        const perpPosition = mangoAccount
            .perpActive()
            .find((pp: any) => pp.marketIndex === renderPerpMarket!.perpMarketIndex);
        if (perpPosition) {
            renderAmount = perpPosition!.basePositionLots.toNumber() / 10
            const renderFunding = perpPosition?.getCumulativeFunding(renderPerpMarket)
            renderFundingAmount = ((renderFunding?.cumulativeShortFunding || 0) - (renderFunding!.cumulativeLongFunding || 0)) / 10 ** 6
        }
        const orders = await mangoAccount!.loadPerpOpenOrdersForMarket(
            client,
            group,
            renderPerpMarket.perpMarketIndex,
            true
        )
        db.setItem(DB_KEYS.OPEN_ORDERS, getPerpOrderSize(orders), { cacheKey: accountDefinition.name + '_' + 'RENDER-PERP' })
    }
    if (ethPerpMarket) {
        const ethsBidAsks = await getBidsAndAsks(ethPerpMarket, client)
        ethBestBid = ethsBidAsks.bestBid
        ethBestAsk = ethsBidAsks.bestAsk
        const ethPerpPosition = mangoAccount
            .perpActive()
            .find((pp: any) => pp.marketIndex === ethPerpMarket!.perpMarketIndex);
        if (ethPerpPosition) {
            ethAmount = ethPerpPosition!.basePositionLots.toNumber() / 10000
            const ethFunding = ethPerpPosition?.getCumulativeFunding(ethPerpMarket)
            ethFundingAmount = ((ethFunding?.cumulativeShortFunding || 0) - (ethFunding!.cumulativeLongFunding || 0)) / 10 ** 6
        }
        const orders = await mangoAccount!.loadPerpOpenOrdersForMarket(
            client,
            group,
            ethPerpMarket.perpMarketIndex,
            true
        )
        db.setItem(DB_KEYS.OPEN_ORDERS, getPerpOrderSize(orders), { cacheKey: accountDefinition.name + '_' + 'ETH-PERP' })
    }

    
    if (perpPosition) {
        const solFunding = perpPosition?.getCumulativeFunding(perpMarket)
        solFundingAmount = ((solFunding?.cumulativeShortFunding || 0) - (solFunding!.cumulativeLongFunding || 0)) / 10 ** 6
    }
    const solOrders = await mangoAccount!.loadPerpOpenOrdersForMarket(
        client,
        group,
        perpMarket.perpMarketIndex,
        true
    )

    db.setItem(DB_KEYS.OPEN_ORDERS, getPerpOrderSize(solOrders), { cacheKey: accountDefinition.name + '_' + 'SOL-PERP' })

    let historicalFunding = 0;
    let interestAmount = 0;
    let solAmount = perpPosition!.basePositionLots.toNumber() / 100

    const { bestBid, bestAsk } = await db.getBidsAndAsks(accountDefinition.name, perpMarket, client)
    const fundingData = await db.fetchHistoricalFundingData(mangoAccount.publicKey.toBase58())
    if (fundingData && fundingData.length > 0) {
        for (const funding of fundingData || []) {
            historicalFunding += funding.long_funding + funding.short_funding
        }
    }

    const interestData = await db.fetchInterestData(mangoAccount.publicKey.toBase58())
    for (const interest of interestData || []) {
        interestAmount += interest.deposit_interest_usd - interest.borrow_interest_usd
    }

    const banks = Array.from(group.banksMapByName.values()).flat();
    const solBank: any = banks.find((bank: any) => bank.name === 'SOL');
    const btcBank: any = banks.find((bank: any) => bank.name === 'TBTC');
    const ethBank: any = banks.find((bank: any) => bank.name === 'ETH (Portal)');
    const usdcBank: any = banks.find((bank: any) => bank.name === 'USDC');
    const solBalance = solBank ? mangoAccount.getTokenBalanceUi(solBank) : 0;
    const usdcBalance = usdcBank ? mangoAccount.getTokenBalanceUi(usdcBank) : 0;
    const btcBalance = btcBank ? mangoAccount.getTokenBalanceUi(btcBank) : 0;
    const ethBalance = ethBank ? mangoAccount.getTokenBalanceUi(ethBank) : 0;

    let borrow = toUiDecimalsForQuote(mangoAccount.getCollateralValue(group)!.toNumber())
    const equity = toUiDecimalsForQuote(mangoAccount.getEquity(group)!.toNumber())
    const solPrice = perpMarket.price.toNumber() * 1000
    const btcPrice = btcPerpMarket.price.toNumber()
    const ethPrice = ethPerpMarket.price.toNumber()

    return {
        account: accountDefinition.key,
        name: accountDefinition.name,
        jupBasis: accountDefinition.jup,
        fundingAmount: solFundingAmount,
        interestAmount,
        solAmount,
        borrow,
        usdBasis: accountDefinition.usd,
        funding: solFundingAmount,
        health: mangoAccount.getHealthRatio(group, HealthType.maint)!.toNumber(),
        equity,
        solBalance,
        solPrice,
        usdcBalance,
        solBank,
        usdcBank,
        perpMarket,
        bestAsk,
        bestBid,
        historicalFunding,
        walletSol: sol,
        walletUsdc: usdc,
        solDiff: solAmount + sol + solBalance - SOL_RESERVE,
        ethBank,
        btcBank,
        ethBalance,
        btcBalance,
        btcAmount,
        ethAmount,
        btcFundingAmount,
        ethFundingAmount,
        ethBestBid,
        ethBestAsk,
        btcBestBid,
        btcBestAsk,
        btcPrice,
        ethPrice,
        renderAmount,
        renderFundingAmount

    }
}

export async function getCurrentFunding(accountDefinition: AccountDefinition) {
    const options = AnchorProvider.defaultOptions()
    const connection = new Connection(CLUSTER_URL)
    const provider = new AnchorProvider(
        connection,
        new Wallet(Keypair.generate()),
        options,
    )
    const client = MangoClient.connect(provider, CLUSTER, MANGO_V4_ID[CLUSTER])
    const mangoAccount = await client.getMangoAccount(new PublicKey(accountDefinition.key));
    const group = await client.getGroup(new PublicKey(GROUP_PK));
    const values = group.perpMarketsMapByMarketIndex.values()
    const perpMarket: any = Array.from(values).find((perpMarket: any) => perpMarket.name === 'SOL-PERP');
    const perpPosition = mangoAccount
        .perpActive()
        .find((pp: any) => pp.marketIndex === perpMarket.perpMarketIndex);
    const fundingAmount = perpPosition!.getCumulativeFundingUi(perpMarket);
    return fundingAmount;
}

export const setupClient = async (accountDefinition: AccountDefinition, prioritizationFee: number = 0, clusterUrl:string = CLUSTER_URL): Promise<Client> => {
    const user = getUser(accountDefinition.privateKey);
    const { client, group, ids, wallet } = await getClient(user, prioritizationFee,clusterUrl)
    const mangoAccount = await client.getMangoAccount(new PublicKey(accountDefinition.key));
    return {
        client, user, mangoAccount, group, ids, wallet
    }
}

export function sleep(ms: number) {
    console.log(`Sleeping for ${(ms / 1000 / 60).toFixed(2)} minutes`)
    return new Promise(resolve => setTimeout(resolve, ms));
}
