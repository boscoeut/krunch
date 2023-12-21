import * as anchor from "@coral-xyz/anchor";
import { PythCluster, PythHttpClient, getPythClusterApiUrl, getPythProgramKeyForCluster } from '@pythnetwork/client';
import type { } from '@redux-devtools/extension'; // required for devtools typing
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { Connection } from "@solana/web3.js";
import { EXCHANGE_POSITIONS, LEVERAGE_DECIMALS, MARKETS, MARKET_WEIGHT_DECIMALS, AMOUNT_DECIMALS } from 'utils/dist/constants';
import { create } from 'zustand';
import { fetchAccount, fetchOrCreateAccount, findAddress } from 'utils/dist/utils';
import type { ExchangeBalance, Market, UserPosition } from '../types';
interface KrunchState {
  program: any,
  prices: Map<String, number>,
  provider: any,
  userUnrealizedPnl: number,
  userCurrentValue: number,
  exchangeUnrealizedPnl: number,
  exchangeCurrentValue: number,
  exchangeBalances: Array<ExchangeBalance>,
  userBalances: Array<ExchangeBalance>,
  userStableBalance: number,
  markets: Array<Market>,
  positions: Array<UserPosition>,
  userAccount: any,
  exchange: any,
  userCollateral: number,
  exchangeCollateral: number,
  initialize: (program: any, provider: any) => void,
  refreshMarkets: () => void,
  refreshAll: () => Promise<void>,
  refreshPositions: () => void,
  refreshUserAccount: () => void,
  refreshPool: () => void,
  getPrices: () => Promise<Map<String, Number>>
  refreshExchangeCollateral: () => Promise<Number>,
  refreshUserCollateral: () => Promise<Number>,
}

