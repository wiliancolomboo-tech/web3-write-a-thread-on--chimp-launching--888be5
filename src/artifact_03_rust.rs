use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    keccak,
    program::invoke_signed,
};

declare_id!("Ch1mpLaunchpad111111111111111111111111111111");

pub const CONFIG_SEED: &[u8] = b"chimp_config";
pub const VAULT_SEED: &[u8] = b"chimp_vault";

#[program]
pub mod chimp_launchpad {
    use super::*;

    pub fn initialize_launch(
        ctx: Context<InitializeLaunch>,
        merkle_root: [u8; 32],
        price_lamports: u64,
        max_supply: u32,
        start_time: i64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.treasury = ctx.accounts.treasury.key();
        config.merkle_root = merkle_root;
        config.price_lamports = price_lamports;
        config.max_supply = max_supply;
        config.minted_count = 0;
        config.start_time = start_time;
        config.is_paused = false;
        config.bump = ctx.bumps.config;
        config.vault_bump = ctx.bumps.vault;

        emit!(LaunchInitializedEvent {
            admin: config.admin,
            price_lamports,
            max_supply,
            start_time,
        });

        Ok(())
    }

    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.is_paused = paused;
        emit!(LaunchPauseToggledEvent { is_paused: paused });
        Ok(())
    }

    pub fn update_merkle_root(ctx: Context<AdminOnly>, new_root: [u8; 32]) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.merkle_root = new_root;
        emit!(MerkleRootUpdatedEvent { new_root });
        Ok(())
    }

    pub fn mint_chimp<'info>(
        ctx: Context<'_, '_, '_, 'info, MintChimp<'info>>,
        proof: Vec<[u8; 32]>,
        allocated_max: u64,
        tier: u8,
        asset_name: String,
        asset_uri: String,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let config = &mut ctx.accounts.config;

        // 1. Guard Checks
        require!(!config.is_paused, LaunchpadError::LaunchPaused);
        require!(clock.unix_timestamp >= config.start_time, LaunchpadError::LaunchNotActive);
        require!(config.minted_count < config.max_supply, LaunchpadError::SoldOut);
        require!(asset_name.len() <= 32, LaunchpadError::NameTooLong);
        require!(asset_uri.len() <= 200, LaunchpadError::UriTooLong);

        // 2. Merkle Whitelist Verification
        let leaf = keccak::hashv(&[
            ctx.accounts.payer.key().as_ref(),
            &allocated_max.to_le_bytes(),
            &[tier],
        ]);

        require!(
            verify_merkle_proof(&proof, config.merkle_root, leaf.0),
            LaunchpadError::InvalidProof
        );

        // 3. User Mint Cap Checks via Receipt
        let receipt = &mut ctx.accounts.user_receipt;
        if receipt.mint_count == 0 {
            receipt.payer = ctx.accounts.payer.key();
            receipt.bump = ctx.bumps.user_receipt;
        }
        require!(
            (receipt.mint_count as u64) < allocated_max,
            LaunchpadError::AllocationExceeded
        );

        // 4. Financial Settlement: Transfer Payment to Vault
        let payment_amount = config.price_lamports;
        if payment_amount > 0 {
            let cpi_context = anchor_lang::system_program::Transfer {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            };
            anchor_lang::system_program::transfer(
                CpiContext::new(ctx.accounts.system_program.to_account_info(), cpi_context),
                payment_amount,
            )?;
        }

        // 5. Metaplex Core Asset Creation
        // Construct Metaplex Core `CreateV1` Instruction Instruction CPI
        // mpl-core instruction identifier for CreateV1: [0x00]
        // This invokes MPL Core Program with deterministic authority derivation
        let config_seeds: &[&[u8]] = &[
            CONFIG_SEED,
            &[config.bump],
        ];
        let signer_seeds = &[config_seeds];

        let mut data = Vec::with_capacity(1 + 4 + asset_name.len() + 4 + asset_uri.len());
        data.push(0); // CreateV1 opcode
        data.extend_from_slice(&(asset_name.len() as u32).to_le_bytes());
        data.extend_from_slice(asset_name.as_bytes());
        data.extend_from_slice(&(asset_uri.len() as u32).to_le_bytes());
        data.extend_from_slice(asset_uri.as_bytes());

        let instruction = anchor_lang::solana_program::instruction::Instruction {
            program_id: ctx.accounts.mpl_core_program.key(),
            accounts: vec![
                anchor_lang::solana_program::instruction::AccountMeta::new(ctx.accounts.asset.key(), true),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.config.key(), true),
                anchor_lang::solana_program::instruction::AccountMeta::new(ctx.accounts.payer.key(), true),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.payer.key(), false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
            ],
            data,
        };

        invoke_signed(
            &instruction,
            &[
                ctx.accounts.asset.to_account_info(),
                ctx.accounts.config.to_account_info(),
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.mpl_core_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        // 6. Update State Counters
        config.minted_count = config.minted_count.checked_add(1).ok_or(LaunchpadError::ArithmeticOverflow)?;
        receipt.mint_count = receipt.mint_count.checked_add(1).ok_or(LaunchpadError::ArithmeticOverflow)?;

        emit!(ChimpMintedEvent {
            recipient: ctx.accounts.payer.key(),
            asset: ctx.accounts.asset.key(),
            mint_index: config.minted_count,
            tier,
        });

        Ok(())
    }

    pub fn withdraw_funds(ctx: Context<WithdrawFunds>, amount: u64) -> Result<()> {
        let config = &ctx.accounts.config;
        let vault = &ctx.accounts.vault;
        
        let current_vault_balance = vault.lamports();
        let rent_exempt_minimum = Rent::get()?.minimum_balance(0);
        let available_to_withdraw = current_vault_balance.saturating_sub(rent_exempt_minimum);

        require!(amount <= available_to_withdraw, LaunchpadError::InsufficientWithdrawAmount);

        let vault_bump = config.vault_bump;
        let seeds: &[&[u8]] = &[VAULT_SEED, &[vault_bump]];
        let signer = &[seeds];

        **vault.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += amount;

        emit!(FundsWithdrawnEvent {
            treasury: ctx.accounts.treasury.key(),
            amount,
        });

        Ok(())
    }
}

