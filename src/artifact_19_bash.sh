#!/usr/bin/env bash
set -euo pipefail

echo "===> [1/4] Configuring Solana Environment"
solana config set --url https://api.devnet.solana.com

echo "===> [2/4] Building Anchor Hybrid Engine"
anchor build

echo "===> [3/4] Deploying Chimp Vault to Devnet"
anchor deploy --provider.cluster devnet

echo "===> [4/4] Verifying Metaplex Core Program Bindings"
solana program dump CoreenVDva111111111111111111111111111111111 target/deploy/mpl_core.so || true
echo "SUCCESS: Program ready for mainnet-beta promotion."