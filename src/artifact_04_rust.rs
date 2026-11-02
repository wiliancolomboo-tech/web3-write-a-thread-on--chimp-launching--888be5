use anchor_lang::prelude::*;
use anchor_lang::system_program;
use mpl_core::{
    instructions::{CreateV1Cpi, CreateV1CpiAccounts, CreateV1InstructionArgs},
    types::{Attribute, Attributes, Plugin, PluginAuthority},
    ID as MPL_CORE_ID,
};

declare_id!("Ch1mpLaunch111111111111111111111111111111111");

#[program]
pub mod chimp_launch {
    use super::*;

    /// Initializes the $CHIMP Launchpad configuration.
    pub fn initialize_launch(
        ctx: Context<InitializeLaunch>,
        merkle_root: [u8; 32],
        mint_price_lamports: u64,
        max_supply: u32,
        start_timestamp: i64,
    ) -> Result<()> {
        let launch_config = &mut ctx.accounts.launch_config;
        launch_config.authority = ctx.accounts.authority.key();
        launch_config.treasury = ctx.accounts.treasury.key();
        launch_config.merkle_root = merkle_root;
        launch_config.mint_price_lamports = mint_price_lamports;
        launch_config.max_supply = max_supply;
        launch_config.current_supply = 0;
        launch_config.start_timestamp = start_timestamp;
        launch_config.bump = ctx.bumps.launch_config;

        emit!(LaunchInitializedEvent {
            authority: launch_config.authority,
            treasury: launch_config.treasury,
            merkle_root,
            mint_price_lamports,
            max_supply,
            start_timestamp,
        });

        Ok(())
    }

    /// Mints a new $CHIMP Core Asset into the buyer's wallet.
    pub fn mint_chimp(
        ctx: Context<MintChimp>,
        asset_name: String,
        asset_uri: String,
        merkle_proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        let launch_config = &mut ctx.accounts.launch_config;
        let clock = Clock::get()?;

        // 1. Validation Checks
        require!(
            clock.unix_timestamp >= launch_config.start_timestamp,
            ChimpError::LaunchNotActive
        );
        require!(
            launch_config.current_supply < launch_config.max_supply,
            ChimpError::MaxSupplyReached
        );

        // 2. Cryptographic Merkle Verification (if root is populated)
        if launch_config.merkle_root != [0u8; 32] {
            let leaf = anchor_lang::solana_program::keccak::hash(
                ctx.accounts.payer.key().as_ref()
            ).0;
            
            require!(
                verify_merkle_proof(&merkle_proof, launch_config.merkle_root, leaf),
                ChimpError::InvalidMerkleProof
            );
        }

        // 3. Process Escrow / SOL Payment
        if launch_config.mint_price_lamports > 0 {
            let cpi_context = CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            );
            system_program::transfer(cpi_context, launch_config.mint_price_lamports)?;
        }

        // 4. CPI to Metaplex Core to create the unified Asset
        let asset_id = ctx.accounts.asset.key();
        let collection_key = ctx.accounts.collection.as_ref().map(|c| c.key());

        let initial_attributes = vec![
            Attribute {
                key: "Generation".to_string(),
                value: "Genesis".to_string(),
            },
            Attribute {
                key: "Chimp Index".to_string(),
                value: (launch_config.current_supply + 1).to_string(),
            },
        ];

        let plugins = vec![Plugin::Attributes(Attributes {
            attribute_list: initial_attributes,
        })];

        let mut create_cpi = CreateV1Cpi::new(
            &ctx.accounts.mpl_core_program.to_account_info(),
            CreateV1CpiAccounts {
                asset: &ctx.accounts.asset.to_account_info(),
                collection: ctx.accounts.collection.as_ref().map(|c| c.to_account_info()).as_ref(),
                payer: &ctx.accounts.payer.to_account_info(),
                owner: Some(&ctx.accounts.recipient.to_account_info()),
                update_authority: Some(&ctx.accounts.authority.to_account_info()),
                system_program: &ctx.accounts.system_program.to_account_info(),
            },
            CreateV1InstructionArgs {
                data_state: mpl_core::types::DataState::AccountState,
                name: asset_name.clone(),
                uri: asset_uri.clone(),
                plugins: Some(plugins),
            },
        );

        create_cpi.invoke()?;

        // 5. Update State
        launch_config.current_supply = launch_config.current_supply.checked_add(1)
            .ok_or(ChimpError::NumericalOverflow)?;

