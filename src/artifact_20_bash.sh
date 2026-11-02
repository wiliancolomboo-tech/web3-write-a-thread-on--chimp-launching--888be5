# Generate authority and deployer keys if not already present
solana-keygen new -o keys/deployer.json --no-bip39-passphrase --silent
solana config set --url https://api.devnet.solana.com
solana config set --keypair keys/deployer.json
solana airdrop 2 keys/deployer.json