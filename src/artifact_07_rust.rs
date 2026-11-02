use anchor_lang::prelude::*;

#[error_code]
pub enum ChimpError {
    #[msg("Launch is currently paused.")]
    LaunchPaused,
    #[msg("Maximum supply for $CHIMP launch reached.")]
    SupplyCapExceeded,
    #[msg("Insufficient lamports provided for mint fee.")]
    InsufficientPayment,
    #[msg("Name string exceeds Metaplex Core limit (32 bytes).")]
    NameTooLong,
    #[msg("URI string exceeds maximum allowed length (200 bytes).")]
    UriTooLong,
    #[msg("Numerical overflow encountered.")]
    MathOverflow,
}