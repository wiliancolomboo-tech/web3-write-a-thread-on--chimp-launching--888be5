import { Command } from "commander";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import axios from "axios";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || "Ch1mpLaunchEng1ne11111111111111111111111111");
const WEBHOOK_URL = process.env.DISCORD_OR_SLACK_WEBHOOK || "";

const programInterface = JSON.parse(
  fs.readFileSync("./target/idl/chimp_launch_engine.json", "utf8")
);

function loadKeypair(path: string): Keypair {
  const secretKey = JSON.parse(fs.readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function notifyWebhook(title: string, message: string, txId: string) {
  if (!WEBHOOK_URL) return;
  try {
    await axios.post(WEBHOOK_URL, {
      content: `🚨 **${title}**\n${message}\nExplorer: https://explorer.solana.com/tx/${txId}?cluster=devnet`,
    });
  } catch (err: any) {
    console.error("Failed to emit webhook alert:", err.message);
  }
}

const program = new Command();

program
  .name("chimp-cli")
  .description("Enterprise operations CLI for $CHIMP Metaplex Launch Engine")
  .version("1.0.0");

program
  .command("init")
  .description("Initialize the $CHIMP Launch Config PDA")
  .requiredOption("-k, --keypair <path>", "Path to authority keypair JSON")
  .requiredOption("-t, --treasury <pubkey>", "Treasury wallet recipient")
  .option("-s, --supply <number>", "Max supply", "10000")
  .option("-p, --price <lamports>", "Mint price in lamports", "10000000") // 0.01 SOL
  .option("-u, --uri <uri>", "Metadata base URI", "https://api.chimp.fun/metadata")
  .action(async (options) => {
    const authority = loadKeypair(options.keypair);
    const connection = new Connection(process.env.SOLANA_RPC || "https://api.devnet.solana.com", "confirmed");
    const wallet = new anchor.Wallet(authority);
    const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
    const client = new anchor.Program(programInterface, PROGRAM_ID, provider);

    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("chimp_launch")], PROGRAM_ID);

    console.log(`Executing Initialize $CHIMP Config -> PDA: ${configPda.toBase58()}`);

    const tx = await client.methods
      .initialize(
        new anchor.BN(options.supply),
        new anchor.BN(options.price),
        options.uri
      )
      .accounts({
        config: configPda,
        authority: authority.publicKey,
        treasury: new PublicKey(options.treasury),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    console.log(`Success! Transaction ID: ${tx}`);
    await notifyWebhook("$CHIMP Launch Initialized", `Engine successfully initialized with Max Supply: ${options.supply}`, tx);
  });

program
  .command("mint")
  .description("Execute a user or bot mint of a $CHIMP Core Asset")
  .requiredOption("-k, --keypair <path>", "Minter keypair JSON")
  .requiredOption("-t, --treasury <pubkey>", "Treasury pubkey")
  .action(async (options) => {
    const minter = loadKeypair(options.keypair);
    const connection = new Connection(process.env.SOLANA_RPC || "https://api.devnet.solana.com", "confirmed");
    const wallet = new anchor.Wallet(minter);
    const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
    const client = new anchor.Program(programInterface, PROGRAM_ID, provider);

    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("chimp_launch")], PROGRAM_ID);
    const assetKeypair = Keypair.generate();
    const mplCoreProgramId = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4P8pq6x");

    console.log(`Minting $CHIMP Asset: ${assetKeypair.publicKey.toBase58()}`);

    const tx = await client.methods
      .mintChimp(new anchor.BN(Date.now()))
      .accounts({
        config: configPda,
        minter: minter.publicKey,
        chimpAsset: assetKeypair.publicKey,
        treasury: new PublicKey(options.treasury),
        mplCoreProgram: mplCoreProgramId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([minter, assetKeypair])
      .rpc();

    console.log(`$CHIMP Minted Successfully! Tx: ${tx}`);
    await notifyWebhook("$CHIMP Minted", `Asset ID: ${assetKeypair.publicKey.toBase58()} minted by ${minter.publicKey.toBase58()}`, tx);
  });

program.parse(process.argv);