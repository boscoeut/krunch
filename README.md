# krunch

# SETUP - to automote with codespaces
install rust
install solana 
    update PATH to include directory of solana bin
generate keypair
config solana to use local network
    solana config set --url localhost
install anchor

install base58 for copy account script
    pip3 install base58

## Update .bashrc to export PATH
export PATH="/home/codespace/.local/share/solana/install/active_release/bin:$PATH"

## to start validator
anchor run startValidator

## To deploy changes
anchor run init

## To switch networks
Update anchor.toml and constants.NETWORK

## To Run Using PM2
cd bots/mango
pm2 start npm -- start