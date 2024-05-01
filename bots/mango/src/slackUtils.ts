import axios from "axios"

const FUNDING_CHANNEL_ID = "C06S9MMH57B"
const TRADE_CHANNEL_ID = "C06S9L6EXDX"
const ALERT_CHANNEL_ID = "C06TJNYLJRG"

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
    spotSize: number,
    error: string) => {


    const data = {
        "channel": TRADE_CHANNEL_ID,
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
    spotSize: number,
    diffAmount: number,
    market:string,
    type:string) => {

    let tradeBlocks: any = []
    if (type === "PERP") {
        tradeBlocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*${market} ${perpSide} PERP: ${perpSize} Price: ${perpPrice.toFixed(3)}*`,
            },
        })
    }
    if (type==="SPOT") {
        tradeBlocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*${market} ${spotSide} SPOT: ${spotSize} Price: ${spotPrice.toFixed(3)}*`,
            },
        })
    }
    const data = {
        "channel": TRADE_CHANNEL_ID,
        text: `${account} ${spotSide} Spot: ${spotPrice.toFixed(3)} Perp: ${perpSize} ${perpSide} ${perpPrice.toFixed(3)}`,
        blocks: [

            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*${market} ${account} ${solPrice.toFixed(3)}*`,
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
    diff: number, spotPrice: number, perpPrice: number, oraclePrice: number, fundingRate: number) => {
    const message = `${account} ${side} Perp: ${(diff).toFixed(3)}`
    const data = {
        "channel": ALERT_CHANNEL_ID,
        text: message,
        blocks: [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*${account}: ${side} Perp: ${(diff).toFixed(3)}*`,
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
    bestBid: number,
    bestAsk: number,
    buySpread: number,
    sellSpread: number) => {

    const alertType = buySpread > sellSpread ? 'BUY' : 'SELL'
    const spread = buySpread > sellSpread ? buySpread : sellSpread

    const data = {
        "channel": ALERT_CHANNEL_ID,
        text: `${alertType} Spread: ${spread.toFixed(3)} `,
        blocks: [

            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*${alertType} ${spread.toFixed(3)} DIFF*`,
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
    const token = process.env.SLACK_TOKEN
    const url = "https://slack.com/api/chat.postMessage"
    const headers = {
        'Content-type': 'application/json',
        'Authorization': `Bearer ${token}`
    }
    try {
        const SLACK_ARELRTS_ON = true
        if (SLACK_ARELRTS_ON && data.channel === TRADE_CHANNEL_ID) {
            const result = await axios.post(url, data, { headers })
            console.log('posted to slack    ', result)
        }
    } catch (e: any) {
        console.log('Error posting to slack:', e.message)
    }

}
