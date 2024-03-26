
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
import {
    JUPITER_SPOT_SLIPPAGE,
    JUPITER_V6_QUOTE_API_MAINNET,
    MIN_SOL_WALLET_BALANCE,
    PERP_PRICE_BUFFER,
    SOL_MINT,
    SOL_PRICE_SPOT_DIFF_SLIPPAGE,
    SOL_RESERVE,
    SWAP_ONLY_DIRECT_ROUTES
} from './constants';
import * as db from './db';
import { getBidsAndAsks, sleep, toFixedFloor } from './mangoUtils';
import {
    AccountDefinition,
    PendingTransaction
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
    solPrice: number) => {

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

        let priceDiff = price - solPrice
        if (side === 'SELL') {
            priceDiff = solPrice - price
        }

        const slippage = (SOL_PRICE_SPOT_DIFF_SLIPPAGE / 100) * solPrice
        console.log(`Price Diff: ${priceDiff}`)
        if (priceDiff > slippage) {
            throw new Error(`Price diff too high: ${priceDiff}.  Oracle=${solPrice}  Swap=${price}  SwapPrice=${amount}  Side=${side}  Account=${accountDefinition.name}  `)
        }

        console.log(`*** ${accountDefinition.name} MARGIN ${side}: `, amount, "Oracle: ", solPrice, "Price: ", price, "Amount In: ", bestRoute.inAmount, "Amount Out: ", bestRoute.outAmount)
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
        db.incrementItem(db.DB_KEYS.NUM_TRADES_SUCCESS, { cacheKey: swap.type + '-SUCCESS' })
        return sig.signature
    } catch (e: any) {
        swap.status = 'FAILED'
        console.error(`Error in spotTrade: ${e.message} Account=${accountDefinition.name}  Type=${swap.type}  Amount=${amount}  Oracle=${solPrice}  Price=${swap.price}  Side=${side}  `)
        db.setItem(db.DB_KEYS.SWAP, swap, { cacheKey })
        db.incrementItem(db.DB_KEYS.NUM_TRADES_FAIL, { cacheKey: swap.type + '-FAIL' })
    }
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

    const healthRemainingAccounts: PublicKey[] =
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

export const getBestPrice = async (side: "BUY" | "SELL", spotAmount: number, inBank: Bank, outBank: Bank) => {
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

    let price = (bestRoute.outAmount / 10 ** outBank.mintDecimals) / (bestRoute.inAmount / 10 ** inBank.mintDecimals)
    if (side === 'BUY') {
        price = (bestRoute.inAmount / 10 ** inBank.mintDecimals) / (bestRoute.outAmount / 10 ** outBank.mintDecimals)
    }

    return {
        bestRoute,
        price
    };
}

export const getTradePossibilities = async (
    name:string,
    client: MangoClient,
    group: Group,
    oraclePrice: number,
    tradeSize: number,
    usdcBank: Bank,
    solBank: Bank) => {
    const values = group.perpMarketsMapByMarketIndex.values()
    const perpMarket: any = Array.from(values).find((perpMarket: any) => perpMarket.name === 'SOL-PERP');
    const orderBook = await getBidsAndAsks(perpMarket, client);
    const buyPerpDiscount = oraclePrice - orderBook.bestAsk;
    const sellPerpDiscount = orderBook.bestBid - oraclePrice;

    // specify a minimum quote amount
    const quoteAmount = Math.max(tradeSize, 0.001)

    const { price: buySpotPrice, bestRoute: bestBuyRoute } = await getBestPrice('BUY', quoteAmount * oraclePrice, usdcBank, solBank)
    const { price: sellSpotPrice, bestRoute: bestSellRoute } = await getBestPrice('SELL', quoteAmount, solBank, usdcBank)

    const buySpotDiscount = sellSpotPrice - oraclePrice;
    const sellSpotDiscount = oraclePrice - sellSpotPrice;

    // buy scenario
    const perpBuy = orderBook.bestAsk;
    const spotSell = sellSpotPrice;
    const buyPerpSellSpot = spotSell - perpBuy - PERP_PRICE_BUFFER;
    // sell scenario
    const perpSell = orderBook.bestBid;
    const spotBuy = buySpotPrice;
    const sellPerpBuySpot = perpSell - spotBuy - PERP_PRICE_BUFFER;

    console.log('*** '+name+' ***')
    console.log('Best Bid: ', orderBook.bestBid, orderBook.bestBid > oraclePrice ? '***' : '')
    console.log('Oracle Price: ', oraclePrice)
    console.log('Best Ask: ', orderBook.bestAsk, orderBook.bestAsk < oraclePrice ? '***' : '')
    console.log('Max Sell Size: ', orderBook.bestBidSize)
    console.log('Max Buy Size: ', orderBook.bestAskSize)
    console.log(name+' Buy Scenario: ', buyPerpSellSpot)
    console.log('   spotSell', spotSell, sellSpotDiscount)
    console.log('   perpBuy', perpBuy, buyPerpDiscount)
    console.log(name+' Sell Scenario: ', sellPerpBuySpot)
    console.log('   perpSell', perpSell, sellPerpDiscount)
    console.log('   spotBuy', spotBuy, buySpotDiscount)


    return {
        buyPerpDiscount,
        sellPerpDiscount,
        buySpotDiscount,
        sellSpotDiscount,
        buyDiscount: buyPerpDiscount + buySpotDiscount,
        sellDiscount: sellPerpDiscount + sellSpotDiscount,
        maxBuySize: orderBook.bestAskSize,
        maxSellSize: orderBook.bestBidSize,
        bestBuyRoute,
        bestSellRoute,
        buyPerpSellSpot,
        sellPerpBuySpot,
        buySpotPrice,
        sellSpotPrice,
        bestAsk: orderBook.bestAsk,
        bestBid: orderBook.bestBid
    }
}

