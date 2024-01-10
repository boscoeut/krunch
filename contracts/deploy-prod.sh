echo "Deploying krunch"
# call the command anchor deploy
#copy the file target/idl/krunch.json to the folder /Users/mebert/Documents/BitBucket/krunch_solana_ui/idl/krunch.json
echo "building krunch"
anchor build --provider.cluster Mainnet
echo "deploying krunch"
anchor deploy --provider.cluster Mainnet --program-keypair ./config/devnet.json --program-name krunch
echo "copying krunch.json to ../ui/src/idl/krunch.json"
cp -v ./target/idl/krunch.json ../ui/src/idl/krunch.json
