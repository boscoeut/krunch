import * as anchor from "@coral-xyz/anchor";
import { PythCluster, PythHttpClient, getPythClusterApiUrl, getPythProgramKeyForCluster } from '@pythnetwork/client';
import type { } from '@redux-devtools/extension'; // required for devtools typing
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  AMOUNT_DECIMALS,
  CHAINLINK_PROGRAM,
  EXCHANGE_LEVERAGE, EXCHANGE_POSITIONS,
  FEE_DECIMALS,
  LEVERAGE_DECIMALS,
  MAKER_FEE,
  MARKETS,
  MARKET_LEVERAGE,
  SLOTS_PER_DAY,
  MARKET_TYPES, MARKET_WEIGHT,
  MARKET_WEIGHT_DECIMALS,
  EXCHANGE_MARKET_WEIGHT,
  NETWORK,
  REWARD_FREQUENCY,
  REWARD_RATE,
  TAKER_FEE,
  LOCALNET
} from 'utils/dist/constants';
import { fetchAccount, fetchOrCreateAccount, findAddress } from 'utils/dist/utils';
import { create } from 'zustand';
import type { AppInfo, ExchangeBalance, Market, UserPosition } from '../types';
import { colors } from "../utils";
const { getOrCreateAssociatedTokenAccount } = require("@solana/spl-token");

export const defaultAppInfo: AppInfo = {
  appTitle: "Krunch",
  appSubTitle: "Defi",
  logoColor: colors.logoColor,
  dangerColor: colors.dangerColor,
  toolbarBackground:colors.toolbarBackground,
  toolbarBorderColor: colors.toolbarBorderColor,
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
  depositDialogOpen: boolean,
  setDepositDialogOpen: (open: boolean) => void,
  withdrawDialogOpen: boolean,
  setWithdrawDialogOpen: (open: boolean) => void,
  tradeDialogOpen:boolean,
  setTradeDialogOpen: (open:boolean) => void,
  poolROI: number,
  exchangeBalanceAvailable: number,
  autoRefresh: boolean,
  poolAccountValue: number,
  nextRewardsClaimDate?: Date,
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
  addExchangePositions: () => Promise<void>
  userAccountValue: number,
  updateExchange: (testMode: boolean, rewardFrequency: number, rewardRate: number, leverage: number, marketWeight: number) => Promise<void>,
  executeTrade: (marketIndex: number, amount: number) => Promise<void>,
  deposit: (market: string, amount: number) => Promise<void>,
  withdraw: (market: string, amount: number) => Promise<void>,
  exchangeDepositOrWithdraw: (market: string, amount: number) => Promise<void>,
  updateMarket: (name: string, marketIndex: number, marketWeight: number,
    leverage: number, takerFee: number, makerFee: number, feedAddress: string) => Promise<void>,
  toggleAutoRefresh: () => void,
}

