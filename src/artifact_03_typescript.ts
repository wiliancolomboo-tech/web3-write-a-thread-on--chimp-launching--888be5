import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

export interface ChimpMintPayload {
  assetAddress: string;
  recipient: string;
  supplyIndex: number;
  metadataName: string;
  metadataUri: string;
  blockTimestamp: number;
  transactionSignature: string;
}

export class EnterpriseNotificationService {
  private discordWebhookUrl?: string;
  private slackWebhookUrl?: string;

  constructor(discordWebhookUrl?: string, slackWebhookUrl?: string) {
    this.discordWebhookUrl = discordWebhookUrl;
    this.slackWebhookUrl = slackWebhookUrl;
  }

  public async notifyAll(payload: ChimpMintPayload): Promise<void> {
    const promises: Promise<void>[] = [];
    if (this.discordWebhookUrl) {
      promises.push(this.sendDiscordNotification(payload));
    }
    if (this.slackWebhookUrl) {
      promises.push(this.sendSlackNotification(payload));
    }
    await Promise.allSettled(promises);
  }

  private async sendDiscordNotification(payload: ChimpMintPayload): Promise<void> {
    const embed = {
      title: "🚀 Metaplex Core: $CHIMP Asset Minted!",
      color: 0x10b981, // Emerald green
      fields: [
        { name: "Asset Name", value: `\`${payload.metadataName}\``, inline: true },
        { name: "Edition Index", value: `#${payload.supplyIndex}`, inline: true },
        { name: "Recipient", value: `[${payload.recipient.slice(0, 4)}...${payload.recipient.slice(-4)}](https://solscan.io/account/${payload.recipient})`, inline: true },
        { name: "Core Asset Key", value: `\`${payload.assetAddress}\``, inline: false },
        { name: "Metadata URI", value: payload.metadataUri, inline: false },
      ],
      timestamp: new Date(payload.blockTimestamp * 1000).toISOString(),
      footer: { text: "CHIMP Protocol Engine • Metaplex Core Standard" },
    };

    await this.postWithRetry(this.discordWebhookUrl!, { embeds: [embed] });
  }

  private async sendSlackNotification(payload: ChimpMintPayload): Promise<void> {
    const message = {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🚨 CHIMP Metaplex Core Mint Alert",
            emoji: true,
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Asset:*\n${payload.metadataName} (#${payload.supplyIndex})` },
            { type: "mrkdwn", text: `*Recipient:*\n\`${payload.recipient}\`` },
            { type: "mrkdwn", text: `*Asset ID:*\n\`${payload.assetAddress}\`` },
            { type: "mrkdwn", text: `*Tx Hash:*\n<https://solscan.io/tx/${payload.transactionSignature}|View Explorer>` },
          ],
        },
      ],
    };

    await this.postWithRetry(this.slackWebhookUrl!, message);
  }

  private async postWithRetry(url: string, body: unknown, maxRetries = 3): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await axios.post(url, body, { timeout: 5000 });
        return;
      } catch (err: any) {
        if (attempt === maxRetries) {
          console.error(`[Telemetry Failure] Exhausted retries targeting ${url}: ${err.message}`);
          return;
        }
        const backoffMs = Math.pow(2, attempt) * 500 + Math.random() * 200;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }
}

export class ChimpStreamListener {
  private connection: Connection;
  private programId: PublicKey;
  private notifier: EnterpriseNotificationService;
  private isRunning: boolean = false;

  constructor(rpcEndpoint: string, wsEndpoint: string, programIdStr: string) {
    this.connection = new Connection(rpcEndpoint, {
      wsEndpoint,
      commitment: "confirmed",
    });
    this.programId = new PublicKey(programIdStr);
    this.notifier = new EnterpriseNotificationService(
      process.env.DISCORD_WEBHOOK_URL,
      process.env.SLACK_WEBHOOK_URL
    );
  }

  public async start(): Promise<void> {
    this.isRunning = true;
    console.log(`[CHIMP Engine] Initializing WebSocket listener on Program: ${this.programId.toBase58()}`);

    this.connection.onLogs(
      this.programId,
      async (logsContext, ctx) => {
        if (logsContext.err) return;

        for (const logLine of logsContext.logs) {
          if (logLine.includes("Program data: ") || logLine.includes("ChimpMintEvent")) {
            try {
              // Simulated event decoding
              const dummyPayload: ChimpMintPayload = {
                assetAddress: Keypair.generate().publicKey.toBase58(),
                recipient: "Ch1mp9xQoW7X5T3V8Z7nL4m6Y8B2D5e1F3G4H5J6K7L",
                supplyIndex: Math.floor(Math.random() * 1000) + 1,
                metadataName: "$CHIMP #Alpha Genesis",
                metadataUri: "https://arweave.net/chimp-genesis-v1.json",
                blockTimestamp: Math.floor(Date.now() / 1000),
                transactionSignature: logsContext.signature,
              };

              console.log(`[Event Detected] Parsed mint in tx: ${logsContext.signature}`);
              await this.notifier.notifyAll(dummyPayload);
            } catch (err: any) {
              console.error(`[Error Decoding Event]: ${err.message}`);
            }
          }
        }
      },
      "confirmed"
    );
  }
}

// CLI entrypoint execution when called directly
if (require.main === module) {
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const wsUrl = process.env.SOLANA_WS_URL || "wss://api.mainnet-beta.solana.com";
  const programId = process.env.PROGRAM_ID || "Ch1mpLaunch111111111111111111111111111111111";

  const engine = new ChimpStreamListener(rpcUrl, wsUrl, programId);
  engine.start().catch((err) => {
    console.error("[Fatal Error in Event Daemon]", err);
    process.exit(1);
  });
}