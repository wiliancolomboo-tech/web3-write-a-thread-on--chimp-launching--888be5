use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    keccak,
    program::invoke_signed,
    system_instruction,
};
use mpl_core::{
    instructions::CreateV1Builder,
    types::{Plugin, PluginAuthority, PluginAuthorityPair, Royalties, RuleSet},
    ID as MPL_CORE_ID,
};

declare_id!("Ch1mpLaunch111111111111111111111111111111111");

pub const CONFIG_SEED: &[u8] = b"chimp_config";
pub const COLLECTION_SEED: &[u8] = b"chimp_collection";

#[program]
pub mod chimp_launchpad {
    use super::*;

    pub fn initialize_launchpad(
        ctx: Context<InitializeLaunchpad>,
        merkle_root: [u8; 32],
        mint_price_lamports: u64,
        max_supply: u32,
        seller_fee_basis_points: u16,
    ) -> Result<()> {
        let config = &mut ctx.accounts.launchpad_config;
        config.authority = ctx.accounts.authority.key();
        config.treasury = ctx.accounts.treasury.key();
        config.merkle_root = merkle_root;
        config.mint_price_lamports = mint_price_lamports;
        config.max_supply = max_supply;
        config.current_supply = 0;
        config.seller_fee_basis_points = seller_fee_basis_points;
        config.is_active = true;
        config.bump = ctx.bumps.launchpad_config;

        msg!("$CHIMP Launchpad Initialized. Target Supply: {}", max_supply);
        Ok(())
    }

    pub fn set_merkle_root(
        ctx: Context<UpdateConfig>,
        new_root: [u8; 32],
    ) -> Result<()> {
        let config = &mut ctx.accounts.launchpad_config;
        config.merkle_root = new_root;
        msg!("Merkle Root updated successfully.");
        Ok(())
    }

    pub fn set_active_state(
        ctx: Context<UpdateConfig>,
        is_active: bool,
    ) -> Result<()> {
        let config = &mut ctx.accounts.launchpad_config;
        config.is_active = is_active;
        msg!("Launchpad active state set to: {}", is_active);
        Ok(())
    }

