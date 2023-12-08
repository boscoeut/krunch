import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { } from '@redux-devtools/extension' // required for devtools typing
import { markets, Market } from '../constants'
import {CHAINLINK_PROGRAM} from '../constants'

interface KrunchState {
  markets: Array<Market>,
  refreshMarkets: (fetchAccount: any) => void,
  getPrice: (program: any, feedAddress: string) => Promise<number>,
}

export const useKrunchStore = create<KrunchState>()((set, get) => ({
  markets,
  refreshMarkets: async (fetchAccount) => {
    let tempMarkets: Array<Market> = []
    for (const market of get().markets) {
      tempMarkets.push({ ...market, ...(await fetchAccount('market', ['market', market.marketIndex])) })
    }
    set(() => ({ markets: tempMarkets }))
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
