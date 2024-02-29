import {
    Group,
    MangoAccount,
    MangoClient,
    PerpOrderSide,
    HealthType
} from '@blockworks-foundation/mango-v4';
import {
    Keypair, PublicKey
} from '@solana/web3.js';
import fs from 'fs';
import { getFundingRate, GROUP_PK, perpTrade, setupClient, spotTrade, sleep } from './mangoUtils';

type AccountDefinition = {
    name: string,
    key: string;
    usd: number;
    jup: number;
    privateKey: string;
};

async function snipePrices(
    accountDefinition: AccountDefinition,
    size: number,
    aprMinThreshold: number,
    aprMaxThreshold: number,
    client: MangoClient,
    mangoAccount: MangoAccount,
    user: Keypair,
    healthThreshold: number
): Promise<void> {
    const hourlyRate = await getFundingRate()
    const hourlyRateAPR = Number((hourlyRate * 100 * 24 * 365).toFixed(3))

    // RELOAD
    const group = await client.getGroup(new PublicKey(GROUP_PK));
    await mangoAccount.reload(client)

    const banks = Array.from(group.banksMapByName.values()).flat();
    const usdcBank = banks.find((bank) => bank.name === 'USDC');
    const solBank = banks.find((bank) => bank.name === 'SOL');

    if (!usdcBank) {
        console.error('USDC Bank not found');
        throw new Error('USDC Bank not found');
    }
    if (!solBank) {
        console.error('SOL Bank not found');
        throw new Error('SOL Bank not found');
    }

    const values = group.perpMarketsMapByMarketIndex.values()
    const perpMarket: any = Array.from(values).find((perpMarket) => perpMarket.name === 'SOL-PERP');
    const pp = mangoAccount
        .perpActive()
        .find((pp: any) => pp.marketIndex === perpMarket.perpMarketIndex);

    if (!pp) {
        console.error(accountDefinition.name, 'Perp account not found');
        throw new Error(accountDefinition.name+' Perp account not found');
    }

    const usdcBalance = mangoAccount.getTokenBalanceUi(usdcBank);

    const solBalance = mangoAccount.getTokenBalanceUi(solBank);

    const perpEquity = pp.basePositionLots.toNumber() / 100


    const solPrice = perpMarket.price.toNumber() * 1000

    const health = mangoAccount.getHealthRatio(group, HealthType.maint)!.toNumber()

    const canOpen = health > healthThreshold
    // const canOpen = false// health > healthThreshold
    const spotVsPerpDiff = solBalance + perpEquity
    const minDiffSize = size / 3
    const spotUnbalanced = Math.abs(spotVsPerpDiff) > minDiffSize
    const extraAmount = 0.02

    let action: 'HOLD' | 'BUY' | 'SELL' = 'HOLD'
    if (hourlyRateAPR < aprMinThreshold) {
        action = 'BUY'
    } else if (hourlyRateAPR > aprMaxThreshold) {
        action = 'SELL'
    }

    console.log(' --- ')
    console.log('ACCOUNT:', accountDefinition.name)
    console.log('USDC Balance', usdcBalance)
    console.log('HEALTH', health)
    console.log('SOL PERP Balance', perpEquity)
    console.log('SOL Balance', solBalance)
    console.log('SOL PRICE', solPrice)
    console.log('FUND RATE / HR:', hourlyRate * 100, '%')
    console.log('FUND RATE APR:', hourlyRateAPR, '%')
    console.log('ACTION:', action)

    const promises: any = [];
    if (action === 'BUY') {
        const canDoPerpTrade = (canOpen && spotVsPerpDiff <= size) || (perpEquity < 0 && spotVsPerpDiff <= size)
        if (spotUnbalanced && spotVsPerpDiff > 0) {
            console.log('SELL SOL', size, spotVsPerpDiff)
            const amount = spotUnbalanced && spotVsPerpDiff > 0 ? Number(Math.abs(spotVsPerpDiff).toFixed(2)) : Number(Math.abs(size).toFixed(2))
            promises.push(spotTrade(amount, solBank, usdcBank, client, mangoAccount, user, group, 'SELL', accountDefinition))
        }
        if (canDoPerpTrade) {
            console.log('BUY BACK PERP', hourlyRateAPR, aprMinThreshold)
            const asks = await perpMarket.loadAsks(client);
            const bestAsk: any = asks.best();
            const tradeSize = size
            console.log(
                'bestAsk:', bestAsk.uiPrice,
                '< SOLPrice:', solPrice,
                'bestAskSize:', bestAsk.uiSize)
            if (bestAsk.uiPrice < solPrice) {
                const midPrice = (bestAsk.uiPrice + solPrice) / 2
                console.log('**** SNIPING', midPrice, "Oracle", solPrice, 'with bestAsk', bestAsk.uiPrice, 'and bestAskSize', `${size}/${bestAsk.uiSize}`)
                promises.push(perpTrade(client, group, mangoAccount,
                    perpMarket, midPrice, tradeSize, PerpOrderSide.bid, accountDefinition, false))
            }
        }
        console.log('Awaiting', promises.length, 'transaction(s)')
        try {
            // await Promise.all(promises)
        } catch (e) {
            console.log('Promise regjected', e)
        }
    }
    if (action === 'SELL') {
        const canDoPerpTrade = (canOpen && spotVsPerpDiff <= size) || (perpEquity > 0 && spotVsPerpDiff <= size)
        if (spotUnbalanced && spotVsPerpDiff < 0) {
            console.log('BUY SOL', spotVsPerpDiff)
            const amount = solPrice * Math.abs(spotVsPerpDiff) + extraAmount
            promises.push(spotTrade(amount, usdcBank, solBank, client, mangoAccount, user, group, 'BUY', accountDefinition))
        }
        if (canDoPerpTrade) {
            console.log('SELL PERP', hourlyRateAPR, aprMaxThreshold)
            const bids = await perpMarket.loadBids(client);
            const bestBid: any = bids.best();
            console.log(
                'bestBid:', bestBid.uiPrice,
                '> SOLPrice:', solPrice,
                'bestBidSize:', bestBid.uiSize)
            if (bestBid.uiPrice > solPrice) {
                const midPrice = (bestBid.uiPrice + solPrice)
                console.log('**** SNIPING', midPrice, 'with bestBid', bestBid.uiPrice, 'and bestBidSize', `${size}/${bestBid.uiSize}`)
                promises.push(perpTrade(client, group, mangoAccount,
                    perpMarket, midPrice, size, PerpOrderSide.ask, accountDefinition, false))
            }
        }
        console.log('Awaiting', promises.length, 'transaction(s)')
        try {
            //await Promise.all(promises)
        } catch (e) {
            console.log('Promise regjected', e)
        }
    }
    return promises
}


