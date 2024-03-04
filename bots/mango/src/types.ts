import {
    Bank, PerpMarket,
    MangoAccount, MangoClient, Group
} from '@blockworks-foundation/mango-v4';
import {
    Keypair, PublicKey
} from '@solana/web3.js';

export type TotalAccountFundingItem = {
    long_funding: number
    short_funding: number
  }
  
  
export type AccountDetail = {
    account: string;
    name: string,
    jupBasis: number;
    fundingAmount: number;
    interestAmount: number;
    solAmount: number;
    borrow: number;
    usdBasis: number;
    funding: number;
    health: number;
    equity: number;
    solPrice: number;
    solBalance: number;
    usdcBalance: number;
    solBank: Bank;
    usdcBank: Bank;
    perpMarket: PerpMarket;
    bestBid: number;
    bestAsk: number;
    historicalFunding:number
};

export type AccountDefinition = {
    name: string,
    key: string;
    usd: number;
    jup: number;
    privateKey: string;
    healthThreshold: number;
    canTrade:boolean
};
export type PendingTransaction = {
    promise: Promise<any>,
    type: 'PERP' | 'SWAP' | 'CANCEL',
    accountName: string,
    side: 'BUY' | 'SELL',
    amount: number,
    price: number,
    oracle: number
}

export class TokenAccount {
    publicKey!: PublicKey
    mint!: PublicKey
    owner!: PublicKey
    amount!: number
    decimals!: number
    uiAmount: number
  
    constructor(
      publicKey: PublicKey,
      decoded: {
        mint: PublicKey
        owner: PublicKey
        amount: number
        decimals: number
        uiAmount: number
      },
    ) {
      this.publicKey = publicKey
      this.uiAmount = 0
      Object.assign(this, decoded)
    }
  }

export type Client = {
    client: MangoClient,
    user: Keypair,
    mangoAccount?: MangoAccount,
    group: Group,
    ids: any
}

export interface TotalInterestDataItem {
    borrow_interest: number
    deposit_interest: number
    borrow_interest_usd: number
    deposit_interest_usd: number
    symbol: string
}

export interface SnipeResponse {
    promises: Array<PendingTransaction>,
    accountDetails?: AccountDetail
}

