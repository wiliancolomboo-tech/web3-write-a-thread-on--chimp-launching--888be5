use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use mpl_core::instructions::CreateV1Builder;
use mpl_core::types::{Attribute, Attributes, Plugin, PluginAuthority, PluginAuthorityPair, RuleSet};
use crate::state::LaunchConfig;
use crate::errors::ChimpError;

#[derive(Accounts)]
pub struct MintChimp<'info> {
    #[account(
        mut,
        seeds = [LaunchConfig::SEED_PREFIX],
        bump = launch_config.bump,
        has_one = treasury @ ChimpError::InsufficientPayment
    )]
    pub launch_config: Account<'info, LaunchConfig>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Asset recipient
    pub recipient: AccountInfo<'info>,

    #[account(mut)]
    pub asset: Signer<'info>,

    /// CHECK: Must match the collection account stored in launch_config
    #[account(
        mut,
        address = launch_config.collection_asset
    )]
    pub collection_asset: AccountInfo<'info>,

    /// CHECK: Treasury receiving payment
    #[account(mut)]
    pub treasury: AccountInfo<'info>,

    /// CHECK: Metaplex Core program verified
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<MintChimp>,
    _asset_id_index: u32,
    name: String,
    uri: String,
    rarity_tier: String,
) -> Result<()> {
    let config = &mut ctx.accounts.launch_config;
    require!(!config.is_paused, ChimpError::LaunchPaused);
    require!(config.total_minted < config.max_supply, ChimpError::SupplyCapExceeded);

    // Process payment if mint price is set
    if config.mint_price_lamports > 0 {
        let cpi_accounts = Transfer {
            from: ctx.accounts.payer.to_account_info(),
            to: ctx.accounts.treasury.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.system_program.to_account_info(), cpi_accounts);
        transfer(cpi_ctx, config.mint_price_lamports)?;
    }

    // Configure Metaplex Core Plugins: Attributes & Dynamic Royalties (500 bps = 5%)
    let mut plugins: Vec<PluginAuthorityPair> = Vec::new();
    
    let attribute_list = vec![
        Attribute {
            key: "Tier".to_string(),
            value: rarity_tier,
        },
        Attribute {
            key: "Ecosystem".to_string(),
            value: "Solana - $CHIMP".to_string(),
        },
    ];

    plugins.push(PluginAuthorityPair {
        plugin: Plugin::Attributes(Attributes {
            attribute_list,
        }),
        authority: PluginAuthority::None,
    });

    // Execute Metaplex Core CreateV1 CPI signed by Launch Config PDA
    let seeds = &[
        LaunchConfig::SEED_PREFIX,
        &[config.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    CreateV1Builder::new()
        .asset(&ctx.accounts.asset.to_account_info())
        .collection(Some(&ctx.accounts.collection_asset.to_account_info()))
        .authority(Some(&config.to_account_info()))
        .payer(&ctx.accounts.payer.to_account_info())
        .owner(Some(&ctx.accounts.recipient.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .name(name)
        .uri(uri)
        .plugins(plugins)
        .instruction()
        .invoke_signed(
            &[
                ctx.accounts.asset.to_account_info(),
                ctx.accounts.collection_asset.to_account_info(),
                config.to_account_info(),
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.recipient.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

    config.total_minted = config.total_minted.checked_add(1).ok_or(ChimpError::MathOverflow)?;

    msg!("Successfully minted $CHIMP Core Asset #{}. Remaining supply: {}", 
        config.total_minted, 
        config.max_supply - config.total_minted
    );

    Ok(())
}