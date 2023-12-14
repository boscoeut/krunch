import * as anchor from "@coral-xyz/anchor"
import type { } from '@redux-devtools/extension'; // required for devtools typing
import { getAssociatedTokenAddress } from "@solana/spl-token"
import { CHAINLINK_PROGRAM, EXCHANGE_POSITIONS, MARKETS, USDC_MINT } from 'utils/dist/constants'
import { create } from 'zustand'
import type { ExchangeBalance, Market, UserPosition } from '../types'

interface KrunchState {
  program: any,
  provider: any,
  exchangeBalances: Array<ExchangeBalance>,
  userBalances: Array<ExchangeBalance>,
  userStableBalance: number,
  markets: Array<Market>,
  positions: Array<UserPosition>,
  userAccount: any,
  exchange: any,
  initialize: (program: any, provider: any) => void,
  refreshMarkets: (fetchAccount: any) => void,
  refreshPositions: (provider: any, fetchOrCreateAccount: any, findAddress: any) => void,
  refreshUserAccount: (provider: any, fetchOrCreateAccount: any, findAddress:any) => void,
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
  userStableBalance: 0,
  markets: MARKETS,
  positions: [],
  exchangeBalances: [],
  userBalances: [],
  userAccount: {},
  exchange: {},
  refreshMarkets: async (fetchAccount) => {
    let tempMarkets: Array<Market> = []
    for (const market of get().markets) {
      tempMarkets.push({ ...market, ...(await fetchAccount(get().program, 'market', ['market', market.marketIndex])) })
    }
    set(() => ({ markets: tempMarkets }))
  },
  refreshPositions: async (provider, fetchOrCreateAccount, findAddress) => {
    let temp: Array<UserPosition> = []
    for (const market of get().markets) {
      const acct: any = await fetchOrCreateAccount(get().program, 'userPosition',
        ['user_position',
          provider.wallet.publicKey,
          market.marketIndex],
        'addUserPosition', [new anchor.BN(market.marketIndex)],
        {
          userAccount: await findAddress(get().program, ['user_account', provider.wallet.publicKey]),
          market: await findAddress(get().program, ['market', market.marketIndex]),
        });
      temp.push({ market: market.name, ...acct })
    }
    set(() => ({ positions: temp }))
  },
  refreshUserAccount: async (provider, fetchOrCreateAccount, findAddress) => {
    const userAccount: any = await fetchOrCreateAccount(get().program, 'userAccount',
      ['user_account',
        provider.wallet.publicKey],
      'createUserAccount', []);
    console.log('createUserAccount', userAccount)

    const balances: Array<ExchangeBalance> = []
    for (const item of EXCHANGE_POSITIONS) {

      let tokenAccount = await getAssociatedTokenAddress(
        item.mint, //mint
        provider.wallet.publicKey, //owner
      )
      let balance = 0
      try {
        let programBalance: any = await provider.connection.getTokenAccountBalance(tokenAccount)
        balance = programBalance.value.amount
      } catch (x) {
        console.log('could not get balance:' + item.market)
      }
      balances.push({
        market: item.market,
        mint: item.mint,
        balance,
        decimals: item.decimals
      })
    }

    set(() => ({ userAccount, userBalances: balances }))
  },

  refreshPool: async (provider, fetchOrCreateAccount, findAddress) => {
    const exchangeAddress = await findAddress(get().program, ['exchange'])

    const balances: Array<ExchangeBalance> = []
    for (const item of EXCHANGE_POSITIONS) {
      const escrowAccount = await findAddress(get().program, [
        exchangeAddress,
        item.mint])
      let balance = 0
      try {
        let programBalance: any = await provider.connection.getTokenAccountBalance(escrowAccount)
        console.log("programBalance Before deposit", programBalance.value.amount);
        balance = programBalance.value.amount
      } catch (x) {
        console.log('could not get balance:' + item.market)
      }
      balances.push({
        market: item.market,
        mint: item.mint,
        balance,
        decimals: item.decimals
      })
    }

    const exchange: any = await fetchOrCreateAccount(get().program, 'exchange', ['exchange'], 'initializeExchange', []);
    set(() => ({ exchange, exchangeBalances: balances }))
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
