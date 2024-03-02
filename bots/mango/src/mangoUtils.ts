import * as bip39 from 'bip39';

import {
    Bank,
    Group,
    MANGO_V4_ID,
    MangoAccount,
    MangoClient,
    PerpMarket,
    PerpOrderSide, PerpOrderType,
    toNative,
    HealthType,
    toUiDecimalsForQuote
} from '@blockworks-foundation/mango-v4';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import {
    AddressLookupTableAccount,
    Cluster, Connection, Keypair, PublicKey,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction
} from '@solana/web3.js';
import axios from 'axios';
import * as bs58 from 'bs58';
import fs from 'fs';
import { Client } from './types';
import { AccountDefinition, AccountDetail, TotalInterestDataItem } from './types';

export const JUPITER_V6_QUOTE_API_MAINNET = 'https://quote-api.jup.ag/v6'
export const FUNDING_RATE_API = 'https://api.mngo.cloud/data/v4/one-hour-funding-rate?mango-group=78b8f4cGCwmZ9ysPFMWLaLTkkaYnUjwMJYStWe5RTSSX'
const CONNECTION_URL = 'https://solana-mainnet.g.alchemy.com/v2/YgL0vPVzbS8fh9y5l-eb35JE2emITsv0';
const CLUSTER_URL = CONNECTION_URL;
export const GROUP_PK =
    process.env.GROUP_PK || '78b8f4cGCwmZ9ysPFMWLaLTkkaYnUjwMJYStWe5RTSSX'; // SOL GROUP
const CLUSTER: Cluster =
    (process.env.CLUSTER_OVERRIDE as Cluster) || 'mainnet-beta';
export const MANGO_DATA_API_URL = 'https://api.mngo.cloud/data/v4'
const INTEREST_CACHE: Map<string, Array<any>> = new Map()

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
        if (INTEREST_CACHE.has(mangoAccountPk)) {
            return INTEREST_CACHE.get(mangoAccountPk)
        } else {
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
                INTEREST_CACHE.set(mangoAccountPk, stats)
                return stats
            } else return []
        }
    } catch (e) {
        console.log('Failed to fetch account funding', e)
        return []
    }
}

export const deserializeJupiterIxAndAlt = async (
    connection: Connection,
    swapTransaction: string,
): Promise<[TransactionInstruction[], AddressLookupTableAccount[]]> => {
    const parsedSwapTransaction = VersionedTransaction.deserialize(
        Buffer.from(swapTransaction, 'base64'),
    )
    const message = parsedSwapTransaction.message
    // const lookups = message.addressTableLookups
    const addressLookupTablesResponses = await Promise.all(
        message.addressTableLookups.map((alt) =>
            connection.getAddressLookupTable(alt.accountKey),
        ),
    )
    const addressLookupTables: AddressLookupTableAccount[] =
        addressLookupTablesResponses
            .map((alt) => alt.value)
            .filter((x): x is AddressLookupTableAccount => x !== null)

    const decompiledMessage = TransactionMessage.decompile(message, {
        addressLookupTableAccounts: addressLookupTables,
    })

    return [decompiledMessage.instructions, addressLookupTables]
}

/**  Given a Jupiter route, fetch the transaction for the user to sign.
 **This function should be used for margin swaps* */
export const fetchJupiterTransaction = async (
    connection: Connection,
    selectedRoute: any,
    userPublicKey: PublicKey,
    slippage: number,
    inputMint: PublicKey,
    outputMint: PublicKey,
): Promise<[TransactionInstruction[], AddressLookupTableAccount[]]> => {
    // docs https://station.jup.ag/api-v6/post-swap
    const transactions = await (
        await fetch(`${JUPITER_V6_QUOTE_API_MAINNET}/swap`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                // response from /quote api
                quoteResponse: selectedRoute,
                // user public key to be used for the swap
                userPublicKey,
                slippageBps: Math.ceil(slippage * 100),
                wrapAndUnwrapSol: false
            }),
        })
    ).json()

    const { swapTransaction } = transactions

    const [ixs, alts] = await deserializeJupiterIxAndAlt(
        connection,
        swapTransaction,
    )

    const isSetupIx = (pk: PublicKey): boolean =>
        pk.toString() === 'ComputeBudget111111111111111111111111111111' ||
        pk.toString() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

    const isDuplicateAta = (ix: TransactionInstruction): boolean => {
        return (
            ix.programId.toString() ===
            'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' &&
            (ix.keys[3].pubkey.toString() === inputMint.toString() ||
                ix.keys[3].pubkey.toString() === outputMint.toString())
        )
    }

    //remove ATA and compute setup from swaps in margin trades
    const filtered_jup_ixs = ixs
        .filter((ix) => !isSetupIx(ix.programId))
        .filter((ix) => !isDuplicateAta(ix))

    return [filtered_jup_ixs, alts]
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

