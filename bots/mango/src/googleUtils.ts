import fs from 'fs';
import path from 'path';
import * as db from './db';
import { AccountDetail, FundingRates, OpenTransaction } from './types';

import { SPREADSHEET_ID, TRANSACTION_CACHE_SIZE } from './constants';
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

export async function updateWallets(items: any[]) {
    try {
        const googleClient: any = await authorize();
        const googleSheets = google.sheets({ version: 'v4', auth: googleClient });
        await googleSheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                valueInputOption: 'USER_ENTERED',
                data: [
                    {
                        range: `Wallets!A4:E${items.length + 3}`,
                        values: items,
                    },
                    
                ]
            }
        });
    } catch (e) {
        console.error('Error updating google sheet', e);
    }
}

export async function updateGoogleSheet(
    fundingRates: FundingRates,
    googleSheets: any,
    accountDetails: AccountDetail[] = [], fee: number,
    transactionCache: OpenTransaction[] = [], bestBuyPrice: number, bestSellPrice: number,
    solPrice: number
) {
    try {
        const jupPrice = await db.fetchJupPrice()
        const wormholePrice = jupPrice.wormholePrice || 0
        const feeEstimate = await db.getFeeEstimate(true) || 0

        const borrowRate = db.getItem<number>(db.DB_KEYS.USDC_BORROW_RATE)
        const depositRate = db.getItem<number>(db.DB_KEYS.USDC_DEPOSIT_RATE)

        //  accounts
        accountDetails.sort((a, b) => a.name.localeCompare(b.name));
        const accountValues = accountDetails.map((accountDetail) => {
            const solOrders = db.getItem(db.DB_KEYS.OPEN_ORDERS, { cacheKey: accountDetail.name + '_' + 'SOL-PERP' }) || 0
            const btcOrders = db.getItem(db.DB_KEYS.OPEN_ORDERS, { cacheKey: accountDetail.name + '_' + 'BTC-PERP' }) || 0
            const ethOrders = db.getItem(db.DB_KEYS.OPEN_ORDERS, { cacheKey: accountDetail.name + '_' + 'ETH-PERP' }) || 0
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
                solOrders,
                btcOrders,
                ethOrders
            ]
        });

        const bestBid = accountDetails[0]?.bestBid || 0
        const bestAsk = accountDetails[0]?.bestAsk || 0

        // transactions
        const transactionValues: any[] = []
        for (let i = 0; i < TRANSACTION_CACHE_SIZE; i++) {
            let transaction: any = transactionCache[i]
            if (!transaction) {
                transactionValues.push(["", "", "", "", "", "", "", ""])
            } else {
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
                        range: `Account_Data!A2:AE${accountValues.length + 1}`,
                        values: accountValues.map((accountDetail) => {
                            return accountDetail
                        }),
                    },
                    {
                        range: `Market_data!B1:B19`,
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
                            [jupPrice.ethPrice],
                            [borrowRate || 0],
                            [depositRate || 0]
                        ],
                    },
                    {
                        range: `Transaction_Cache!A2:H${TRANSACTION_CACHE_SIZE+1}`,
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

export async function getTradeData(
    googleSheets: any
) {
    try {
        const sheetName = "MARKET_DATA"
        const response = await googleSheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,        
            range:`${sheetName}!H18:H19`,
        });

        const cellValues = response.data.values.flat();
        console.log(cellValues);

        const accountList:Array<string> = response.data.values?.[1]?.[0].split(",") || []
        return {
            tradingStatus:response.data.values?.[0]?.[0] === "TRUE",
            accountList
        }
    } catch (e) {
        console.error('Error reading google sheet', e);
    }
}