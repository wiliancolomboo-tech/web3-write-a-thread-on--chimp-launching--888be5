# 1. Build and test Anchor smart contract
anchor build
anchor test

# 2. Deploy to Solana Devnet / Mainnet
solana program deploy target/deploy/chimp_launchpad.so \
  --program-id Ch1mpCoreLaunchpad11111111111111111111111111 \
  --url https://api.devnet.solana.com

# 3. Spin up the enterprise telemetry and notification daemon
docker compose up -d --build
docker compose logs -f chimp-sentinel