# 1. Build and verify the Anchor program
anchor build

# 2. Deploy Anchor program to Solana Devnet or Mainnet-Beta
solana program deploy target/deploy/chimp_hybrid_core.so \
  --program-id target/deploy/chimp_hybrid_core-keypair.json \
  --url https://api.mainnet-beta.solana.com

# 3. Setup Environment Variables
cp .env.example .env
nano .env

# 4. Launch Automation Engine via Docker Compose
docker compose up -d --build

# 5. Inspect Live Output Logs
docker compose logs -f chimp-metaplex-worker