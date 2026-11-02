# 1. Clone repository and install dependencies
git clone https://github.com/chimp-dao/chimp-metaplex-launch.git
cd chimp-metaplex-launch
yarn install

# 2. Build Anchor program binary with reproducible Verifiable SVM build
anchor build

# 3. Configure network and deploy to Solana Devnet / Mainnet-Beta
solana config set --url https://api.devnet.solana.com
solana airdrop 2 $(solana address)
anchor deploy --program-name chimp_launch

# 4. Run full test suite with Localnet or Devnet Core Program
anchor test --skip-local-validator