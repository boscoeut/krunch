
import {
    MangoClient,
    toNative
} from '@blockworks-foundation/mango-v4';
import { Wallet } from '@coral-xyz/anchor';
import {
    PublicKey,
    VersionedTransaction
} from '@solana/web3.js';
import axios from 'axios';
import {
    JUPITER_SPOT_SLIPPAGE,
    JUPITER_V6_QUOTE_API_MAINNET,
    JUP_ONLY_DIRECT_ROUTES,
    MIN_SOL_BORROW,
    MIN_SOL_WALLET_AMOUNT,
    MIN_USDC_BORROW, MIN_USDC_WALLET_AMOUNT,
    SOL_BUFFER,
    SOL_DECIMALS,
    SOL_MINT,
    SOL_RESERVE,
    USDC_BUFFER,
    USDC_DECIMALS,
    USDC_MINT
} from './constants';
import { DB_KEYS, incrementItem, setItem, getItem } from './db';
import {
    AccountDefinition,
    Client,
    PendingTransaction
} from './types';
import { toFixedFloor } from './mangoUtils';


export const performJupiterSwap = async (
    client: MangoClient,
    user: PublicKey,
    inputMint: string,
    outputMint: string,
    amount: number,
    inDecimals: number,
    wallet?: Wallet
) => {
    const amountBn = toNative(
        Math.min(amount, 99999999999), // Jupiter API can't handle amounts larger than 99999999999
        inDecimals,
    );
    const onlyDirectRoutes = JUP_ONLY_DIRECT_ROUTES
    const maxAccounts = 64
    const swapMode = 'ExactIn'
    const paramObj: any = {
        inputMint,
        outputMint,
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
    const selectedRoute = res.data
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
                userPublicKey: user,
                wrapAndUnwrapSol: true,
                // dynamicComputeUnitLimit: true, // allow dynamic compute limit instead of max 1,400,000
                // prioritizationFeeLamports: 'auto' // custom priority fee
            }),
        })
    ).json()
    const { swapTransaction } = transactions

    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // sign the transaction
    if (wallet) {
        transaction.sign([wallet.payer]);
    }

    // Execute the transaction
    const rawTransaction = transaction.serialize()
    const allConnections = [client.connection, ...client.multipleConnections!];
    const txid = await Promise.any(
      allConnections.map((c) => {
        return c.sendRawTransaction(rawTransaction, {
          skipPreflight: true, // mergedOpts.skipPreflight,
        });
      }),
    );
    console.log('New Jupiter Transaction',txid);
    await client.connection.confirmTransaction(txid);
}

export const doDeposit = async (
    accountDefinition: AccountDefinition,
    client: Client,
    usdc: number,
    sol: number): Promise<PendingTransaction> => {

    const swap: PendingTransaction = {
        type: 'DEPOSIT',
        amount: 0,
        accountName: accountDefinition.name,
        price: getItem(DB_KEYS.SOL_PRICE) || 0,
        oracle: getItem(DB_KEYS.SOL_PRICE) || 0,
        timestamp: Date.now(),
        status: 'PENDING'
    }
    const cacheKey = accountDefinition.name
    try {
        setItem(DB_KEYS.SWAP, swap, { cacheKey })
        if (!client.mangoAccount) {
            console.log('Mango account not found')
            return swap
        }

        if (sol - SOL_RESERVE >= MIN_SOL_WALLET_AMOUNT) {
            // import SOL
            const depositAmount = toFixedFloor(sol - SOL_RESERVE)
            swap.amount = depositAmount
            console.log('Importing SOL', swap.amount)
            await client.client.tokenDeposit(
                client.group,
                client.mangoAccount,
                new PublicKey(SOL_MINT),
                depositAmount,
            )
        }

        if (usdc >= MIN_USDC_WALLET_AMOUNT) {
            // import USDC
            const depositAmount = toFixedFloor(usdc)
            swap.amount = depositAmount
            console.log('Importing USDC', depositAmount)
            await client.client.tokenDeposit(
                client.group,
                client.mangoAccount,
                new PublicKey(USDC_MINT),
                depositAmount
            )
        }
        swap.status = 'COMPLETE'
        setItem(DB_KEYS.SWAP, swap, { cacheKey })
        return swap
    } catch (e: any) {
        console.log('Error in doDeposit', e.message)
        swap.status = 'FAILED'
        setItem(DB_KEYS.SWAP, swap, { cacheKey })
        return swap
    }

}

export const doSolWithdrawal = async (
    accountDefinition: AccountDefinition,
    client: Client,
    borrowAmount: number): Promise<PendingTransaction> => {

    const swap: PendingTransaction = {
        type: 'BORROW',
        amount: toFixedFloor(borrowAmount),
        accountName: accountDefinition.name,
        price: getItem(DB_KEYS.SOL_PRICE) || 0,
        oracle: getItem(DB_KEYS.SOL_PRICE) || 0,
        timestamp: Date.now(),
        status: 'PENDING'
    }
    const cacheKey = accountDefinition.name
    try {
        setItem(DB_KEYS.SWAP, swap, { cacheKey })
        if (!client.mangoAccount) {
            console.log('Mango account not found')
        } else {            
            await client.client.tokenWithdraw(
                client.group,
                client.mangoAccount,
                new PublicKey(SOL_MINT),
                toFixedFloor(borrowAmount),
                true,
            )
        }
        swap.status = 'COMPLETE'
        setItem(DB_KEYS.SWAP, swap, { cacheKey })
        return swap
    } catch (e: any) {
        console.log('Error in doSolWithdrawal', e.message)
        swap.status = 'FAILED'
        setItem(DB_KEYS.SWAP, swap, { cacheKey })
        return swap
    }

}


