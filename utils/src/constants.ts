import { PublicKey } from "@solana/web3.js";


export const NETWORK: 'Localnet'|'Devnet'|'Mainnet' = "Devnet";

let networkUrl = "http://localhost:8899" // Localnet
let adminAddress = "HQj2MtJPNK1MvdHidVxEMZCtRwkxMPL9MVf2gt3rSKHS" 
let tokenProgramId = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
let associatedTokenProgramId = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
let usdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
let solMint = new PublicKey("Fx84E9SUstSvQN4pq56xcG4hXghkeAMoL6W6ajCnZjyt")
let usdtMint = new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB")
let btcMint = new PublicKey("3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh")
let ethMint = new PublicKey("7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs")
let solUsdFeed = new PublicKey("CH31Xns5z3M1cTAbKW34jcxPPciazARpijcHj9rxtemt")
let usdcUsdFeed = new PublicKey("GzGuoKXE8Unn7Vcg1DtomwD27tL4bVUpSK2M1yk6Xfz5")
let usdtUsdFeed = new PublicKey("8vAuuqC5wVZ9Z9oQUGGDSjYgudTfjmyqGU5VucQxTk5U")
let ethUsdFeed = new PublicKey("716hFAECqotxcXcj8Hs8nr7AG6q9dBw2oX3k3M8V7uGq")
let btcUsdFeed = new PublicKey("Cv4T27XbjVoKUYwP72NQQanvZeA7W4YF9L4EnYT9kx5o")
let chainlinkProgram =  "HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny"
if (NETWORK === "Devnet") {
    networkUrl = "https://api.devnet.solana.com" // devnet
    usdcMint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")
    solMint = new PublicKey("So11111111111111111111111111111111111111112") // wrong
    usdtMint = new PublicKey("EJwZgeZrdC8TXTQbQBoL6bfuAnFUUy1PVCMB4DYPzVaS")
    btcMint = new PublicKey("Ff5JqsAYUD4vAfQUtfRprT4nXu9e28tTBZTDFMnJNdvd") // wrong
    ethMint = new PublicKey("Ff5JqsAYUD4vAfQUtfRprT4nXu9e28tTBZTDFMnJNdvd")
    solUsdFeed = new PublicKey("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR")
    usdcUsdFeed = new PublicKey("2EmfL3MqL3YHABudGNmajjCpR13NNEn9Y4LWxbDm6SwR")
    usdtUsdFeed = new PublicKey("8QQSUPtdRTboa4bKyMftVNRfGFsB4Vp9d7r39hGKi53e")
    ethUsdFeed = new PublicKey("669U43LNHx7LsVj95uYksnhXUfWKDsdzVqev3V4Jpw3P")
    btcUsdFeed = new PublicKey("6PxBx93S8x3tno1TsFZwT5VqP8drrRCbCXygEXYNkFJe") 
    adminAddress = "HQj2MtJPNK1MvdHidVxEMZCtRwkxMPL9MVf2gt3rSKHS" 
    tokenProgramId = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    associatedTokenProgramId = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
    chainlinkProgram =  "HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny"
}

export const NETWORK_URL = networkUrl;
export const ADMIN_ADDRESS = adminAddress;
export const TOKEN_PROGRAM_ID = tokenProgramId;
export const ASSOCIATED_TOKEN_PROGRAM_ID = associatedTokenProgramId;
export const USDC_MINT = usdcMint;
export const SOL_MINT = solMint;
export const USDT_MINT = usdtMint;
export const BTC_MINT = btcMint;
export const ETH_MINT = ethMint;
export const SOL_USD_FEED = solUsdFeed;
export const USDC_USD_FEED = usdcUsdFeed;
export const USDT_USD_FEED = usdtUsdFeed;
export const ETH_USD_FEED = ethUsdFeed;
export const BTC_USD_FEED = btcUsdFeed;
export const CHAINLINK_PROGRAM = chainlinkProgram;
export const MARKET_WEIGHT = 1;

// export const REWARD_FREQUENCY = 86400 * 1000 / 400; // 1 week
export const REWARD_FREQUENCY = 5; // 1 week
export const PRICE_DECIMALS = 10 ** 9;
export const FEE_DECIMALS = 10 ** 4;
export const MARKET_WEIGHT_DECIMALS = 10 ** 4;
export const AMOUNT_DECIMALS = 10 ** 9;
export const LEVERAGE_DECIMALS = 10 ** 4;
export const MARKET_LEVERAGE = 10;
export const EXCHANGE_LEVERAGE = 10;
export const TAKER_FEE = 0.002;
export const MAKER_FEE = -0.001;

export const REWARD_RATE = 0.5 * AMOUNT_DECIMALS;


export const MARKET_TYPES = [{
    id: 1,
    name: 'Crypto'
}, {
    id: 2,
    name: 'Stocks'
}, {
    id: 3,
    name: 'Forex'
}]

export const MARKETS = [{
    name: "SOL/USD",
    feedAddress: SOL_USD_FEED.toString(),
    marketIndex: 1,
    marketTypeId: 1
}, {
    name: "BTC/USD",
    feedAddress: BTC_USD_FEED.toString(),
    marketIndex: 2,
    marketTypeId: 1
}, {
    name: "ETH/USD",
    feedAddress: ETH_USD_FEED.toString(),
    marketIndex: 3,
    marketTypeId: 1
}]

export const EXCHANGE_POSITIONS = [{
    decimals: 9,
    mint: SOL_MINT,
    feedAddress: SOL_USD_FEED,
    market: "SOL/USD",
}, {
    decimals: 6,
    mint: USDC_MINT,
    feedAddress: USDC_USD_FEED,
    market: "USDC/USD",
}, {
    decimals: 8,
    mint: BTC_MINT,
    feedAddress: BTC_USD_FEED,
    market: "BTC/USD",
}, {
    decimals: 6,
    mint: USDT_MINT,
    feedAddress: USDT_USD_FEED,
    market: "USDT/USD",
}, {
    decimals: 8,
    mint: ETH_MINT,
    feedAddress: ETH_USD_FEED,
    market: "ETH/USD",
}]

