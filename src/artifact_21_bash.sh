cd contracts/chimp-core-vault
anchor build
solana program deploy target/deploy/chimp_core_vault.so \
  --program-id target/deploy/chimp_core_vault-keypair.json \
  --url devnet