export const useKrunchStore = create<KrunchState>()((set, get) => ({
  depositDialogOpen: false,
  setDepositDialogOpen: (open: boolean) => { set({ depositDialogOpen: open }) },
  withdrawDialogOpen: false,
  setWithdrawDialogOpen: (open: boolean) => { set({ withdrawDialogOpen: open }) },
  tradeDialogOpen:false,
  setTradeDialogOpen: (open:boolean) => { set({ tradeDialogOpen: open })},
  poolROI: 0,
  toggleAutoRefresh: () => {
    set({ autoRefresh: !get().autoRefresh })
  },
  autoRefresh: true,
  exchangeBalanceAvailable: 0,
  poolAccountValue: 0,
  updateMarket: async (name: string, marketIndex: number, marketWeight: number,
    leverage: number, takerFee: number, makerFee: number, feedAddress: string) => {
    let accountExists = false;
    const program = get().program
    try {
      await fetchAccount(program, 'market', ['market', Number(marketIndex)])
      accountExists = true;
    } catch (x) {
      // market does not exist.  Needs to be created
    }
    if (accountExists) {
      const tx = await program.methods.updateMarket(
        new anchor.BN(marketIndex),
        new anchor.BN(Number(makerFee) * FEE_DECIMALS),
        new anchor.BN(Number(takerFee) * FEE_DECIMALS),
        new anchor.BN(Number(leverage) * LEVERAGE_DECIMALS),
        new anchor.BN(Number(marketWeight) * MARKET_WEIGHT_DECIMALS),
      ).accounts({
        market: await findAddress(program, ['market', Number(marketIndex)]),
        exchange: await findAddress(program, ['exchange'])
      }).rpc();
    } else {
      const tx = await program.methods.addMarket(
        new anchor.BN(marketIndex),
        new anchor.BN(Number(makerFee) * FEE_DECIMALS),
        new anchor.BN(Number(takerFee) * FEE_DECIMALS),
        new anchor.BN(Number(leverage) * LEVERAGE_DECIMALS),
        new anchor.BN(Number(marketWeight) * MARKET_WEIGHT_DECIMALS),
        new PublicKey(feedAddress),
      ).accounts({
        market: await findAddress(program, ['market', Number(marketIndex)]),
        exchange: await findAddress(program, ['exchange'])
      }).rpc();
    }
  },
  exchangeDepositOrWithdraw: async (market: string, amount: number) => {
    const position = EXCHANGE_POSITIONS.find((position) => position.market === market)
    if (!position) {
      throw new Error('Position not found')
    }
    const program = get().program
    const provider = get().provider

    let tokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection, //connection
      provider.wallet.publicKey, //payer
      position.mint, //mint
      provider.wallet.publicKey, //owner
    )

    const exchangeAddress = await findAddress(program, ['exchange'])
    const escrowAccount = await findAddress(program, [
      exchangeAddress,
      position.mint])

    const transactionAmount = Number(amount) * AMOUNT_DECIMALS
    const method = transactionAmount > 0 ? 'exchangeDeposit' : 'exchangeWithdraw'

    const tx = await program.methods[method](
      new anchor.BN(Math.abs(transactionAmount))
    ).accounts({
      userTokenAccount: new PublicKey(tokenAccount.address.toString()),
      mint: position.mint,
      exchange: exchangeAddress,
      escrowAccount,
      exchangeTreasuryPosition: await findAddress(program, ['exchange_position', position.mint]),
      owner: provider.wallet.publicKey,
      chainlinkFeed: position.feedAddress,
      chainlinkProgram: CHAINLINK_PROGRAM,
    }).rpc();
  },
  withdraw: async (market: string, amount: number) => {
    const program = get().program
    const provider = get().provider

    const position = EXCHANGE_POSITIONS.find((p) => p.market === market)
    if (!position) {
      throw new Error('Position not found')
    }
    let tokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection, //connection
      provider.wallet.publicKey, //payer
      position.mint, //mint
      provider.wallet.publicKey, //owner
    )

    const exchangeAddress = await findAddress(program, ['exchange'])
    const escrowAccount = await findAddress(program, [
      exchangeAddress,
      position.mint])

    const transactionAmount = Number(amount) * AMOUNT_DECIMALS
    const tx = await program.methods.withdraw(
      new anchor.BN(Math.abs(transactionAmount))
    ).accounts({
      userTokenAccount: new PublicKey(tokenAccount.address.toString()),
      mint: position.mint,
      exchange: exchangeAddress,
      escrowAccount,
      userAccount: await findAddress(program, ['user_account', provider.wallet.publicKey]),
      exchangeTreasuryPosition: await findAddress(program, ['exchange_position', position.mint]),
      owner: provider.wallet.publicKey,
      chainlinkFeed: position.feedAddress,
      chainlinkProgram: CHAINLINK_PROGRAM,
    }).rpc();
  },
  deposit: async (market: string, amount: number) => {
    const program = get().program
    const provider = get().provider
    const position = EXCHANGE_POSITIONS.find((p) => p.market === market)

    if (!position) {
      throw new Error('Position not found')
    }
    let tokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection, //connection
      provider.wallet.publicKey, //payer
      position.mint, //mint
      provider.wallet.publicKey, //owner
    )

    const exchangeAddress = await findAddress(program, ['exchange'])
    const escrowAccount = await findAddress(program, [
      exchangeAddress,
      position.mint])

    const transactionAmount = Number(amount) * AMOUNT_DECIMALS
    const tx = await program.methods.deposit(
      new anchor.BN(Math.abs(transactionAmount))
    ).accounts({
      userTokenAccount: new PublicKey(tokenAccount.address.toString()),
      mint: position.mint,
      exchange: exchangeAddress,
      escrowAccount,
      userAccount: await findAddress(program, ['user_account', provider.wallet.publicKey]),
      exchangeTreasuryPosition: await findAddress(program, ['exchange_position', position.mint]),
      owner: provider.wallet.publicKey,
      chainlinkFeed: position.feedAddress,
      chainlinkProgram: CHAINLINK_PROGRAM,
    }).rpc();
  },
  executeTrade: async function (marketIndex: number, amount: number) {
    const provider = get().provider
    const program = get().program
    const index = Number(marketIndex)
    const market = MARKETS.find((market) => market.marketIndex === Number(marketIndex))
    const position = EXCHANGE_POSITIONS.find((position) => position.market === market?.name)

    if (!position) {
      throw new Error('Position not found')
    }

    await fetchOrCreateAccount(program, 'userPosition',
      ['user_position',
        provider.wallet.publicKey,
        index],
      'addUserPosition', [new anchor.BN(index)],
      {
        userAccount: await findAddress(program, ['user_account', provider.wallet.publicKey]),
        market: await findAddress(program, ['market', index]),
      });

    await fetchOrCreateAccount(program, 'userAccount',
      ['user_account',
        provider.wallet.publicKey],
      'createUserAccount', []);

    const tx = await program.methods.executeTrade(
      new anchor.BN(marketIndex),
      new anchor.BN(Number(amount) * AMOUNT_DECIMALS)
    ).accounts({
      market: await findAddress(program, ['market', index]),
      exchange: await findAddress(program, ['exchange']),
      userPosition: await findAddress(program, ['user_position', provider.wallet.publicKey, index]),
      userAccount: await findAddress(program, ['user_account', provider.wallet.publicKey]),
      chainlinkFeed: position.feedAddress,
      chainlinkProgram: CHAINLINK_PROGRAM,
    }).rpc();
  },
  userAccountValue: 0,
  updateExchange: async function (testMode: boolean, rewardFrequency: number, rewardRate: number, leverage: number, marketWeight: number) {
    const program = get().program
    const tx = await program.methods.updateExchange(testMode,
      new anchor.BN(rewardFrequency),
      new anchor.BN(rewardRate),
      leverage * LEVERAGE_DECIMALS,
      marketWeight * MARKET_WEIGHT_DECIMALS,
    ).accounts({
      exchange: await findAddress(program, ['exchange']),
    }).rpc();
  },
  addMarkets: async function () {
    const program = get().program
    const _takerFee = TAKER_FEE
    const _makerFee = MAKER_FEE
    const _marketWeight = MARKET_WEIGHT

    for (const m of MARKETS) {
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
    }
  },
  addExchangePositions: async function (shouldUpdate: boolean = false) {
    const provider = get().provider
    const program = get().program
    for (const tokenMint of EXCHANGE_POSITIONS) {
      try {
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
    const program = get().program
    const slotsIn24Hours = REWARD_FREQUENCY;
    await fetchOrCreateAccount(program, 'exchange', ['exchange'], 'initializeExchange', [
      EXCHANGE_LEVERAGE * LEVERAGE_DECIMALS,
      new anchor.BN(slotsIn24Hours),
      new anchor.BN(REWARD_RATE),
      NETWORK === LOCALNET,
      EXCHANGE_MARKET_WEIGHT * MARKET_WEIGHT_DECIMALS,
    ]);
    await get().addMarkets();

    const marketIndex = 1;
    await fetchOrCreateAccount(program, 'userAccount',
      ['user_account',
        provider.wallet.publicKey],
      'createUserAccount', []);

    await fetchOrCreateAccount(program, 'userPosition',
      ['user_position',
        provider.wallet.publicKey,
        marketIndex],
      'addUserPosition', [new anchor.BN(marketIndex)],
      {
        userAccount: await findAddress(program, ['user_account', provider.wallet.publicKey]),
        market: await findAddress(program, ['market', marketIndex]),
      });
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

    await fetchOrCreateAccount(get().program, 'userAccount',
      ['user_account',
        provider.wallet.publicKey],
      'createUserAccount', []);

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

    const poolAccountValue =
      Number(exchange.fees)//
      + Number(exchange.rebates)//
      + Number(exchange.rewards)//
      + Number(exchange.pnl)//

    const poolDeposits = exchange.collateralValue.toNumber()
    const poolROI = (
      poolDeposits
      + Number(exchange.fees)//
      + Number(exchange.rebates)//
      + Number(exchange.rewards)//
      + Number(exchange.pnl)
    ) / poolDeposits;

    const exchangeTotal = (exchange.pnl.toNumber()
      + exchange.rebates.toNumber()
      + exchange.rewards.toNumber()
      + exchange.fees.toNumber()
      + exchange.collateralValue.toNumber())
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
        // could not get market
      }
    }
    set(() => ({ poolROI, poolAccountValue, markets: tempMarkets, exchangeCurrentValue: accountCurrentValue, exchangeUnrealizedPnl: accountUnrealizedPnl }))
  },
  refreshPositions: async () => {
    const provider = get().provider
    let temp: Array<UserPosition> = []
    let accountCurrentValue = 0
    let accountUnrealizedPnl = 0
    for (const market of get().markets) {
      try {
        const acct: any = await fetchAccount(get().program, 'userPosition',
          ['user_position',
            provider.wallet.publicKey,
            market.marketIndex]);
        const price = get().prices.get(market.name)
        const currValue = ((acct.tokenAmount.toNumber() * (price || 0)) / AMOUNT_DECIMALS) || 0
        const unrealizedPnl = acct.tokenAmount.toNumber() > 0 ? currValue + acct.basis.toNumber() / AMOUNT_DECIMALS :
          currValue - acct.basis.toNumber() / AMOUNT_DECIMALS
        accountCurrentValue += currValue
        accountUnrealizedPnl += unrealizedPnl
        const entryPrice = acct.tokenAmount.toNumber() === 0 ? 0 : acct.basis.toNumber() / acct.tokenAmount.toNumber()
        temp.push({ market: market.name, ...acct, price, currValue, unrealizedPnl, entryPrice })
      } catch (x: any) {
        // market does not exist
      }
    }
    set(() => ({ positions: temp, userCurrentValue: accountCurrentValue, userUnrealizedPnl: accountUnrealizedPnl }))
  },
  refreshUserAccount: async () => {
    const provider = get().provider

    try {
      const userAccount: any = await fetchAccount(get().program, 'userAccount',
        ['user_account',
          provider.wallet.publicKey]);

      const balances: Array<ExchangeBalance> = []
      for (const item of EXCHANGE_POSITIONS) {
        try {
          let tokenAccount = await getAssociatedTokenAddress(
            item.mint, //mint
            provider.wallet.publicKey, //owner
          )
          let balance = 0
          try {
            let tokenBalance: any = await provider.connection.getTokenAccountBalance(tokenAccount)
            balance = Number(tokenBalance.value.amount)
          } catch (x) {
            // could not get balance
          }
          const price = get().prices.get(item.market)
          balances.push({
            market: item.market,
            mint: item.mint,
            balance,
            decimals: item.decimals,
            price
          })
        } catch (x: any) {
          // market does not exist
        }
      }
      set(() => ({ userAccount, userBalances: balances }))
    } catch (x: any) {
      // userAccount Does not exist
    }
  },
  refreshUserCollateral: async () => {
    // user collateral
    const provider = get().provider
    const exchange = await fetchAccount(get().program, 'exchange', ['exchange'])
    let userTotal = 0
    try {
      const userAccount: any = await fetchAccount(get().program, 'userAccount',
        ['user_account',
          provider.wallet.publicKey]);
      const hardAmount =
        userAccount.pnl.toNumber()
        + userAccount.fees.toNumber()
        + userAccount.rebates.toNumber()
        + userAccount.rewards.toNumber()
        + userAccount.collateralValue.toNumber();
      userTotal = hardAmount * (exchange.leverage / LEVERAGE_DECIMALS) + userAccount.marginUsed.toNumber();
      let nextRewardsClaimDate: Date | undefined = undefined
      if (userAccount.lastRewardsClaim?.toNumber() > 0) {
        const numDays = exchange.rewardFrequency?.toNumber() / SLOTS_PER_DAY
        const milliSecondsPerDay = 1000 * 60 * 60 * 24
        nextRewardsClaimDate = new Date(userAccount.lastRewardsClaim?.toNumber() * 1000 + numDays * milliSecondsPerDay)
      }

      set({
        nextRewardsClaimDate,
        userCollateral: userTotal,
        userAccountValue: hardAmount
      })
    } catch (x: any) {
      // userAccount Does not exist
    } finally {
      return userTotal
    }
  },
  refreshExchangeCollateral: async () => {
    const exchange = await fetchAccount(get().program, 'exchange', ['exchange'])
    const currentUser = get().provider.wallet.publicKey
    const isAdmin = currentUser?.toString() === exchange.admin.toString()

    // exchange total
    const exchangeTotal = (
      + exchange.collateralValue.toNumber())
      * exchange.leverage
      / LEVERAGE_DECIMALS
      
    // exchange balance available    
    const marketWeight = exchange.marketWeight || 1
    const exchangeBalanceAvailable = exchangeTotal * (marketWeight / MARKET_WEIGHT_DECIMALS)+ exchange.marginUsed.toNumber()
    set({ exchangeCollateral: exchangeTotal, exchangeBalanceAvailable, isAdmin })
    return exchangeTotal
  },
  refreshAwardsAvailable: async () => {
    const exchange = await fetchAccount(get().program, 'exchange', ['exchange'])
    try {
      const userAccount = await fetchAccount(get().program, 'userAccount', ['user_account', get().provider.wallet.publicKey])
      let userTotal = get().userCollateral - userAccount.rewards.toNumber();
      let exchangeTotal = get().exchangeCollateral;
      let exchangeRewards =
        (exchange.pnl.toNumber() + exchange.rewards.toNumber() + exchange.fees.toNumber() + exchange.rebates.toNumber())
        * (exchange.rewardRate.toNumber()) / AMOUNT_DECIMALS;
      // get % or rewards available
      if (exchangeRewards < 0) {
        exchangeRewards = 0
      }
      let amount = (exchangeRewards * userTotal) / exchangeTotal;
      set({
        exchangeRewardsAvailable: exchangeRewards,
        userRewardsAvailable: amount || 0,
      })
    } catch (x: any) {
      // user account does not exist
    }
  },
  refreshPool: async () => {
    const provider = get().provider
    const exchangeAddress = await findAddress(get().program, ['exchange'])

    const balances: Array<ExchangeBalance> = []
    let total = 0
    for (const item of EXCHANGE_POSITIONS) {
      try {
        const escrowAccount = await findAddress(get().program, [
          exchangeAddress,
          item.mint])
        let balance = 0
        try {
          let programBalance: any = await provider.connection.getTokenAccountBalance(escrowAccount)
          balance = programBalance.value.amount
        } catch (x: any) {
          // could not get balance
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
      } catch (x: any) {
        // market does not exist
      }
    }
    const exchange: any = await fetchAccount(get().program, 'exchange', ['exchange']);
    set(() => ({ exchange, exchangeBalances: balances, treasuryTotal: total }))
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
}))
