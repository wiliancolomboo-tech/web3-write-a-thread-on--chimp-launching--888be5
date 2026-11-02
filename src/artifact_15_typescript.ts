import axios from "axios";
import { CONFIG } from "./config";

export interface SwapNotificationPayload {
  direction: "FUNGIBLE_TO_CORE" | "CORE_TO_FUNGIBLE";
  user: string;
  asset: string;
  amountChimp: string;
  signature: string;
  slot: number;
}

export class EnterpriseNotifier {
  public static async dispatch(payload: SwapNotificationPayload): Promise<void> {
    const title = payload.direction === "FUNGIBLE_TO_CORE"
      ? "🦧 $CHIMP Minted into Metaplex Core Asset!"
      : "🔄 Metaplex Core Deposited for $CHIMP SPL Float";

    const text = `*${title}*\n`
      + `• *User:* \`${payload.user}\`\n`
      + `• *Core Asset ID:* \`${payload.asset}\`\n`
      + `• *Amount:* ${payload.amountChimp} $CHIMP\n`
      + `• *Tx:* https://solscan.io/tx/${payload.signature}`;

    const promises: Promise<any>[] = [];

    if (CONFIG.discordWebhookUrl) {
      promises.push(
        axios.post(CONFIG.discordWebhookUrl, {
          embeds: [{
            title,
            color: payload.direction === "FUNGIBLE_TO_CORE" ? 0x22c55e : 0x3b82f6,
            fields: [
              { name: "User", value: payload.user, inline: false },
              { name: "Metaplex Core Asset", value: payload.asset, inline: false },
              { name: "SPL Transferred", value: `${payload.amountChimp} $CHIMP`, inline: true },
              { name: "Solscan Proof", value: `[View Transaction](https://solscan.io/tx/${payload.signature})`, inline: true }
            ],
            footer: { text: "CHIMP Engine • Metaplex Core Sentinel" },
            timestamp: new Date().toISOString()
          }]
        }).catch(err => console.error("[Discord Hook Error]", err.message))
      );
    }

    if (CONFIG.slackWebhookUrl) {
      promises.push(
        axios.post(CONFIG.slackWebhookUrl, { text }).catch(err => console.error("[Slack Hook Error]", err.message))
      );
    }

    await Promise.allSettled(promises);
  }
}