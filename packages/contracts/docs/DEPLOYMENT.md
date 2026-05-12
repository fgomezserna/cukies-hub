# UKI sale contracts deployment

## Stack

- Hardhat
- OpenZeppelin Contracts
- BNB Smart Chain testnet/mainnet

## Commands

```bash
pnpm --filter @cukies/contracts compile
pnpm --filter @cukies/contracts test
pnpm --filter @cukies/contracts coverage
pnpm --filter @cukies/contracts simulate:deploy
pnpm --filter @cukies/contracts deploy:testnet
pnpm --filter @cukies/contracts export:abi
```

## Required environment

Copy `packages/contracts/.env.example` and fill values in your shell or local env file. Do not commit private keys.

Required for deploy:

- `DEPLOYER_PRIVATE_KEY`
- `ASM_TOKEN_ADDRESS`
- `SALE_TREASURY_ADDRESS`
- `BSCSCAN_API_KEY` for verification

Optional:

- `UKI_TOKEN_ADDRESS` to reuse an existing UKI token.
- `UKI_VESTING_VAULT_ADDRESS` to reuse an existing vault.
- `SALE_OWNER_ADDRESS` to set a multisig/admin owner.
- `SALE_START`, `SALE_END`, `VESTING_START`, `VESTING_DURATION`.

## Deployment order

1. Deploy or attach `UKIToken`.
2. Deploy or attach `VestingVault`.
3. Deploy `Presale`.
4. Fund `VestingVault` with the UKI amount reserved for sale.
5. Grant `VESTING_MANAGER_ROLE` on `VestingVault` to `Presale`.
6. Create team/advisors/ecosystem schedules with `createVestingWithCliff`.
7. Verify contracts on BscScan.
8. Export ABIs and set dapp env addresses.

Before mainnet, complete `packages/contracts/docs/SECURITY.md`.

## Dapp env

```bash
NEXT_PUBLIC_UKI_CHAIN_ID=97
NEXT_PUBLIC_ASM_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_UKI_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_UKI_VESTING_VAULT_ADDRESS=0x...
NEXT_PUBLIC_UKI_PRESALE_ADDRESS=0x...
NEXT_PUBLIC_BSCSCAN_BASE_URL=https://testnet.bscscan.com
```
