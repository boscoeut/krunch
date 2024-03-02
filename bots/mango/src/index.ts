import {
    Group,
    MangoAccount,
    MangoClient
} from '@blockworks-foundation/mango-v4';
import { Keypair, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import { authorize, updateGoogleSheet } from './googleUtils';
import { AccountDefinition, getAccountData, getClient, getFundingRate } from './mangoUtils';
const { google } = require('googleapis');


async function queryMango(googleSheets: any,
    client: MangoClient,
    mangoAccounts: Map<string, MangoAccount>,
    group: Group,
    accounts: Array<AccountDefinition>): Promise<void> {

    let solPrice = 0
    const hourlyRate = await getFundingRate()

    let borrowAvailable = 0
    let totalUsdBasis = 0
    let totalJupBasis = 0
    let totalFunding = 0
    let totalInterest = 0
    let totalEquity = 0

    let accountDetails: any = []
    for (const accountDefinition of accounts) {
        try {
            let mangoAccount = mangoAccounts.get(accountDefinition.key)
            if (!mangoAccount) {
                mangoAccount = await client.getMangoAccount(new PublicKey(accountDefinition.key));
            } else {
                await mangoAccount.reload(client);
            }
            const accountData = await getAccountData(accountDefinition, client, group, mangoAccount)
            solPrice = accountData.solPrice
            totalInterest += accountData.interestAmount
            totalFunding += accountData.funding
            totalUsdBasis += accountData.usdBasis
            totalJupBasis += accountData.jupBasis
            const key = accountDefinition.name
            if (accountData.borrow > 0) {
                borrowAvailable += accountData.borrow
            }
            totalEquity += accountData.equity
            console.log('--  --')
            console.log(key + " BORROW", accountData.borrow)
            console.log(key + " INTEREST", accountData.interestAmount)
            console.log(key + " VALUE", accountData.equity)
            console.log(key + " BASIS", accountData.usdBasis);
            console.log(key + " SOL", accountData.solAmount);
            console.log(key + " HEALTH", accountData.health)
            console.log(key + " FUNDING", accountData.funding)
            console.log(key + " SOL TOKEN", accountData.solBalance)
            accountDetails.push(accountData)
        } catch (x) {
            console.error(`Error fetching account data for ${accountDefinition.name}`, x)
        }
    }
    console.log('-- start --')
    console.log('TOTAL BASIS:', totalUsdBasis)
    console.log('JUP BASIS:', totalJupBasis)
    console.log('TOTAL EQUITY:', totalEquity)
    console.log('TOTAL INTEREST:', totalInterest)
    console.log('PNL:', totalEquity - totalUsdBasis - totalJupBasis)
    console.log('FUND RATE / HR:', Number((hourlyRate * 100).toFixed(4)), '%')
    console.log('FUND RATE APR:', Number((hourlyRate * 100 * 24 * 365).toFixed(3)), '%')
    console.log('BORROW AVAILABLE:', borrowAvailable)
    console.log('TOTAL FUNDING:', totalFunding)
    console.log('TIME:', new Date().toTimeString())
    console.log('-- end --')

    await updateGoogleSheet(googleSheets, accountDetails, hourlyRate, solPrice)
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


async function main(): Promise<void> {
    const NUM_MINUTES = 0.5
    const mangoAccounts: Map<string, any> = new Map()
    const accounts: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string);
    const googleClient: any = await authorize();
    const googleSheets = google.sheets({ version: 'v4', auth: googleClient });
    const { client, group, ids } = await getClient(new Keypair())

    while (true) {
        console.log('Running Mango Bot', new Date().toTimeString())
        try {
            await group.reloadBanks(client, ids)
            await group.reloadPerpMarkets(client, ids);
            await group.reloadPerpMarketOraclePrices(client);
            await queryMango(googleSheets, client, mangoAccounts, group, accounts)
        } catch (e) {
            console.error('Error querying Mango', e)
        }
        console.log('Sleeping for', NUM_MINUTES, 'minutes')
        await sleep(1000 * 60 * NUM_MINUTES)
    }
}

try {
    main();
} catch (error) {
    console.log(error);
}