export const doJupiterTrade = async (
    accountDefinition: AccountDefinition,
    client: Client,
    inMint: string,
    outMint: string,
    inAmount: number,
    outAmount: number,
    usdc: number,
    sol: number, solPrice: number): Promise<PendingTransaction> => {

    const swap: PendingTransaction = {
        type: inMint === USDC_MINT ? 'JUP-BUY' : 'JUP-SELL',
        amount: inAmount,
        accountName: accountDefinition.name,
        price: solPrice,
        oracle: solPrice,
        timestamp: Date.now(),
        status: 'PENDING'
    }
    const cacheKey = accountDefinition.name
    try {
        setItem(DB_KEYS.SWAP, swap, { cacheKey })
        if (!client.mangoAccount) {
            console.log('Mango account not found')
        } else if (inMint === USDC_MINT) {
            if (sol - SOL_RESERVE >= MIN_SOL_WALLET_AMOUNT) {
                // import SOL
                swap.type = 'DEPOSIT'
                const depositAmount = toFixedFloor(sol - SOL_RESERVE)
                swap.amount = depositAmount
                console.log(accountDefinition.name, 'Importing SOL', swap.amount)
                await client.client.tokenDeposit(
                    client.group,
                    client.mangoAccount,
                    new PublicKey(SOL_MINT),
                    depositAmount,
                )
            }
            if (usdc < inAmount) {
                // borrow usdc
                swap.type = 'BORROW'
                const borrowAmount = toFixedFloor(Math.max(MIN_USDC_BORROW, inAmount - usdc + USDC_BUFFER))
                swap.amount = borrowAmount
                console.log(accountDefinition.name, 'Borrowing USDC', swap.amount)
                await client.client.tokenWithdraw(
                    client.group,
                    client.mangoAccount,
                    new PublicKey(USDC_MINT),
                    borrowAmount,
                    true,
                )
            } else if (usdc >= inAmount) {
                // swap usdc to sol
                const swapAmount = toFixedFloor(usdc)
                swap.amount = swapAmount
                console.log(accountDefinition.name, 'Swapping USDC to SOL: ' + swapAmount)
                await performJupiterSwap(client.client,
                    client.user.publicKey,
                    inMint,
                    outMint,
                    swapAmount,
                    USDC_DECIMALS,
                    client.wallet)
            }
        } else {
            if (usdc >= MIN_USDC_WALLET_AMOUNT) {
                // import USDC
                swap.type = 'DEPOSIT'
                const depositAmount = toFixedFloor(usdc)
                swap.amount = depositAmount
                console.log(accountDefinition.name, 'Importing USDC', usdc)
                await client.client.tokenDeposit(
                    client.group,
                    client.mangoAccount,
                    new PublicKey(USDC_MINT),
                    depositAmount
                )
            }
            if (sol - SOL_RESERVE < inAmount) {
                // borrow SOL                
                const borrowAmount = toFixedFloor(Math.max(MIN_SOL_BORROW, inAmount - sol + SOL_RESERVE + SOL_BUFFER))
                swap.type = 'BORROW'
                swap.amount = borrowAmount
                console.log(accountDefinition.name, 'Borrowing SOL', borrowAmount)
                await client.client.tokenWithdraw(
                    client.group,
                    client.mangoAccount,
                    new PublicKey(SOL_MINT),
                    borrowAmount,
                    true,
                )
            } else if (sol - SOL_RESERVE >= inAmount) {
                // swap sol to USDC
                const swapAmount = toFixedFloor(sol - SOL_RESERVE)
                swap.amount = swapAmount
                console.log(accountDefinition.name, 'Swapping SOL to USDC: ' + swap.amount)
                await performJupiterSwap(client.client,
                    client.user.publicKey,
                    inMint,
                    outMint,
                    swapAmount,
                    SOL_DECIMALS,
                    client.wallet)
            }
        }
        swap.status = 'COMPLETE'
        incrementItem(DB_KEYS.NUM_TRADES_SUCCESS, { cacheKey: swap.type + '-SUCCESS' })
        setItem(DB_KEYS.SWAP, swap, { cacheKey })
        return swap
    } catch (e: any) {
        console.log('Error in doJupiterTrade', e.message)
        incrementItem(DB_KEYS.NUM_TRADES_FAIL, { cacheKey: swap.type + '-FAIL' })
        setItem(DB_KEYS.SWAP, swap, { cacheKey })
        swap.status = 'FAILED'
        return swap
    }

}

