import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, Idl } from "@coral-xyz/anchor";
import axios from "axios";
import { Resend } from "resend";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration environment bindings
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || "Ch1mpCoreLaunchpad11111111111111111111111111");
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_ALERT_EMAIL = process.env.RESEND_ALERT_EMAIL || "ops@chimp.solana";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export interface ChimpMintTelemetry {
  assetPubkey: string;
  recipient: string;
  edition: number;
  txHash: string;
  solPrice: number;
  timestamp: string;
}

export class ChimpLaunchpadClient {
  public connection: Connection;
  public provider: AnchorProvider;
  public adminWallet: Wallet;

  constructor(adminKeypair: Keypair) {
    this.connection = new Connection(SOLANA_RPC_URL, "confirmed");
    this.adminWallet = new Wallet(adminKeypair);
    this.provider = new AnchorProvider(this.connection, this.adminWallet, {
      preflightCommitment: "confirmed",
    });
  }

  /**
   * Broadcast real-time mint notifications across enterprise channels
   */
  public async broadcastMintEvent(telemetry: ChimpMintTelemetry): Promise<void> {
    console.log(`[ALERT] Ingested Mint for $CHIMP #${telemetry.edition} -> ${telemetry.assetPubkey}`);

    // 1. Dispatch to Discord
    if (DISCORD_WEBHOOK_URL) {
      try {
        await axios.post(DISCORD_WEBHOOK_URL, {
          username: "$CHIMP Launchpad Sentinel",
          avatar_url: "https://arweave.net/chimp-logo.png",
          embeds: [
            {
              title: "🦍 New $CHIMP Minted on Metaplex Core!",
              color: 0xffa500,
              fields: [
                { name: "Edition", value: `#${telemetry.edition}`, inline: true },
                { name: "Recipient", value: `\`${telemetry.recipient.slice(0, 4)}...${telemetry.recipient.slice(-4)}\``, inline: true },
                { name: "Asset ID", value: `[Solana Explorer](https://explorer.solana.com/address/${telemetry.assetPubkey})` },
                { name: "Transaction", value: `[View Hash](https://explorer.solana.com/tx/${telemetry.txHash})` },
              ],
              footer: { text: "Powered by Metaplex Core Asset Standard" },
              timestamp: telemetry.timestamp,
            },
          ],
        });
        console.log("[Discord] Webhook notification delivered.");
      } catch (err) {
        console.error("[Discord] Webhook notification failed:", (err as Error).message);
      }
    }

    // 2. Dispatch to Slack Operations Room
    if (SLACK_WEBHOOK_URL) {
      try {
        await axios.post(SLACK_WEBHOOK_URL, {
          text: `🚨 *$CHIMP Mint Success* | Edition #${telemetry.edition} | Recipient: \`${telemetry.recipient}\` | Tx: \`${telemetry.txHash}\``,
        });
        console.log("[Slack] Ops notification delivered.");
      } catch (err) {
        console.error("[Slack] Webhook notification failed:", (err as Error).message);
      }
    }

    // 3. Dispatch to Enterprise Resend Email Service
    if (resend) {
      try {
        await resend.emails.send({
          from: "launchpad@chimp.solana",
          to: RESEND_ALERT_EMAIL,
          subject: `[Audit] $CHIMP Asset #${telemetry.edition} Successfully Minted`,
          html: `
            <h2>$CHIMP Metaplex Core Launch Alert</h2>
            <p>A new asset has been written directly to Metaplex Core state.</p>
            <ul>
              <li><strong>Edition:</strong> #${telemetry.edition}</li>
              <li><strong>Asset Address:</strong> ${telemetry.assetPubkey}</li>
              <li><strong>Recipient:</strong> ${telemetry.recipient}</li>
              <li><strong>Tx Hash:</strong> ${telemetry.txHash}</li>
              <li><strong>Timestamp:</strong> ${telemetry.timestamp}</li>
            </ul>
          `,
        });
        console.log("[Resend] Audit email delivered.");
      } catch (err) {
        console.error("[Resend] Email dispatch failed:", (err as Error).message);
      }
    }
  }

  /**
   * Monitor on-chain program logs for deterministic events
   */
  public listenToMintEvents(): void {
    console.log(`[DAEMON] Subscribing to $CHIMP Launchpad Program logs at: ${PROGRAM_ID.toBase58()}`);

    this.connection.onLogs(
      PROGRAM_ID,
      async ({ logs, err, signature }) => {
        if (err) return;

        const isMintLog = logs.some((l) => l.includes("Instruction: MintChimp"));
        if (isMintLog) {
          const telemetry: ChimpMintTelemetry = {
            assetPubkey: "CoreAssetKeySample" + signature.slice(0, 8),
            recipient: this.adminWallet.publicKey.toBase58(),
            edition: Math.floor(Math.random() * 10000),
            txHash: signature,
            solPrice: 0.1,
            timestamp: new Date().toISOString(),
          };
          await this.broadcastMintEvent(telemetry);
        }
      },
      "confirmed"
    );
  }
}

// Direct Execution Entrypoint
if (require.main === module) {
  const dummyKeypair = Keypair.generate();
  const agent = new ChimpLaunchpadClient(dummyKeypair);
  agent.listenToMintEvents();

  // Trigger a dry-run telemetry proof
  agent.broadcastMintEvent({
    assetPubkey: Keypair.generate().publicKey.toBase58(),
    recipient: dummyKeypair.publicKey.toBase58(),
    edition: 1,
    txHash: "5VERv8NMvQbJepqzToqE6Xk7Q69WqJ",
    solPrice: 0.1,
    timestamp: new Date().toISOString(),
  });
}