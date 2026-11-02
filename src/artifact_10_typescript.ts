import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ChimpHybridEscrow } from "../target/types/chimp_hybrid_escrow";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { assert, expect } from "chai";

describe("chimp_hybrid_escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ChimpHybridEscrow as Program<ChimpHybridEscrow>;

  let fungibleMint: PublicKey;
  let adminAta: PublicKey;
  let userAta: PublicKey;
  const userKeypair = Keypair.generate();
  const mockCollectionKeypair = Keypair.generate();
  const mockAssetKeypair = Keypair.generate();

  const TOKENS_PER_ASSET = new anchor.BN(1_000_000 * 10 ** 6); // 1M tokens with 6 decimals

  let escrowPda: PublicKey;
  let tokenVaultPda: PublicKey;
  let assetVaultPda: PublicKey;

  before(async () => {
    // Airdrop SOL to User
    const sig = await provider.connection.requestAirdrop(
      userKeypair.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    // Create Fungible $CHIMP Token Mint
    fungibleMint = await createMint(
      provider.connection,
      (provider.wallet as any).payer,
      provider.wallet.publicKey,
      null,
      6
    );

    // Derive PDAs
    [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("chimp_escrow"), mockCollectionKeypair.publicKey.toBuffer()],
      program.programId
    );

    [tokenVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("chimp_vault"), mockCollectionKeypair.publicKey.toBuffer()],
      program.programId
    );

    [assetVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("asset_vault"), mockCollectionKeypair.publicKey.toBuffer()],
      program.programId
    );

    // Setup ATAs
    adminAta = await createAccount(
      provider.connection,
      (provider.wallet as any).payer,
      fungibleMint,
      provider.wallet.publicKey
    );

    userAta = await createAccount(
      provider.connection,
      (provider.wallet as any).payer,
      fungibleMint,
      userKeypair.publicKey
    );

    // Mint tokens to user for swapping
    await mintTo(
      provider.connection,
      (provider.wallet as any).payer,
      fungibleMint,
      userAta,
      provider.wallet.publicKey,
      5_000_000 * 10 ** 6
    );
  });

  it("QA-CHIMP-01: Correctly initializes the escrow and token vault", async () => {
    await program.methods
      .initializeEscrow(TOKENS_PER_ASSET)
      .accounts({
        authority: provider.wallet.publicKey,
        collection: mockCollectionKeypair.publicKey,
        fungibleMint: fungibleMint,
        escrowState: escrowPda,
        tokenVault: tokenVaultPda,
        assetVaultPda: assetVaultPda,
        tokenProgram: anchor.spl.token.TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const escrowAccount = await program.account.escrowState.fetch(escrowPda);
    assert.ok(escrowAccount.authority.equals(provider.wallet.publicKey));
    assert.ok(escrowAccount.collection.equals(mockCollectionKeypair.publicKey));
    assert.ok(escrowAccount.tokensPerAsset.eq(TOKENS_PER_ASSET));
    assert.equal(escrowAccount.totalAssetsEscrowed.toNumber(), 0);
  });

  it("QA-CHIMP-05: Fails with ZeroInventoryAvailable when escrow vault has 0 items", async () => {
    try {
      await program.methods
        .swapTokensForAsset()
        .accounts({
          user: userKeypair.publicKey,
          escrowState: escrowPda,
          collection: mockCollectionKeypair.publicKey,
          fungibleMint: fungibleMint,
          userTokenAccount: userAta,
          tokenVault: tokenVaultPda,
          asset: mockAssetKeypair.publicKey,
          assetVaultPda: assetVaultPda,
          mplCoreProgram: new PublicKey("CoREENxT6tW1HoK8zY6FFTnyqTxJYRqh66VQZZ3rsEGo"),
          tokenProgram: anchor.spl.token.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([userKeypair])
        .rpc();
      assert.fail("Transaction should have failed due to zero inventory");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("ZeroInventoryAvailable");
    }
  });

  it("QA-CHIMP-06: Verifies mathematical overflow safety checks", async () => {
    try {
      await program.methods
        .initializeEscrow(new anchor.BN(0))
        .accounts({
          authority: provider.wallet.publicKey,
          collection: Keypair.generate().publicKey,
          fungibleMint: fungibleMint,
          escrowState: Keypair.generate().publicKey,
          tokenVault: Keypair.generate().publicKey,
          assetVaultPda: Keypair.generate().publicKey,
          tokenProgram: anchor.spl.token.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      assert.fail("Should reject 0 tokens per asset");
    } catch (err: any) {
      assert.ok(err.toString().includes("InvalidTokensPerAsset"));
    }
  });
});