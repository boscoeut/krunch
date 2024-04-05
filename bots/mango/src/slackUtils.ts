import axios from "axios"
import { PERP_BUY_PRICE_BUFFER, PERP_SELL_PRICE_BUFFER } from "./constants"
import * as db from "./db"

const FUNDING_CHANNEL_ID = "C06S9MMH57B"
const ALERT_CHANNEL_ID = "C06S9L6EXDX"
export const postToSlackFunding = async (fundingRate: number) => {
    const data = {
        "channel": FUNDING_CHANNEL_ID,
        text: `Funding Rate: ${fundingRate.toFixed(3)}%`,
        blocks: [

            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `Funding Rate: *${fundingRate.toFixed(3)}%*`,
                },
            },

            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `${new Date().toLocaleTimeString()}`,
                },
            },
            {
                "type": "divider"
            }, {
                "type": "divider"
            }
        ]
    }
    await postToSlack(data)
}
export const postToSlackTradeError = async (
    account: string,
    perpSize: number,
    perpPrice: number,
    perpSide: "BUY" | "SELL",
    spotSide: 'BUY' | 'SELL',
    spotPrice: any,
    spotSize:number,
    error:string) => {

    
    const data = {
        "channel": ALERT_CHANNEL_ID,
        text: `${account} ${spotSide} Spot: ${spotPrice.toFixed(3)} Perp: ${perpSize} ${perpSide} ${perpPrice.toFixed(3)}`,
        blocks: [

            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `ERROR: ${account} ${spotSide} Spot: ${spotSize} ${spotPrice.toFixed(3)} Perp: ${perpSize} ${perpSide} ${perpPrice.toFixed(3)}`,
                },
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `ERROR: ${error}`,
                },
            },

            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `${new Date().toLocaleTimeString()}`,
                },
            },
            {
                "type": "divider"
            }, {
                "type": "divider"
            }
        ]
    }
    await postToSlack(data)
}
export const postToSlackTrade = async (
    account: string,
    solPrice: number,
    perpSize: number,
    perpPrice: number,
    perpSide: "BUY" | "SELL",
    spotSide: 'BUY' | 'SELL',
    spotPrice: any,
    spotSize:number,
    diffAmount:number) => {

    let tradeBlocks:any = []
    if (perpSize > 0) {
        tradeBlocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*${perpSide} PERP: ${perpSize} Price: ${perpPrice.toFixed(3)}*`,
            },
        })
    }
    if (spotSize > 0) {
        tradeBlocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*${spotSide} SPOT: ${spotSize} Price: ${spotPrice.toFixed(3)}*`,
            },
        })
    }
    const data = {
        "channel": ALERT_CHANNEL_ID,
        text: `${account} ${spotSide} Spot: ${spotPrice.toFixed(3)} Perp: ${perpSize} ${perpSide} ${perpPrice.toFixed(3)}`,
        blocks: [

            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*${account} ${solPrice.toFixed(3)}*`,
                },
            },
            ...tradeBlocks,
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `Diff Amount $${diffAmount.toFixed(3)}`,   
                },
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `${new Date().toLocaleTimeString()}`,
                },
            },
            {
                "type": "divider"
            }, {
                "type": "divider"
            }
        ]
    }
    await postToSlack(data)
}
export const postToSlackAlert = async (account: string, side: "BUY" | "SELL",
    diff: number, spotPrice: number, perpPrice: number, oraclePrice: number) => {
    const fundingRate = await db.getFundingRate()
    const message = `${account} ${side} Perp: ${(diff + PERP_BUY_PRICE_BUFFER).toFixed(3)}`
    const data = {
        "channel": ALERT_CHANNEL_ID,
        text: message,
        blocks: [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*${account}: ${side} Perp: ${(diff + PERP_BUY_PRICE_BUFFER).toFixed(3)}*`,
                },
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `Funding Rate: *${fundingRate.toFixed(3)}%*`,
                },
            },

            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `Spot Price: ${spotPrice.toFixed(3)}`,
                },
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `Perp Price: ${perpPrice.toFixed(3)}`,
                },
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `Oracle Price: ${oraclePrice.toFixed(3)}`,
                },
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `Buffer: ${side === "SELL" ? PERP_SELL_PRICE_BUFFER : PERP_BUY_PRICE_BUFFER} : ${new Date().toLocaleTimeString()}`,
                },
            },
            {
                "type": "divider"
            }, {
                "type": "divider"
            }
        ]
    }
    await postToSlack(data)
}

export const postToSlackPriceAlert = async (
    oracle: number,
    bestBid:number,
    bestAsk:number,
    buySpread:number,
    sellSpread:number) => {
    
    const alertType = buySpread > sellSpread ? 'BUY' : 'SELL'
    const spread = buySpread > sellSpread ? buySpread : sellSpread

    const data = {
        "channel": ALERT_CHANNEL_ID,
        text: `${alertType} Spread: ${buySpread.toFixed(3)} `,
        blocks: [

            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*${alertType} ${spread.toFixed(3)}*`,
                },
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `SOL=$${oracle.toFixed(3)}.  Bid=$${bestBid.toFixed(3)} Ask=$${bestAsk.toFixed(3)}`,   
                },
            },
            {
                "type": "divider"
            }, {
                "type": "divider"
            }
        ]
    }
    await postToSlack(data)
}

export const postToSlack = async (data: any) => {
    console.log('Posting to slack')
    const token = process.env.SLACK_TOKEN
    const url = "https://slack.com/api/chat.postMessage"
    const headers = {
        'Content-type': 'application/json',
        'Authorization': `Bearer ${token}`
    }
    try {
        await axios.post(url, data, { headers })
    } catch (e: any) {
        console.log('Error posting to slack:', e.message)
    }

}
