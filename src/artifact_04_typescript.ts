import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";

describe("chimp_launchpad Unit & Integration QA Suite", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ChimpLaunchpad;

  const admin = Keypair.generate();
  const treasury = Keypair.generate();
  const recipient = Keypair.generate();
  const collectionKeypair = Keypair.generate();
  const mplCoreMock = new PublicKey("CoRe1xTViWsNxz93u1xR3d13aY2nWBvWdBMecAijWf9");

  let configPda: PublicKey;
  let bump: number;

  before(async () => {
    // Fund Admin and Recipient
    const airdropAdmin = await provider.connection.requestAirdrop(admin.publicKey, 5 * LAMPORTS_PER_SOL);
    const airdropRecipient = await provider.connection.requestAirdrop(recipient.publicKey, 5 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(airdropAdmin);
    await provider.connection.confirmTransaction(airdropRecipient);

    [configPda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("chimp_config"), admin.publicKey.toBuffer()],
      program.programId
    );
  });

  it("QA-01: Successfully Initializes $CHIMP Metaplex Core Collection Configuration", async () => {
    await program.methods
      .initializeCollection("$CHIMP Genesis", "https://arweave.net/chimp-collection.json")
      .accounts({
        config: configPda,
        collection: collectionKeypair.publicKey,
        treasury: treasury.publicKey,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const configAccount = await program.account.launchpadConfig.fetch(configPda);
    expect(configAccount.admin.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(configAccount.treasury.toBase58()).to.equal(treasury.publicKey.toBase58());
    expect(configAccount.collection.toBase58()).to.equal(collectionKeypair.publicKey.toBase58());
    expect(configAccount.totalMinted.toNumber()).to.equal(0);
    expect(configAccount.maxSupply.toNumber()).to.equal(10000);
    expect(configAccount.isPaused).to.be.false;
  });

  it("QA-02: Enforces Admin Pausing Functionality", async () => {
    await program.methods
      .setPause(true)
      .accounts({
        config: configPda,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    const configAccount = await program.account.launchpadConfig.fetch(configPda);
    expect(configAccount.isPaused).to.be.true;

    // Unpause for subsequent tests
    await program.methods
      .setPause(false)
      .accounts({
        config: configPda,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    const unpausedConfig = await program.account.launchpadConfig.fetch(configPda);
    expect(unpausedConfig.isPaused).to.be.false;
  });

  it("QA-03: Blocks Unauthorized Admin Manipulation", async () => {
    const maliciousActor = Keypair.generate();
    const airdrop = await provider.connection.requestAirdrop(maliciousActor.publicKey, 1 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(airdrop);

    try {
      await program.methods
        .setPause(true)
        .accounts({
          config: configPda,
          admin: maliciousActor.publicKey,
        })
        .signers([maliciousActor])
        .rpc();
      expect.fail("Should have thrown unauthorized has_one constraint violation.");
    } catch (err: any) {
      expect(err.toString()).to.include("ConstraintRaw") || expect(err.toString()).to.include("has_one");
    }
  });

  it("QA-04: Rejects Asset Strings Exceeding Canonical Byte Capacities", async () => {
    const assetKeypair = Keypair.generate();
    const overlengthName = "A".repeat(33); // Exceeds 32 bytes

    try {
      await program.methods
        .mintChimp(overlengthName, "https://arweave.net/meta.json")
        .accounts({
          config: configPda,
          collection: collectionKeypair.publicKey,
          asset: assetKeypair.publicKey,
          recipient: recipient.publicKey,
          payer: recipient.publicKey,
          treasury: treasury.publicKey,
          mplCoreProgram: mplCoreMock,
          systemProgram: SystemProgram.programId,
        })
        .signers([recipient, assetKeypair])
        .rpc();
      expect.fail("Should have aborted due to string size limit violation.");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("NameTooLong");
    }
  });
});