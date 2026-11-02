await createV1(umi, {
  asset: assetSigner,
  collection: chimpCollection,
  name: "Chimp #1",
  uri: "https://arweave.net/...",
  plugins: [attributesPlugin, royaltiesPlugin]
}).sendAndConfirm(umi);