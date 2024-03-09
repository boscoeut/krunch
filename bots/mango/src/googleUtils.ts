import fs from 'fs';
import path from 'path';
import { DB_KEYS, Increment, getItems, getItem } from './db';
import { AccountDetail, PendingTransaction } from './types';

import { SPREADSHEET_ID } from './constants';
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = path.join(process.cwd(), 'secrets/token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'secrets/google_creds.json');
const  START_ROW = 10

export function loadSavedCredentialsIfExist() {
    try {
        const content = fs.readFileSync(TOKEN_PATH, 'utf8');
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        return null;
    }
}

export async function updateGoogleSheet(googleSheets: any,
    accountDetails: AccountDetail[] = []
    ) {
    try {
        const fundingRate = getItem<number>(DB_KEYS.FUNDING_RATE)        
        const jupPrice= <{solPrice:number, jupPrice:number}>getItem(DB_KEYS.JUP_PRICE)
        const solPrice = getItem<number>(DB_KEYS.SOL_PRICE) || jupPrice.solPrice

        const openTransactions: PendingTransaction[] = getItems([DB_KEYS.SWAP])
        // clear old transactions
        const transactionRow = 20
        const maxTransactionRows = 20
        const result = await googleSheets.spreadsheets.values.clear({
            spreadsheetId: SPREADSHEET_ID,
            range: `SOL!A${transactionRow + openTransactions.length}:G${transactionRow + maxTransactionRows - openTransactions.length}`
        });

        //  accounts
        let endRow = START_ROW + accountDetails.length
        const ACCOUNT_VALUES_RANGE = `SOL!A${START_ROW}:N${endRow}`;
        const accountValues = accountDetails.map((accountDetail) => {
            return [
                accountDetail.name,
                accountDetail.historicalFunding,
                accountDetail.borrow,
                accountDetail.equity,
                accountDetail.health / 100,
                accountDetail.interestAmount,
                accountDetail.usdBasis,
                accountDetail.jupBasis,
                accountDetail.solAmount,
                toGoogleSheetsDate(new Date()),
                accountDetail.solBalance,
                accountDetail.walletSol,
                accountDetail.walletUsdc,
                accountDetail.usdcBalance
            ]
        });

        const bestBid = accountDetails[0].bestBid
        const bestAsk = accountDetails[0].bestAsk

        const transactionValues: any = []
        openTransactions.forEach((pendingTx) => {
            const amount = pendingTx.amount
            transactionValues.push([
                pendingTx.accountName,
                pendingTx.type,
                pendingTx.status,
                pendingTx.price,
                pendingTx.oracle,
                pendingTx.type.startsWith('PERP') || pendingTx.type.startsWith('JUP') ?  amount : amount / solPrice,
                toGoogleSheetsDate(new Date(pendingTx.timestamp))
            ])
        })

        // update stats
        const statValues: Increment[] = getItems([DB_KEYS.NUM_TRADES, DB_KEYS.NUM_TRADES_FAIL, DB_KEYS.NUM_TRADES_SUCCESS])
        statValues.sort((a: Increment, b: Increment) => a.key.localeCompare(b.key));
        const stats = statValues.map((stat) => [stat.key, stat.item]);
        

        await googleSheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                valueInputOption: 'USER_ENTERED',
                data: [
                    {
                    range: `SOL!J${transactionRow}:K${transactionRow + statValues.length}`,
                    values: stats,

                }, 
                {
                    range: `SOL!A${transactionRow}:G${transactionRow + maxTransactionRows}`,
                    values: transactionValues,

                }, {
                    range: `SOL!B1:C2`,
                    values: [[solPrice, bestBid],
                    [fundingRate/100, bestAsk]],

                }, {
                    range: ACCOUNT_VALUES_RANGE,
                    values: accountValues,

                }, {
                    range: `SOL!O1:O2`,
                    values: [[jupPrice.solPrice],[jupPrice.jupPrice]],
                }]
            }
        });
    } catch (e) {
        console.error('Error updating google sheet', e);
    }
}

export function saveCredentials(client: any) {
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

export async function authorize() {
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

export function toGoogleSheetsDate(date: Date) {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const zeroDate = new Date('1899-12-30T00:00:00Z');
    return (date.getTime() - zeroDate.getTime()) / MS_PER_DAY;
}
