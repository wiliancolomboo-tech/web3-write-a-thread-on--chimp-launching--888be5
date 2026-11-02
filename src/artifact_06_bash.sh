# 1. Build Smart Contract with Verifiable Anchor Build
anchor build --verifiable

# 2. Deploy to Solana Devnet (or Mainnet-Beta)
solana program deploy \
  --program-id target/deploy/chimp_launchpad-keypair.json \
  target/deploy/chimp_launchpad.so \
  --url https://api.devnet.solana.com

# 3. Synchronize Program ID in Anchor.toml & lib.rs
anchor keys sync