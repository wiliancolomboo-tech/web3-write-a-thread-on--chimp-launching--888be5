import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";
import { MPL_CORE_PROGRAM_ID } from "@metaplex-foundation/mpl-core";

describe("chimp_launchpad on Metaplex Core", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // In production tests, the generated types from anchor are loaded
  const program = anchor.workspace.ChimpLaunchpad;

  const admin = Keypair.generate();
  const buyer = Keypair.generate();
  const treasury = Keypair.generate();
  const collectionKeypair = Keypair.generate();

  const [launchConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("launch_config")],
    program.programId
  );

  before(async () => {
    // Airdrop SOL to test actors
    const tx1 = await provider.connection.requestAirdrop(admin.publicKey, 5 * LAMPORTS_PER_SOL);
    const tx2 = await provider.connection.requestAirdrop(buyer.publicKey, 5 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(tx1);
    await provider.connection.confirmTransaction(tx2);
  });

  it("1. Successfully initializes the $CHIMP Core Collection with zero errors", async () => {
    const mintPrice = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
    const maxSupply = 5000;

    await program.methods
      .initializeLaunch(
        "$CHIMP Genesis",
        "https://arweave.net/chimp-collection.json",
        mintPrice,
        maxSupply
      )
      .accounts({
        launchConfig: launchConfigPda,
        collection: collectionKeypair.publicKey,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
      })
      .signers([admin, collectionKeypair])
      .rpc();

    const configAccount = await program.account.launchConfig.fetch(launchConfigPda);
    expect(configAccount.admin.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(configAccount.maxSupply).to.equal(maxSupply);
    expect(configAccount.totalMinted).to.equal(0);
    expect(configAccount.isPaused).to.be.false;
  });

  it("2. Mints a single-account Metaplex Core Asset with Plugin configuration", async () => {
    const assetKeypair = Keypair.generate();
    const preTreasuryBalance = await provider.connection.getBalance(treasury.publicKey);

    await program.methods
      .mintChimp(
        "$CHIMP #1",
        "https://arweave.net/chimp-1.json",
        "Apex Primate",
        9500
      )
      .accounts({
        launchConfig: launchConfigPda,
        collection: collectionKeypair.publicKey,
        asset: assetKeypair.publicKey,
        payer: buyer.publicKey,
        recipient: buyer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
      })
      .signers([buyer, assetKeypair])
      .rpc();

    const configAccount = await program.account.launchConfig.fetch(launchConfigPda);
    expect(configAccount.totalMinted).to.equal(1);

    const postTreasuryBalance = await provider.connection.getBalance(treasury.publicKey);
    expect(postTreasuryBalance - preTreasuryBalance).to.equal(0.1 * LAMPORTS_PER_SOL);
  });

  it("3. Enforces pause guardrails and rejects unprivileged mints", async () => {
    // Admin pauses launch
    await program.methods
      .setPaused(true)
      .accounts({
        launchConfig: launchConfigPda,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    const assetKeypair = Keypair.generate();
    let errorCaught = false;

    try {
      await program.methods
        .mintChimp(
          "$CHIMP #2",
          "https://arweave.net/chimp-2.json",
          "Rare",
          4000
        )
        .accounts({
          launchConfig: launchConfigPda,
          collection: collectionKeypair.publicKey,
          asset: assetKeypair.publicKey,
          payer: buyer.publicKey,
          recipient: buyer.publicKey,
          treasury: treasury.publicKey,
          systemProgram: SystemProgram.programId,
          mplCoreProgram: MPL_CORE_PROGRAM_ID,
        })
        .signers([buyer, assetKeypair])
        .rpc();
    } catch (err: any) {
      errorCaught = true;
      expect(err.error.errorCode.code).to.equal("LaunchPaused");
    }

    expect(errorCaught).to.be.true;

    // Unpause for clean test teardown
    await program.methods
      .setPaused(false)
      .accounts({
        launchConfig: launchConfigPda,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();
  });
});