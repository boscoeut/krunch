import {
    Group,
    MangoAccount,
    MangoClient,
    PerpOrderSide
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

async function snipePrices(minAmount: number,
    maxAmount: number,
    size: number,
    aprMinThreshold: number,
    aprMaxThreshold: number,
    client: MangoClient,
    mangoAccount: MangoAccount,
    user: Keypair
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
        console.error('Perp account not found');
        throw new Error('Perp account not found');
    }

    const usdcBalance = mangoAccount.getTokenBalanceUi(usdcBank);
    console.log('USDC  balance', usdcBalance)
    const solBalance = mangoAccount.getTokenBalanceUi(solBank);
    console.log('SOL balance', solBalance)
    const perpEquity = pp.basePositionLots.toNumber() / 100
    console.log('SOL PERP balance', perpEquity)

    const solPrice = perpMarket.price.toNumber() * 1000
    console.log('solPrice', solPrice)

    const perpIsMaxedOut = Math.abs(perpEquity) >= maxAmount
    const perpIsMinnedOut = Math.abs(perpEquity) <= minAmount
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
    console.log('FUND RATE / HR:', hourlyRate * 100, '%')
    console.log('FUND RATE APR:', hourlyRateAPR, '%')
    console.log('ACTION:', action)

    if (action === 'BUY') {

        const promises:any = [];
        if (spotUnbalanced && spotVsPerpDiff > 0) {
            console.log('SELL SOL', size, spotVsPerpDiff)
            const amount = spotUnbalanced && spotVsPerpDiff > 0 ? Number(Math.abs(spotVsPerpDiff).toFixed(2)) : Number(Math.abs(size).toFixed(2))
            promises.push(spotTrade(amount, solBank, usdcBank, client, mangoAccount, user, group, 'SELL'))
        } 
        if (!perpIsMinnedOut && spotVsPerpDiff <= size) {
            console.log('BUY BACK PERP', hourlyRateAPR, aprMinThreshold)
            const asks = await perpMarket.loadAsks(client);
            const bestAsk: any = asks.best();
            console.log(
                'bestAsk:', bestAsk.uiPrice,
                '< SOLPrice:', solPrice,
                'bestAskSize:', bestAsk.uiSize)
            if (bestAsk.uiPrice < solPrice) {
                const midPrice = (bestAsk.uiPrice + solPrice) / 2
                console.log('**** SNIPING',midPrice,"Oracle", solPrice, 'with bestAsk', bestAsk.uiPrice, 'and bestAskSize', `${size}/${bestAsk.uiSize}`)
                promises.push(perpTrade(client, group, mangoAccount,
                    perpMarket, bestAsk.uiPrice, size, PerpOrderSide.bid))
            }
        }
        await Promise.all(promises)
    }
    if (action === 'SELL') {
        if (spotUnbalanced && spotVsPerpDiff > 0) {
            console.log('BUY SOL', spotVsPerpDiff)
            const amount = solPrice * Math.abs(spotVsPerpDiff) + extraAmount
            await spotTrade(amount, usdcBank, solBank, client, mangoAccount, user, group, 'BUY')
        } else if (!perpIsMaxedOut) {
            console.log('SELL PERP', hourlyRateAPR, aprMaxThreshold)
            const bids = await perpMarket.loadBids(client);
            const bestBid: any = bids.best();
            console.log(
                'bestBid:', bestBid.uiPrice,
                '> SOLPrice:', solPrice,
                'bestBidSize:', bestBid.uiSize)
            if (bestBid.uiPrice > solPrice) {
                await perpTrade(client, group, mangoAccount,
                    perpMarket, bestBid.uiPrice, size, PerpOrderSide.ask)
                console.log('**** SNIPING', solPrice, 'with bestBid', bestBid.uiPrice, 'and bestBidSize', `${size}/${bestBid.uiSize}`)
            }
        }
    }
}


async function main(): Promise<void> {
    const NUM_MINUTES = 0.25
    const accountDefinitions: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string)
        .filter((f: any) => f.name === 'SIX');
    const accountDefinition = accountDefinitions[0]
    const { client, user,  mangoAccount } = await setupClient(accountDefinition)

    while (true) {
        console.log('Sniping Bot', new Date().toTimeString())
        for (const accountDefinition of accountDefinitions) {
            try {
                await snipePrices(50, 100, 1, -50, 50,
                    client, mangoAccount, user)
            } catch (e) {
                console.error('Error querying Mango', e)
            }
        }
        if (NUM_MINUTES > 1) {
            console.log('Sleeping for', NUM_MINUTES, 'minutes')
        } else {
            console.log('Sleeping for', NUM_MINUTES * 60, 'seconds')
        }
        await sleep(1000 * 60 * NUM_MINUTES)
    }
}

try {
    main();
} catch (error) {
    console.log(error);
}