async function main(): Promise<void> {
    const NUM_MINUTES = 0.75
    const names = ['PRIVATE3']
    const accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
       //.filter((f: any) => names.includes(f.name));
    const clients: Map<string, any> = new Map()

    const minusThreshold = -50
    const plusThreshold = 50
    const healthThreshold = 30
    const tradeSize = 1
    while (true) {
        console.log('Sniping Bot', new Date().toTimeString())
        let numberOfTransactions = 0
        for (const accountDefinition of accountDefinitions) {
            try {
                let client = clients.get(accountDefinition.name)
                if (!client) {
                    client = await setupClient(accountDefinition)
                    clients.set(accountDefinition.name, client)
                }
                const transactions: any = await snipePrices(accountDefinition,
                    tradeSize,
                    minusThreshold,
                    plusThreshold, client.client,
                    client.mangoAccount, client.user, healthThreshold)
                numberOfTransactions += transactions?.length || 0
            } catch (e) {
                console.error('Error querying Mango', e)
            }
        }

        if (numberOfTransactions > 0) {
            if (NUM_MINUTES > 1) {
                console.log('#Transactions',numberOfTransactions,'Sleeping for', NUM_MINUTES, 'minutes')
            } else {
                console.log('#Transactions',numberOfTransactions,'Sleeping for', NUM_MINUTES * 60, 'seconds')
            }
            await sleep(1000 * 60 * NUM_MINUTES)
        } else {
            console.log('No transactions, sleeping for 5 seconds')
            await sleep(5000)
        }
    }
}

try {
    main();
} catch (error) {
    console.log(error);
}
