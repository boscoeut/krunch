echo "Deploying krunch"
# call the command anchor deploy
#copy the file target/idl/krunch.json to the folder /Users/eberma/Documents/BitBucket/krunch_solana_ui/idl/krunch.json
echo "building krunch"
anchor build
echo "deploying krunch"
anchor deploy
echo "copying krunch.json to /Users/eberma/Documents/BitBucket/krunch_solana_ui/src/idl/krunch.json"
cp -v ./target/idl/krunch.json /Users/eberma/Documents/BitBucket/krunch_solana_ui/src/idl/krunch.json
