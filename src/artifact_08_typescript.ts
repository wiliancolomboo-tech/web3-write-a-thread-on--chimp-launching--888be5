import axios from 'axios';
import { loadConfig } from './config';

export interface TweetPayload {
  text: string;
}

export class ThreadPublisher {
  private config = loadConfig();

  /**
   * Publishes Part 1 of the $CHIMP launch thread.
   */
  public async publishPart1Thread(dryRun: boolean = true): Promise<string[]> {
    const threadTweets: string[] = [
      `1/10 🐒 $CHIMP is officially launching on Solana using @metaplex's revolutionary Core standard! 

Why Metaplex Core? It slashes mint costs by ~85%, drops account rent to a bare minimum, and packs ownership, royalties, and metadata into ONE atomic account. 

Here is the technical breakdown 🧵👇`,

      `2/10 🏛️ The Old vs. The New:
Legacy Token Metadata on Solana required 4 accounts per asset:
- Mint Account
- Token Account
- Metadata Account
- Master Edition Account

Result? >0.022 SOL locked in rent + complex cross-program CPIs. 

Metaplex Core packs everything into a single account (~0.0035 SOL). Efficiency redefined.`,

      `3/10 ⚡ Dynamic Plugin Architecture:
$CHIMP leverages MPL-Core's native plugin architecture:
✅ On-chain Royalty enforcement with zero wrapper bloat
✅ Native Attributes plugin storing archetype traits directly on L1
✅ Built-in Freeze & Transfer Delegates for future DeFi staking mechanisms

Gas efficient. Maximum speed.`,

      `4/10 🔒 Cryptographic Integrity & Verifiability:
$CHIMP asset accounts are anchored directly to our sovereign Metaplex Core Collection authority.

Every mint executes in a single deterministic instruction, preventing front-running and ensuring strict royalty compliance.

Contract: CoREENxus...
Collection ID: Verified.`,

      `5/10 🌐 Turnkey Developer Experience:
The entire pipeline is open-source, automated with @metaplex Umi SDK, and integrated with live RPC telemetry & webhooks.

Part 2 will unpack our Hybrid Liquidity Bridge and how $CHIMP blends MPL-Core with SPL Token-2022!

Like + Retweet to support the next era of Solana digital assets. 🚀🍌`
    ];

    console.log(`[THREAD PUBLISHER] Loaded ${threadTweets.length} tweets for Part 1.`);

    if (dryRun) {
      console.log('--- [DRY RUN MODE ENABLED: TWEETS NOT SENT TO API] ---');
      threadTweets.forEach((tweet, idx) => {
        console.log(`\n[Tweet ${idx + 1}/${threadTweets.length}]:\n${tweet}`);
      });
      return threadTweets;
    }

    // Live execution via Twitter API v2
    const postedIds: string[] = [];
    let lastTweetId: string | null = null;

    for (const tweet of threadTweets) {
      const payload: any = { text: tweet };
      if (lastTweetId) {
        payload.reply = { in_reply_to_tweet_id: lastTweetId };
      }

      // Enterprise OAuth 1.0a / OAuth 2.0 dispatch
      const response = await axios.post('https://api.twitter.com/2/tweets', payload, {
        headers: {
          Authorization: `Bearer ${this.config.twitterAccessToken}`,
          'Content-Type': 'application/json',
        },
      });

      lastTweetId = response.data.data.id;
      if (lastTweetId) {
        postedIds.push(lastTweetId);
      }
    }

    return postedIds;
  }
}

if (require.main === module) {
  const isDryRun = process.env.DRY_RUN !== 'false';
  const publisher = new ThreadPublisher();
  publisher.publishPart1Thread(isDryRun)
    .then(() => console.log('Thread syndication routine finished.'))
    .catch(err => {
      console.error('Syndication error:', err);
      process.exit(1);
    });
}