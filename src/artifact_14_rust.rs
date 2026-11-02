use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("ChimpLaunch1111111111111111111111111111111111");

#[program]
pub mod chimp_launch {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        swap_ratio: u64,
        max_supply: u32,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, swap_ratio, max_supply)
    }

    pub fn mint_core_asset(
        ctx: Context<MintCoreAsset>,
        name: String,
        uri: String,
    ) -> Result<()> {
        instructions::mint_core_asset::handler(ctx, name, uri)
    }

    pub fn swap_tokens_for_nft(ctx: Context<SwapTokensForNft>) -> Result<()> {
        instructions::swap_tokens_for_nft::handler(ctx)
    }

    pub fn swap_nft_for_tokens(ctx: Context<SwapNftForTokens>) -> Result<()> {
        instructions::swap_nft_for_tokens::handler(ctx)
    }
}