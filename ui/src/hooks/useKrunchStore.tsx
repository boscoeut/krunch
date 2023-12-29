import * as anchor from "@coral-xyz/anchor";
import { PythCluster, PythHttpClient, getPythClusterApiUrl, getPythProgramKeyForCluster } from '@pythnetwork/client';
import type { } from '@redux-devtools/extension'; // required for devtools typing
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { Connection } from "@solana/web3.js";
import {
  MARKET_LEVERAGE,
  FEE_DECIMALS, REWARD_FREQUENCY,
  MAKER_FEE, TAKER_FEE,
  REWARD_RATE, EXCHANGE_LEVERAGE, EXCHANGE_POSITIONS,
  LEVERAGE_DECIMALS, MARKETS, MARKET_WEIGHT_DECIMALS,
  AMOUNT_DECIMALS, MARKET_TYPES, MARKET_WEIGHT
} from 'utils/dist/constants';
import { create } from 'zustand';
import { fetchAccount, fetchOrCreateAccount, findAddress } from 'utils/dist/utils';
import type { ExchangeBalance, Market, UserPosition, AppInfo } from '../types';
import { colors } from "../utils";
import { PublicKey } from "@solana/web3.js";

export const defaultAppInfo: AppInfo = {
  appTitle: "Krunch",
  appSubTitle: "Defi",
  logoColor: colors.logoColor,
  dangerColor: colors.dangerColor,
  leverage: 10,
  docAppReference: "Krunch Defi",
  appDescription: 'Decentralized Trading',
  welcomeMessage: 'Welcome to Krunch Defi',
  stableCoin: 'USDT',
  protocolName: 'Krunch Defi',
  pageTitle: 'Krunch Defi - Decentralized Trading',
  pageDescription: 'Krunch Defi: Decentralized Trading for Equities, Crypto and Forex.   No liquidations.  Trade at 10x Leverage.  Earn fees rewards.'
}

interface KrunchState {
  setup: () => Promise<void>,
  isAdmin: boolean,
  appInfo: AppInfo,
  refreshAwardsAvailable: () => Promise<void>,
  exchangeRewardsAvailable: number,
  userRewardsAvailable: number,
  program: any,
  prices: Map<String, number>,
  provider: any,
  userUnrealizedPnl: number,
  userCurrentValue: number,
  exchangeUnrealizedPnl: number,
  exchangeCurrentValue: number,
  exchangeBalances: Array<ExchangeBalance>,
  treasuryTotal: number,
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
  claimRewards: () => Promise<void>,
  addMarkets: () => Promise<void>,
  addExchangePositions: () => Promise<void>,
}

