import { PublicKey } from "@solana/web3.js";

export const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
export const SOL_MINT = new PublicKey("Fx84E9SUstSvQN4pq56xcG4hXghkeAMoL6W6ajCnZjyt")
export const USDT_MINT = new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB")
export const BTC_MINT = new PublicKey("3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh")
export const ETH_MINT = new PublicKey("7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs")
export const SOL_USD_FEED = new PublicKey("CH31Xns5z3M1cTAbKW34jcxPPciazARpijcHj9rxtemt")
export const USDC_USD_FEED = new PublicKey("GzGuoKXE8Unn7Vcg1DtomwD27tL4bVUpSK2M1yk6Xfz5")
export const USDT_USD_FEED = new PublicKey("8vAuuqC5wVZ9Z9oQUGGDSjYgudTfjmyqGU5VucQxTk5U")
export const ETH_USD_FEED = new PublicKey("716hFAECqotxcXcj8Hs8nr7AG6q9dBw2oX3k3M8V7uGq")
export const BTC_USD_FEED = new PublicKey("Cv4T27XbjVoKUYwP72NQQanvZeA7W4YF9L4EnYT9kx5o")
export const CHAINLINK_PROGRAM="HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny"
// export const NETWORK_URL="https://shiny-halibut-7vpx9xx4wj2x579-3000.app.github.dev/" // codespaces
export const NETWORK_URL = "http://localhost:8899";

export const PRICE_DECIMALS = 10 ** 9;
export const FEE_DECIMALS = 10 ** 4;
export const MARKET_WEIGHT_DECIMALS = 10 ** 4;
export const AMOUNT_DECIMALS = 10 ** 9;
export const LEVERAGE_DECIMALS = 10 ** 4;

// export const ADMIN_ADDRESS="EDsmoWKuanmGubggz7XxTYX6qc3LtWgXj39qSikEqk7S" // codespaces
export const ADMIN_ADDRESS="HQj2MtJPNK1MvdHidVxEMZCtRwkxMPL9MVf2gt3rSKHS" // local
export const TOKEN_PROGRAM_ID="TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
export const ASSOCIATED_TOKEN_PROGRAM_ID="ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
// export const KRUNCH="5DLAQZJ4hPpgur3XAyot61xCHuykBeDhVVyopWtcWNkm" // codespaces
export const KRUNCH="EnZBKfVmLQre1x8K42DJtEzNe8AbRHoWacxkLMf3fr52" // local address

export const MARKETS= [{
    name:"SOL/USD",
    feedAddress:SOL_USD_FEED.toString(),
    marketIndex:1
},{
    name:"BTC/USD",
    feedAddress:BTC_USD_FEED.toString(),
    marketIndex:2
},{
    name:"ETH/USD",
    feedAddress:ETH_USD_FEED.toString(),
    marketIndex:3
}]

export const EXCHANGE_POSITIONS = [{
    decimals: 9,
    mint: SOL_MINT,
    feedAddress: SOL_USD_FEED,
    market:"SOL/USD",
}, {
    decimals: 6,
    mint: USDC_MINT,
    feedAddress: USDC_USD_FEED,
    market:"USDC/USD",
}, {
    decimals: 8,
    mint: BTC_MINT,
    feedAddress: BTC_USD_FEED,
    market:"BTC/USD",
}, {
    decimals: 6,
    mint: USDT_MINT,
    feedAddress: USDT_USD_FEED,
    market:"USDT/USD",
}, {
    decimals: 8,
    mint: ETH_MINT,
    feedAddress: ETH_USD_FEED,
    market:"ETH/USD",
}]

