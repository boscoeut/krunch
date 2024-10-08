
import {
    Bank,
    FlashLoanType,
    Group,
    MangoAccount,
    MangoClient,
    PerpOrderSide,
    PerpOrderType,
    PerpSelfTradeBehavior,
    createAssociatedTokenAccountIdempotentInstruction,
    getAssociatedTokenAddress,
    toNative
} from '@blockworks-foundation/mango-v4';
import {
    AnchorProvider,
    BN
} from '@coral-xyz/anchor';
import {
    AccountMeta,
    AddressLookupTableAccount,
    Connection, Keypair, PublicKey,
    SYSVAR_INSTRUCTIONS_PUBKEY,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction
} from '@solana/web3.js';
import axios from 'axios';
import { toFixedFloor, sleep } from './mangoUtils';
import {
    JUPITER_V6_QUOTE_API_MAINNET,
    ORDER_EXPIRATION,
    TRADE_TIMEOUT,
    POST_TRADE_TIMEOUT,
    SOL_PRICE_SPOT_DIFF_SLIPPAGE,
    SWAP_ONLY_DIRECT_ROUTES,
    SHOULD_CANCEL_ORDERS
} from './constants';
import * as db from './db';
import {
    AccountDefinition,
    MarketKey,
    Side
} from './types';


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

