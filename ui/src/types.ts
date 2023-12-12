import { PublicKey } from "@solana/web3.js";

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

export type ExchangeBalance = {
    mint: PublicKey,
    market:string,
    balance:number,
    decimals:number,
}

export type UserPosition = {
    owner: PublicKey,
    market:string,
    marketIndex:number,
    basis?:number,
    fees?:number,
    tokenAmount?:number,
    pnl?:number,
}