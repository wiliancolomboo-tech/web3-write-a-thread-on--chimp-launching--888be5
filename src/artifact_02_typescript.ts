// File: src/chimp-engine.ts
import { 
  createUmi 
} from '@metaplex-foundation/umi-bundle-defaults';
import { 
  createSignerFromKeypair, 
  signerIdentity, 
  generateSigner, 
  percentAmount, 
  publicKey,
  KeypairSigner,
  Umi,
  PublicKey
} from '@metaplex-foundation/umi';
import { 
  createCollection, 
  create, 
  fetchAsset, 
  fetchCollection,
  ruleSet,
  pluginAuthorityPair,
  createPlugin,
  Asset,
  Collection
} from '@metaplex-foundation/mpl-core';
import * as web3 from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

export interface ChimpEngineConfig {
  rpcUrl: string;
  payerSecretKey: Uint8Array;
  collectionName: string;
  collectionUri: string;
  sellerFeeBasisPoints: number; // e.g. 500 = 5%
}

export interface ChimpAssetPayload {
  name: string;
  uri: string;
  ownerPubkey?: string;
  attributes?: Array<{ key: string; value: string }>;
}

export interface MintResult {
  assetAddress: string;
  collectionAddress: string;
  signature: string;
}

export class ChimpLaunchEngine {
  private umi: Umi;
  private signer: KeypairSigner;
  private config: ChimpEngineConfig;

  constructor(config: ChimpEngineConfig) {
    this.config = config;
    this.umi = createUmi(config.rpcUrl);
    
    // Derive keypair signer from secret key
    const rawKeypair = this.umi.eddsa.createKeypairFromSecretKey(config.payerSecretKey);
    this.signer = createSignerFromKeypair(this.umi, rawKeypair);
    this.umi.use(signerIdentity(this.signer));
  }

  public getPayerPublicKey(): PublicKey {
    return this.signer.publicKey;
  }

  /**
   * Initializes the parent $CHIMP Metaplex Core Collection with Royalties Plugin
   */
  public async createChimpCollection(): Promise<{ collectionAddress: string; signature: string }> {
    const collectionSigner = generateSigner(this.umi);
    
    const tx = await createCollection(this.umi, {
      collection: collectionSigner,
      name: this.config.collectionName,
      uri: this.config.collectionUri,
      plugins: [
        {
          type: 'Royalties',
          basisPoints: this.config.sellerFeeBasisPoints,
          creators: [
            {
              address: this.signer.publicKey,
              percentage: 100,
            }
          ],
          ruleSet: ruleSet('None'),
        }
      ],
    }).sendAndConfirm(this.umi);

    const signature = Buffer.from(tx.signature).toString('hex');

    return {
      collectionAddress: collectionSigner.publicKey.toString(),
      signature,
    };
  }

  /**
   * Mints an individual $CHIMP Asset attached to the Metaplex Core Collection
   */
  public async mintChimpAsset(
    collectionAddress: string,
    payload: ChimpAssetPayload
  ): Promise<MintResult> {
    const assetSigner = generateSigner(this.umi);
    const targetOwner = payload.ownerPubkey ? publicKey(payload.ownerPubkey) : this.signer.publicKey;

    // Build attributes plugin if provided
    const plugins = [];
    if (payload.attributes && payload.attributes.length > 0) {
      plugins.push(
        pluginAuthorityPair({
          type: 'Attributes',
          attributeList: payload.attributes,
        })
      );
    }

    const tx = await create(this.umi, {
      asset: assetSigner,
      collection: publicKey(collectionAddress),
      name: payload.name,
      uri: payload.uri,
      owner: targetOwner,
      plugins: plugins.length > 0 ? plugins : undefined,
    }).sendAndConfirm(this.umi);

    const signature = Buffer.from(tx.signature).toString('hex');

    return {
      assetAddress: assetSigner.publicKey.toString(),
      collectionAddress,
      signature,
    };
  }

  /**
   * Fetches deterministic metadata state directly from Solana Ledger
   */
  public async queryAsset(assetAddress: string): Promise<Asset> {
    return await fetchAsset(this.umi, publicKey(assetAddress));
  }

  /**
   * Fetches deterministic collection metadata state
   */
  public async queryCollection(collectionAddress: string): Promise<Collection> {
    return await fetchCollection(this.umi, publicKey(collectionAddress));
  }
}