
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
    SWAP_ONLY_DIRECT_ROUTES
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

        const swap: PendingTransaction = {
            type: side === 'BUY' ? 'SPOT-BUY' : 'SPOT-SELL',
            amount,
            accountName: accountDefinition.name,
            price: 0,
            oracle: 0,
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
        const slippage = 100
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
        db.setItem(db.DB_KEYS.SWAP, swap, { cacheKey })
        db.incrementItem(db.DB_KEYS.NUM_TRADES_FAIL, { cacheKey : swap.type+'-FAIL' })
        console.error('Error in spotTrade: ', e.message)
    }
}
