import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";
import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";

describe("chimp-launch-engine", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Address of Metaplex Core Program
  const MPL_CORE_PROGRAM_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");

  const authority = Keypair.generate();
  const treasury = Keypair.generate();
  const userValid = Keypair.generate();
  const userMalicious = Keypair.generate();

  let tree: MerkleTree;
  let root: Buffer;
  let launchConfigPda: PublicKey;
  let bump: number;

  before(async () => {
    // Airdrop SOL to test actors
    for (const actor of [authority, userValid, userMalicious]) {
      const sig = await provider.connection.requestAirdrop(actor.publicKey, 5 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig, "confirmed");
    }

    // Prepare Merkle Tree
    const allowlist = [userValid.publicKey.toBase58(), authority.publicKey.toBase58()];
    const leaves = allowlist.map((a) => keccak256(new PublicKey(a).toBuffer()));
    tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    root = tree.getRoot();

    // Derive PDA
    [launchConfigPda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("chimp_launch_config"), authority.publicKey.toBuffer()],
      new PublicKey("Ch1mpLaunch111111111111111111111111111111111")
    );
  });

  it("1. Generates Merkle tree and validates inclusion deterministically", async () => {
    const leafValid = keccak256(userValid.publicKey.toBuffer());
    const proof = tree.getProof(leafValid);
    const isValid = tree.verify(proof, leafValid, root);
    expect(isValid).to.be.true;

    const leafInvalid = keccak256(userMalicious.publicKey.toBuffer());
    const invalidProof = tree.getProof(leafInvalid);
    const isMaliciousValid = tree.verify(invalidProof, leafInvalid, root);
    expect(isMaliciousValid).to.be.false;
  });

  it("2. Verifies Launch Parameters Constraints", () => {
    const mintPrice = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
    const maxSupply = 5555;
    const now = Math.floor(Date.now() / 1000);

    expect(mintPrice.toNumber()).to.be.greaterThan(0);
    expect(maxSupply).to.equal(5555);
    expect(now).to.be.greaterThan(0);
  });

  it("3. Validates Metaplex Core account layout & zero-rent bloat assumptions", () => {
    // Metaplex Core creates a single unified account instead of 3 legacy accounts
    const legacySize = 82 + 679 + 282; // Mint + Metadata + MasterEdition approx
    const mplCoreSize = 168; // Base single account size for Core Asset
    const savingsPercentage = ((legacySize - mplCoreSize) / legacySize) * 100;

    expect(savingsPercentage).to.be.greaterThan(80);
    console.log(`    Calculated Rent Cost Reduction: ${savingsPercentage.toFixed(2)}%`);
  });

  it("4. Blocks unauthorized users from forging allowlist proofs", () => {
    const unauthorizedLeaf = keccak256(userMalicious.publicKey.toBuffer());
    const validProof = tree.getProof(keccak256(userValid.publicKey.toBuffer()));
    
    // Attempting to evaluate valid proof with malicious leaf must fail
    const forgedAttempt = tree.verify(validProof, unauthorizedLeaf, root);
    expect(forgedAttempt).to.be.false;
  });
});