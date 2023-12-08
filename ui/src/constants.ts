import { PublicKey } from "@solana/web3.js";
export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
export const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
export const SOL_USD = "CH31Xns5z3M1cTAbKW34jcxPPciazARpijcHj9rxtemt"
export const BTC_USD = "Cv4T27XbjVoKUYwP72NQQanvZeA7W4YF9L4EnYT9kx5o"
export const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
export const CHAINLINK = "HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny"
export const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
export const CHAINLINK_PROGRAM ="HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny"
export const PRICE_DECIMALS = 10 ** 9;
export const FEE_DECIMALS = 10 ** 4;
export const MARKET_WEIGHT_DECIMALS = 10 ** 4;
export const AMOUNT_DECIMALS = 10 ** 9;
export const LEVERAGE_DECIMALS = 10 ** 4;

export type Market = {
    name:string,
    marketIndex:number,
    leverage?:number,
    marketWeight?:number,
    basis?:number,
    fees?:number,
    currentPrice?:number,
    makerFee?:number,
    takerFee?:number,
    marginUsed?:number,
    tokenAmount?:number,
    feedAddress:string,
}

export const markets = [{
    name:"SOL/USD",
    feedAddress:SOL_USD,
    marketIndex:1
},{
    name:"BTC/USD",
    feedAddress:BTC_USD,
    marketIndex:2
}]