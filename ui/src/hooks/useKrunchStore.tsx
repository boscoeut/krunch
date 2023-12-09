import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { } from '@redux-devtools/extension' // required for devtools typing
import { markets, Market, UserPosition } from '../constants'
import {CHAINLINK_PROGRAM} from '../constants'
import * as anchor from "@coral-xyz/anchor";

interface KrunchState {
  markets: Array<Market>,
  positions: Array<UserPosition>,
  userAccount: any,
  exchange: any,
  refreshMarkets: (fetchAccount: any) => void,
  refreshPositions: (provider:any,fetchOrCreateAccount: any,findAddress:any) => void,
  refreshUserAccount: (provider:any,fetchOrCreateAccount: any) => void,
  refreshPool: (provider:any,fetchOrCreateAccount: any) => void,
  getPrice: (program: any, feedAddress: string) => Promise<number>,
}

export const useKrunchStore = create<KrunchState>()((set, get) => ({
  markets,
  positions:[],
  userAccount: {},
  exchange: {},
  refreshMarkets: async (fetchAccount) => {
    let tempMarkets: Array<Market> = []
    for (const market of get().markets) {
      tempMarkets.push({ ...market, ...(await fetchAccount('market', ['market', market.marketIndex])) })
    }
    set(() => ({ markets: tempMarkets }))
  },
  refreshPositions: async (provider,fetchOrCreateAccount,findAddress) => {
    let temp: Array<UserPosition> = []
    for (const market of get().markets) {
      const acct: any = await fetchOrCreateAccount('userPosition',
      ['user_position',
          provider.wallet.publicKey,
          market.marketIndex],
      'addUserPosition', [new anchor.BN(market.marketIndex)],
      {
          userAccount: await findAddress(['user_account', provider.wallet.publicKey]),
          market: await findAddress(['market', market.marketIndex]),
      });
      temp.push({market:market.name, ...acct})
    }
    set(() => ({ positions: temp }))
  },
  refreshUserAccount: async (provider,fetchOrCreateAccount) => {
    const userAccount: any = await fetchOrCreateAccount('userAccount',
    ['user_account',
        provider.wallet.publicKey],
    'createUserAccount', []);
    console.log('createUserAccount', userAccount)
    set(() => ({ userAccount }))
  },
  refreshPool: async (provider,fetchOrCreateAccount) => {
    const exchange: any = await fetchOrCreateAccount('exchange', ['exchange'], 'initializeExchange', []);
    set(() => ({ exchange }))
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
