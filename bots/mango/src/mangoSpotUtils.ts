
import {
    Bank,
    FlashLoanType,
    Group,
    MangoAccount,
    MangoClient,
    toNative
} from '@blockworks-foundation/mango-v4';
import {
    AddressLookupTableAccount,
    Connection, Keypair, PublicKey,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction
} from '@solana/web3.js';
import axios from 'axios';
import {
    JUPITER_V6_QUOTE_API_MAINNET,
    SOL_PRICE_SPOT_DIFF_SLIPPAGE,
    SWAP_ONLY_DIRECT_ROUTES,
    JUPITER_SPOT_SLIPPAGE
} from './constants';
import {
    AccountDefinition, 
    PendingTransaction
} from './types';
import * as db from './db';


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
                wrapAndUnwrapSol: false, 
                // dynamicComputeUnitLimit: true, // allow dynamic compute limit instead of max 1,400,000                
                // prioritizationFeeLamports: 'auto' // custom priority fee
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


export const spotTrade = async (
    amount: number,
    inBank: Bank,
    outBank: Bank,
    client: MangoClient,
    mangoAccount: MangoAccount,
    user: Keypair,
    group: Group,
    side: 'BUY' | 'SELL',
    accountDefinition: AccountDefinition,
    solPrice:number) => {

        const swap: PendingTransaction = {
            type: side === 'BUY' ? 'SPOT-BUY' : 'SPOT-SELL',
            amount,
            accountName: accountDefinition.name,
            price: db.getItem(db.DB_KEYS.SOL_PRICE) || 0,
            oracle: db.getItem(db.DB_KEYS.SOL_PRICE) || 0,
            timestamp: Date.now(),
            status: 'PENDING'
        }
    const cacheKey = accountDefinition.name
    try {
        db.setItem(db.DB_KEYS.SWAP, swap, { cacheKey })

        const amountBn = toNative(
            Math.min(amount, 99999999999), // Jupiter API can't handle amounts larger than 99999999999
            inBank.mintDecimals,
        );
        console.log('finding best route for amount = ' + amount);
        const onlyDirectRoutes = SWAP_ONLY_DIRECT_ROUTES
        const slippage = JUPITER_SPOT_SLIPPAGE
        const maxAccounts = 64
        const swapMode = 'ExactIn'
        const paramObj: any = {
            inputMint: inBank.mint.toString(),
            outputMint: outBank.mint.toString(),
            amount: amountBn.toString(),
            slippageBps: JUPITER_SPOT_SLIPPAGE.toString(),
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
            inBank.mint,
            outBank.mint
        );
        let price = (bestRoute.outAmount / 10 ** outBank.mintDecimals) / (bestRoute.inAmount / 10 ** inBank.mintDecimals)
        if (side === 'BUY') {
            price = (bestRoute.inAmount / 10 ** inBank.mintDecimals) / (bestRoute.outAmount / 10 ** outBank.mintDecimals)
        }

        let priceDiff = price-solPrice
        if (side === 'SELL') {
            priceDiff = solPrice-price
        }
        console.log(`Price Diff: ${priceDiff}`)
        if (priceDiff > SOL_PRICE_SPOT_DIFF_SLIPPAGE) {
            throw new Error(`Price diff too high: ${priceDiff}.  Oracle=${solPrice}  Swap=${price}  SwapPrice=${amount}  Side=${side}  Account=${accountDefinition.name}  `)
        }

        console.log(`*** ${accountDefinition.name} MARGIN ${side}: `, amount,"Oracle: ",solPrice, "Price: ", price, "Amount In: ", bestRoute.inAmount, "Amount Out: ", bestRoute.outAmount)
        swap.price = price
        const sig = await client.marginTrade({
            group: group,
            mangoAccount: mangoAccount,
            inputMintPk: inBank.mint,
            amountIn: Number(amount.toFixed(3)),
            outputMintPk: outBank.mint,
            userDefinedInstructions: ixs,
            userDefinedAlts: alts,
            flashLoanType: FlashLoanType.swap
        });
        console.log(`${accountDefinition.name} MARGIN ${side} COMPLETE:`, `https://explorer.solana.com/tx/${sig.signature}`);
        swap.status = 'COMPLETE'
        db.setItem(db.DB_KEYS.SWAP, swap, { cacheKey })
        db.incrementItem(db.DB_KEYS.NUM_TRADES_SUCCESS, { cacheKey : swap.type+'-SUCCESS' })
        return sig.signature
    } catch (e:any) {
        swap.status = 'FAILED'
        console.error(`Error in spotTrade: ${e.message} Account=${accountDefinition.name}  Type=${swap.type}  Amount=${amount}  Oracle=${solPrice}  Price=${swap.price}  Side=${side}  `)
        db.setItem(db.DB_KEYS.SWAP, swap, { cacheKey })
        db.incrementItem(db.DB_KEYS.NUM_TRADES_FAIL, { cacheKey : swap.type+'-FAIL' })
    }
}