export const spotTrade = async (
    amount: number,
    inBank: Bank,
    outBank: Bank,
    client: MangoClient,
    mangoAccount: MangoAccount,
    user: Keypair,
    group: Group,
    side: 'BUY' | 'SELL',
    accountDefinition: AccountDefinition) => {
    try {
        const amountBn = toNative(
            Math.min(amount, 99999999999), // Jupiter API can't handle amounts larger than 99999999999
            inBank.mintDecimals,
        );
        console.log('finding best route for amount = ' + amount);
        const onlyDirectRoutes = true
        const slippage = 75
        const maxAccounts = 64
        const swapMode = 'ExactIn'
        const paramObj: any = {
            inputMint: inBank.mint.toString(),
            outputMint: outBank.mint.toString(),
            amount: amountBn.toString(),
            slippageBps: Math.ceil(slippage * 100).toString(),
            swapMode,
            onlyDirectRoutes: `${onlyDirectRoutes}`,
            maxAccounts: `${maxAccounts}`,
        }
        const paramsString = new URLSearchParams(paramObj).toString()
        const res = await axios.get(
            `${JUPITER_V6_QUOTE_API_MAINNET}/quote?${paramsString}`,
        )
        const bestRoute = res.data
        const [ixs, alts] = await fetchJupiterTransaction(
            client.connection,
            bestRoute,
            user.publicKey,
            0,
            inBank.mint,
            outBank.mint
        );
        let price = (bestRoute.outAmount / 10 ** outBank.mintDecimals) / (bestRoute.inAmount / 10 ** inBank.mintDecimals)
        if (side === 'BUY') {
            price = (bestRoute.inAmount / 10 ** inBank.mintDecimals) / (bestRoute.outAmount / 10 ** outBank.mintDecimals)
        }
        console.log(`*** ${accountDefinition.name} MARGIN ${side}: `, amount, "Price: ", price, "Amount In: ", bestRoute.inAmount, "Amount Out: ", bestRoute.outAmount)
        const sig = await client.marginTrade({
            group: group,
            mangoAccount: mangoAccount,
            inputMintPk: inBank.mint,
            amountIn: Number(amount.toFixed(3)),
            outputMintPk: outBank.mint,
            userDefinedInstructions: ixs,
            userDefinedAlts: alts,
            flashLoanType: { swap: {} },
        });
        console.log(`${accountDefinition.name} MARGIN ${side} COMPLETE:`, `https://explorer.solana.com/tx/${sig.signature}`);
        return sig.signature
    } catch (e) {
        console.log(`${accountDefinition.name} Error placing SPOT Trade`, e)
        return null
    }
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
    try {
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
            PerpOrderType.immediateOrCancel,
            reduceOnly);
        console.log(`${accountDefinition.name} PERP COMPLETE ${side === PerpOrderSide.ask ? "SELL" : "BUY"} https://explorer.solana.com/tx/${order.signature}`);
        return order.signature
    } catch (e) {
        console.log(`${accountDefinition.name} Error placing PERP Trade`, e)
        return null
    }
}

export const getClient = async (user: Keypair): Promise<Client> => {
    const options = AnchorProvider.defaultOptions();
    const connection = new Connection(CLUSTER_URL!, options);

    const wallet = new Wallet(user);
    const provider = new AnchorProvider(connection, wallet, options);
    const client = MangoClient.connect(provider, CLUSTER, MANGO_V4_ID[CLUSTER], {
        idsSource: 'get-program-accounts',
    });
    const group = await client.getGroup(new PublicKey(GROUP_PK));
    const ids = await client.getIds(group.publicKey);
    return {
        client, user, group, ids
    }
}

export async function getAccountData(
    accountDefinition: AccountDefinition,
    client: any,
    group: any,
    mangoAccount: MangoAccount
): Promise<AccountDetail> {
    const values = group.perpMarketsMapByMarketIndex.values()
    const perpMarket: any = Array.from(values).find((perpMarket: any) => perpMarket.name === 'SOL-PERP');

    const pp = mangoAccount
        .perpActive()
        .find((pp: any) => pp.marketIndex === perpMarket.perpMarketIndex);

    let fundingAmount = 0;
    let interestAmount = 0;
    let solAmount = 0;
    if (pp) {
        fundingAmount += pp.getCumulativeFundingUi(perpMarket);
        solAmount = pp.basePositionLots.toNumber() / 100
    }
    const interestData = await fetchInterestData(mangoAccount.publicKey.toBase58())
    for (const interest of interestData || []) {
        interestAmount += interest.deposit_interest_usd - interest.borrow_interest_usd
    }

    const banks = Array.from(group.banksMapByName.values()).flat();
    const solBank: any = banks.find((bank: any) => bank.name === 'SOL');
    const usdcBank: any = banks.find((bank: any) => bank.name === 'USDC');
    const solBalance = solBank ? mangoAccount.getTokenBalanceUi(solBank) : 0;
    const usdcBalance = solBank ? mangoAccount.getTokenBalanceUi(solBank) : 0;

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
        perpMarket
    }
}

export const setupClient = async (accountDefinition: AccountDefinition): Promise<Client> => {
    const user = getUser(accountDefinition.privateKey);
    const { client, group, ids } = await getClient(user)
    const mangoAccount = await client.getMangoAccount(new PublicKey(accountDefinition.key));
    return {
        client, user, mangoAccount, group, ids
    }
}

export async function getFundingRate() {
    const fundingRate = await axios.get(FUNDING_RATE_API)
    const data: any = fundingRate.data
    const hourlyRate = data.find((d: any) => d.name === 'SOL-PERP').funding_rate_hourly
    return hourlyRate
}

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
