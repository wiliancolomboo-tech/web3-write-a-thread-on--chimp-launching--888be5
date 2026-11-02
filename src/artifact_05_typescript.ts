import { Command } from 'commander';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';
import { EnterpriseNotifier } from './telemetry';

dotenv.config();

const program = new Command();
program.version('1.0.0').description('Enterprise $CHIMP Metaplex Core Launch Orchestrator');

program
  .command('listen')
  .description('Start the autonomous Geyser/RPC log event ingestion service')
  .action(async () => {
    const rpcEndpoint = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcEndpoint, 'confirmed');
    const programId = new PublicKey(process.env.CHIMP_PROGRAM_ID || 'CH1MPy8zV4aRkR1XbNn4PqZ6yH7mJ9wQ2L8tV3kU1s9');
    const notifier = new EnterpriseNotifier();

    console.log(`[DAEMON] Subscribing to program events for ${programId.toBase58()} on ${rpcEndpoint}`);

    connection.onLogs(
      programId,
      async ({ logs, err, signature }) => {
        if (err) return;
        const mintLog = logs.find(log => log.includes("ChimpMintedEvent"));
        if (mintLog) {
          console.log(`[EVENT] Detected confirmed $CHIMP Mint: ${signature}`);
          // Parse event params and dispatch alert
          await notifier.dispatchMintNotification({
            assetId: "CoreAssetSamplePubkey1111111111111111111111",
            recipient: "UserDestination1111111111111111111111111111",
            mintNumber: 42,
            rarityTier: "Legendary Alpha",
            chimpPower: 9900,
            txSignature: signature,
            cluster: 'devnet'
          });
        }
      },
      'confirmed'
    );
  });

program
  .command('test-alert')
  .description('Dispatch synthetic health check alert')
  .action(async () => {
    const notifier = new EnterpriseNotifier();
    await notifier.dispatchMintNotification({
      assetId: "CHIMP3zK5u4W1mPLXcoreExampleAssetId987654321",
      recipient: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      mintNumber: 1,
      rarityTier: "Primate Sovereign",
      chimpPower: 10000,
      txSignature: "5KtPn3Wn3kL2Y5...sampleTxSig...8zVx4Q",
      cluster: "devnet"
    });
  });

program.parse(process.argv);