import {
    Bank,
    Group,
    MANGO_V4_ID,
    MangoAccount,
    MangoClient,
    PerpMarket,
    PerpOrderSide, PerpOrderType,
    toNative
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
export const JUPITER_V6_QUOTE_API_MAINNET = 'https://quote-api.jup.ag/v6'

const CONNECTION_URL = 'https://solana-mainnet.g.alchemy.com/v2/YgL0vPVzbS8fh9y5l-eb35JE2emITsv0';
const CLUSTER_URL = CONNECTION_URL;
export const GROUP_PK =
    process.env.GROUP_PK || '78b8f4cGCwmZ9ysPFMWLaLTkkaYnUjwMJYStWe5RTSSX'; // SOL GROUP
const CLUSTER: Cluster =
    (process.env.CLUSTER_OVERRIDE as Cluster) || 'mainnet-beta';


type AccountDefinition = {
    name: string,
    key: string;
    usd: number;
    jup: number;
    privateKey: string;
};

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
                wrapAndUnwrapSol: false,
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
    const b = bs58.decode(fs.readFileSync(accountKey, 'utf8'));
    const j = new Uint8Array(b.buffer, b.byteOffset, b.byteLength / Uint8Array.BYTES_PER_ELEMENT);
    const user = Keypair.fromSecretKey(new Uint8Array(JSON.parse(`[${j}]`)));
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
    side: 'BUY' | 'SELL') => {
    const amountBn = toNative(
        Math.min(amount, 99999999999), // Jupiter API can't handle amounts larger than 99999999999
        inBank.mintDecimals,
    );


    console.log('finding best route for amount = ' + amount);
    const onlyDirectRoutes = false
    const slippage = 50
    const swapMode = 'ExactIn'
    const paramObj: any = {
        inputMint: inBank.mint.toString(),
        outputMint: outBank.mint.toString(),
        amount: amountBn.toString(),
        slippageBps: Math.ceil(slippage * 100).toString(),
        swapMode,
        onlyDirectRoutes: `${onlyDirectRoutes}`,
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
        outBank.mint,
    );
    const price = (bestRoute.outAmount / 10 ** outBank.mintDecimals) / (bestRoute.inAmount / 10 ** inBank.mintDecimals)
    console.log(`*** MARGIN ${side}: `, amount, "Price: ", price, "Amount In: ", bestRoute.inAmount, "Amount Out: ", bestRoute.outAmount)
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
    console.log(`${side} - MARGIN TRADE:, https://explorer.solana.com/tx/${sig.signature}`,);
}

export const perpTrade = async (client: MangoClient,
    group: Group,
    mangoAccount: MangoAccount,
    perpMarket: PerpMarket,
    price: number,
    size: number,
    side: PerpOrderSide) => {
    const orderId = 4200
    console.log(`**** PERP ${side === PerpOrderSide.ask ? "SELL" : "BUY"} order for ${size} at ${price}`)
    const order = await client.perpPlaceOrder(
        group,
        mangoAccount,
        perpMarket.perpMarketIndex,
        side,
        price, // ui price 
        size, // ui base quantity
        undefined, // max quote quantity
        orderId, // order id
        PerpOrderType.immediateOrCancel,
        false);
    console.log(`https://explorer.solana.com/tx/${order.signature}`);
}


export const setupClient = async (accountDefinition: AccountDefinition) => {
    const options = AnchorProvider.defaultOptions();
    const connection = new Connection(CLUSTER_URL!, options);

    const user = getUser(accountDefinition.privateKey);
    const wallet = new Wallet(user);
    const provider = new AnchorProvider(connection, wallet, options);
    const client = MangoClient.connect(provider, CLUSTER, MANGO_V4_ID[CLUSTER], {
        idsSource: 'get-program-accounts',
    });
    const mangoAccount = await client.getMangoAccount(new PublicKey(accountDefinition.key));
    return {
        client, user, mangoAccount
    }
}
export async function getFundingRate() {
    const fundingRate = await axios.get('https://api.mngo.cloud/data/v4/one-hour-funding-rate?mango-group=78b8f4cGCwmZ9ysPFMWLaLTkkaYnUjwMJYStWe5RTSSX')
    const data: any = fundingRate.data
    const hourlyRate = data.find((d: any) => d.name === 'SOL-PERP').funding_rate_hourly
    return hourlyRate
}

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
