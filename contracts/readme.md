# start local validator
solana-test-validator

# build
anchor build

# test
anchor test

# deploy (before deploying you must run anchor build)
anchor deploy

# start with fresh accounts
solana-test-validator --reset

# to change networks modify provider in anchor.toml
[provider]
cluster = "Devnet"  # Devnet, Mainnet
change NETWORK in constants.ts

# USDC Faucet
https://faucet.circle.com/