async function getMarginTradeIx({
    client,
    group,
    mangoAccount,
    inputMintPk,
    amountIn,
    outputMintPk,
    userDefinedInstructions,
    // margin trade is a general function
    // set flash_loan_type to FlashLoanType.swap if you desire the transaction to be recorded as a swap
    flashLoanType,
}: {
    client: MangoClient;
    group: Group;
    mangoAccount: MangoAccount;
    inputMintPk: PublicKey;
    amountIn: number;
    outputMintPk: PublicKey;
    userDefinedInstructions: TransactionInstruction[];
    flashLoanType: FlashLoanType;
}): Promise<Array<any>> {

    const swapExecutingWallet = mangoAccount.owner;

    const inputBank: Bank = group.getFirstBankByMint(inputMintPk);
    const outputBank: Bank = group.getFirstBankByMint(outputMintPk);

    const healthRemainingAccounts: PublicKey[] = await
        client.buildHealthRemainingAccounts(
            group,
            [mangoAccount],
            [inputBank, outputBank],
            [],
        );
    const parsedHealthAccounts = healthRemainingAccounts.map(
        (pk) =>
        ({
            pubkey: pk,
            isWritable: false,
            isSigner: false,
        } as AccountMeta),
    );

    /*
     * Find or create associated token accounts
     */
    const inputTokenAccountPk = await getAssociatedTokenAddress(
        inputBank.mint,
        swapExecutingWallet,
        true,
    );
    const inputTokenAccExists =
        await client.program.provider.connection.getAccountInfo(
            inputTokenAccountPk,
        );
    const preInstructions: TransactionInstruction[] = [];
    if (!inputTokenAccExists) {
        preInstructions.push(
            await createAssociatedTokenAccountIdempotentInstruction(
                swapExecutingWallet,
                swapExecutingWallet,
                inputBank.mint,
            ),
        );
    }

    const outputTokenAccountPk = await getAssociatedTokenAddress(
        outputBank.mint,
        swapExecutingWallet,
        true,
    );
    const outputTokenAccExists =
        await client.program.provider.connection.getAccountInfo(
            outputTokenAccountPk,
        );
    if (!outputTokenAccExists) {
        preInstructions.push(
            await createAssociatedTokenAccountIdempotentInstruction(
                swapExecutingWallet,
                swapExecutingWallet,
                outputBank.mint,
            ),
        );
    }

    const inputBankAccount = {
        pubkey: inputBank.publicKey,
        isWritable: true,
        isSigner: false,
    };
    const outputBankAccount = {
        pubkey: outputBank.publicKey,
        isWritable: true,
        isSigner: false,
    };
    const inputBankVault = {
        pubkey: inputBank.vault,
        isWritable: true,
        isSigner: false,
    };
    const outputBankVault = {
        pubkey: outputBank.vault,
        isWritable: true,
        isSigner: false,
    };
    const inputATA = {
        pubkey: inputTokenAccountPk,
        isWritable: true,
        isSigner: false,
    };
    const outputATA = {
        pubkey: outputTokenAccountPk,
        isWritable: false,
        isSigner: false,
    };
    const groupAM = {
        pubkey: group.publicKey,
        isWritable: false,
        isSigner: false,
    };

    const flashLoanEndIx = await client.program.methods
        .flashLoanEndV2(2, flashLoanType)
        .accounts({
            account: mangoAccount.publicKey,
            owner: (client.program.provider as AnchorProvider).wallet.publicKey,
        })
        .remainingAccounts([
            ...parsedHealthAccounts,
            inputBankVault,
            outputBankVault,
            inputATA,
            {
                isWritable: true,
                pubkey: outputTokenAccountPk,
                isSigner: false,
            },
            groupAM,
        ])
        .instruction();

    const flashLoanBeginIx = await client.program.methods
        .flashLoanBegin([
            toNative(amountIn, inputBank.mintDecimals),
            new BN(
                0,
            ) /* we don't care about borrowing the target amount, this is just a dummy */,
        ])
        .accounts({
            account: mangoAccount.publicKey,
            owner: (client.program.provider as AnchorProvider).wallet.publicKey,
            instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .remainingAccounts([
            inputBankAccount,
            outputBankAccount,
            inputBankVault,
            outputBankVault,
            inputATA,
            outputATA,
            groupAM,
        ])
        .instruction();

    return [
        ...preInstructions,
        flashLoanBeginIx,
        ...userDefinedInstructions,
        flashLoanEndIx,
    ]
}

export const getBestPrice = async (side: Side, spotAmount: number, inBank: Bank, outBank: Bank, slippageBps:number) => {
    const amountBn = toNative(
        Math.min(spotAmount, 99999999999), // Jupiter API can't handle amounts larger than 99999999999
        inBank.mintDecimals,
    );
    const onlyDirectRoutes = SWAP_ONLY_DIRECT_ROUTES
    const maxAccounts = 64
    const swapMode = 'ExactIn'
    const paramObj: any = {
        inputMint: inBank.mint.toString(),
        outputMint: outBank.mint.toString(),
        amount: amountBn.toString(),
        slippageBps: slippageBps.toString(),
        swapMode,
        onlyDirectRoutes: `${onlyDirectRoutes}`,
        maxAccounts: `${maxAccounts}`,
    }
    const paramsString = new URLSearchParams(paramObj).toString()
    const res = await axios.get(
        `${JUPITER_V6_QUOTE_API_MAINNET}/quote?${paramsString}`,
    )
    const bestRoute = res.data

    let price = (bestRoute.outAmount / 10 ** outBank.mintDecimals) / (bestRoute.inAmount / 10 ** inBank.mintDecimals)
    if (side === Side.BUY) {
        price = (bestRoute.inAmount / 10 ** inBank.mintDecimals) / (bestRoute.outAmount / 10 ** outBank.mintDecimals)
    }

    return {
        bestRoute,
        price
    };
}

export const checkPrice = (oraclePrice: number, spotPrice: number, side: Side) => {
    let priceDiff = spotPrice - oraclePrice
    if (side === Side.SELL) {
        priceDiff = oraclePrice - spotPrice
    }
    const slippage = (SOL_PRICE_SPOT_DIFF_SLIPPAGE / 100) * oraclePrice
    console.log(`Price Diff: ${priceDiff}`)
    if (priceDiff > slippage) {
        throw new Error(`Price diff too high: ${priceDiff}.  Oracle=${oraclePrice}  Swap=${spotPrice}  Side=${side}`)
    }

}

export const cancelOpenOrders = async (client: MangoClient, mangoAccount: MangoAccount,
    group: Group, market: string, account: string) => {
    const values = group.perpMarketsMapByMarketIndex.values()
    const perpMarket: any = Array.from(values).find((perpMarket: any) => perpMarket.name === market);
    const orders = await mangoAccount.loadPerpOpenOrdersForMarket(
        client,
        group,
        perpMarket.perpMarketIndex,
        true
    )
    if (orders.length > 0) {
        console.log(`Cancelling ${orders.length} orders for ${account}`)
        if (SHOULD_CANCEL_ORDERS){
            await client.perpCancelAllOrders(group, mangoAccount, perpMarket.perpMarketIndex, 10)
        }
    }
}

export const perpTrade = async (accountDefinition: AccountDefinition, client: MangoClient, mangoAccount: MangoAccount,
    group: Group, price: number, quantity: number, side: PerpOrderSide, market: string) => {
    const values = group.perpMarketsMapByMarketIndex.values()
    const perpMarket: any = Array.from(values).find((perpMarket: any) => perpMarket.name === market);

    console.log(`${accountDefinition.name} PERP BEGIN ${side === PerpOrderSide.bid ? Side.BUY : Side.SELL}`)
    console.log(`  Price=`, price)
    console.log(`  Amount=`, quantity)
    let addressLookupTables: any = []
    let tradeInstructions: any = []
    const clientOrderId = Date.now()
    tradeInstructions.push(await client.perpUpdateFundingIx(group, perpMarket))
    tradeInstructions.push(await client.perpPlaceOrderIx(
        group,
        mangoAccount!,
        perpMarket.perpMarketIndex,
        side,
        price,// price 
        toFixedFloor(quantity),// quantity
        undefined,//maxQuoteQuantity,
        clientOrderId,//clientOrderId,
        PerpOrderType.limit,
        false, //reduceOnly
        Date.now() / 1000 + ORDER_EXPIRATION, //expiryTimestamp,
        undefined // limit
    ))

    db.addOpenTransaction({
        account: accountDefinition.name,
        side: side === PerpOrderSide.ask ? Side.SELL : Side.BUY,
        price: price,
        size: toFixedFloor(quantity),
        error: 'Pending',
        type: 'PERP',
        date: new Date(),
        market,
        orderId: clientOrderId
    })

    return { tradeInstructions, addressLookupTables, orderIds: [clientOrderId]}

}

export const handleError = async (e: any) => {
    let errorMessage = e.message
    let delay = 0;
    try {
        const eValue = JSON.parse(e.message)
        let customError = 0
        try {
            customError = eValue.value.err.InstructionError[1].Custom
        } catch {
            // error parsing message    
        }
        if (customError === 1) {
            errorMessage = 'Custom InstructionError.  Trying again in 30 seconds'
            delay = 30
        } else if (customError === 6001) {
            errorMessage = '6001 Spot Slippage exceeded for Spot Price'
        } else if (customError === 6007) {
            errorMessage = '6007 Spot Custom program error: 0x1777'
        } else if (customError === 6023) {
            errorMessage = '6023 Spot Error Message: Invalid tick array sequence'
        } else if (customError === 3005) {
            errorMessage = '3005 Spot Error Number: Error Message: Not enough account keys given to the instruction'
        } else if (customError === 6028) {
            errorMessage = '6028 Spot Error Message: Invaild first tick array account'
        } else if (customError === 6047) {
            errorMessage = '6047 incorrect number of health accounts; received 8 accounts but expected 10 (2 banks, 2 bank oracles, 3 perp markets, 3 perp oracles, 0 serum3 oos).'
        } else if (customError === 6024) {
            errorMessage = '6024. Error Message: an oracle is stale; name: USDC'
            delay = 30
        }
    } catch (ex: any) {
        // error parsing message
    } finally {
        console.error(errorMessage)
    }
    if (delay > 0) {
        await sleep(delay * 1000)
    }
    return errorMessage
}

export const spotAndPerpSwap = async (
    spotAmount: number,
    perpBank: Bank,
    usdcBank: Bank,
    client: MangoClient,
    mangoAccount: MangoAccount,
    user: Keypair,
    group: Group,
    spotSide: Side,
    accountDefinition: AccountDefinition,
    perpPrice: number,
    buyPerpSize: number,
    sellPerpSize: number,
    sellPriceBuffer: number,
    buyPriceBuffer: number,
    numOrders: number,
    market: MarketKey,
    jupiterSpotSlippage:number) => {

    let perpSide: PerpOrderSide = PerpOrderSide.bid
    let spotPrice = 0

    let doPerp = buyPerpSize > 0 || sellPerpSize > 0
    let doSpot = spotAmount > 0
    let tradeInstructions: Array<any> = []
    let addressLookupTables: Array<any> = []
    const orderIds: Array<number> = []

    console.log(`***** ${accountDefinition.name} spotAndPerpSwap *****`)
    const values = group.perpMarketsMapByMarketIndex.values()
    const perpMarket: any = Array.from(values).find((perpMarket: any) => perpMarket.name === market);

    // SPOT TRADE
    if (doSpot) {
        const inBank = spotSide === Side.SELL ? perpBank : usdcBank
        const outBank = spotSide === Side.SELL ? usdcBank : perpBank

        const quoteAmount = Side.BUY === spotSide ? spotAmount * perpPrice : spotAmount
        const { price, bestRoute: bestRoute } = await getBestPrice(spotSide, quoteAmount, inBank, outBank, jupiterSpotSlippage)
        spotPrice = price
        const clientOrderId = Date.now()
        try {
            checkPrice(perpPrice, spotPrice, spotSide)
            const [ixs, alts] = await fetchJupiterTransaction(
                client.connection,
                bestRoute,
                user.publicKey,
                inBank.mint,
                outBank.mint
            );

            const amountIn = bestRoute.inAmount / 10 ** inBank.mintDecimals
            const amountOut = bestRoute.outAmount / 10 ** outBank.mintDecimals
            const marginInstructions = await getMarginTradeIx(
                {
                    client: client,
                    group: group,
                    mangoAccount: mangoAccount,
                    inputMintPk: inBank.mint,
                    amountIn,
                    outputMintPk: outBank.mint,
                    userDefinedInstructions: ixs,
                    flashLoanType: FlashLoanType.swap
                }
            )
            addressLookupTables.push(...alts)
            tradeInstructions.push(...marginInstructions)
            orderIds.push(clientOrderId)
            console.log(`${accountDefinition.name} SPOT ${spotSide}`)
            console.log(`  Price=`, spotPrice)
            console.log(`  Amount=`, spotAmount)
            console.log(`  Oracle=`, perpPrice)

            db.addOpenTransaction({
                account: accountDefinition.name,
                side: spotSide,
                price: price,
                size: amountOut,
                error: 'Pending',
                type: 'SPOT',
                date: new Date(),
                market,
                orderId: clientOrderId
            })            
        } catch (e: any) {
            await db.updateOpenTransaction(clientOrderId, 'ERROR: ' + e.message)
        }
    }

    // PERP TRADE
    if (doPerp) {
        // determine perp amount
        if (buyPerpSize + sellPerpSize > 0) {
            //tradeInstructions.push(await client.perpUpdateFundingIx(group, perpMarket))
        }
        if (buyPerpSize > 0) {
            const clientOrderId = Date.now()
            perpSide = PerpOrderSide.bid
            tradeInstructions.push(await client.perpPlaceOrderPeggedV2Ix(
                group,
                mangoAccount!,
                perpMarket.perpMarketIndex,
                PerpOrderSide.bid,
                -1 * (buyPriceBuffer),// price Offset
                toFixedFloor(buyPerpSize),// size
                undefined, //piglimit
                undefined,//maxQuoteQuantity,
                clientOrderId,//clientOrderId,
                PerpOrderType.limit,
                PerpSelfTradeBehavior.cancelProvide,
                false, //reduceOnly
                undefined, //expiryTimestamp,
                undefined // limit
            ))
            db.addOpenTransaction({
                account: accountDefinition.name,
                side: Side.BUY,
                price: perpPrice - 1 * buyPriceBuffer,
                size: toFixedFloor(buyPerpSize),
                error: 'Pending',
                type: 'PERP',
                date: new Date(),
                market,
                orderId: clientOrderId
            })
            orderIds.push(clientOrderId)
        }
        if (sellPerpSize > 0) {
            perpSide = PerpOrderSide.ask
            const clientOrderId = Date.now()
            tradeInstructions.push(await client.perpPlaceOrderPeggedV2Ix(
                group,
                mangoAccount!,
                perpMarket.perpMarketIndex,
                PerpOrderSide.ask,
                sellPriceBuffer,// price Offset
                toFixedFloor(sellPerpSize),// size
                undefined, //piglimit
                undefined,//maxQuoteQuantity,
                clientOrderId,//clientOrderId,
                PerpOrderType.limit,
                PerpSelfTradeBehavior.cancelProvide,
                false, //reduceOnly
                undefined, //expiryTimestamp,
                undefined // limit
            ))
            db.addOpenTransaction({
                account: accountDefinition.name,
                side: Side.SELL,
                price: perpPrice + 1 * buyPriceBuffer,
                size: toFixedFloor(sellPerpSize),
                error: 'Pending',
                type: 'PERP',
                date: new Date(),
                market,
                orderId: clientOrderId
            })
            orderIds.push(clientOrderId)
        }

        if (numOrders > 1 && (buyPerpSize > 0 || sellPerpSize > 0)) {
            const cancelInstructions = await client.perpCancelAllOrdersIx(group, mangoAccount, perpMarket.perpMarketIndex, 5);
            tradeInstructions.unshift(cancelInstructions)
        }
        console.log(`${accountDefinition.name} ${market} PERP ${perpSide === PerpOrderSide.bid ? Side.BUY : Side.SELL}`)
        console.log(`   sellPerpSize=`, sellPerpSize)
        console.log(`   buyPerpSize=`, buyPerpSize)
        console.log(`   Oracle=`, perpPrice)
    }

    return { tradeInstructions, addressLookupTables, orderIds }

}

export const postTrades = async (accountName: string, tradeInstructions: any, client: MangoClient, group: Group, addressLookupTables: any, addDelay: boolean, orderIds:Array<number>) => {
    try {

        if (tradeInstructions.length > 0) {
            db.incrementOpenTransactions()
            
            const request = client.sendAndConfirmTransactionForGroup(
                group,
                tradeInstructions,
                { alts: [...group.addressLookupTablesList, ...addressLookupTables] },
            );

            const timeout = new Promise((resolve, reject) => {
                const id = setTimeout(() => {
                    clearTimeout(id);
                    reject(new Error('Timed out'));
                }, TRADE_TIMEOUT * 1000); // 75 seconds timeout
            });
            const sig: any = await Promise.race([timeout, request])
            console.log(`*** ${accountName} TX COMPLETE:`, `https://explorer.solana.com/tx/${sig.signature}`);
            console.log(`sig = ${sig.signature}`)

            for (let orderId of orderIds) {
                await db.updateOpenTransaction(orderId, 'COMPLETE')
            }

            // sleep to allow perp trade to settle
            if (addDelay) {
                await new Promise(resolve => setTimeout(resolve, POST_TRADE_TIMEOUT * 1000));
            }
        }
    } catch (e: any) {
        const errorMessage = await handleError(e)
        for (let orderId of orderIds) {
            await db.updateOpenTransaction(orderId, 'ERROR: '+ errorMessage)
        }
    }
}