        emit!(ChimpMintedEvent {
            asset: asset_id,
            recipient: ctx.accounts.recipient.key(),
            edition_index: launch_config.current_supply,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Admin can update the Merkle root for subsequent launch phases.
    pub fn update_merkle_root(
        ctx: Context<UpdateLaunchConfig>,
        new_merkle_root: [u8; 32],
    ) -> Result<()> {
        let launch_config = &mut ctx.accounts.launch_config;
        launch_config.merkle_root = new_merkle_root;
        Ok(())
    }
}

// -----------------------------------------------------------------------------
// Helper: Merkle Proof Verification Engine
// -----------------------------------------------------------------------------
pub fn verify_merkle_proof(proof: &[[u8; 32]], root: [u8; 32], leaf: [u8; 32]) -> bool {
    let mut computed_hash = leaf;

    for proof_element in proof.iter() {
        if computed_hash <= *proof_element {
            let mut combined = [0u8; 64];
            combined[0..32].copy_from_slice(&computed_hash);
            combined[32..64].copy_from_slice(proof_element);
            computed_hash = anchor_lang::solana_program::keccak::hash(&combined).0;
        } else {
            let mut combined = [0u8; 64];
            combined[0..32].copy_from_slice(proof_element);
            combined[32..64].copy_from_slice(&computed_hash);
            computed_hash = anchor_lang::solana_program::keccak::hash(&combined).0;
        }
    }

    computed_hash == root
}

// -----------------------------------------------------------------------------
// Account Contexts
// -----------------------------------------------------------------------------
#[derive(Accounts)]
pub struct InitializeLaunch<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + LaunchConfig::INIT_SPACE,
        seeds = [b"chimp_launch_config", authority.key().as_ref()],
        bump
    )]
    pub launch_config: Account<'info, LaunchConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Treasury account receiving mint proceeds
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintChimp<'info> {
    #[account(
        mut,
        seeds = [b"chimp_launch_config", launch_config.authority.as_ref()],
        bump = launch_config.bump
    )]
    pub launch_config: Account<'info, LaunchConfig>,

    /// CHECK: The authority who signed the launch configuration
    pub authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Recipient of the minted Metaplex Core asset
    pub recipient: UncheckedAccount<'info>,

    /// Keypair signer for the new Metaplex Core asset account
    #[account(mut)]
    pub asset: Signer<'info>,

    /// CHECK: Optional MPL-Core Collection
    #[account(mut)]
    pub collection: Option<UncheckedAccount<'info>>,

    /// CHECK: Treasury specified in the launch_config
    #[account(
        mut,
        address = launch_config.treasury @ ChimpError::InvalidTreasury
    )]
    pub treasury: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,

    /// CHECK: Metaplex Core Program address
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct UpdateLaunchConfig<'info> {
    #[account(
        mut,
        seeds = [b"chimp_launch_config", authority.key().as_ref()],
        bump = launch_config.bump,
        has_one = authority @ ChimpError::Unauthorized
    )]
    pub launch_config: Account<'info, LaunchConfig>,
    pub authority: Signer<'info>,
}

// -----------------------------------------------------------------------------
// State Definitions
// -----------------------------------------------------------------------------
#[account]
#[derive(InitSpace)]
pub struct LaunchConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub merkle_root: [u8; 32],
    pub mint_price_lamports: u64,
    pub max_supply: u32,
    pub current_supply: u32,
    pub start_timestamp: i64,
    pub bump: u8,
}

// -----------------------------------------------------------------------------
// Events
// -----------------------------------------------------------------------------
#[event]
pub struct LaunchInitializedEvent {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub merkle_root: [u8; 32],
    pub mint_price_lamports: u64,
    pub max_supply: u32,
    pub start_timestamp: i64,
}

#[event]
pub struct ChimpMintedEvent {
    pub asset: Pubkey,
    pub recipient: Pubkey,
    pub edition_index: u32,
    pub timestamp: i64,
}

// -----------------------------------------------------------------------------
// Error Codes
// -----------------------------------------------------------------------------
#[error_code]
pub enum ChimpError {
    #[msg("Launch is not active yet.")]
    LaunchNotActive,
    #[msg("Maximum asset supply reached.")]
    MaxSupplyReached,
    #[msg("Invalid Merkle proof for allowlist.")]
    InvalidMerkleProof,
    #[msg("Treasury destination mismatch.")]
    InvalidTreasury,
    #[msg("Unauthorized operation.")]
    Unauthorized,
    #[msg("Numerical overflow encountered.")]
    NumericalOverflow,
}