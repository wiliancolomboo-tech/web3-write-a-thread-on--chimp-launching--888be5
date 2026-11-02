cd ../../cli
npm install
npm run build

# Deploy Metaplex Core Collection
node dist/index.js create-collection \
  --keypair ../keys/deployer.json \
  --rpc https://api.devnet.solana.com \
  --name "$CHIMP Genesis" \
  --uri "https://arweave.net/chimp-genesis-collection.json"