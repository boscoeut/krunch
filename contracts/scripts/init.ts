
// console.log("migration script invoked")
// console.log(anchor.AnchorProvider.env());
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { Krunch } from "../target/types/krunch";

const PRICE_DECIMALS = 10 ** 9;
const FEE_DECIMALS = 10 ** 4;
const MARKET_WEIGHT_DECIMALS = 10 ** 4;
const AMOUNT_DECIMALS = 10 ** 9;
const LEVERAGE_DECIMALS = 10 ** 4;
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")

const findAddress = async (program: any, args: Array<String | PublicKey | Number>) => {
    const buffer = args.map((arg) => {
        if (typeof arg === 'string') {
            return Buffer.from(arg)
        } else if (arg instanceof PublicKey) {
            return arg.toBuffer()
        } else if (typeof arg === 'number') {
            return new anchor.BN(arg.toString()).toArrayLike(Buffer, "le", 2)
        } else {
            console.log("invalid type", arg)
            throw new Error("invalid type")
        }
    });
    const [account] =
        await anchor.web3.PublicKey.findProgramAddress(
            buffer,
            program.programId as any
        );
    return account
}

const fetchOrCreateAccount = async (program: any,
    name: string,
    seeds: Array<String | PublicKey | Number>,
    createMethod: string,
    args: Array<any>,
    additionalAccounts?: any) => {
    const address = await findAddress(program, seeds);
    try {
        const acct = await program.account[name].fetch(address);
        return acct;
    } catch (err) {
        console.log("Account not found: ", name);
        console.log('Initializing ' + name);
        const accounts = { [name]: address, ...(additionalAccounts || {}), }
        console.log('Initializing accounts ' + JSON.stringify(accounts));
        const tx = await program?.methods[createMethod](...args).accounts(accounts).rpc();
        console.log("fetchOrCreateAccount", tx);
        return await program.account[name].fetch(address);
    }
}

const fetchAccount = async (program: any, name: string, seeds: Array<String | PublicKey | Number>) => {
    const address = await findAddress(program, seeds);
    console.log('fetchAccount', name)
    const acct = await program.account[name].fetch(address);
    return acct;
}

const addMarkets = async function (provider: any, program: any) {
    const _takerFee = 0.2;
    const _makerFee = 0.1;
    const _leverage = 1;
    const _marketWeight = 0.1

    const marketIndex = 1;

    const markets = [{
        index: 1,
        address: "CH31Xns5z3M1cTAbKW34jcxPPciazARpijcHj9rxtemt",
    }, {
        index: 2,
        address: "Cv4T27XbjVoKUYwP72NQQanvZeA7W4YF9L4EnYT9kx5o"
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
            new PublicKey(address)],
            {
                exchange: await findAddress(program, ['exchange']),
            });
        console.log("market", market.pnl.toString());
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

    const tokenMint = USDC_MINT


    const exchangePosition: any = await fetchOrCreateAccount(program,
        'exchangeTreasuryPosition',
        ['exchange_position',
            tokenMint
        ],
        'addExchangePosition',
        [tokenMint, true, new anchor.BN(0.1 * MARKET_WEIGHT_DECIMALS),
            new anchor.BN(6)],
        {
            admin: provider.wallet.publicKey,
        });
    console.log('exchangePosition', exchangePosition.tokenMint.toString());

    const tx = await program?.methods.
        updateExchangePosition(tokenMint, true, new anchor.BN(0.1 * MARKET_WEIGHT_DECIMALS)).
        accounts({
            exchangeTreasuryPosition:await findAddress(program, ['exchange_position', tokenMint]),
        }).rpc();

};

const mintTokens = async function (provider: any, program: any) {
    const payer = (provider.wallet as anchor.Wallet).payer;
    const { getOrCreateAssociatedTokenAccount, getMint, createMintToInstruction } = require("@solana/spl-token");
    console.log("mintTokens owner", payer.publicKey.toString())
    // Configure client to use the provider.
    //create associated token account
    const mint = await getMint(provider.connection, new PublicKey(USDC_MINT))
    console.log("SUPPLY", mint.supply.toString())

    let usdcTokenAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection, //connection
        payer, //payer
        USDC_MINT, //mint
        payer.publicKey, //owner
    )
    console.log('usdcTokenAccount address', usdcTokenAccount.address.toString())
    console.log('usdcTokenAccount Owner', usdcTokenAccount.owner.toString())
    console.log('usdcTokenAccount payer', payer.publicKey.toString())

    //mint tokens
    const mintTokenTX = new anchor.web3.Transaction();
    mintTokenTX.add(createMintToInstruction(
        USDC_MINT,
        usdcTokenAccount.address,
        payer.publicKey,
        1000 * 10 ** 6, //1000 usdc tokens
    ));
    await provider.sendAndConfirm(mintTokenTX,);

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
        owner: provider.wallet.publicKey
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
        await mintTokens(provider, program);
    } catch (e) {
        console.log(e)
    }
})();
