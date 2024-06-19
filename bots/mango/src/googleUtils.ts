import fs from 'fs';
import path from 'path';
import * as db from './db';
import { AccountDetail, FundingRates, OpenTransaction } from './types';

import { MAX_FEE, SPREADSHEET_ID, TRANSACTION_CACHE_SIZE } from './constants';
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
                        range: `Wallets!A4:F${items.length + 3}`,
                        values: items,
                    },

                ]
            }
        });
    } catch (e) {
        console.error('Error updating google sheet', e);
    }
}

export async function updateDriftSheet(
    driftAccounts: Array<any> = []
) {
    const googleClient: any = await authorize();
    const googleSheets = google.sheets({ version: 'v4', auth: googleClient });
    await googleSheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
            valueInputOption: 'USER_ENTERED',
            data: [
                {
                    range: `DRIFT_ACCOUNT_DATA!A2:AF${driftAccounts.length + 1}`,
                    values: driftAccounts.map((accountDetail) => {
                        return Object.values(accountDetail)
                    }),
                }
            ]
        }
    });
}

export async function updateGoogleSheet(
    fundingRates: FundingRates,
    googleSheets: any,
    accountDetails: AccountDetail[] = [], fee: number,
    transactionCache: OpenTransaction[] = [], bestBuyPrice: number, bestSellPrice: number,
    solPrice: number,
    driftAccounts: Array<any> = []
) {
    try {
        const jupPrice = await db.fetchJupPrice()
        const wormholePrice = jupPrice.wormholePrice || 0
        const driftPrice = jupPrice.driftPrice || 0
        const feeEstimate = await db.getFeeEstimate(true) || 0

        const borrowRate = db.getItem<number>(db.DB_KEYS.USDC_BORROW_RATE)
        const depositRate = db.getItem<number>(db.DB_KEYS.USDC_DEPOSIT_RATE)

        //  accounts
        accountDetails.sort((a, b) => a.name.localeCompare(b.name));
        const accountValues = accountDetails.map((accountDetail) => {
            const solOrders = db.getItem(db.DB_KEYS.OPEN_ORDERS, { cacheKey: accountDetail.name + '_' + 'SOL-PERP' }) || 0
            const btcOrders = db.getItem(db.DB_KEYS.OPEN_ORDERS, { cacheKey: accountDetail.name + '_' + 'BTC-PERP' }) || 0
            const ethOrders = db.getItem(db.DB_KEYS.OPEN_ORDERS, { cacheKey: accountDetail.name + '_' + 'ETH-PERP' }) || 0
            const renderOrders = db.getItem(db.DB_KEYS.OPEN_ORDERS, { cacheKey: accountDetail.name + '_' + 'RENDER-PERP' }) || 0
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
                ethOrders,
                accountDetail.renderAmount,
                accountDetail.renderFundingAmount,
                renderOrders
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
                        range: `DRIFT_ACCOUNT_DATA!A2:AF${driftAccounts.length + 1}`,
                        values: driftAccounts.map((accountDetail) => {
                            return Object.values(accountDetail)
                        }),
                    },
                    {
                        range: `Account_Data!A2:AH${accountValues.length + 1}`,
                        values: accountValues.map((accountDetail) => {
                            return accountDetail
                        }),
                    },
                    {
                        range: `Market_data!B1:B21`,
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
                            [driftPrice],
                            [],
                            [bestBuyPrice],
                            [bestSellPrice],
                            [fundingRates.btcFundingRate / 100],
                            [fundingRates.ethFundingRate / 100],
                            [jupPrice.btcPrice],
                            [jupPrice.ethPrice],
                            [borrowRate || 0],
                            [depositRate || 0],
                            [fundingRates.rndrFundingRate / 100],
                            [jupPrice.renderPrice]
                        ],
                    },
                    {
                        range: `Transaction_Cache!A2:H${TRANSACTION_CACHE_SIZE + 1}`,
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

export async function updateBotRunDetails(googleSheets: any, lastConfirmed: number) {
    const sheetName = "DashboardDM"
    await googleSheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
            valueInputOption: 'RAW',
            data: [
                {
                    range: `${sheetName}!D_BOT_LAST_CONFIRMED`,
                    values: [[lastConfirmed]],
                }
            ]
        }
    });
}

export async function getBotRunDetails(
    googleSheets: any
) {
    try {
        const sheetName = "DashboardDM"
        const response = await googleSheets.spreadsheets.values.batchGet({
            spreadsheetId: SPREADSHEET_ID,
            ranges: [`${sheetName}!D_BOT_LAST_UPDATED`, `${sheetName}!D_BOT_LAST_CONFIRMED`]
        });
        const cellValues = response.data.valueRanges;
        return [Number(cellValues[0].values[0][0]),
        Number(cellValues[1].values[0][0])]
    } catch (e) {
        console.error('Error reading google sheet', e);
        throw e
    }
}

export async function getDiffs(
    googleSheets: any
) {
    try {
        const sheetName = "Phone"
        const response = await googleSheets.spreadsheets.values.batchGet({
            spreadsheetId: SPREADSHEET_ID,
            ranges: [`${sheetName}!H14:H17`]
        });
        const cellValues = response.data.valueRanges;
        return cellValues[0]
    } catch (e) {
        console.error('Error reading google sheet', e);
        throw e
    }
}

export async function getTradingParameters(
    googleSheets: any
) {
    try {
        const sheetName = "MARKET_DATA"
        const response = await googleSheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!H18:H29`,
        });

        const cellValues = response.data.values.flat();
        console.log(cellValues);

        const accountList: Array<string> = response.data.values?.[1]?.[0].split(",") || []
        const result = {
            tradingStatus: response.data.values?.[0]?.[0] === "TRUE",
            accountList,
            shortRateThreshold: Number(response.data.values?.[2]?.[0]),
            longRateThreshold: Number(response.data.values?.[3]?.[0]),
            solTradeSize: Number(response.data.values?.[4]?.[0]),
            buyPriceBuffer: Number(response.data.values?.[5]?.[0]),
            sellPriceBuffer: Number(response.data.values?.[6]?.[0]),
            jupiterSpotSlippage: Number(response.data.values?.[7]?.[0]),
            priorityFee: Number(response.data.values?.[8]?.[0]),
            minHealthFactor: Number(response.data.values?.[9]?.[0]),
            driftHealthFactor: Number(response.data.values?.[10]?.[0]),
            freeCashLimit: Number(response.data.values?.[11]?.[0]),
        }

        // check values
        if (result.shortRateThreshold < 10) {
            throw new Error("Short rate threshold is too low:" + result.shortRateThreshold)
        }
        if (result.longRateThreshold > 10) {
            throw new Error("Long rate threshold is too high: " + result.longRateThreshold)
        }
        if (result.solTradeSize > 3.5) {
            throw new Error("Sol Trade Size is to High: " + result.solTradeSize)
        }
        if (result.buyPriceBuffer < 0.001) {
            throw new Error("buyPriceBuffer is to low: " + result.buyPriceBuffer)
        }
        if (result.sellPriceBuffer < 0.001) {
            throw new Error("sellPriceBuffer is to low: " + result.sellPriceBuffer)
        }
        if (result.priorityFee > MAX_FEE) {
            throw new Error("priorityFee is to high: " + result.priorityFee + " MAX_FEE=" + MAX_FEE)
        }
        return result
    } catch (e) {
        console.error('Error reading google sheet', e);
        throw e
    }
}