    pub fn mint_chimp_core<'info>(
        ctx: Context<'_, '_, '_, 'info, MintChimpCore<'info>>,
        proof: Vec<[u8; 32]>,
        name: String,
        uri: String,
    ) -> Result<()> {
        let config = &mut ctx.accounts.launchpad_config;

        // 1. Boundary & Invariant Checks
        require!(config.is_active, ChimpError::LaunchpadInactive);
        require!(config.current_supply < config.max_supply, ChimpError::MaxSupplyReached);
        require!(name.len() <= 32, ChimpError::InvalidStringLength);
        require!(uri.len() <= 200, ChimpError::InvalidStringLength);

        // 2. Cryptographic Merkle Verification (if merkle_root != [0; 32])
        if config.merkle_root != [0u8; 32] {
            let user_pubkey = ctx.accounts.payer.key();
            let leaf = keccak::hashv(&[user_pubkey.as_ref()]).to_bytes();
            let is_valid = verify_merkle_proof(&proof, config.merkle_root, leaf);
            require!(is_valid, ChimpError::InvalidMerkleProof);
        }

        // 3. Process Payment to Treasury
        if config.mint_price_lamports > 0 {
            invoke_signed(
                &system_instruction::transfer(
                    &ctx.accounts.payer.key(),
                    &ctx.accounts.treasury.key(),
                    config.mint_price_lamports,
                ),
                &[
                    ctx.accounts.payer.to_account_info(),
                    ctx.accounts.treasury.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                &[],
            )?;
        }

        // 4. CPI to Metaplex Core Program: CreateV1
        let config_bump = config.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, &[config_bump]]];

        let mut plugins = Vec::new();
        if config.seller_fee_basis_points > 0 {
            plugins.push(PluginAuthorityPair {
                plugin: Plugin::Royalties(Royalties {
                    basis_points: config.seller_fee_basis_points,
                    creators: vec![mpl_core::types::Creator {
                        address: config.treasury,
                        percentage: 100,
                    }],
                    rule_set: RuleSet::None,
                }),
                authority: PluginAuthority::None,
            });
        }

        let create_ix = CreateV1Builder::new()
            .asset(ctx.accounts.asset.key())
            .collection(Some(ctx.accounts.collection.key()))
            .authority(ctx.accounts.launchpad_config.key())
            .payer(ctx.accounts.payer.key())
            .owner(Some(ctx.accounts.payer.key()))
            .system_program(ctx.accounts.system_program.key())
            .name(name.clone())
            .uri(uri.clone())
            .plugins(plugins)
            .instruction();

        let account_infos = vec![
            ctx.accounts.asset.to_account_info(),
            ctx.accounts.collection.to_account_info(),
            ctx.accounts.launchpad_config.to_account_info(),
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.mpl_core_program.to_account_info(),
        ];

        invoke_signed(&create_ix, &account_infos, signer_seeds)?;

        // 5. Update State
        config.current_supply = config
            .current_supply
            .checked_add(1)
            .ok_or(ChimpError::ArithmeticOverflow)?;

        emit!(ChimpMintEvent {
            asset: ctx.accounts.asset.key(),
            recipient: ctx.accounts.payer.key(),
            supply_index: config.current_supply,
            name,
            uri,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

// ---------------- Helper Functions ---------------- //

fn verify_merkle_proof(proof: &[[u8; 32]], root: [u8; 32], leaf: [u8; 32]) -> bool {
    let mut computed_hash = leaf;
    for proof_element in proof.iter() {
        if computed_hash <= *proof_element {
            computed_hash = keccak::hashv(&[&computed_hash, proof_element]).to_bytes();
        } else {
            computed_hash = keccak::hashv(&[proof_element, &computed_hash]).to_bytes();
        }
    }
    computed_hash == root
}

// ---------------- Context Structs ---------------- //

#[derive(Accounts)]
pub struct InitializeLaunchpad<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + LaunchpadConfig::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub launchpad_config: Account<'info, LaunchpadConfig>,

    /// CHECK: Metaplex Core Collection account, initialized beforehand or via admin
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Treasury account receiving mint proceeds
    pub treasury: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = launchpad_config.bump,
        has_one = authority @ ChimpError::Unauthorized
    )]
    pub launchpad_config: Account<'info, LaunchpadConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct MintChimpCore<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = launchpad_config.bump
    )]
    pub launchpad_config: Account<'info, LaunchpadConfig>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub asset: Signer<'info>,

    /// CHECK: Validated in CPI against Metaplex Core program
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Validated against launchpad_config.treasury
    #[account(
        mut,
        address = launchpad_config.treasury @ ChimpError::InvalidTreasuryAccount
    )]
    pub treasury: UncheckedAccount<'info>,

    #[account(address = MPL_CORE_ID)]
    /// CHECK: Metaplex Core native program
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

// ---------------- State & Events ---------------- //

#[account]
#[derive(InitSpace)]
pub struct LaunchpadConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub merkle_root: [u8; 32],
    pub mint_price_lamports: u64,
    pub max_supply: u32,
    pub current_supply: u32,
    pub seller_fee_basis_points: u16,
    pub is_active: bool,
    pub bump: u8,
}

#[event]
pub struct ChimpMintEvent {
    pub asset: Pubkey,
    pub recipient: Pubkey,
    pub supply_index: u32,
    pub name: String,
    pub uri: String,
    pub timestamp: i64,
}

#[error_code]
pub enum ChimpError {
    #[msg("Launchpad is currently paused or inactive")]
    LaunchpadInactive,
    #[msg("Maximum token supply has already been reached")]
    MaxSupplyReached,
    #[msg("Merkle verification failed: Wallet is not whitelisted")]
    InvalidMerkleProof,
    #[msg("Provided treasury does not match launchpad configuration")]
    InvalidTreasuryAccount,
    #[msg("String exceeds maximum allowable buffer length")]
    InvalidStringLength,
    #[msg("Numerical overflow during arithmetic operation")]
    ArithmeticOverflow,
    #[msg("Signer does not possess required administrative permissions")]
    Unauthorized,
}