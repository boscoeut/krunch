// const tokens = await getTokenAccountsByOwnerWithWrappedSol(client.connection, user.publicKey)
import { getTokenAccountsByOwnerWithWrappedSol } from "./mangoUtils";
import { Connection, PublicKey } from "@solana/web3.js";
import { CLUSTER_URL, COMMITTMENT, SOL_MINT, USDC_MINT, JUP_MINT, W_MINT } from "./constants";
import fs from 'fs';
import { updateWallets } from "./googleUtils";
async function checkBalances() {
    const connection = new Connection(CLUSTER_URL!, {
        commitment: COMMITTMENT
    });
    let accounts: Array<any> = JSON.parse(fs.readFileSync('./secrets/accounts.json', 'utf8') as string)

    let allItems =[...accounts]

    const items: Array<any> = []

    for (const accountDefinition of allItems) {
        const publicKey = new PublicKey(accountDefinition.key);
        const tokens = await getTokenAccountsByOwnerWithWrappedSol(connection, publicKey)
        const usdcToken = tokens.find((t) => t.mint.toString() === USDC_MINT)
        const solToken = tokens.find((t) => t.mint.toString() === SOL_MINT)
        const jupToken = tokens.find((t) => t.mint.toString() === JUP_MINT)
        const wToken = tokens.find((t) => t.mint.toString() === W_MINT)

        const jup = jupToken?.uiAmount || 0
        const w = wToken?.uiAmount || 0
        const usdc = usdcToken?.uiAmount || 0
        const sol = solToken?.uiAmount || 0
        console.log(`Account: ${accountDefinition.name} SOL: ${sol} USDC: ${usdc} JUP: ${jup} W: ${w}`)
        items.push([accountDefinition.name, sol, usdc, jup, w])
    }
    await updateWallets(items)
}

try {
    console.log('get wallet balances')
    checkBalances()
} catch (error) {
    console.log(error);
}
