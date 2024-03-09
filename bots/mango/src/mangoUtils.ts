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
import {
    CLUSTER,
    CLUSTER_URL,
    COMMITTMENT,
    DEFAULT_PRIORITY_FEE,
    FUNDING_RATE_API,
    GROUP_PK,
    JUP_PRICE_URL,
    MANGO_DATA_API_URL,
    ORDER_EXPIRATION,
    ORDER_TYPE,
    SOL_MINT,
    SOL_RESERVE,
    USDC_MINT
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
        const response = await axios.get(url)
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
    } catch (e) {
        console.log('Failed to fetch account funding', e)
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
            bestAsk: asks.best()?.uiPrice || 0
        }
        return item
    } catch (e) {
        console.log('Failed to fetch bids and asks', e)
        return { bestBid: 0, bestAsk: 0 }
    }
}

export async function getFundingRate() {
    const fundingRate = await axios.get(FUNDING_RATE_API)
    const data: any = fundingRate.data
    if (data.find) {
        const hourlyRate = data?.find((d: any) => d.name === 'SOL-PERP').funding_rate_hourly
        return Number((hourlyRate * 100 * 24 * 365).toFixed(3))
    } else {
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
    try {
        const cacheKey = accountDefinition.name
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
        await sleep(ORDER_EXPIRATION * 1000)   
        swap.status = 'COMPLETE'
        db.incrementItem(db.DB_KEYS.NUM_TRADES_SUCCESS, { cacheKey: swap.type + '-SUCCESS' })
        return order.signature
    } catch (e: any) {
        swap.status = 'FAILED'
        console.log('Error in perpTrade', e.message)
        db.incrementItem(db.DB_KEYS.NUM_TRADES_FAIL, { cacheKey: swap.type + '-FAIL' })
    }
}

export const getClient = async (user: Keypair): Promise<Client> => {
    const options = AnchorProvider.defaultOptions();
    const connection = new Connection(CLUSTER_URL!, COMMITTMENT);
    // const backupConnections = [new Connection(LAVA_CONNECTION_URL)];

    const wallet = new Wallet(user);
    const provider = new AnchorProvider(connection, wallet, options);
    provider.opts.skipPreflight = true // TODO
    const client = MangoClient.connect(provider, CLUSTER, MANGO_V4_ID[CLUSTER], {
        idsSource: 'get-program-accounts',
        prioritizationFee: DEFAULT_PRIORITY_FEE,
        // multipleConnections: backupConnections,
        // postSendTxCallback: (txCallbackOptions: any) => {
        //     console.log('<<<<>>>> Transaction txCallbackOptions', txCallbackOptions)
        // }
    });
    const group = await client.getGroup(new PublicKey(GROUP_PK));
    const ids = await client.getIds(group.publicKey);
    return {
        client, user, group, ids, wallet
    }
}

export async function reloadClient(client: Client) {
    if (!client.mangoAccount) return
    await Promise.all([
        client.mangoAccount.reload(client.client),
        client.group.reloadBanks(client.client, client.ids),
        client.group.reloadPerpMarkets(client.client, client.ids),
        client.group.reloadPerpMarketOraclePrices(client.client),
    ]);
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

    const pp = mangoAccount
        .perpActive()
        .find((pp: any) => pp.marketIndex === perpMarket.perpMarketIndex);

    let fundingAmount = 0;
    let historicalFunding = 0;
    let interestAmount = 0;
    let solAmount = 0;
    if (pp) {
        fundingAmount += pp.getCumulativeFundingUi(perpMarket);
        solAmount = pp.basePositionLots.toNumber() / 100
    }
    const { bestBid, bestAsk } = await db.get<{ bestBid: number, bestAsk: number }>(db.DB_KEYS.BIDS_AND_ASKS, { params: [perpMarket, client], cacheKey: accountDefinition.name })
    const fundingData = await db.get<any[]>(db.DB_KEYS.FUNDING_DATA, { cacheKey: accountDefinition.name, params: [mangoAccount.publicKey.toBase58()] })
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
        solDiff: solAmount + sol+solBalance-SOL_RESERVE
    }
}

export const setupClient = async (accountDefinition: AccountDefinition): Promise<Client> => {
    const user = getUser(accountDefinition.privateKey);
    const { client, group, ids, wallet } = await getClient(user)
    const mangoAccount = await client.getMangoAccount(new PublicKey(accountDefinition.key));
    return {
        client, user, mangoAccount, group, ids, wallet
    }
}



export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
