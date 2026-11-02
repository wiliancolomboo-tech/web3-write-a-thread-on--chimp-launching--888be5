import dotenv from "dotenv";
dotenv.config();

export interface WorkerConfig {
  rpcEndpoint: string;
  wsEndpoint: string;
  programId: string;
  chimpMint: string;
  collectionAddress: string;
  slackWebhookUrl?: string;
  discordWebhookUrl?: string;
  pollIntervalMs: number;
}

export const CONFIG: WorkerConfig = {
  rpcEndpoint: process.env.SOLANA_RPC_ENDPOINT || "https://api.devnet.solana.com",
  wsEndpoint: process.env.SOLANA_WS_ENDPOINT || "wss://api.devnet.solana.com",
  programId: process.env.PROGRAM_ID || "Ch1mpVault1111111111111111111111111111111111",
  chimpMint: process.env.CHIMP_MINT || "Ch1mpFungib1e1111111111111111111111111111111",
  collectionAddress: process.env.CORE_COLLECTION || "CoreCo11ection11111111111111111111111111111",
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "5000", 10),
};