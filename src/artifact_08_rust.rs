use anchor_lang::prelude::*;
use mpl_core::instructions::CreateCollectionV1Builder;
use crate::state::LaunchConfig;
use crate::errors::ChimpError;

#[derive(Accounts)]
pub struct InitializeCollection<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + LaunchConfig::INIT_SPACE,
        seeds = [LaunchConfig::SEED_PREFIX],
        bump
    )]
    pub launch_config: Account<'info, LaunchConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub collection_asset: Signer<'info>,

    /// CHECK: Treasury wallet receiving mint proceeds
    pub treasury: AccountInfo<'info>,

    /// CHECK: Metaplex Core Program ID verified by address constraint
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeCollection>,
    name: String,
    uri: String,
    max_supply: u32,
    mint_price_lamports: u64,
) -> Result<()> {
    require!(name.len() <= 32, ChimpError::NameTooLong);
    require!(uri.len() <= 200, ChimpError::UriTooLong);

    let config = &mut ctx.accounts.launch_config;
    config.authority = ctx.accounts.authority.key();
    config.collection_asset = ctx.accounts.collection_asset.key();
    config.treasury = ctx.accounts.treasury.key();
    config.total_minted = 0;
    config.max_supply = max_supply;
    config.mint_price_lamports = mint_price_lamports;
    config.is_paused = false;
    config.bump = ctx.bumps.launch_config;

    // CPI into Metaplex Core to create the Collection Asset
    CreateCollectionV1Builder::new()
        .collection(&ctx.accounts.collection_asset.to_account_info())
        .payer(&ctx.accounts.authority.to_account_info())
        .update_authority(Some(&ctx.accounts.launch_config.to_account_info()))
        .name(name)
        .uri(uri)
        .instruction()
        .invoke(&[
            ctx.accounts.collection_asset.to_account_info(),
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.launch_config.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ])?;

    msg!("$CHIMP Metaplex Core Collection initialized: {}", ctx.accounts.collection_asset.key());
    Ok(())
}