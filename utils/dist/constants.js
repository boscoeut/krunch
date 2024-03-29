"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TV_MARKETS = exports.EXCHANGE_POSITIONS = exports.MARKETS = exports.MARKET_TYPES = exports.REWARD_RATE = exports.MAKER_FEE = exports.TAKER_FEE = exports.EXCHANGE_LEVERAGE = exports.MARKET_LEVERAGE = exports.LEVERAGE_DECIMALS = exports.AMOUNT_DECIMALS = exports.EXCHANGE_MARKET_WEIGHT = exports.MARKET_WEIGHT_DECIMALS = exports.FEE_DECIMALS = exports.PRICE_DECIMALS = exports.REWARD_FREQUENCY = exports.MARKET_WEIGHT = exports.CHAINLINK_PROGRAM = exports.BTC_USD_FEED = exports.ETH_USD_FEED = exports.USDT_USD_FEED = exports.USDC_USD_FEED = exports.SOL_USD_FEED = exports.ETH_MINT = exports.BTC_MINT = exports.USDT_MINT = exports.SOL_MINT = exports.USDC_MINT = exports.ASSOCIATED_TOKEN_PROGRAM_ID = exports.TOKEN_PROGRAM_ID = exports.ADMIN_ADDRESS = exports.NETWORK_URL = exports.NETWORK_EXPLORER = exports.SLOTS_PER_DAY = exports.DEVNET = exports.LOCALNET = exports.AUTO_REFRESH_INTERVAL = exports.SHOW_LIGHT_MODE = exports.NETWORK = void 0;
var web3_js_1 = require("@solana/web3.js");
/**
 * To Change Networks
 * 1. Change NETWORK to 'Localnet', 'Devnet', or 'Mainnet'
 * 2. Change cluster = "Devnet" in Anchor.toml
 * 3. Run anchor run deploy-dev for dev
 * 4. Run anchor run deploy-local for local
 */
