
// console.log("migration script invoked")
// console.log(anchor.AnchorProvider.env());
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { fetchAccount, fetchOrCreateAccount, findAddress } from 'utils/dist/utils';
import {
    AMOUNT_DECIMALS,
    CHAINLINK_PROGRAM,
    EXCHANGE_LEVERAGE,
    EXCHANGE_POSITIONS,
    FEE_DECIMALS,
    LEVERAGE_DECIMALS,
    MARKETS,
    MARKET_LEVERAGE,
    MARKET_WEIGHT_DECIMALS,
    NETWORK,
    REWARD_FREQUENCY,
    REWARD_RATE,
    MAKER_FEE,
    TAKER_FEE,
    MARKET_WEIGHT
} from 'utils/src/constants';
import { Krunch } from "../target/types/krunch";
const { getOrCreateAssociatedTokenAccount, getMint, createMintToInstruction } = require("@solana/spl-token");


const addMarkets = async function (provider: any, program: any) {
    const _takerFee = TAKER_FEE;
    const _makerFee = MAKER_FEE;
    const _marketWeight = 1
    const markets = MARKETS

    for (const m of markets) {
        const marketIndex = m.marketIndex;
        const address = new PublicKey(m.feedAddress);
        const market: any = await fetchOrCreateAccount(
            program,
            'market',
            ['market', marketIndex],
            'addMarket', [
            marketIndex,
            new anchor.BN(_takerFee * FEE_DECIMALS),
            new anchor.BN(_makerFee * FEE_DECIMALS),
            new anchor.BN(MARKET_LEVERAGE * LEVERAGE_DECIMALS),
            new anchor.BN(_marketWeight * MARKET_WEIGHT_DECIMALS),
            address],
            {
                exchange: await findAddress(program, ['exchange']),
            });
        console.log("market created ", market.marketIndex.toString());
    }
}

const addExchangePositions = async function (provider: any, program: any) {
    for (const tokenMint of EXCHANGE_POSITIONS) {
        const exchangePosition: any = await fetchOrCreateAccount(program,
            'exchangeTreasuryPosition',
            ['exchange_position',
                tokenMint.mint
            ],
            'addExchangePosition',
            [tokenMint.mint, true, new anchor.BN(MARKET_WEIGHT * MARKET_WEIGHT_DECIMALS),
            new anchor.BN(tokenMint.decimals),
            tokenMint.feedAddress
            ],
            {
                admin: provider.wallet.publicKey,
                exchange: await findAddress(program, ['exchange']),
            });
        console.log('exchangePosition', exchangePosition.tokenMint.toString());

        await program?.methods.
            updateExchangePosition(
                tokenMint.mint,
                true,
                new anchor.BN(MARKET_WEIGHT * MARKET_WEIGHT_DECIMALS),
                new anchor.BN(tokenMint.decimals),
                tokenMint.feedAddress).
            accounts({
                exchangeTreasuryPosition: await findAddress(program, ['exchange_position', tokenMint.mint]),
                exchange: await findAddress(program, ['exchange']),
                owner: provider.wallet.publicKey,
            }).rpc();
    }

}


const initializeKrunch = async function (provider: any, program: any) {
    let slotsIn24Hours = REWARD_FREQUENCY;
    const exchange: any = await fetchOrCreateAccount(program, 'exchange', ['exchange'],
        'initializeExchange', [
        EXCHANGE_LEVERAGE * LEVERAGE_DECIMALS,
        new anchor.BN(slotsIn24Hours),
        new anchor.BN(REWARD_RATE),
        NETWORK === 'Localnet']
        );
    console.log("ONWER ADDRESS", provider.wallet.publicKey.toString());
    console.log("exchange collateralValue", exchange.collateralValue.toString());
    await addMarkets(provider, program);
    const marketIndex = 1;

    const userAccount = await fetchOrCreateAccount(program, 'userAccount',
        ['user_account',
            provider.wallet.publicKey],
        'createUserAccount', []);
    console.log("userAccount", userAccount.pnl.toString());

    const userPosition: any = await fetchOrCreateAccount(program, 'userPosition',
        ['user_position',
            provider.wallet.publicKey,
            marketIndex],
        'addUserPosition', [new anchor.BN(marketIndex)],
        {
            userAccount: await findAddress(program, ['user_account', provider.wallet.publicKey]),
            market: await findAddress(program, ['market', marketIndex]),
        });
    console.log('createUserPosition', userPosition.pnl.toString());

    await addExchangePositions(provider, program);

};


