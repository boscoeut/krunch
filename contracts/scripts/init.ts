
// console.log("migration script invoked")
// console.log(anchor.AnchorProvider.env());
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { Krunch } from "../target/types/krunch";
const { getOrCreateAssociatedTokenAccount, getMint, createMintToInstruction } = require("@solana/spl-token");
import {USDC_MINT,ETH_MINT,ETH_USD_FEED, CHAINLINK_PROGRAM,
    PRICE_DECIMALS,
    FEE_DECIMALS,
    MARKET_WEIGHT_DECIMALS,
    AMOUNT_DECIMALS,
    LEVERAGE_DECIMALS,
    SOL_MINT,
    USDT_MINT,
    BTC_MINT,
    SOL_USD_FEED,
    USDC_USD_FEED,
    USDT_USD_FEED,
    BTC_USD_FEED,
    EXCHANGE_POSITIONS
} from 'utils/src/constants'
import { findAddress, fetchOrCreateAccount, fetchAccount } from 'utils/src/utils'


const addMarkets = async function (provider: any, program: any) {
    const _takerFee = 0.2;
    const _makerFee = 0.1;
    const _leverage = 1;
    const _marketWeight = 0.1
    const markets = [{
        index: 1,
        address: SOL_USD_FEED,
    }, {
        index: 2,
        address: BTC_USD_FEED
    }]
    for (const m of markets) {
        const marketIndex = m.index;
        const address = m.address;
        const market: any = await fetchOrCreateAccount(
            program,
            'market',
            ['market', marketIndex],
            'addMarket', [
            marketIndex,
            new anchor.BN(_takerFee * FEE_DECIMALS),
            new anchor.BN(_makerFee * FEE_DECIMALS),
            new anchor.BN(_leverage * LEVERAGE_DECIMALS),
            new anchor.BN(_marketWeight * MARKET_WEIGHT_DECIMALS),
            address],
            {
                exchange: await findAddress(program, ['exchange']),
            });
        console.log("market", market.pnl.toString());
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
            [tokenMint.mint, true, new anchor.BN(0.1 * MARKET_WEIGHT_DECIMALS),
            new anchor.BN(tokenMint.decimals),
            tokenMint.feedAddress
            ],
            {
                admin: provider.wallet.publicKey,
            });
        console.log('exchangePosition', exchangePosition.tokenMint.toString());

        await program?.methods.
            updateExchangePosition(
                tokenMint.mint,
                true,
                new anchor.BN(0.1 * MARKET_WEIGHT_DECIMALS),
                new anchor.BN(tokenMint.decimals),
                tokenMint.feedAddress).
            accounts({
                exchangeTreasuryPosition: await findAddress(program, ['exchange_position', tokenMint.mint]),
                owner: provider.wallet.publicKey,
            }).rpc();
    }

}


const initializeKrunch = async function (provider: any, program: any) {
    const exchange: any = await fetchOrCreateAccount(program, 'exchange', ['exchange'], 'initializeExchange', []);
    console.log("ONWER ADDRESS", provider.wallet.publicKey.toString());
    console.log("exchange", exchange.collateralValue.toString());
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

const setupAccounts = async function (provider: any, program: any) {
    const payer = (provider.wallet as anchor.Wallet).payer;

    await mintTokens(provider);
    let usdcTokenAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection, //connection
        payer, //payer
        USDC_MINT, //mint
        payer.publicKey, //owner
    )
    let userBalance = await provider.connection.getTokenAccountBalance(usdcTokenAccount.address)
    console.log("userBalance Before", userBalance.value.amount);

    const exchangeAddress = await findAddress(program, ['exchange'])
    const escrowAccount = await findAddress(program, [
        exchangeAddress,
        USDC_MINT])
    console.log("escrowAccount", escrowAccount.toString())

    // deposit
    const escrowDepositAccount = await findAddress(program, [
        exchangeAddress,
        USDC_MINT])
    console.log("escrowDepositAccount", escrowDepositAccount.toString())

    let tx = await program.methods.deposit(new anchor.BN(2000000000)).accounts({
        userTokenAccount: new PublicKey(usdcTokenAccount.address.toString()),
        mint: USDC_MINT,
        exchange: exchangeAddress,
        escrowAccount: escrowDepositAccount,
        userAccount: await findAddress(program, ['user_account', provider.wallet.publicKey]),
        exchangeTreasuryPosition: await findAddress(program, ['exchange_position', USDC_MINT]),
        owner: provider.wallet.publicKey,
        chainlinkFeed: USDC_USD_FEED,
        chainlinkProgram: CHAINLINK_PROGRAM,
    }).rpc();
    console.log("deposit", tx);

    let programBalance = await provider.connection.getTokenAccountBalance(escrowAccount)

    userBalance = await provider.connection.getTokenAccountBalance(usdcTokenAccount.address)
    console.log("userBalance After deposit", userBalance.value.amount);

    programBalance = await provider.connection.getTokenAccountBalance(escrowAccount)
    console.log("programBalance After deposit", programBalance.value.amount);

    const acct: any = await fetchAccount(program, 'userAccount', ['user_account', provider.wallet.publicKey]);
    console.log('deposit', acct.collateralValue.toString())

    // withdraw
    tx = await program.methods.withdraw(new anchor.BN(500000000)).accounts({
        userTokenAccount: new PublicKey(usdcTokenAccount.address.toString()),
        mint: USDC_MINT,
        exchange: exchangeAddress,
        escrowAccount: escrowDepositAccount,
        exchangeTreasuryPosition: await findAddress(program, ['exchange_position', USDC_MINT]),
        userAccount: await findAddress(program, ['user_account', provider.wallet.publicKey]),
        owner: provider.wallet.publicKey

    }).rpc();
    console.log("withdraw", tx);

    userBalance = await provider.connection.getTokenAccountBalance(usdcTokenAccount.address)
    console.log("userBalance After withdraw", userBalance.value.amount);

    programBalance = await provider.connection.getTokenAccountBalance(escrowAccount)
    console.log("programBalance After withdraw", programBalance.value.amount);
};

(async () => {
    const provider = anchor.AnchorProvider.env();
    try {
        const program = anchor.workspace.Krunch as Program<Krunch>;

        await initializeKrunch(provider, program);
        await setupAccounts(provider, program);
    } catch (e) {
        console.log(e)
    }
})();