exports.NETWORK = "Localnet";
exports.SHOW_LIGHT_MODE = false;
exports.AUTO_REFRESH_INTERVAL = 1000 * 2; // 2 seconds
exports.LOCALNET = 'Localnet';
exports.DEVNET = 'Devnet';
exports.SLOTS_PER_DAY = 24 * 60 * 60;
var rewardFrequency = exports.SLOTS_PER_DAY * 1;
var networkExplorer = "https://explorer.solana.com/";
var networkUrl = "http://localhost:8899"; // Localnet
var adminAddress = "HQj2MtJPNK1MvdHidVxEMZCtRwkxMPL9MVf2gt3rSKHS";
var tokenProgramId = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
var associatedTokenProgramId = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
var usdcMint = new web3_js_1.PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
var solMint = new web3_js_1.PublicKey("Fx84E9SUstSvQN4pq56xcG4hXghkeAMoL6W6ajCnZjyt"); //????
// let solMint = new PublicKey("So11111111111111111111111111111111111111112") // verified
var usdtMint = new web3_js_1.PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");
var btcMint = new web3_js_1.PublicKey("3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh");
var ethMint = new web3_js_1.PublicKey("7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs");
var solUsdFeed = new web3_js_1.PublicKey("CH31Xns5z3M1cTAbKW34jcxPPciazARpijcHj9rxtemt");
var usdcUsdFeed = new web3_js_1.PublicKey("GzGuoKXE8Unn7Vcg1DtomwD27tL4bVUpSK2M1yk6Xfz5");
var usdtUsdFeed = new web3_js_1.PublicKey("8vAuuqC5wVZ9Z9oQUGGDSjYgudTfjmyqGU5VucQxTk5U");
var ethUsdFeed = new web3_js_1.PublicKey("716hFAECqotxcXcj8Hs8nr7AG6q9dBw2oX3k3M8V7uGq");
var btcUsdFeed = new web3_js_1.PublicKey("Cv4T27XbjVoKUYwP72NQQanvZeA7W4YF9L4EnYT9kx5o");
var chainlinkProgram = "HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny";
if (exports.NETWORK === "Devnet") {
    networkUrl = "https://api.devnet.solana.com"; // devnet
    networkExplorer = "https://explorer.solana.com/?cluster=devnet"; // devnet
    usdcMint = new web3_js_1.PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"); // verified
    solMint = new web3_js_1.PublicKey("So11111111111111111111111111111111111111112"); // verified
    usdtMint = new web3_js_1.PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"); // unknown
    btcMint = new web3_js_1.PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"); // unknown
    ethMint = new web3_js_1.PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"); // unknown
    solUsdFeed = new web3_js_1.PublicKey("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR"); // verified
    usdcUsdFeed = new web3_js_1.PublicKey("2EmfL3MqL3YHABudGNmajjCpR13NNEn9Y4LWxbDm6SwR"); // verified
    usdtUsdFeed = new web3_js_1.PublicKey("8QQSUPtdRTboa4bKyMftVNRfGFsB4Vp9d7r39hGKi53e"); // verified
    ethUsdFeed = new web3_js_1.PublicKey("669U43LNHx7LsVj95uYksnhXUfWKDsdzVqev3V4Jpw3P"); // verified
    btcUsdFeed = new web3_js_1.PublicKey("6PxBx93S8x3tno1TsFZwT5VqP8drrRCbCXygEXYNkFJe"); // verified
    tokenProgramId = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"; // verified
    associatedTokenProgramId = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"; // verified
    chainlinkProgram = "HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny"; // verified
    adminAddress = "HQj2MtJPNK1MvdHidVxEMZCtRwkxMPL9MVf2gt3rSKHS";
}
else if (exports.NETWORK === "Mainnet") {
    networkUrl = "https://api.mainnet-beta.solana.com"; // mainnet
    usdcMint = new web3_js_1.PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // verified
    solMint = new web3_js_1.PublicKey("So11111111111111111111111111111111111111112"); // verified
    usdtMint = new web3_js_1.PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"); // verified
    btcMint = new web3_js_1.PublicKey("3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh"); // verified
    ethMint = new web3_js_1.PublicKey("7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs"); // verified
    solUsdFeed = new web3_js_1.PublicKey("CH31Xns5z3M1cTAbKW34jcxPPciazARpijcHj9rxtemt"); // verified
    usdcUsdFeed = new web3_js_1.PublicKey("GzGuoKXE8Unn7Vcg1DtomwD27tL4bVUpSK2M1yk6Xfz5"); // verified
    usdtUsdFeed = new web3_js_1.PublicKey("8vAuuqC5wVZ9Z9oQUGGDSjYgudTfjmyqGU5VucQxTk5U"); // verified
    ethUsdFeed = new web3_js_1.PublicKey("716hFAECqotxcXcj8Hs8nr7AG6q9dBw2oX3k3M8V7uGq"); // verified
    btcUsdFeed = new web3_js_1.PublicKey("Cv4T27XbjVoKUYwP72NQQanvZeA7W4YF9L4EnYT9kx5o"); // verified
    tokenProgramId = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"; // verified
    associatedTokenProgramId = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"; // verified
    chainlinkProgram = "HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny"; // verified
    adminAddress = "HQj2MtJPNK1MvdHidVxEMZCtRwkxMPL9MVf2gt3rSKHS";
}
exports.NETWORK_EXPLORER = networkExplorer;
exports.NETWORK_URL = networkUrl;
exports.ADMIN_ADDRESS = adminAddress;
exports.TOKEN_PROGRAM_ID = tokenProgramId;
exports.ASSOCIATED_TOKEN_PROGRAM_ID = associatedTokenProgramId;
exports.USDC_MINT = usdcMint;
exports.SOL_MINT = solMint;
exports.USDT_MINT = usdtMint;
exports.BTC_MINT = btcMint;
exports.ETH_MINT = ethMint;
exports.SOL_USD_FEED = solUsdFeed;
exports.USDC_USD_FEED = usdcUsdFeed;
exports.USDT_USD_FEED = usdtUsdFeed;
exports.ETH_USD_FEED = ethUsdFeed;
exports.BTC_USD_FEED = btcUsdFeed;
exports.CHAINLINK_PROGRAM = chainlinkProgram;
exports.MARKET_WEIGHT = 1;
exports.REWARD_FREQUENCY = rewardFrequency;
exports.PRICE_DECIMALS = Math.pow(10, 9);
exports.FEE_DECIMALS = Math.pow(10, 4);
exports.MARKET_WEIGHT_DECIMALS = Math.pow(10, 4);
exports.EXCHANGE_MARKET_WEIGHT = 0.5;
exports.AMOUNT_DECIMALS = Math.pow(10, 9);
exports.LEVERAGE_DECIMALS = Math.pow(10, 4);
exports.MARKET_LEVERAGE = 10;
exports.EXCHANGE_LEVERAGE = 10;
exports.TAKER_FEE = 0.002;
exports.MAKER_FEE = -0.001;
exports.REWARD_RATE = 0.5 * exports.AMOUNT_DECIMALS;
exports.MARKET_TYPES = [{
        id: 1,
        name: 'Crypto'
    }, {
        id: 2,
        name: 'Stocks'
    }, {
        id: 3,
        name: 'Forex'
    }];
exports.MARKETS = [{
        name: "SOL/USD",
        feedAddress: exports.SOL_USD_FEED.toString(),
        marketIndex: 1,
        marketTypeId: 1
    }, {
        name: "BTC/USD",
        feedAddress: exports.BTC_USD_FEED.toString(),
        marketIndex: 2,
        marketTypeId: 1
    }, {
        name: "ETH/USD",
        feedAddress: exports.ETH_USD_FEED.toString(),
        marketIndex: 3,
        marketTypeId: 1
    }];
exports.EXCHANGE_POSITIONS = [{
        decimals: 9,
        mint: exports.SOL_MINT,
        feedAddress: exports.SOL_USD_FEED,
        market: "SOL/USD",
    }, {
        decimals: 6,
        mint: exports.USDC_MINT,
        feedAddress: exports.USDC_USD_FEED,
        market: "USDC/USD",
    }, {
        decimals: 8,
        mint: exports.BTC_MINT,
        feedAddress: exports.BTC_USD_FEED,
        market: "BTC/USD",
    }, {
        decimals: 6,
        mint: exports.USDT_MINT,
        feedAddress: exports.USDT_USD_FEED,
        market: "USDT/USD",
    }, {
        decimals: 8,
        mint: exports.ETH_MINT,
        feedAddress: exports.ETH_USD_FEED,
        market: "ETH/USD",
    }];
exports.TV_MARKETS = {
    "SOL/USD": "SOLUSD",
    "ETH/USD": "ETHUSD",
    "BTC/USD": "BTCUSD",
};