const mintTokens = async function (provider: any) {
    const payer = (provider.wallet as anchor.Wallet).payer;
    console.log("mintTokens owner", payer.publicKey.toString())


    for (const token of EXCHANGE_POSITIONS) {
        console.log("minting tokens token", token.market)
        const mint = await getMint(provider.connection, new PublicKey(token.mint))
        console.log("SUPPLY", mint.supply.toString())

        let tokenAccount = await getOrCreateAssociatedTokenAccount(
            provider.connection, //connection
            payer, //payer
            token.mint, //mint
            payer.publicKey, //owner
        )
        console.log('usdcTokenAccount address', tokenAccount.address.toString())
        console.log('usdcTokenAccount Owner', tokenAccount.owner.toString())
        console.log('usdcTokenAccount payer', payer.publicKey.toString())

        //mint tokens
        const mintTokenTX = new anchor.web3.Transaction();
        mintTokenTX.add(createMintToInstruction(
            token.mint,
            tokenAccount.address,
            payer.publicKey,
            1000 * 10 ** mint.decimals, //1000 usdc tokens
        ));
        await provider.sendAndConfirm(mintTokenTX,);
    }
}

const deposit = async function (provider: any,
    program: any,
    mint: PublicKey,
    feed: PublicKey,
    amount: number) {
    const payer = (provider.wallet as anchor.Wallet).payer;
    let tokenAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection, //connection
        payer, //payer
        mint, //mint
        payer.publicKey, //owner
    )
    let userBalance = await provider.connection.getTokenAccountBalance(tokenAccount.address)
    console.log("userBalance Before", userBalance.value.amount);

    const exchangeAddress = await findAddress(program, ['exchange'])
    const escrowDepositAccount = await findAddress(program, [
        exchangeAddress,
        mint])
    console.log("escrowDepositAccount", escrowDepositAccount.toString())

    let tx = await program.methods.deposit(new anchor.BN(amount * AMOUNT_DECIMALS)).accounts({
        userTokenAccount: new PublicKey(tokenAccount.address.toString()),
        mint: mint,
        exchange: exchangeAddress,
        escrowAccount: escrowDepositAccount,
        userAccount: await findAddress(program, ['user_account', provider.wallet.publicKey]),
        exchangeTreasuryPosition: await findAddress(program, ['exchange_position', mint]),
        owner: provider.wallet.publicKey,
        chainlinkFeed: feed,
        chainlinkProgram: CHAINLINK_PROGRAM,
    }).rpc();
    console.log("deposit", tx);

    let programBalance = await provider.connection.getTokenAccountBalance(escrowDepositAccount)

    const acct: any = await fetchAccount(program, 'userAccount', ['user_account', provider.wallet.publicKey]);
    console.log('deposit', acct.collateralValue.toString())

    userBalance = await provider.connection.getTokenAccountBalance(tokenAccount.address)
    console.log("userBalance After deposit", userBalance.value.amount);

    programBalance = await provider.connection.getTokenAccountBalance(escrowDepositAccount)
    console.log("programBalance After deposit", programBalance.value.amount);
}

const setupAccounts = async function (provider: any, program: any) {
    if (NETWORK === 'Localnet') {
        await mintTokens(provider);
    }
    //await deposit(provider, program, USDC_MINT, USDC_USD_FEED, 100);
    //  await deposit(provider, program, SOL_MINT, SOL_USD_FEED, 100);
};

(async () => {
    const provider = anchor.AnchorProvider.env();
    console.log("provider rpcEndpoint", provider.connection.rpcEndpoint)
    try {
        const program = anchor.workspace.Krunch as Program<Krunch>;
        const hash = await provider.connection.getLatestBlockhash();
        console.log("hash", hash)


        let slotsIn24Hours = REWARD_FREQUENCY;
        const exchange: any = await fetchOrCreateAccount(program, 'exchange', ['exchange'],
        'initializeExchange', [
        EXCHANGE_LEVERAGE * LEVERAGE_DECIMALS,
        new anchor.BN(slotsIn24Hours),
        new anchor.BN(REWARD_RATE)]);
        console.log("ONWER ADDRESS", provider.wallet.publicKey.toString());
        console.log("exchange collateralValue", exchange.collateralValue.toString());
       
        await initializeKrunch(provider, program);
        await setupAccounts(provider, program);
    } catch (e) {
        console.log("error", e.message)
        console.log(e)
    }
})();
