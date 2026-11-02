import { Connection, PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { CONFIG } from "./config";
import { EnterpriseNotifier } from "./notifier";

export class ChimpCoreSentinel {
  private connection: Connection;
  private isRunning: boolean = false;

  constructor() {
    this.connection = new Connection(CONFIG.rpcEndpoint, {
      wsEndpoint: CONFIG.wsEndpoint,
      commitment: "confirmed",
    });
  }

  public async start(): Promise<void> {
    this.isRunning = true;
    console.log("==================================================");
    console.log("🚀 Starting $CHIMP Metaplex Core Sentinel Service");
    console.log(`📡 RPC Endpoint: ${CONFIG.rpcEndpoint}`);
    console.log(`🎯 Program ID: ${CONFIG.programId}`);
    console.log(`📦 Collection: ${CONFIG.collectionAddress}`);
    console.log("==================================================");

    const programKey = new PublicKey(CONFIG.programId);

    this.connection.onLogs(
      programKey,
      async (logsContext, ctx) => {
        if (logsContext.err) return;

        const signature = logsContext.signature;
        for (const log of logsContext.logs) {
          if (log.includes("SwappedFungibleForCoreEvent")) {
            console.log(`[EVENT] Swapped Fungible for Core Asset in Tx: ${signature}`);
            await EnterpriseNotifier.dispatch({
              direction: "FUNGIBLE_TO_CORE",
              user: "Encountered in Log",
              asset: "Metaplex Core Item",
              amountChimp: "1,000,000",
              signature,
              slot: ctx.slot,
            });
          } else if (log.includes("SwappedCoreForFungibleEvent")) {
            console.log(`[EVENT] Swapped Core Asset for Fungible in Tx: ${signature}`);
            await EnterpriseNotifier.dispatch({
              direction: "CORE_TO_FUNGIBLE",
              user: "Encountered in Log",
              asset: "Metaplex Core Item",
              amountChimp: "1,000,000",
              signature,
              slot: ctx.slot,
            });
          }
        }
      },
      "confirmed"
    );

    // Keep event loop active
    while (this.isRunning) {
      await new Promise((resolve) => setTimeout(resolve, CONFIG.pollIntervalMs));
    }
  }

  public stop(): void {
    this.isRunning = false;
    console.log("🛑 $CHIMP Sentinel stopped.");
  }
}

if (require.main === module) {
  const sentinel = new ChimpCoreSentinel();
  sentinel.start().catch((err) => {
    console.error("Fatal exception in Sentinel:", err);
    process.exit(1);
  });
}