export const useKrunchStore = create<KrunchState>()((set, get) => ({
  userUnrealizedPnl: 0,
  userCurrentValue: 0,
  exchangeUnrealizedPnl: 0,
  exchangeCurrentValue: 0,
  userCollateral: 0,
  exchangeCollateral: 0,
  prices: new Map<String, number>(),
  getPrices: async () => {
    const PYTHNET_CLUSTER_NAME: PythCluster = 'pythnet'
    const connection = new Connection(getPythClusterApiUrl(PYTHNET_CLUSTER_NAME))
    const pythPublicKey = getPythProgramKeyForCluster(PYTHNET_CLUSTER_NAME)
    const pythClient = new PythHttpClient(connection, pythPublicKey)
    const data = await pythClient.getData()
    console.log('data', data)

    const tempPrices = new Map<String, number>()
    for (const market of EXCHANGE_POSITIONS) {
      const price = data.productPrice.get(`Crypto.${market.market}`)!
      if (price && price.price) {
        tempPrices.set(market.market, price.price)
      }
    }
    set({
      prices: tempPrices
    })
    return tempPrices
  },
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
  refreshMarkets: async () => {
    let tempMarkets: Array<Market> = []

    const exchange = await fetchAccount(get().program, 'exchange', ['exchange'])
    const exchangeTotal = (exchange.pnl.toNumber()
      + exchange.rebates.toNumber()
      + exchange.rewards.toNumber()
      + exchange.amountWithdrawn.toNumber()
      + exchange.amountDeposited.toNumber()
      + exchange.fees.toNumber() + exchange.collateralValue.toNumber())
      * exchange.leverage
      / LEVERAGE_DECIMALS
      + exchange.marginUsed.toNumber()

    let accountCurrentValue = 0
    let accountUnrealizedPnl = 0  
    for (const market of get().markets) {
      try {
        const acct = await fetchAccount(get().program, 'market', ['market', market.marketIndex])
        const price = get().prices.get(market.name)
        // exchnage total
        const maxMarketCollateral =
          (exchangeTotal * acct.marketWeight) / MARKET_WEIGHT_DECIMALS;
        let marketTotal =
          + maxMarketCollateral
          + acct.marginUsed.toNumber();

        const currValue = ((acct.tokenAmount.toNumber() * (price || 0)) / AMOUNT_DECIMALS) || 0
        const unrealizedPnl = acct.tokenAmount.toNumber() > 0 ? currValue - acct.basis.toNumber() / AMOUNT_DECIMALS :
          currValue - acct.basis.toNumber() / AMOUNT_DECIMALS
        accountCurrentValue += currValue
        accountUnrealizedPnl += unrealizedPnl
        tempMarkets.push({ market: market.name, ...market, ...acct, price, marketTotal,unrealizedPnl,currValue })
      } catch (x: any) {
        console.log(x.message)
        console.log('could not get market ' + market.name)
      }
    }
    set(() => ({ markets: tempMarkets, exchangeCurrentValue: accountCurrentValue, exchangeUnrealizedPnl: accountUnrealizedPnl }))
  },
  refreshPositions: async () => {
    const provider = get().provider
    let temp: Array<UserPosition> = []
    let accountCurrentValue = 0
    let accountUnrealizedPnl = 0
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
      const price = get().prices.get(market.name)
      const currValue = ((acct.tokenAmount.toNumber() * (price || 0)) / AMOUNT_DECIMALS) || 0
      console.log("currValue", currValue)
      const unrealizedPnl = acct.tokenAmount.toNumber() > 0 ? currValue - acct.basis.toNumber() / AMOUNT_DECIMALS :
        currValue - acct.basis.toNumber() / AMOUNT_DECIMALS
      accountCurrentValue += currValue
      accountUnrealizedPnl += unrealizedPnl
      temp.push({ market: market.name, ...acct, price, currValue, unrealizedPnl })
    }
    set(() => ({ positions: temp, userCurrentValue: accountCurrentValue, userUnrealizedPnl: accountUnrealizedPnl }))
  },
  refreshUserAccount: async () => {
    const provider = get().provider
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
        let tokenBalance: any = await provider.connection.getTokenAccountBalance(tokenAccount)
        console.log("tokenBalance " + item.market, tokenBalance.value)
        balance = Number(tokenBalance.value.amount)
      } catch (x) {
        console.log('could not get balance:' + item.market)
      }
      const price = get().prices.get(item.market)
      console.log('price *******', price)
      balances.push({
        market: item.market,
        mint: item.mint,
        balance,
        decimals: item.decimals,
        price
      })
    }

    set(() => ({ userAccount, userBalances: balances }))
  },
  refreshUserCollateral: async () => {
    // user collateral
    const provider = get().provider
    const exchange = await fetchAccount(get().program, 'exchange', ['exchange'])
    console.log('exchange', exchange)
    const userAccount: any = await fetchOrCreateAccount(get().program, 'userAccount',
      ['user_account',
        provider.wallet.publicKey],
      'createUserAccount', []);
    console.log('user_account', userAccount)
    const hardAmount = 
      userAccount.pnl.toNumber() 
      + userAccount.fees.toNumber()
      + userAccount.rebates.toNumber() 
      + userAccount.rewards.toNumber() 
      + userAccount.collateralValue.toNumber();
    let userTotal = hardAmount * (exchange.leverage / LEVERAGE_DECIMALS) + userAccount.marginUsed.toNumber();
    console.log('###uuserTotal', userTotal / AMOUNT_DECIMALS)
    set({ userCollateral: userTotal })
    return userTotal
  },
  refreshExchangeCollateral: async () => {
    const exchange = await fetchAccount(get().program, 'exchange', ['exchange'])
    console.log('exchange', exchange)
    const exchangeTotal = (
      exchange.pnl.toNumber()
      + exchange.fees.toNumber()
      + exchange.amountWithdrawn.toNumber()
      + exchange.amountDeposited.toNumber()
      + exchange.rebates.toNumber() 
      + exchange.rewards.toNumber() 
      + exchange.collateralValue.toNumber())
      * exchange.leverage
      / LEVERAGE_DECIMALS
      + exchange.marginUsed.toNumber()
    console.log('###exchangeTotal', exchangeTotal / AMOUNT_DECIMALS)
    set({ exchangeCollateral: exchangeTotal })
    return exchangeTotal
  },
  refreshAll: async () => {
    get().getPrices()
    get().refreshMarkets()
    get().refreshPositions()
    get().refreshPool()
    get().refreshUserAccount()
    get().refreshExchangeCollateral()
    get().refreshUserCollateral()
  },
  refreshPool: async () => {
    const provider = get().provider
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
      const price = get().prices.get(item.market)
      balances.push({
        market: item.market,
        mint: item.mint,
        balance,
        decimals: item.decimals,
        price
      })
    }

    const exchange: any = await fetchOrCreateAccount(get().program, 'exchange', ['exchange'], 'initializeExchange', []);
    set(() => ({ exchange, exchangeBalances: balances }))
  },

}))