export const checkPrice = (oraclePrice: number, spotPrice: number, side: 'BUY' | 'SELL') => {
    let priceDiff = spotPrice - oraclePrice
    if (side === 'SELL') {
        priceDiff = oraclePrice - spotPrice
    }
    const slippage = (SOL_PRICE_SPOT_DIFF_SLIPPAGE / 100) * oraclePrice
    console.log(`Price Diff: ${priceDiff}`)
    if (priceDiff > slippage) {
        throw new Error(`Price diff too high: ${priceDiff}.  Oracle=${oraclePrice}  Swap=${spotPrice}  Side=${side}`)
    }

}

export const spotAndPerpSwap = async (
    spotAmount: number,
    inBank: Bank,
    outBank: Bank,
    client: MangoClient,
    mangoAccount: MangoAccount,
    user: Keypair,
    group: Group,
    spotSide: 'BUY' | 'SELL',
    accountDefinition: AccountDefinition,
    solPrice: number,
    perpSize: number,
    perpPrice: number,
    perpSide: PerpOrderSide,
    bestRoute: any,
    spotPrice: any,
    perpBestPrice: any,
    walletSol: number) => {

    try {
        let doPerp = perpSize > 0
        let doSpot = spotAmount > 0
        let tradeInstructions: any = []
        let addressLookupTables: any = []

        console.log(`***** ${accountDefinition.name} spotAndPerpSwap *****`)

        // CHECK WALLET
        if (walletSol < MIN_SOL_WALLET_BALANCE) {
            const borrowAmount = SOL_RESERVE - walletSol
            const mintPk = new PublicKey(SOL_MINT)
            const borrowAmountBN = toNative(borrowAmount, group.getMintDecimals(mintPk));
            const ix = await client.tokenWithdrawNativeIx(group, mangoAccount, mintPk, borrowAmountBN, true)
            tradeInstructions.push(...ix)
        } else {
            // SPOT TRADE
            if (doSpot) {
                checkPrice(solPrice, spotPrice, spotSide)
                const [ixs, alts] = await fetchJupiterTransaction(
                    client.connection,
                    bestRoute,
                    user.publicKey,
                    inBank.mint,
                    outBank.mint
                );

                const amountIn = bestRoute.inAmount / 10 ** inBank.mintDecimals
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
                console.log(`${accountDefinition.name} SPOT ${spotSide}`)
                console.log(`  Price=`, spotPrice)
                console.log(`  Amount=`, spotAmount)
                console.log(`  Oracle=`, solPrice)
            }

            // PERP TRADE
            if (doPerp) {
                checkPrice(solPrice, perpPrice, perpSide === PerpOrderSide.bid ? 'BUY' : 'SELL')
                // determine perp amount
                const values = group.perpMarketsMapByMarketIndex.values()
                const perpMarket: any = Array.from(values).find((perpMarket: any) => perpMarket.name === 'SOL-PERP');

                const cancelInstructions = await client.perpCancelAllOrdersIx(group, mangoAccount, perpMarket.perpMarketIndex, 5);
                tradeInstructions.push(cancelInstructions)

                const instructions = await client.perpPlaceOrderV2Ix(group,
                    mangoAccount,
                    perpMarket.perpMarketIndex, //perpMarketIndex
                    perpSide,
                    toFixedFloor(perpPrice),//price
                    toFixedFloor(perpSize),//quantity
                    undefined,//maxQuoteQuantity
                    Date.now(),//clientOrderId
                    PerpOrderType.limit,
                    PerpSelfTradeBehavior.cancelProvide,
                    false,//reduceOnly
                    undefined,//expiryTimestamp
                    undefined,//limit
                )
                tradeInstructions.push(instructions)
                console.log(`${accountDefinition.name} PERP ${perpSide === PerpOrderSide.bid ? "BUY" : "SELL"}`)
                console.log(`   Price=`, perpPrice)
                console.log(`   BestPrice=`, perpBestPrice)
                console.log(`   Amount=`, perpSize)
                console.log(`   Oracle=`, solPrice)
            }
        }

        if (tradeInstructions.length > 0) {
            db.incrementOpenTransactions()
            const sig = await client.sendAndConfirmTransactionForGroup(
                group,
                tradeInstructions,
                { alts: [...group.addressLookupTablesList, ...addressLookupTables] },
            );
            console.log(`*** ${accountDefinition.name} ${spotSide} COMPLETE:`, `https://explorer.solana.com/tx/${sig.signature}`);
            console.log(`sig = ${sig.signature}`)

            // sleep for 30 seconds to allow perp trade to settle
            await new Promise(resolve => setTimeout(resolve, 30 * 1000));
        }
    } catch (e: any) {
        console.error(`Error in comp trade: ${e.message} Account=${accountDefinition.name}  Amount=${spotAmount}  Oracle=${solPrice}  Side=${spotSide}  `)
        try{
            const eValue = JSON.parse(e.message)
            if (eValue.value.err.InstructionError[1].Custom === 1){
                console.log('Custom InstructionError.  Trying again in 30 seconds')
                await sleep(30*1000)
            }else if (eValue.value.err.InstructionError[1].Custom === 6001){
                console.log('Slippage exceeded for Spot Price:', spotPrice)
             
            }
        }catch(ex:any){
            console.error(`Error in comp trade: ${ex.message} Account=${accountDefinition.name}  Amount=${spotAmount}  Oracle=${solPrice}  Side=${spotSide}  `)
        }
    }
}