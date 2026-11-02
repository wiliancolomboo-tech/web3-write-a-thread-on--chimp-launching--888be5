use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    program::invoke_signed,
    system_instruction,
};

declare_id!("Ch1mpCoreLaunchpad11111111111111111111111111");

pub const MPL_CORE_PROGRAM_ID: Pubkey = pubkey!("CoRe1xTViWsNxz93u1xR3d13aY2nWBvWdBMecAijWf9");

#[program]
pub mod chimp_launchpad {
    use super::*;

    /// Initialize the global $CHIMP Launchpad Config and Collection Record
    pub fn initialize_collection(
        ctx: Context<InitializeCollection>,
        name: String,
        uri: String,
    ) -> Result<()> {
        require!(name.len() <= 32, ChimpError::NameTooLong);
        require!(uri.len() <= 200, ChimpError::UriTooLong);

        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.treasury = ctx.accounts.treasury.key();
        config.collection = ctx.accounts.collection.key();
        config.mint_price_lamports = 100_000_000; // 0.1 SOL
        config.total_minted = 0;
        config.max_supply = 10_000;
        config.is_paused = false;
        config.bump = ctx.bumps.config;

        msg!("$CHIMP Core Collection initialized: {}", ctx.accounts.collection.key());
        Ok(())
    }

    /// Mint a $CHIMP Core Asset directly into Metaplex Core single-account storage
    pub fn mint_chimp(
        ctx: Context<MintChimp>,
        asset_name: String,
        asset_uri: String,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(!config.is_paused, ChimpError::MintPaused);
        require!(config.total_minted < config.max_supply, ChimpError::SoldOut);
        require!(asset_name.len() <= 32, ChimpError::NameTooLong);
        require!(asset_uri.len() <= 200, ChimpError::UriTooLong);

        // 1. Collect mint fee and transfer to treasury
        let fee = config.mint_price_lamports;
        let transfer_ix = system_instruction::transfer(
            &ctx.accounts.payer.key(),
            &ctx.accounts.treasury.key(),
            fee,
        );
        invoke_signed(
            &transfer_ix,
            &[
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.treasury.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[],
        )?;

        // 2. Derive signer seeds for Collection PDA authority
        let admin_key = config.admin;
        let seeds = &[
            b"chimp_config".as_ref(),
            admin_key.as_ref(),
            &[config.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        // 3. Assemble MPL Core `CreateV2` Instruction
        // Account indices for Metaplex Core CreateV2:
        // 0. Asset (signer/writable)
        // 1. Collection (optional writable)
        // 2. Authority (signer)
        // 3. Payer (signer/writable)
        // 4. Owner (optional, defaults to payer)
        // 5. System Program
        // 6. Log Wrapper (optional)
        let mut create_data = Vec::with_capacity(256);
        // Instruction discriminator for CreateV2 in mpl-core is index 1
        create_data.push(1u8); 
        
        // Serialize asset name (Borsh-compatible String)
        let name_bytes = asset_name.as_bytes();
        create_data.extend_from_slice(&(name_bytes.len() as u32).to_le_bytes());
        create_data.extend_from_slice(name_bytes);

        // Serialize URI (Borsh-compatible String)
        let uri_bytes = asset_uri.as_bytes();
        create_data.extend_from_slice(&(uri_bytes.len() as u32).to_le_bytes());
        create_data.extend_from_slice(uri_bytes);

        let core_accounts = vec![
            AccountMeta::new(ctx.accounts.asset.key(), true),
            AccountMeta::new(ctx.accounts.collection.key(), false),
            AccountMeta::new_readonly(ctx.accounts.config.key(), true),
            AccountMeta::new(ctx.accounts.payer.key(), true),
            AccountMeta::new_readonly(ctx.accounts.recipient.key(), false),
            AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
        ];

        let core_instruction = anchor_lang::solana_program::instruction::Instruction {
            program_id: ctx.accounts.mpl_core_program.key(),
            accounts: core_accounts,
            data: create_data,
        };

        invoke_signed(
            &core_instruction,
            &[
                ctx.accounts.asset.to_account_info(),
                ctx.accounts.collection.to_account_info(),
                ctx.accounts.config.to_account_info(),
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.recipient.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.mpl_core_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        // 4. Increment state counter
        config.total_minted = config.total_minted.checked_add(1).ok_or(ChimpError::Overflow)?;

        emit!(ChimpMintEvent {
            asset: ctx.accounts.asset.key(),
            recipient: ctx.accounts.recipient.key(),
            edition: config.total_minted,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Admin Emergency Pause
    pub fn set_pause(ctx: Context<UpdateConfig>, paused: bool) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.is_paused = paused;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeCollection<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + LaunchpadConfig::LEN,
        seeds = [b"chimp_config", admin.key().as_ref()],
        bump
    )]
    pub config: Account<'info, LaunchpadConfig>,

    /// CHECK: Metaplex Core Collection account initialized via CLI / Core program
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Treasury receiving mint proceeds
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintChimp<'info> {
    #[account(
        mut,
        seeds = [b"chimp_config", config.admin.as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, LaunchpadConfig>,

    /// CHECK: Collection account that the $CHIMP asset will belong to
    #[account(mut, address = config.collection)]
    pub collection: UncheckedAccount<'info>,

    /// Signer keypair generated client-side for the new $CHIMP Core asset
    #[account(mut)]
    pub asset: Signer<'info>,

    /// CHECK: Recipient of the newly minted $CHIMP asset
    pub recipient: UncheckedAccount<'info>,

    /// Transaction fee and mint payer
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Treasury receiving the payment
    #[account(mut, address = config.treasury)]
    pub treasury: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core canonical program
    #[account(address = MPL_CORE_PROGRAM_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [b"chimp_config", admin.key().as_ref()],
        bump = config.bump,
        has_one = admin
    )]
    pub config: Account<'info, LaunchpadConfig>,
    pub admin: Signer<'info>,
}

#[account]
pub struct LaunchpadConfig {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub collection: Pubkey,
    pub mint_price_lamports: u64,
    pub total_minted: u64,
    pub max_supply: u64,
    pub is_paused: bool,
    pub bump: u8,
}

impl LaunchpadConfig {
    pub const LEN: usize = 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1;
}

#[event]
pub struct ChimpMintEvent {
    pub asset: Pubkey,
    pub recipient: Pubkey,
    pub edition: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum ChimpError {
    #[msg("Asset name exceeds 32 byte maximum.")]
    NameTooLong,
    #[msg("Asset URI exceeds 200 byte maximum.")]
    UriTooLong,
    #[msg("Minting is currently paused by admin.")]
    MintPaused,
    #[msg("$CHIMP collection max supply reached.")]
    SoldOut,
    #[msg("Numerical arithmetic overflow.")]
    Overflow,
}