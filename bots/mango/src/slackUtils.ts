import axios from "axios"
import { PERP_BUY_PRICE_BUFFER, PERP_SELL_PRICE_BUFFER } from "./constants"
import { DB_KEYS } from "./db"
import * as db from "./db"

export const postToSlack = async (account: string, side: "BUY" | "SELL",
    diff: number, spotPrice:number, perpPrice:number, oraclePrice:number) => {
    const url = 'https://hooks.slack.com/services/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'
    const headers = {
        'Content-type': 'application/json'
    }
    const fundingRate = await db.get<number>(DB_KEYS.FUNDING_RATE)
    const message = `${account} ${side} Perp: ${(diff + PERP_BUY_PRICE_BUFFER).toFixed(3)}`
    const data = {
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
                    text: `Buffer: ${side === "SELL"? PERP_SELL_PRICE_BUFFER: PERP_BUY_PRICE_BUFFER } : ${new Date().toLocaleTimeString()}`,
                },
            },
            {
                "type": "divider"
            }, {
                "type": "divider"
            }
        ]
    }
    await axios.post(url, data, { headers })
}
