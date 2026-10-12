import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";
import { keccak256 } from "js-sha3";

describe("Chimp Launchpad - Metaplex Core Integration Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const MPL_CORE_PROGRAM_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4P8TQ56y");
  
  // Wallet contexts
  const admin = Keypair.generate();
  const legitimateUser = Keypair.generate();
  const unauthorizedUser = Keypair.generate();
  const treasury = Keypair.generate();

  let configPda: PublicKey;
  let configBump: number;
  let collectionKeypair = Keypair.generate();

  // Merkle Tree Setup
  const allowedWallets = [legitimateUser.publicKey.toBuffer()];
  const leaves = allowedWallets.map((wallet) => Buffer.from(keccak256(wallet), "hex"));
  
  // Single leaf root computation for testing
  const merkleRoot = leaves[0];
  const validProof: number[][] = []; // Single leaf tree requires empty sibling proof

  before(async () => {
    // Airdrop balances
    for (const kp of [admin, legitimateUser, unauthorizedUser]) {
      const sig = await provider.connection.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig, "confirmed");
    }

    [configPda, configBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("chimp_config")],
      anchor.workspace.ChimpLaunchpad.programId
    );
  });

  it("1. Successfully initializes the $CHIMP launchpad with Metaplex Core specs", async () => {
    const program = anchor.workspace.ChimpLaunchpad as Program<any>;

    const maxSupply = 500;
    const mintPrice = new anchor.BN(0.05 * LAMPORTS_PER_SOL);
    const sellerFeeBasisPoints = 500; // 5.00%

    await program.methods
      .initializeLaunchpad(
        Array.from(merkleRoot),
        mintPrice,
        maxSupply,
        sellerFeeBasisPoints
      )
      .accounts({
        launchpadConfig: configPda,
        collection: collectionKeypair.publicKey,
        treasury: treasury.publicKey,
        authority: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const configAccount = await program.account.launchpadConfig.fetch(configPda);
    expect(configAccount.authority.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(configAccount.treasury.toBase58()).to.equal(treasury.publicKey.toBase58());
    expect(configAccount.maxSupply).to.equal(maxSupply);
    expect(configAccount.currentSupply).to.equal(0);
    expect(configAccount.isActive).to.be.true;
  });

  it("2. Rejects unauthorized state changes to the Merkle Root", async () => {
    const program = anchor.workspace.ChimpLaunchpad as Program<any>;
    const dummyRoot = Array.from(Buffer.alloc(32, 1));

    try {
      await program.methods
        .setMerkleRoot(dummyRoot)
        .accounts({
          launchpadConfig: configPda,
          authority: unauthorizedUser.publicKey,
        })
        .signers([unauthorizedUser])
        .rpc();
      expect.fail("Unauthorized wallet should not be able to modify config");
    } catch (err: any) {
      expect(err.toString()).to.include("Unauthorized");
    }
  });

  it("3. Enforces Merkle tree validation during mint", async () => {
    const program = anchor.workspace.ChimpLaunchpad as Program<any>;
    const assetKeypair = Keypair.generate();

    try {
      await program.methods
        .mintChimpCore(
          validProof,
          "$CHIMP #1",
          "https://metadata.chimp.io/1.json"
        )
        .accounts({
          launchpadConfig: configPda,
          payer: unauthorizedUser.publicKey, // Not in merkle tree
          asset: assetKeypair.publicKey,
          collection: collectionKeypair.publicKey,
          treasury: treasury.publicKey,
          mplCoreProgram: MPL_CORE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([unauthorizedUser, assetKeypair])
        .rpc();
      expect.fail("Unauthorized user should fail Merkle verification");
    } catch (err: any) {
      expect(err.toString()).to.include("InvalidMerkleProof");
    }
  });

  it("4. Rejects minting when launchpad is paused", async () => {
    const program = anchor.workspace.ChimpLaunchpad as Program<any>;
    
    // Pause launchpad
    await program.methods
      .setActiveState(false)
      .accounts({
        launchpadConfig: configPda,
        authority: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    const assetKeypair = Keypair.generate();
    try {
      await program.methods
        .mintChimpCore(
          validProof,
          "$CHIMP #1",
          "https://metadata.chimp.io/1.json"
        )
        .accounts({
          launchpadConfig: configPda,
          payer: legitimateUser.publicKey,
          asset: assetKeypair.publicKey,
          collection: collectionKeypair.publicKey,
          treasury: treasury.publicKey,
          mplCoreProgram: MPL_CORE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([legitimateUser, assetKeypair])
        .rpc();
      expect.fail("Minting should fail when inactive");
    } catch (err: any) {
      expect(err.toString()).to.include("LaunchpadInactive");
    }

    // Unpause launchpad for future tests
    await program.methods
      .setActiveState(true)
      .accounts({
        launchpadConfig: configPda,
        authority: admin.publicKey,
      })
      .signers([admin])
      .rpc();
  });
});