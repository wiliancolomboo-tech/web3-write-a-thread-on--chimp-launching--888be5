# 1. Clone repository and install dependencies
git clone https://github.com/chimp-solana/chimp-metaplex-launch.git
cd chimp-metaplex-launch
npm install

# 2. Build Anchor Smart Contracts
anchor build

# 3. Configure Environment Variables
cp .env.example .env
# Edit .env with your SOLANA_RPC_URL, DEPLOYER_PRIVATE_KEY, and DISCORD_SLACK_WEBHOOK_URL

# 4. Deploy Program to Solana Devnet / Mainnet-Beta
solana program deploy target/deploy/chimp_launch.so \
  --program-id target/deploy/chimp_launch-keypair.json \
  --url https://api.devnet.solana.com

# 5. Run deterministic test suite
npm run test

# 6. Trigger Launch Orchestration CLI
npm run launch