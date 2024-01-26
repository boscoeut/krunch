import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

export type Market = {
    name:string,
    marketIndex:number,
    leverage?:number,
    marketWeight?:number,
    basis?:number,
    fees?:number,
    currentPrice?:number,
    makerFee?:number,
    pnl?:number,
    price?:number,
    takerFee?:number,
    marginUsed?:number,
    tokenAmount?:number,
    feedAddress:string,
    marketTotal?:number,
    rebates?:number,
    currValue?:number,
    unrealizedPnl?:number,
    entryPrice?:number, 
    marketTypeId?:number,
    marketType?:string,  
}

export type YieldMarket = {
    name:string,
    marketIndex:number,
    price?:number,   
    marketTypeId?:number,
    marketType?:string,  
    longTokenAmount?:anchor.BN,
    shortTokenAmount?:anchor.BN,
    longFunding?:anchor.BN,
    shortFunding?:anchor.BN,
    longBasis?:anchor.BN,
    shortBasis?:anchor.BN,
    currentLongValue?:number,
    userPosition?: UserYieldPosition
}

export type UserYieldPosition = {
    longTokenAmount?:anchor.BN,
    shortTokenAmount?:anchor.BN,
    longFunding?:anchor.BN,
    shortFunding?:anchor.BN,
    longBasis?:anchor.BN,
    shortBasis?:anchor.BN,
    currentLongValue?:number,
}



export type ExchangeBalance = {
    mint: PublicKey,
    market:string,
    balance:number,
    decimals:number,
    price?:number,
    currValue?:number,  
}

export type UserPosition = {
    owner: PublicKey,
    market:string,
    marketIndex:number,
    basis?:number,
    fees?:number,
    tokenAmount?:number,
    pnl?:number,
    rebates?:number,
    rewards?:number,
    currValue?:number,
    unrealizedPnl?:number,
    entryPrice?:number,

}


export type AppInfo = {
    appTitle: string,
    appSubTitle: string,
    docAppReference: string,
    appDescription: string,
    welcomeMessage: string,
    stableCoin: string,
    protocolName:string,
    pageTitle:string,
    pageDescription:string,
    logoColor:string,
    dangerColor:string,
    leverage:number,
    toolbarBackground:string,
    toolbarBorderColor: string,
  }