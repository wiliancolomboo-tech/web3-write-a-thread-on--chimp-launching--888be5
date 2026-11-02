use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("CHiMPcoRE1111111111111111111111111111111111");

#[program]
pub mod chimp_core_engine {
    use super::*;

    /// Initializes the global config and verified collection asset on Metaplex Core
    pub fn initialize_collection(
        ctx: Context<InitializeCollection>,
        name: String,
        uri: String,
        max_supply: u32,
        mint_price_lamports: u64,
    ) -> Result<()> {
        instructions::initialize_collection::handler(ctx, name, uri, max_supply, mint_price_lamports)
    }

    /// Mints a unique $CHIMP Metaplex Core asset with native plugins attached
    pub fn mint_chimp(
        ctx: Context<MintChimp>,
        asset_id_index: u32,
        name: String,
        uri: String,
        rarity_tier: String,
    ) -> Result<()> {
        instructions::mint_asset::handler(ctx, asset_id_index, name, uri, rarity_tier)
    }
}