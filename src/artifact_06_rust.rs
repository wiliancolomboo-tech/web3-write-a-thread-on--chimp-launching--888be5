use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct LaunchConfig {
    pub authority: Pubkey,
    pub collection_asset: Pubkey,
    pub treasury: Pubkey,
    pub total_minted: u32,
    pub max_supply: u32,
    pub mint_price_lamports: u64,
    pub is_paused: bool,
    pub bump: u8,
}

impl LaunchConfig {
    pub const SEED_PREFIX: &'static [u8] = b"chimp_config";
}