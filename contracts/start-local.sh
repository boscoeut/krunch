MY_ADDRESS=EDsmoWKuanmGubggz7XxTYX6qc3LtWgXj39qSikEqk7S
TOKEN_PROGRAM_ID=TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
ASSOCIATED_TOKEN_PROGRAM_ID=ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL
CHAINLINK=HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny
KRUNCH=5DLAQZJ4hPpgur3XAyot61xCHuykBeDhVVyopWtcWNkm

USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
SOL_MINT=So11111111111111111111111111111111111111112
USDT_MINT=Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB
BTC_MINT=3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh
ETH_MINT=7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs
SOL_USD_FEED=CH31Xns5z3M1cTAbKW34jcxPPciazARpijcHj9rxtemt
USDC_USD_FEED=GzGuoKXE8Unn7Vcg1DtomwD27tL4bVUpSK2M1yk6Xfz5
USDT_USD_FEED=GzGuoKXE8Unn7Vcg1DtomwD27tL4bVUpSK2M1yk6Xfz5
ETH_USD_FEED=716hFAECqotxcXcj8Hs8nr7AG6q9dBw2oX3k3M8V7uGq
BTC_USD_FEED=Cv4T27XbjVoKUYwP72NQQanvZeA7W4YF9L4EnYT9kx5o

TOKEN_NAMES=("USDC_MINT" "SOL_MINT" "USDT_MINT" "BTC_MINT" "ETH_MINT" "SOL_USD_FEED" "USDC_USD_FEED" "USDT_USD_FEED" "ETH_USD_FEED" "BTC_USD_FEED")
TOKENS=("$USDC_MINT" "$SOL_MINT" $USDT_MINT $BTC_MINT $ETH_MINT $SOL_USD_FEED $USDC_USD_FEED $USDT_USD_FEED $ETH_USD_FEED $BTC_USD_FEED)
MINT_SUFFIX="MINT"

ARGS=""
# Loop through the array
for index in "${!TOKENS[@]}"
do
    TOKEN_NAME="${TOKEN_NAMES[$index]}"
    TOKEN="${TOKENS[$index]}"
    ARGS="$ARGS --account $TOKEN ./cloned_accounts/$TOKEN_NAME.json"
    echo "Index: $index"
    echo "TOKEN: $TOKEN"
    echo "TOKEN_NAME: $TOKEN_NAME"
    solana account -u m $TOKEN --output-file ./cloned_accounts/$TOKEN_NAME.json --output json-compact

    if [[ $TOKEN_NAME == *$MINT_SUFFIX* ]]; then
        python3 -c "import base64;import base58;import json;usdc = json.load(open('./cloned_accounts/$TOKEN_NAME.json'));data = bytearray(base64.b64decode(usdc['account']['data'][0]));data[4:4+32] = base58.b58decode('${MY_ADDRESS}');print(base64.b64encode(data));usdc['account']['data'][0] = base64.b64encode(data).decode('utf8');json.dump(usdc, open('./cloned_accounts/$TOKEN_NAME.json', 'w'))"
    fi
done
echo $ARGS

solana program dump -u m $CHAINLINK ./cloned_accounts/chainlink.so

solana-test-validator -r --bpf-program $CHAINLINK ./cloned_accounts/chainlink.so $ARGS

# solana-test-validator -r --bpf-program HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny ./cloned_accounts/chainlink.so --account EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v ./cloned_accounts/USDC_MINT.json --account So11111111111111111111111111111111111111112 ./cloned_accounts/SOL_MINT.json --account Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB ./cloned_accounts/USDT_MINT.json --account 3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh ./cloned_accounts/BTC_MINT.json --account 7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs ./cloned_accounts/ETH_MINT.json --account CH31Xns5z3M1cTAbKW34jcxPPciazARpijcHj9rxtemt ./cloned_accounts/SOL_USD_FEED.json --account GzGuoKXE8Unn7Vcg1DtomwD27tL4bVUpSK2M1yk6Xfz5 ./cloned_accounts/USDC_USD_FEED.json --account GzGuoKXE8Unn7Vcg1DtomwD27tL4bVUpSK2M1yk6Xfz5 ./cloned_accounts/USDT_USD_FEED.json --account 716hFAECqotxcXcj8Hs8nr7AG6q9dBw2oX3k3M8V7uGq ./cloned_accounts/ETH_USD_FEED.json --account Cv4T27XbjVoKUYwP72NQQanvZeA7W4YF9L4EnYT9kx5o ./cloned_accounts/BTC_USD_FEED.json