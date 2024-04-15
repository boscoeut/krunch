import fs from 'fs';
import path from 'path';
import * as db from './db';
import { AccountDetail, FundingRates, OpenTransaction } from './types';

import { SPREADSHEET_ID } from './constants';
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = path.join(process.cwd(), 'secrets/token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'secrets/google_creds.json');

export function loadSavedCredentialsIfExist() {
    try {
        const content = fs.readFileSync(TOKEN_PATH, 'utf8');
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        return null;
    }
}

export async function updateGoogleSheet(
    fundingRates:FundingRates,
    googleSheets: any,
    accountDetails: AccountDetail[] = [], fee: number, 
    transactionCache: OpenTransaction[] = [],bestBuyPrice:number,bestSellPrice:number,
    solPrice: number
) {
    try {
        const jupPrice = await db.fetchJupPrice()
        const wormholePrice = jupPrice.wormholePrice || 0
        const feeEstimate = await db.getFeeEstimate(true) || 0

        //  accounts
        accountDetails.sort((a, b) => a.name.localeCompare(b.name));
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
                accountDetail.usdcBalance,
                accountDetail.fundingAmount,
                db.tradeHistory.get(accountDetail.name) || 0,
                accountDetail.ethAmount,
                accountDetail.ethBalance,
                accountDetail.btcAmount,
                accountDetail.btcBalance,
                accountDetail.ethFundingAmount,
                accountDetail.btcFundingAmount,
                accountDetail.ethBestBid,
                accountDetail.ethBestAsk,
                accountDetail.btcBestBid,
                accountDetail.btcBestAsk,
                accountDetail.btcPrice,
                accountDetail.ethPrice,
            ]
        });

        const bestBid = accountDetails[0]?.bestBid || 0
        const bestAsk = accountDetails[0]?.bestAsk || 0

        // transactions
        const transactionValues:any[] = []
        for(let i=0; i<10; i++) {  
            let transaction:any = transactionCache[i]
            if (!transaction){
                transactionValues.push(["","","","","","","",""])
            }else{
                transactionValues.push([
                    toGoogleSheetsDate(transaction.date),
                    transaction.account,
                    transaction.side,
                    transaction.price,
                    transaction.size,
                    transaction.type,
                    transaction.market + (transaction.error ? ` - ${transaction.error}` : ""),
                    transaction.error || "N/A"
                ])
            }
            
        }

        await googleSheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                valueInputOption: 'USER_ENTERED',
                data: [                    
                    {
                        range: `Account_Data!A2:AB${accountValues.length + 1}`,
                        values: accountValues.map((accountDetail) => {
                            return accountDetail
                        }),
                    },
                    {
                        range: `Market_data!B1:B17`,
                        values: [
                            [fundingRates.solFundingRate / 100],
                            [fee],
                            [feeEstimate],
                            [solPrice],
                            [jupPrice.solPrice],
                            [jupPrice.jupPrice],
                            [wormholePrice],
                            [bestBid],
                            [bestAsk],
                            [],
                            [],
                            [bestBuyPrice],
                            [bestSellPrice],
                            [fundingRates.btcFundingRate / 100],
                            [fundingRates.ethFundingRate / 100],
                            [jupPrice.btcPrice],
                            [jupPrice.ethPrice]
                        ],
                    },
                    {
                        range: `Transaction_Cache!A2:H11`,
                        values: transactionValues
                    }
                ]
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
