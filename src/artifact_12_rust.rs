TransferV1CpiBuilder::new(&ctx.accounts.mpl_core_program)
    .asset(&ctx.accounts.core_asset)
    .authority(&ctx.accounts.vault_authority)
    .new_owner(&ctx.accounts.user)
    .invoke_signed(signer_seeds)?;