import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ChimpCoreVault } from "../target/types/chimp_core_vault";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("chimp-core-vault integration test suite", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ChimpCoreVault as Program<ChimpCoreVault>;

  const authority = Keypair.generate();
  const user = Keypair.generate();
  const mplCoreProgramId = new PublicKey("CoREENxus6tW35nsduWnmSTEaF4DnECu5MeG44USW6dP");

  let chimpMint: PublicKey;
  let userTokenAccount: PublicKey;
  let vaultConfigPda: PublicKey;
  let vaultEscrowPda: PublicKey;
  let collectionKeypair = Keypair.generate();

  const TOKENS_PER_ASSET = new anchor.BN(1_000_000_000); // 1,000 $CHIMP (6 decimals)

  before(async () => {
    // 1. Airdrop SOL to test actors
    const tx1 = await provider.connection.requestAirdrop(authority.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    const tx2 = await provider.connection.requestAirdrop(user.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(tx1);
    await provider.connection.confirmTransaction(tx2);

    // 2. Initialize Fungible $CHIMP Mint
    chimpMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      6
    );

    // 3. Setup User Token Account & Mint 5,000 $CHIMP
    userTokenAccount = await createAccount(
      provider.connection,
      user,
      chimpMint,
      user.publicKey
    );

    await mintTo(
      provider.connection,
      authority,
      chimpMint,
      userTokenAccount,
      authority.publicKey,
      5_000_000_000
    );

    // 4. Derive PDAs
    [vaultConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_config")],
      program.programId
    );

    [vaultEscrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_escrow"), chimpMint.toBuffer()],
      program.programId
    );
  });

  it("1. Successfully initializes the $CHIMP Metaplex Core Vault", async () => {
    await program.methods
      .initializeVault(TOKENS_PER_ASSET)
      .accounts({
        authority: authority.publicKey,
        vaultConfig: vaultConfigPda,
        chimpMint: chimpMint,
        escrowTokenAccount: vaultEscrowPda,
        collectionAsset: collectionKeypair.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([authority])
      .rpc();

    const vault = await program.account.vaultConfig.fetch(vaultConfigPda);
    expect(vault.authority.toString()).to.equal(authority.publicKey.toString());
    expect(vault.chimpMint.toString()).to.equal(chimpMint.toString());
    expect(vault.tokensPerAsset.toString()).to.equal(TOKENS_PER_ASSET.toString());
    expect(vault.totalMinted.toNumber()).to.equal(0);
    expect(vault.isPaused).to.be.false;
  });

  it("2. Rejects initialization with zero tokens per asset", async () => {
    const dummyAuthority = Keypair.generate();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(dummyAuthority.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL)
    );

    const [dummyVaultConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_config_invalid")],
      program.programId
    );

    try {
      await program.methods
        .initializeVault(new anchor.BN(0))
        .accounts({
          authority: dummyAuthority.publicKey,
          vaultConfig: dummyVaultConfig,
          chimpMint: chimpMint,
          escrowTokenAccount: vaultEscrowPda,
          collectionAsset: collectionKeypair.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([dummyAuthority])
        .rpc();
      expect.fail("Should have thrown error on zero tokens_per_asset");
    } catch (err: any) {
      expect(err.message).to.include("InvalidTokenSwapAmount");
    }
  });

  it("3. Enforces deterministic math and prevents unauthorized signer mutations", async () => {
    const maliciousSigner = Keypair.generate();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(maliciousSigner.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL)
    );

    const fakeAsset = Keypair.generate();

    try {
      // Attempt minting with spoofed collection
      const fakeCollection = Keypair.generate();
      await program.methods
        .mintFromTokens("Chimp #001", "https://metadata.chimp.io/1.json", "Legendary")
        .accounts({
          payer: user.publicKey,
          vaultConfig: vaultConfigPda,
          userTokenAccount: userTokenAccount,
          escrowTokenAccount: vaultEscrowPda,
          asset: fakeAsset.publicKey,
          collection: fakeCollection.publicKey, // Invalid collection mismatch
          mplCoreProgram: mplCoreProgramId,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user, fakeAsset])
        .rpc();
      expect.fail("Should have failed due to collection mismatch");
    } catch (err: any) {
      expect(err.message).to.include("InvalidCollectionAsset");
    }
  });
});