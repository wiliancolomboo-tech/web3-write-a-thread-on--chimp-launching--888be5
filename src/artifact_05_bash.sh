# 1. Build and verify deterministic Anchor artifacts
anchor build

# 2. Deploy Anchor Program to Solana Devnet / Mainnet-Beta
solana program deploy \
  --program-id target/deploy/chimp_launchpad-keypair.json \
  target/deploy/chimp_launchpad.so \
  --url https://api.mainnet-beta.solana.com \
  --keypair ~/.config/solana/id.json

# 3. Initialize Launchpad State via CLI
yarn ts-node scripts/init-launchpad.ts \
  --maxSupply 5000 \
  --mintPrice 0.5 \
  --royaltyBps 500 \
  --treasury <YOUR_TREASURY_PUBKEY>