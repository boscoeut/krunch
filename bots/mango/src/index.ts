import { HealthType, MANGO_V4_ID, MangoClient, toUiDecimalsForQuote } from '@blockworks-foundation/mango-v4';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import axios from 'axios';
import { Cluster, Connection, Keypair, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import * as bip39 from 'bip39';
const { authenticate } = require('@google-cloud/local-auth');
import path from 'path';
const { google } = require('googleapis');


const SPREADSHEET_ID = '1-k6Lv4quwIS-rRck-JYLA0WiuC9x43nDuMa_95q8CIw';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const CONNECTION_URL = 'https://solana-mainnet.g.alchemy.com/v2/YgL0vPVzbS8fh9y5l-eb35JE2emITsv0';
const CLUSTER_URL = CONNECTION_URL;
const GROUP_PK =
    process.env.GROUP_PK || '78b8f4cGCwmZ9ysPFMWLaLTkkaYnUjwMJYStWe5RTSSX';
const CLUSTER: Cluster =
    (process.env.CLUSTER_OVERRIDE as Cluster) || 'mainnet-beta';

const TOKEN_PATH = path.join(process.cwd(), 'secrets/token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'secrets/google_creds.json');

type AccountDefinition = {
    name: string,
    key: string;
    usd: number;
    jup: number;
};
type AccountDetail = {
    account: string;
    name: string,
    jupBasis: number;
    fundingAmount: number;
    interestAmount: number;
    solAmount: number;
    borrow: number;
    usdBasis: number;
    funding: number;
    health: number;
    equity: number;
};

function loadSavedCredentialsIfExist() {
    try {
        const content = fs.readFileSync(TOKEN_PATH, 'utf8');
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        return null;
    }
}

function saveCredentials(client: any) {
    const content = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8') as string);
    const key = content.installed || content.web;
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    fs.writeFileSync(TOKEN_PATH, payload);
}

async function authorize() {
    let client = loadSavedCredentialsIfExist();
    if (client) {
        return client;
    }
    client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    });
    if (client.credentials) {
        saveCredentials(client);
    }
    return client;
}

function toGoogleSheetsDate(date: Date) {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const zeroDate = new Date('1899-12-30T00:00:00Z');
    return (date.getTime() - zeroDate.getTime()) / MS_PER_DAY;
}

async function updateGoogleSheet(accountDetails: AccountDetail[] = [], fundingRate: number, solPrice: number) {
    try {

        const client: any = await authorize();
        const googleSheets = google.sheets({ version: 'v4', auth: client });

        let startRow = 10

        let endRow = startRow + accountDetails.length
        const SPREADSHEET_RANGE = `SOL!A${startRow}:J${endRow}`;
        const values = accountDetails.map((accountDetail) => {
            return [
                accountDetail.name,
                accountDetail.funding,
                accountDetail.borrow,
                accountDetail.equity,
                accountDetail.health / 100,
                accountDetail.interestAmount,
                accountDetail.usdBasis,
                accountDetail.jupBasis,
                accountDetail.solAmount,
                toGoogleSheetsDate(new Date())]
        });
        const request = {
            spreadsheetId: SPREADSHEET_ID,
            range: SPREADSHEET_RANGE,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values,
            },
        };
        const response = await googleSheets.spreadsheets.values.update(request);
        console.log(response.data);

        const request2 = {
            spreadsheetId: SPREADSHEET_ID,
            range: `SOL!B1:B2`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [[solPrice],[fundingRate * 24 * 365]],
            },
        };
        const response2 = await googleSheets.spreadsheets.values.update(request2);
        console.log(response2.data);


    } catch (e) {
        console.log(e)
    }
}

async function getFundingRate() {
    const fundingRate = await axios.get('https://api.mngo.cloud/data/v4/one-hour-funding-rate?mango-group=78b8f4cGCwmZ9ysPFMWLaLTkkaYnUjwMJYStWe5RTSSX')
    const data: any = fundingRate.data
    const hourlyRate = data.find((d: any) => d.name === 'SOL-PERP').funding_rate_hourly
    return hourlyRate
}


async function getAccountData(
    accountDefinition: AccountDefinition,
    client: any,
    perpMarket: any,
    bank: any,
    group: any,
) {
    const mangoAccount = await client.getMangoAccount(new PublicKey(accountDefinition.key));
    
    const pp = mangoAccount
        .perpActive()
        .find((pp: any) => pp.marketIndex === perpMarket.perpMarketIndex);

    let fundingAmount = 0;
    let interestAmount = 0;
    let solAmount = 0;
    if (pp) {
        fundingAmount += pp.getCumulativeFundingUi(perpMarket);
        solAmount = pp.basePositionLots.toNumber() / 100
    }
    if (bank) {
        interestAmount += mangoAccount.getCumulativeInterest(bank)
    }
    let borrow = toUiDecimalsForQuote(mangoAccount.getCollateralValue(group)!.toNumber())
    const equity = toUiDecimalsForQuote(mangoAccount.getEquity(group)!.toNumber())
    return {
        account: accountDefinition.key,
        name: accountDefinition.name,
        jupBasis: accountDefinition.jup,
        fundingAmount,
        interestAmount: toUiDecimalsForQuote(interestAmount),
        solAmount,
        borrow,
        usdBasis: accountDefinition.usd,
        funding: fundingAmount,
        health: mangoAccount.getHealthRatio(group, HealthType.maint)!.toNumber(),
        equity
    }
}


async function queryMango(): Promise<void> {
    // [{"DRIFT": {
    //     "key": "xxx",
    //     "usd": 0,
    //     "jup": 4538
    // }}]
    const accounts: Array<AccountDefinition> = JSON.parse(fs.readFileSync('./secrets/config.json', 'utf8') as string);
    const options = AnchorProvider.defaultOptions();
    const connection = new Connection(CLUSTER_URL!, options);

    const wallet = new Wallet(new Keypair());
    const provider = new AnchorProvider(connection, wallet, options);
    const client = MangoClient.connect(provider, CLUSTER, MANGO_V4_ID[CLUSTER], {
        idsSource: 'get-program-accounts',
    });
    const group = await client.getGroup(new PublicKey(GROUP_PK));
    const values = group.perpMarketsMapByMarketIndex.values()
    const perpMarket: any = Array.from(values).find((perpMarket) => perpMarket.name === 'SOL-PERP');

    const solPrice = perpMarket.price.toNumber()*1000
    const hourlyRate = await getFundingRate()


    const banks = Array.from(group.banksMapByName.values()).flat();
    const bank = banks.find((bank) => bank.name === 'USDC');

    let borrowAvailable = 0
    let totalUsdBasis = 0
    let totalJupBasis = 0
    let totalFunding = 0
    let totalInterest = 0
    let totalEquity = 0

    let accountDetails: any = []
    for (const accountDefinition of accounts) {
        try {
            const accountData = await getAccountData(accountDefinition, client, perpMarket, bank, group)
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
    await updateGoogleSheet(accountDetails, hourlyRate, solPrice)
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function createKeypair() {
    let mnemonic = bip39.generateMnemonic();
    console.log(mnemonic);
    console.log(mnemonic.replace(/ /g, ''));
    const seed = bip39.mnemonicToSeedSync(mnemonic).slice(0, 32);
    const keypair = Keypair.fromSeed(seed);
    const publicKey  = keypair.publicKey.toBase58()
    console.log(publicKey); // Print the public key
}

async function main(): Promise<void> {
    const NUM_MINUTES = 1.5
    //createKeypair()
    while (true) {
        console.log('Running Mango Bot', new Date().toTimeString())
        try {

            await queryMango()
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