export const useKrunchStore = create<KrunchState>()((set, get) => ({
  addMarkets: async function () {
    const provider = get().provider
    console.log('provider', provider)
    const program = get().program
    const _takerFee = TAKER_FEE
    const _makerFee = MAKER_FEE
    const _marketWeight = 1
    const markets = MARKETS

    for (const m of markets) {
      const marketIndex = m.marketIndex;
      const address = new PublicKey(m.feedAddress);
      const market: any = await fetchOrCreateAccount(
        program,
        'market',
        ['market', marketIndex],
        'addMarket', [
        marketIndex,
        new anchor.BN(_takerFee * FEE_DECIMALS),
        new anchor.BN(_makerFee * FEE_DECIMALS),
        new anchor.BN(MARKET_LEVERAGE * LEVERAGE_DECIMALS),
        new anchor.BN(_marketWeight * MARKET_WEIGHT_DECIMALS),
        address],
        {
          exchange: await findAddress(program, ['exchange']),
        });
      console.log("market created ", market.marketIndex.toString());
    }
  },
  addExchangePositions: async function (shouldUpdate: boolean = false) {
    const provider = get().provider
    console.log('provider', provider)
    const program = get().program
    for (const tokenMint of EXCHANGE_POSITIONS) {

      console.log('adding exchange position', tokenMint.market)

      try {
        const exchangePosition: any = await fetchAccount(program,
          'exchangeTreasuryPosition',
          ['exchange_position',
            tokenMint.mint
          ]);
        console.log('exchangePosition', exchangePosition.tokenMint.toString());
        if (shouldUpdate) {
          await program?.methods.
            updateExchangePosition(
              tokenMint.mint,
              true,
              new anchor.BN(MARKET_WEIGHT * MARKET_WEIGHT_DECIMALS),
              new anchor.BN(tokenMint.decimals),
              tokenMint.feedAddress).
            accounts({
              exchangeTreasuryPosition: await findAddress(program, ['exchange_position', tokenMint.mint]),
              exchange: await findAddress(program, ['exchange']),
              owner: provider.wallet.publicKey,
            }).rpc();
        }
      } catch (x) {
        const exchangePosition: any = await fetchOrCreateAccount(program,
          'exchangeTreasuryPosition',
          ['exchange_position',
            tokenMint.mint
          ],
          'addExchangePosition',
          [tokenMint.mint, true, new anchor.BN(MARKET_WEIGHT * MARKET_WEIGHT_DECIMALS),
          new anchor.BN(tokenMint.decimals),
          tokenMint.feedAddress
          ],
          {
            admin: provider.wallet.publicKey,
            exchange: await findAddress(program, ['exchange']),
          });
      }
    }
  },
  setup: async () => {
    const provider = get().provider
    console.log('provider', provider)
    const program = get().program
    console.log('program', program)
    const slotsIn24Hours = REWARD_FREQUENCY;
    const exchange: any = await fetchOrCreateAccount(program, 'exchange', ['exchange'], 'initializeExchange', [
      EXCHANGE_LEVERAGE * LEVERAGE_DECIMALS,
      new anchor.BN(slotsIn24Hours),
      new anchor.BN(REWARD_RATE)
    ]);
    console.log('exchange', exchange)
    console.log("ONWER ADDRESS", provider.wallet.publicKey.toString());
    console.log("exchange collateralValue", exchange.collateralValue.toString());
    await get().addMarkets();

    const marketIndex = 1;
    const userAccount = await fetchOrCreateAccount(program, 'userAccount',
      ['user_account',
        provider.wallet.publicKey],
      'createUserAccount', []);
    console.log("userAccount", userAccount.pnl.toString());

    const userPosition: any = await fetchOrCreateAccount(program, 'userPosition',
      ['user_position',
        provider.wallet.publicKey,
        marketIndex],
      'addUserPosition', [new anchor.BN(marketIndex)],
      {
        userAccount: await findAddress(program, ['user_account', provider.wallet.publicKey]),
        market: await findAddress(program, ['market', marketIndex]),
      });
    console.log('createUserPosition', userPosition.pnl.toString());

    await get().addExchangePositions();

  },
  isAdmin: false,
  treasuryTotal: 0,
  appInfo: defaultAppInfo,
  exchangeRewardsAvailable: 0,
  userRewardsAvailable: 0,
  claimRewards: async () => {
    const program = get().program
    const provider = get().provider
    const e = await fetchAccount(program, 'exchange', ['exchange'])
    console.log('exchange', e)

    const userAccount = await fetchOrCreateAccount(get().program, 'userAccount',
      ['user_account',
        provider.wallet.publicKey],
      'createUserAccount', []);
    console.log('user_account', userAccount)

    await program.methods.claimRewards().accounts({
      userAccount: await findAddress(program, ['user_account', provider.wallet.publicKey]),
      exchange: await findAddress(program, ['exchange'])
    }).rpc();
  },
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
          currValue + acct.basis.toNumber() / AMOUNT_DECIMALS
        accountCurrentValue += currValue
        accountUnrealizedPnl += unrealizedPnl
        const entryPrice = acct.tokenAmount.toNumber() === 0 ? 0 : acct.basis.toNumber() / acct.tokenAmount.toNumber()
        const marketType = MARKET_TYPES.find((x: any) => x.id === market.marketTypeId || 1)
        tempMarkets.push({ market: market.name, ...market, ...acct, price, entryPrice, marketTotal, unrealizedPnl, currValue, marketType: marketType?.name })
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
      const unrealizedPnl = acct.tokenAmount.toNumber() > 0 ? currValue + acct.basis.toNumber() / AMOUNT_DECIMALS :
        currValue - acct.basis.toNumber() / AMOUNT_DECIMALS
      accountCurrentValue += currValue
      console.log("******unrealizedPnl", unrealizedPnl, accountCurrentValue)
      accountUnrealizedPnl += unrealizedPnl
      const entryPrice = acct.tokenAmount.toNumber() === 0 ? 0 : acct.basis.toNumber() / acct.tokenAmount.toNumber()
      temp.push({ market: market.name, ...acct, price, currValue, unrealizedPnl, entryPrice })
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
    const currentUser = get().provider.wallet.publicKey
    const isAdmin = currentUser?.toString() === exchange.admin.toString()
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
    set({ exchangeCollateral: exchangeTotal, isAdmin })
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
    get().refreshAwardsAvailable()
  },
  refreshAwardsAvailable: async () => {
    const exchange = await fetchAccount(get().program, 'exchange', ['exchange'])
    const userAccount = await fetchAccount(get().program, 'userAccount', ['user_account', get().provider.wallet.publicKey])

    console.log('userAccount', userAccount.rewards.toString())
    console.log('userCollateral', get().userCollateral.toString())
    let userTotal = get().userCollateral - userAccount.rewards.toNumber();
    let exchangeTotal = get().exchangeCollateral;
    const exchangeRewards =
      (exchange.pnl.toNumber()
        + exchange.rebates.toNumber()
        + exchange.rewards.toNumber()
        + exchange.fees.toNumber()) * (exchange.rewardRate.toNumber()) / AMOUNT_DECIMALS;
    // get % or rewards available
    let amount = (exchangeRewards * userTotal) / exchangeTotal;

    console.log(`____
      userPercent ${userTotal / exchangeTotal}  
      exchangeRewards ${exchangeRewards} 
      userTotal ${userTotal} 
      exchangeTotal ${exchangeTotal} 
      amount ${amount}`)
    set({
      exchangeRewardsAvailable: exchangeRewards,
      userRewardsAvailable: amount,
    })
  },
  refreshPool: async () => {
    const provider = get().provider
    const exchangeAddress = await findAddress(get().program, ['exchange'])

    const balances: Array<ExchangeBalance> = []
    let total = 0
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
      const currValue = (balance / (10 ** item.decimals)) * (price || 0)
      total += currValue
      balances.push({
        market: item.market,
        mint: item.mint,
        balance,
        decimals: item.decimals,
        price,
        currValue
      })
    }

    let slotsIn24Hours = REWARD_FREQUENCY;
    const exchange: any = await fetchOrCreateAccount(get().program, 'exchange', ['exchange'], 'initializeExchange', [
      EXCHANGE_LEVERAGE * LEVERAGE_DECIMALS,
      new anchor.BN(slotsIn24Hours),
      new anchor.BN(REWARD_RATE)
    ]);
    set(() => ({ exchange, exchangeBalances: balances, treasuryTotal: total }))
  },

}))