// -----------------------------------------------------------------------------
// HELPER ROUTINES
// -----------------------------------------------------------------------------
pub fn verify_merkle_proof(proof: &[[u8; 32]], root: [u8; 32], leaf: [u8; 32]) -> bool {
    let mut computed_hash = leaf;
    for proof_element in proof.iter() {
        if computed_hash <= *proof_element {
            computed_hash = keccak::hashv(&[&computed_hash, proof_element]).0;
        } else {
            computed_hash = keccak::hashv(&[proof_element, &computed_hash]).0;
        }
    }
    computed_hash == root
}

// -----------------------------------------------------------------------------
// ACCOUNTS SCHEMA
// -----------------------------------------------------------------------------
#[derive(Accounts)]
pub struct InitializeLaunch<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + LaunchConfig::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, LaunchConfig>,

    /// CHECK: Native Vault PDA holding proceeds
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump
    )]
    pub vault: AccountInfo<'info>,

    /// CHECK: Validated in config init
    pub treasury: AccountInfo<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ LaunchpadError::UnauthorizedAdmin
    )]
    pub config: Account<'info, LaunchConfig>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct MintChimp<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, LaunchConfig>,

    /// CHECK: Checked by seeds constraint
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = config.vault_bump
    )]
    pub vault: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + UserReceipt::INIT_SPACE,
        seeds = [b"receipt", config.key().as_ref(), payer.key().as_ref()],
        bump
    )]
    pub user_receipt: Account<'info, UserReceipt>,

    #[account(mut)]
    pub asset: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: MPL Core Program ID: CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4P8TQ66
    pub mpl_core_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawFunds<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ LaunchpadError::UnauthorizedAdmin,
        has_one = treasury @ LaunchpadError::InvalidTreasuryAccount
    )]
    pub config: Account<'info, LaunchConfig>,

    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = config.vault_bump
    )]
    pub vault: AccountInfo<'info>,

    /// CHECK: Matches config.treasury
    #[account(mut)]
    pub treasury: AccountInfo<'info>,

    pub admin: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct LaunchConfig {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub merkle_root: [u8; 32],
    pub price_lamports: u64,
    pub max_supply: u32,
    pub minted_count: u32,
    pub start_time: i64,
    pub is_paused: bool,
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserReceipt {
    pub payer: Pubkey,
    pub mint_count: u32,
    pub bump: u8,
}

// -----------------------------------------------------------------------------
// EVENTS & ERRORS
// -----------------------------------------------------------------------------
#[event]
pub struct LaunchInitializedEvent {
    pub admin: Pubkey,
    pub price_lamports: u64,
    pub max_supply: u32,
    pub start_time: i64,
}

#[event]
pub struct LaunchPauseToggledEvent {
    pub is_paused: bool,
}

#[event]
pub struct MerkleRootUpdatedEvent {
    pub new_root: [u8; 32],
}

#[event]
pub struct ChimpMintedEvent {
    pub recipient: Pubkey,
    pub asset: Pubkey,
    pub mint_index: u32,
    pub tier: u8,
}

#[event]
pub struct FundsWithdrawnEvent {
    pub treasury: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum LaunchpadError {
    #[msg("Launchpad is currently paused.")]
    LaunchPaused,
    #[msg("Launch period is not yet active.")]
    LaunchNotActive,
    #[msg("Collection is completely sold out.")]
    SoldOut,
    #[msg("Signer is not the authorized launchpad administrator.")]
    UnauthorizedAdmin,
    #[msg("Invalid Merkle whitelist proof provided.")]
    InvalidProof,
    #[msg("Wallet has reached maximum mint allocation.")]
    AllocationExceeded,
    #[msg("Invalid treasury address specified for withdrawal.")]
    InvalidTreasuryAccount,
    #[msg("Insufficient balance available in vault.")]
    InsufficientWithdrawAmount,
    #[msg("Asset name exceeds 32 bytes.")]
    NameTooLong,
    #[msg("Asset URI exceeds 200 bytes.")]
    UriTooLong,
    #[msg("Numerical overflow encountered.")]
    ArithmeticOverflow,
}