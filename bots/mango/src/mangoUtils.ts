import * as bip39 from 'bip39';

import {
    Group,
    HealthType,
    MANGO_V4_ID,
    MangoAccount,
    MangoClient,
    PerpMarket,
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
    DEFAULT_PRIORITY_FEE,
    FEE_CONNECTION_URL,
    FUNDING_RATE_API,
    GROUP_ADDRESS_LOOKUP_TABLE_KEY,
    GROUP_PK,
    JUP_PRICE_URL,
    LAVA_CONNECTION_URL,
    QUICKNODE_CONNECTION_URL,
    LITE_RPC_URL,
    MANGO_DATA_API_URL,
    MAX_PRIORITY_FEE_KEYS,
    ORDER_EXPIRATION,
    ORDER_TYPE,
    SOL_MINT,
    SOL_RESERVE,
    USDC_MINT,
    GET_BLOCK_CONNECTION_URL,
    USE_PRIORITY_FEE
} from './constants';
import * as db from './db';
import {
    AccountDefinition,
    AccountDetail,
    Client,
    PendingTransaction,
    TokenAccount,
    TotalAccountFundingItem,
    TotalInterestDataItem
} from './types';

export function createKeypair() {
    let mnemonic = bip39.generateMnemonic();
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
        const jupPrice = response.data.data.JUP.price
        const solPrice = response.data.data.SOL.price
        return { jupPrice, solPrice }
    } catch (e) {
        console.log('Failed to fetch jup price', e)
        return { jupPrice: 0, solPrice: 0 }
    }
}

