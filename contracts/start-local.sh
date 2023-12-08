#MY_ADDRESS=54Cm8AmU6SDyP7gGwJaTgYFBCK5GEQGCgPZ9wtNmavq5D8yNGzntFyxdvoxBfFH8spVK3tnPovQ9FoaGagmbBVV2
MY_ADDRESS=EDsmoWKuanmGubggz7XxTYX6qc3LtWgXj39qSikEqk7S
TOKEN_PROGRAM_ID=TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
ASSOCIATED_TOKEN_PROGRAM_ID=ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL
SOL_USD=CH31Xns5z3M1cTAbKW34jcxPPciazARpijcHj9rxtemt
BTC_USD=Cv4T27XbjVoKUYwP72NQQanvZeA7W4YF9L4EnYT9kx5o
USDC=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
CHAINLINK=HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny
KRUNCH=5DLAQZJ4hPpgur3XAyot61xCHuykBeDhVVyopWtcWNkm

solana account -u m $SOL_USD --output-file ./cloned_accounts/sol_usd.json --output json-compact
solana account -u m $BTC_USD --output-file ./cloned_accounts/btc_usd.json --output json-compact
solana account -u m  $USDC --output-file ./cloned_accounts/usdc.json --output json-compact
solana program dump -u m $CHAINLINK ./cloned_accounts/chainlink.so
solana program dump -u m $TOKEN_PROGRAM_ID ./cloned_accounts/tokenProgram.so
solana program dump -u m $ASSOCIATED_TOKEN_PROGRAM_ID ./cloned_accounts/associatedTokenProgram.so

python3 -c "import base64;import base58;import json;usdc = json.load(open('./cloned_accounts/usdc.json'));data = bytearray(base64.b64decode(usdc['account']['data'][0]));data[4:4+32] = base58.b58decode('${MY_ADDRESS}');print(base64.b64encode(data));usdc['account']['data'][0] = base64.b64encode(data).decode('utf8');json.dump(usdc, open('./cloned_accounts/usdc_clone.json', 'w'))"
#usdc_clone
anchor build 
solana-test-validator -r --bpf-program $CHAINLINK ./cloned_accounts/chainlink.so \
--account $SOL_USD ./cloned_accounts/sol_usd.json \
--account $BTC_USD ./cloned_accounts/btc_usd.json \
--account $USDC ./cloned_accounts/usdc_clone.json
#     # --bpf-program $KRUNCH ./target/deploy/krunch.so \
#     --bpf-program $CHAINLINK ./cloned_accounts/chainlink.so \
#     --bpf-program $TOKEN_PROGRAM_ID ./cloned_accounts/tokenProgram.so \
#     --bpf-program $ASSOCIATED_TOKEN_PROGRAM_ID ./cloned_accounts/associatedTokenProgram.so \
#     