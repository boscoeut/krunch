import fs from 'fs';
import path from 'path';
import { AccountDetail, JupiterSwap, PendingTransaction } from './types';
import { getItem, getAll } from './db'

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
    accountDetails: AccountDetail[] = [],
    fundingRate: number,
    solPrice: number,
    openTransactions: PendingTransaction[] = [],
    jupPrice: number,
    jupSolPrice:number ) {
    try {
        
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
            const cacheKey = 'JUPSWAP' + pendingTx.accountName
            const jupSwap:JupiterSwap = getItem(cacheKey)
            const amount = pendingTx.type === 'JUPSWAP' ? jupSwap?.txAmount : pendingTx.amount
            transactionValues.push([
                pendingTx.accountName,
                pendingTx.type === 'JUPSWAP' ? 'JUP-' + jupSwap?.stage : pendingTx.type,
                pendingTx.side,
                pendingTx.price,
                pendingTx.oracle,
                pendingTx.type === 'PERP' || pendingTx.type === 'JUPSWAP' ?  amount : amount / solPrice,
                toGoogleSheetsDate(new Date(pendingTx.timestamp))
            ])
        })

        // update stats
        const db = getAll()
        const statValues: any = []
        for (const [key, value] of db.entries()) {
            if (key.indexOf('NUM') === -1) continue
            statValues.push([value, key])
        }
        statValues.sort((a: string, b: string) => a[1].localeCompare(b[1]));

        await googleSheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                valueInputOption: 'USER_ENTERED',
                data: [{
                    range: `SOL!J${transactionRow}:K${transactionRow + statValues.length}`,
                    values: statValues,

                }, {
                    range: `SOL!A${transactionRow}:G${transactionRow + maxTransactionRows}`,
                    values: transactionValues,

                }, {
                    range: `SOL!B1:C2`,
                    values: [[solPrice, bestBid],
                    [fundingRate * 24 * 365, bestAsk]],

                }, {
                    range: ACCOUNT_VALUES_RANGE,
                    values: accountValues,

                }, {
                    range: `SOL!O1:O2`,
                    values: [[jupSolPrice],[jupPrice]],
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
