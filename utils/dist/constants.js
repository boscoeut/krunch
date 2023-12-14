"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXCHANGE_POSITIONS = exports.MARKETS = exports.KRUNCH = exports.ASSOCIATED_TOKEN_PROGRAM_ID = exports.TOKEN_PROGRAM_ID = exports.ADMIN_ADDRESS = exports.LEVERAGE_DECIMALS = exports.AMOUNT_DECIMALS = exports.MARKET_WEIGHT_DECIMALS = exports.FEE_DECIMALS = exports.PRICE_DECIMALS = exports.NETWORK_URL = exports.CHAINLINK_PROGRAM = exports.BTC_USD_FEED = exports.ETH_USD_FEED = exports.USDT_USD_FEED = exports.USDC_USD_FEED = exports.SOL_USD_FEED = exports.ETH_MINT = exports.BTC_MINT = exports.USDT_MINT = exports.SOL_MINT = exports.USDC_MINT = void 0;
var web3_js_1 = require("@solana/web3.js");
exports.USDC_MINT = new web3_js_1.PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
exports.SOL_MINT = new web3_js_1.PublicKey("Fx84E9SUstSvQN4pq56xcG4hXghkeAMoL6W6ajCnZjyt");
exports.USDT_MINT = new web3_js_1.PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");
exports.BTC_MINT = new web3_js_1.PublicKey("3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh");
exports.ETH_MINT = new web3_js_1.PublicKey("7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs");
exports.SOL_USD_FEED = new web3_js_1.PublicKey("CH31Xns5z3M1cTAbKW34jcxPPciazARpijcHj9rxtemt");
exports.USDC_USD_FEED = new web3_js_1.PublicKey("GzGuoKXE8Unn7Vcg1DtomwD27tL4bVUpSK2M1yk6Xfz5");
exports.USDT_USD_FEED = new web3_js_1.PublicKey("8vAuuqC5wVZ9Z9oQUGGDSjYgudTfjmyqGU5VucQxTk5U");
exports.ETH_USD_FEED = new web3_js_1.PublicKey("716hFAECqotxcXcj8Hs8nr7AG6q9dBw2oX3k3M8V7uGq");
exports.BTC_USD_FEED = new web3_js_1.PublicKey("Cv4T27XbjVoKUYwP72NQQanvZeA7W4YF9L4EnYT9kx5o");
exports.CHAINLINK_PROGRAM = "HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny";
// export const NETWORK_URL="https://shiny-halibut-7vpx9xx4wj2x579-3000.app.github.dev/" // codespaces
exports.NETWORK_URL = "http://localhost:8899";
exports.PRICE_DECIMALS = Math.pow(10, 9);
exports.FEE_DECIMALS = Math.pow(10, 4);
exports.MARKET_WEIGHT_DECIMALS = Math.pow(10, 4);
exports.AMOUNT_DECIMALS = Math.pow(10, 9);
exports.LEVERAGE_DECIMALS = Math.pow(10, 4);
// export const ADMIN_ADDRESS="EDsmoWKuanmGubggz7XxTYX6qc3LtWgXj39qSikEqk7S" // codespaces
exports.ADMIN_ADDRESS = "HQj2MtJPNK1MvdHidVxEMZCtRwkxMPL9MVf2gt3rSKHS"; // local
exports.TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
exports.ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
// export const KRUNCH="5DLAQZJ4hPpgur3XAyot61xCHuykBeDhVVyopWtcWNkm" // codespaces
exports.KRUNCH = "EnZBKfVmLQre1x8K42DJtEzNe8AbRHoWacxkLMf3fr52"; // local address
exports.MARKETS = [{
        name: "SOL/USD",
        feedAddress: exports.SOL_USD_FEED.toString(),
        marketIndex: 1
    }, {
        name: "BTC/USD",
        feedAddress: exports.BTC_USD_FEED.toString(),
        marketIndex: 2
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
