import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Krunch } from "../target/types/krunch";
import { expect } from 'chai'
import { PublicKey, Keypair } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createMint,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
} from "@solana/spl-token"

console.log("TOKEN_PROGRAM_ID", TOKEN_PROGRAM_ID.toString())
console.log("ASSOCIATED_TOKEN_PROGRAM_ID", ASSOCIATED_TOKEN_PROGRAM_ID.toString())
const PRICE_DECIMALS = 10 ** 9;
const FEE_DECIMALS = 10 ** 4;
const MARKET_WEIGHT_DECIMALS = 10 ** 4;
const AMOUNT_DECIMALS = 10 ** 9;
const LEVERAGE_DECIMALS = 10 ** 4;

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

describe("krunch", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Krunch as Program<Krunch>;
  const pg = anchor.AnchorProvider.env()
  it("Calculate", async () => {
    // Add your test here.
    const tx = await program.methods.calculate().accounts({
    }).view();
    console.log("calculate", tx.toNumber());
  });

  it("CalculateFee", async () => {
    // Add your test here.
    const tx = await program.methods.calculateFee(
      new anchor.BN(100 * PRICE_DECIMALS),
      new anchor.BN(1 * AMOUNT_DECIMALS),
      new anchor.BN(.02 * FEE_DECIMALS))
      .accounts({
      }).view();
    console.log("CalculateFee", tx.toNumber() / AMOUNT_DECIMALS);
    expect(tx.toNumber(), 'CalculateFee').to.equal(-2 * PRICE_DECIMALS);
  });


  it("Is initialized!", async () => {

    const exchangeBuffer = Buffer.from("exchange");
    const [exchange, _exchangeBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [exchangeBuffer],
        program.programId
      );
    const tx = await program.methods.initializeExchange().accounts({
      exchange
    }).rpc();
    console.log("Your transaction signature", tx);
  });

  it("create_user_account", async () => {
    const [userAccount] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from("user_account"),
          pg.wallet.publicKey.toBuffer()
        ],
        program.programId
      );
    const tx = await program.methods.createUserAccount().accounts({
      userAccount,

    }).rpc();
    console.log("create_user_account transaction signature", tx);
  });

  it("Add Market", async () => {
    // Add your test here.
    const market_index = 1;
    const tx = await program.methods.addMarket(1,
      .1 * FEE_DECIMALS,
      -.1 * FEE_DECIMALS,
      1 * LEVERAGE_DECIMALS,
      .1 * MARKET_WEIGHT_DECIMALS).accounts({
        market: await findAddress(program, ["market", market_index]),
        exchange: await findAddress(program, ["exchange"])
      }).rpc();
    console.log("Your transaction signature", tx);
  });

  it("Update Price", async () => {
    const market_index = 1;
    const market = await findAddress(program, ["market", market_index])
    const tx = await program.methods.updateMarket(
      1
      , new anchor.BN(10 * PRICE_DECIMALS)
      , .1 * FEE_DECIMALS
      , .1 * FEE_DECIMALS
      , 1 * LEVERAGE_DECIMALS
      , .1 * MARKET_WEIGHT_DECIMALS
    ).accounts({
      market
    }).rpc();
    console.log("Your transaction signature", tx);
    const marketUpdated = await program.account.market.fetch(market);
    console.log("market currentPrice is: ", marketUpdated.currentPrice.toNumber());
    expect(marketUpdated.currentPrice.toNumber(), 'market currentPrice should be 10').to.equal(10 * PRICE_DECIMALS);
  });

  it("Add User Position", async () => {
    const market_index = 1;
    const tx = await program.methods.addUserPosition(1).accounts({
      userPosition: await findAddress(program, ["user_position", pg.wallet.publicKey, market_index]),
      userAccount: await findAddress(program, ["user_account", pg.wallet.publicKey]),
      market: await findAddress(program, ["market", market_index])
    }).rpc();
    console.log("Your transaction signature", tx);
  });

  it("execute_trade 1", async () => {
    const market_index = 1;

    const userPosition = await findAddress(program, ["user_position", pg.wallet.publicKey, market_index])
    const userAccount = await findAddress(program, ["user_account", pg.wallet.publicKey])
    const market = await findAddress(program, ["market", market_index])
    const exchange = await findAddress(program, ["exchange"])

    const tx = await program.methods.executeTrade(1, new anchor.BN(4 * AMOUNT_DECIMALS)).accounts({
      userPosition,
      userAccount,
      market,
      exchange

    }).rpc();
    console.log("execute_trade transaction signature", tx);

    const exchangeUpdated = await program.account.exchange.fetch(exchange);
    console.log("exchange basis: ", exchangeUpdated.basis.toNumber());
    console.log("exchange fees: ", exchangeUpdated.fees.toNumber());

    const userAccountUpdated = await program.account.userAccount.fetch(userAccount);
    console.log("userAccount collateralValue: ", userAccountUpdated.collateralValue.toNumber());
    console.log("userAccount fees: ", userAccountUpdated.fees.toNumber());

    const marketUpdated = await program.account.market.fetch(market);
    console.log("market tokenAmount is: ", marketUpdated.tokenAmount.toNumber());
    console.log("market basis is: ", marketUpdated.basis.toNumber());
    console.log("market fees is: ", marketUpdated.fees.toNumber());
    expect(marketUpdated.tokenAmount.toNumber(), 'market tokenAmount should be 4').to.equal(4 * AMOUNT_DECIMALS);

    const userPositionUpdated = await program.account.userPosition.fetch(userPosition);
    console.log("userPositionUpdated tokenAmount is: ", userPositionUpdated.tokenAmount.toNumber());
    console.log("userPositionUpdated basis: ", userPositionUpdated.basis.toNumber());
    console.log("userPositionUpdated fees: ", userPositionUpdated.fees.toNumber());
    expect(userPositionUpdated.tokenAmount.toNumber(), 'userPositionUpdated tokenAmount should be 4').to.equal(4 * AMOUNT_DECIMALS);

  });


  it("execute_trade 2", async () => {
    const market_index = 1;

    const userPosition = await findAddress(program, ["user_position", pg.wallet.publicKey, market_index])
    const userAccount = await findAddress(program, ["user_account", pg.wallet.publicKey])
    const market = await findAddress(program, ["market", market_index])
    const exchange = await findAddress(program, ["exchange"])

    await program.methods.updateMarket(
      1
      , new anchor.BN(10 * PRICE_DECIMALS)
      , .1 * FEE_DECIMALS
      , .1 * FEE_DECIMALS
      , 1 * LEVERAGE_DECIMALS
      , .1 * MARKET_WEIGHT_DECIMALS
    ).accounts({
      market
    }).rpc();

    const tx = await program.methods.executeTrade(1, new anchor.BN(-4 * AMOUNT_DECIMALS)).accounts({
      userPosition,
      userAccount,
      market,
      exchange

    }).rpc();
    console.log("execute_trade transaction signature", tx);

    const exchangeUpdated = await program.account.exchange.fetch(exchange);
    console.log("exchange basis: ", exchangeUpdated.basis.toNumber());
    console.log("exchange fees: ", exchangeUpdated.fees.toNumber());

    const userAccountUpdated = await program.account.userAccount.fetch(userAccount);
    console.log("userAccount collateralValue: ", userAccountUpdated.collateralValue.toNumber());
    console.log("userAccount fees: ", userAccountUpdated.fees.toNumber());

    const marketUpdated = await program.account.market.fetch(market);
    console.log("market tokenAmount is: ", marketUpdated.tokenAmount.toNumber());
    console.log("market basis is: ", marketUpdated.basis.toNumber());
    console.log("market fees is: ", marketUpdated.fees.toNumber());
    expect(marketUpdated.tokenAmount.toNumber(), 'market tokenAmount should be 4').to.equal(4);

    const userPositionUpdated = await program.account.userPosition.fetch(userPosition);
    console.log("userPositionUpdated tokenAmount is: ", userPositionUpdated.tokenAmount.toNumber());
    console.log("userPositionUpdated basis: ", userPositionUpdated.basis.toNumber());
    console.log("userPositionUpdated fees: ", userPositionUpdated.fees.toNumber());
    expect(userPositionUpdated.tokenAmount.toNumber(), 'userPositionUpdated tokenAmount should be 4').to.equal(4);

  });

});
