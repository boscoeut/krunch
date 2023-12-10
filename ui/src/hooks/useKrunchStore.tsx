import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { } from '@redux-devtools/extension' // required for devtools typing
import { markets, Market, UserPosition } from '../constants'
import { CHAINLINK_PROGRAM, USDC_MINT } from '../constants'
import * as anchor from "@coral-xyz/anchor";
import { getAssociatedTokenAddress, getMint } from "@solana/spl-token"

interface KrunchState {
  program: any,
  provider: any,
  exchangeStableBalance: number,
  userStableBalance: number,
  markets: Array<Market>,
  positions: Array<UserPosition>,
  userAccount: any,
  exchange: any,
  initialize: (program: any, provider: any) => void,
  refreshMarkets: (fetchAccount: any) => void,
  refreshPositions: (provider: any, fetchOrCreateAccount: any, findAddress: any) => void,
  refreshUserAccount: (provider: any, fetchOrCreateAccount: any) => void,
  refreshPool: (provider: any, fetchOrCreateAccount: any, findAddress: any) => void,
  getPrice: (program: any, feedAddress: string) => Promise<number>,
}

export const useKrunchStore = create<KrunchState>()((set, get) => ({
  initialize: (_program: any, _provider: any) => {
    set(() => ({
      program: _program,
      provider: _provider
    }))
  },
  program: {},
  provider: {},
  exchangeStableBalance: 0,
  userStableBalance: 0,
  markets,
  positions: [],
  userAccount: {},
  exchange: {},
  refreshMarkets: async (fetchAccount) => {
    let tempMarkets: Array<Market> = []
    for (const market of get().markets) {
      tempMarkets.push({ ...market, ...(await fetchAccount('market', ['market', market.marketIndex])) })
    }
    set(() => ({ markets: tempMarkets }))
  },
  refreshPositions: async (provider, fetchOrCreateAccount, findAddress) => {
    let temp: Array<UserPosition> = []
    for (const market of get().markets) {
      const acct: any = await fetchOrCreateAccount(get().program,'userPosition',
        ['user_position',
          provider.wallet.publicKey,
          market.marketIndex],
        'addUserPosition', [new anchor.BN(market.marketIndex)],
        {
          userAccount: await findAddress(get().program,['user_account', provider.wallet.publicKey]),
          market: await findAddress(get().program,['market', market.marketIndex]),
        });
      temp.push({ market: market.name, ...acct })
    }
    set(() => ({ positions: temp }))
  },
  refreshUserAccount: async (provider, fetchOrCreateAccount) => {
    let usdcTokenAccount = await getAssociatedTokenAddress(
      USDC_MINT, //mint
      provider.wallet.publicKey, //owner
    )

    let userBalance: any = await provider.connection.getTokenAccountBalance(usdcTokenAccount)
    const userAccount: any = await fetchOrCreateAccount(get().program,'userAccount',
      ['user_account',
        provider.wallet.publicKey],
      'createUserAccount', []);
    console.log('createUserAccount', userAccount)
    set(() => ({ userAccount, userStableBalance: userBalance.value.uiAmount }))
  },

  refreshPool: async (provider, fetchOrCreateAccount, findAddress) => {
    const exchangeAddress = await findAddress(get().program,['exchange'])
    const escrowAccount = await findAddress(get().program,[
      exchangeAddress,
      USDC_MINT])
    let programBalance: any = await provider.connection.getTokenAccountBalance(escrowAccount)
    console.log("programBalance Before deposit", programBalance.value.amount);

    const exchange: any = await fetchOrCreateAccount(get().program,'exchange', ['exchange'], 'initializeExchange', []);
    set(() => ({ exchange, exchangeStableBalance: programBalance.value.uiAmount }))
  },
  getPrice: async (program, feedAddress) => {
    const tx = await program.methods.getPrice().accounts({
      chainlinkFeed: feedAddress,
      chainlinkProgram: CHAINLINK_PROGRAM
    }).view();
    console.log(tx.round.toNumber() / (10 ** tx.decimals))
    return tx.round.toNumber() / (10 ** tx.decimals)
  }
}))
