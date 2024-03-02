import fs from 'fs';
import path from 'path';
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');
import { AccountDetail, PendingTransaction } from './mangoUtils';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = path.join(process.cwd(), 'secrets/token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'secrets/google_creds.json');

export const SPREADSHEET_ID = '1-k6Lv4quwIS-rRck-JYLA0WiuC9x43nDuMa_95q8CIw';

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
    openTransactions: PendingTransaction[] = []) {
    try {
        let startRow = 10

        let endRow = startRow + accountDetails.length
        const SPREADSHEET_RANGE = `SOL!A${startRow}:K${endRow}`;
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
                toGoogleSheetsDate(new Date()),
                accountDetail.solBalance
            ]
        });
        const request = {
            spreadsheetId: SPREADSHEET_ID,
            range: SPREADSHEET_RANGE,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values,
            },
        };
        await googleSheets.spreadsheets.values.update(request);

        const request2 = {
            spreadsheetId: SPREADSHEET_ID,
            range: `SOL!B1:B2`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [[solPrice], [fundingRate * 24 * 365]],
            },
        };
        await googleSheets.spreadsheets.values.update(request2);

        const transactionRow = 20
        const maxTransactionRows = 20
        await googleSheets.spreadsheets.values.clear({
            spreadsheetId: SPREADSHEET_ID,
            range: `SOL!A${transactionRow+ openTransactions.length}:F${transactionRow + maxTransactionRows - openTransactions.length}`
        });

        if (openTransactions.length > 0) {
            const transactionValues: any = []
            openTransactions.forEach((pendingTx) => {
                transactionValues.push([
                    pendingTx.accountName,
                    pendingTx.type,
                    pendingTx.side,
                    pendingTx.price,
                    pendingTx.oracle,
                    pendingTx.type === 'PERP'? pendingTx.amount : pendingTx.amount / solPrice,
                ])
            })

            const request3 = {
                spreadsheetId: SPREADSHEET_ID,
                range: `SOL!A${transactionRow}:F${transactionRow + maxTransactionRows}`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: transactionValues,
                },
            };
            await googleSheets.spreadsheets.values.update(request3);
        }


    } catch (e) {
        console.log(e)
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