export const fetchFundingData = async (mangoAccountPk: string) => {
    try {
        const url = `${MANGO_DATA_API_URL}/stats/funding-account-total?mango-account=${mangoAccountPk}`
        const response = await axios.get(url, { timeout: 2000 })
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
    } catch (e:any) {
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

export async function getFundingRate() {
    try {
        const fundingRate = await axios.get(FUNDING_RATE_API, { timeout: 3000 })
        const data: any = fundingRate.data
        if (data?.find) {
            const hourlyRate = data?.find((d: any) => d.name === 'SOL-PERP').funding_rate_hourly
            return Number((hourlyRate * 100 * 24 * 365).toFixed(3))
        } else {
            return 0
        }
    } catch (x:any) {
        console.log('Failed to fetch funding rate', x.message)
        return 0
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

export const perpTrade = async (
    client: MangoClient,
    group: Group,
    mangoAccount: MangoAccount,
    perpMarket: PerpMarket,
    price: number,
    size: number,
    side: PerpOrderSide,
    accountDefinition: AccountDefinition,
    reduceOnly: boolean) => {
    const swap: PendingTransaction = {
        type: side === PerpOrderSide.bid ? 'PERP-BUY' : 'PERP-SELL',
        amount: size,
        accountName: accountDefinition.name,
        price: price,
        oracle: price,
        timestamp: Date.now(),
        status: 'PENDING'
    }
    const cacheKey = accountDefinition.name
    try {
        db.setItem(db.DB_KEYS.SWAP, swap, { cacheKey })
        const expiryTimestamp = Date.now() / 1000 + ORDER_EXPIRATION;
        console.log(`**** ${accountDefinition.name} PERP ${side === PerpOrderSide.ask ? "SELL" : "BUY"} order for ${size} at ${price}`)
        const order = await client.perpPlaceOrder(
            group,
            mangoAccount,
            perpMarket.perpMarketIndex,
            side,
            price, // ui price 
            size, // ui base quantity
            undefined, // max quote quantity
            Date.now(), // order id
            ORDER_TYPE,
            reduceOnly,
            expiryTimestamp
        );
        console.log(`${accountDefinition.name} PERP COMPLETE ${side === PerpOrderSide.ask ? "SELL" : "BUY"} https://explorer.solana.com/tx/${order.signature}`);
        swap.status = 'ORDERED'
        db.incrementItem(db.DB_KEYS.NUM_TRADES_SUCCESS, { cacheKey: swap.type + '-SUCCESS' })
        db.setItem(db.DB_KEYS.SWAP, swap, { cacheKey })
        await sleep(ORDER_EXPIRATION * 1000)
        swap.status = 'COMPLETE'
        db.setItem(db.DB_KEYS.SWAP, swap, { cacheKey })
        return order.signature
    } catch (e: any) {
        swap.status = 'FAILED'
        console.log('Error in perpTrade', e.message)
        db.setItem(db.DB_KEYS.SWAP, swap, { cacheKey })
        db.incrementItem(db.DB_KEYS.NUM_TRADES_FAIL, { cacheKey: swap.type + '-FAIL' })
    }
}

export function toFixedFloor(num: number, fixed: number = 4): number {
    const power = Math.pow(10, fixed);
    const val = (Math.floor(num * power) / power).toFixed(fixed);
    return Number(val)
}

export const getClient = async (user: Keypair, prioritizationFee: number): Promise<Client> => {
    const options = AnchorProvider.defaultOptions();
    options.skipPreflight = false
    const connection = new Connection(CLUSTER_URL!, {
        commitment: COMMITTMENT,
        // wsEndpoint: ALCHEMY_WS_URL
    });
    const backupConnections = [
        new Connection(LITE_RPC_URL),
        new Connection(LAVA_CONNECTION_URL),
        new Connection(QUICKNODE_CONNECTION_URL),
        new Connection(GET_BLOCK_CONNECTION_URL),
    ];

    const wallet = new Wallet(user);
    const provider = new AnchorProvider(connection, wallet, options);
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

export async function getAccountData(
    accountDefinition: AccountDefinition,
    client: any,
    group: any,
    mangoAccount: MangoAccount,
    user: Keypair
): Promise<AccountDetail> {
    const values = group.perpMarketsMapByMarketIndex.values()
    const perpMarket: any = Array.from(values).find((perpMarket: any) => perpMarket.name === 'SOL-PERP');

    const tokens = await getTokenAccountsByOwnerWithWrappedSol(client.connection, user.publicKey)
    const usdcToken = tokens.find((t) => t.mint.toString() === USDC_MINT)
    const solToken = tokens.find((t) => t.mint.toString() === SOL_MINT)
    const usdc = usdcToken?.uiAmount || 0
    const sol = solToken?.uiAmount || 0

    const perpPosition = mangoAccount
        .perpActive()
        .find((pp: any) => pp.marketIndex === perpMarket.perpMarketIndex);

    const fund1 = perpPosition?.getCumulativeFunding(perpMarket)
    const fundingAmount = ((fund1?.cumulativeShortFunding || 0)  - (fund1!.cumulativeLongFunding || 0))/10**6
    
    let historicalFunding = 0;
    let interestAmount = 0;
    let solAmount = perpPosition!.basePositionLots.toNumber() / 100
    const { bestBid, bestAsk } = await db.get<{ bestBid: number, bestAsk: number }>(db.DB_KEYS.BIDS_AND_ASKS, { params: [perpMarket, client], cacheKey: accountDefinition.name })
    const fundingData = await db.get<any[]>(db.DB_KEYS.HISTORICAL_FUNDING_DATA, { cacheKey: accountDefinition.name, params: [mangoAccount.publicKey.toBase58()] })
    if (fundingData && fundingData.length > 0) {
        for (const funding of fundingData || []) {
            historicalFunding += funding.long_funding + funding.short_funding
        }
    }

    const interestData = await db.get<any[]>(db.DB_KEYS.INTEREST_DATA, { cacheKey: accountDefinition.name, params: [mangoAccount.publicKey.toBase58()] })
    for (const interest of interestData || []) {
        interestAmount += interest.deposit_interest_usd - interest.borrow_interest_usd
    }

    const banks = Array.from(group.banksMapByName.values()).flat();
    const solBank: any = banks.find((bank: any) => bank.name === 'SOL');
    const usdcBank: any = banks.find((bank: any) => bank.name === 'USDC');
    const solBalance = solBank ? mangoAccount.getTokenBalanceUi(solBank) : 0;
    const usdcBalance = usdcBank ? mangoAccount.getTokenBalanceUi(usdcBank) : 0;

    let borrow = toUiDecimalsForQuote(mangoAccount.getCollateralValue(group)!.toNumber())
    const equity = toUiDecimalsForQuote(mangoAccount.getEquity(group)!.toNumber())
    const solPrice = perpMarket.price.toNumber() * 1000

    return {
        account: accountDefinition.key,
        name: accountDefinition.name,
        jupBasis: accountDefinition.jup,
        fundingAmount,
        interestAmount,
        solAmount,
        borrow,
        usdBasis: accountDefinition.usd,
        funding: fundingAmount,
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
        solDiff: solAmount + sol + solBalance - SOL_RESERVE
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

export const setupClient = async (accountDefinition: AccountDefinition, prioritizationFee: number = DEFAULT_PRIORITY_FEE): Promise<Client> => {
    const user = getUser(accountDefinition.privateKey);
    const { client, group, ids, wallet } = await getClient(user, prioritizationFee)
    const mangoAccount = await client.getMangoAccount(new PublicKey(accountDefinition.key));
    return {
        client, user, mangoAccount, group, ids, wallet
    }
}

export function sleep(ms: number) {
    console.log(`Sleeping for ${(ms / 1000 / 60).toFixed(2)} minutes`)
    return new Promise(resolve => setTimeout(resolve, ms));
}
