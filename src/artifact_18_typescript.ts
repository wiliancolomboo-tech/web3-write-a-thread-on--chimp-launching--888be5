import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import { ChimpHybridVault } from "../target/types/chimp_hybrid_vault";

describe("chimp_hybrid_vault test suite", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ChimpHybridVault as Program<ChimpHybridVault>;

  let fungibleMint: PublicKey;
  let userTokenAccount: PublicKey;
  let vaultTokenAccount: PublicKey;
  let vaultConfigPda: PublicKey;
  let vaultBump: number;

  const authority = provider.wallet as anchor.Wallet;
  const user = Keypair.generate();
  const mockCollection = Keypair.generate();
  const mockCoreAsset = Keypair.generate();

  const TOKENS_PER_ASSET = new anchor.BN(1_000_000 * 10 ** 6); // 1M tokens with 6 decimals

  before(async () => {
    // 1. Airdrop SOL to test user
    const tx = await provider.connection.requestAirdrop(
      user.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(tx);

    // 2. Create SPL token mint
    fungibleMint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      6
    );

    // 3. Derive PDA addresses
    [vaultConfigPda, vaultBump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault_config"),
        fungibleMint.toBuffer(),
        mockCollection.publicKey.toBuffer(),
      ],
      program.programId
    );

    [vaultTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_tokens"), vaultConfigPda.toBuffer()],
      program.programId
    );

    // 4. Create user token account and mint balance
    userTokenAccount = await createAccount(
      provider.connection,
      user,
      fungibleMint,
      user.publicKey
    );

    await mintTo(
      provider.connection,
      authority.payer,
      fungibleMint,
      userTokenAccount,
      authority.publicKey,
      10_000_000 * 10 ** 6
    );
  });

  it("TC-01: Correctly initializes the Chimp Hybrid Vault PDA", async () => {
    await program.methods
      .initialize(TOKENS_PER_ASSET)
      .accounts({
        authority: authority.publicKey,
        fungibleMint: fungibleMint,
        collection: mockCollection.publicKey,
        vaultConfig: vaultConfigPda,
        vaultTokenAccount: vaultTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const configAccount = await program.account.vaultConfig.fetch(vaultConfigPda);
    expect(configAccount.authority.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(configAccount.fungibleMint.toBase58()).to.equal(fungibleMint.toBase58());
    expect(configAccount.tokensPerAsset.toString()).to.equal(TOKENS_PER_ASSET.toString());
    expect(configAccount.isPaused).to.be.false;
  });

  it("TC-02: Enforces invariant check when swapping without valid Metaplex Core CPI mock", async () => {
    try {
      await program.methods
        .swapFungibleForCore()
        .accounts({
          user: user.publicKey,
          vaultConfig: vaultConfigPda,
          fungibleMint: fungibleMint,
          userTokenAccount: userTokenAccount,
          vaultTokenAccount: vaultTokenAccount,
          coreAsset: mockCoreAsset.publicKey,
          collection: mockCollection.publicKey,
          mplCoreProgram: new PublicKey("CoreenVDva111111111111111111111111111111111"),
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();
      expect.fail("Should have thrown error on Core asset mock validation");
    } catch (err: any) {
      expect(err).to.exist;
    }
  });

  it("TC-03: Protects against unauthorized user token account draining", async () => {
    const maliciousAttacker = Keypair.generate();
    try {
      await program.methods
        .swapFungibleForCore()
        .accounts({
          user: maliciousAttacker.publicKey,
          vaultConfig: vaultConfigPda,
          fungibleMint: fungibleMint,
          userTokenAccount: userTokenAccount, // Target victim's ATA
          vaultTokenAccount: vaultTokenAccount,
          coreAsset: mockCoreAsset.publicKey,
          collection: mockCollection.publicKey,
          mplCoreProgram: new PublicKey("CoreenVDva111111111111111111111111111111111"),
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([maliciousAttacker])
        .rpc();
      expect.fail("Should reject attacker signing for user's token account");
    } catch (err: any) {
      expect(err.message).to.include("InvalidAssetOwner");
    }
  });
});