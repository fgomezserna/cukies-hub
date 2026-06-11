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
pnpm --filter @cukies/contracts deploy:local
pnpm --filter @cukies/contracts deploy:testnet
pnpm --filter @cukies/contracts deploy:testnet:operational
pnpm --filter @cukies/contracts deploy:mainnet:operational
pnpm --filter @cukies/contracts handover:mainnet:safe
pnpm --filter @cukies/contracts preflight:presale -- --network bscTestnet
pnpm --filter @cukies/contracts export:abi
pnpm --filter @cukies/contracts freeze:manifest
```

## Required environment

Copy `packages/contracts/.env.example` and fill values in your shell or local env file. Do not commit private keys.

Required for deploy:

- `DEPLOYER_PRIVATE_KEY`
- `ASM_TOKEN_ADDRESS`
- `UKI_INITIAL_SUPPLY`
- `SALE_TREASURY_ADDRESS`
- `SALE_OWNER_ADDRESS` for BSC testnet/mainnet. Use the launch Safe multisig/admin owner.
- `SALE_START`, `SALE_END`, `VESTING_START`, `VESTING_DURATION`.
- `UKI_PER_ASM`, `MIN_ASM_PER_PURCHASE`, `TOTAL_UKI_FOR_SALE`.
- `BSCSCAN_API_KEY` for verification

Optional:

- `UKI_TOKEN_ADDRESS` to reuse an existing UKI token.
- `UKI_VESTING_VAULT_ADDRESS` to reuse an existing vault.
- `UKI_PRESALE_ADDRESS` for preflight checks against a deployed presale.
- `UKI_INITIAL_SUPPLY_RECEIVER` when deploying a new UKI token. For production, decide and set this explicitly before deploy; do not rely on deployer fallbacks.

For non-local deploys, use `deploy:testnet` or `deploy:mainnet`; both run `scripts/deploy-presale.production.cjs`. The local/dev script rejects non-local networks.


## Mainnet operational deploy flow before Safe handover

Use `deploy:mainnet:operational` for the planned mainnet launch flow where one deployment wallet temporarily owns/admins all contracts and the Safe handover happens in a second phase.

This dedicated script is mainnet-only and enforces:

- network `bsc` / chain id `56`,
- `ASM_TOKEN_ADDRESS=0x40af8fd127dcd302d7ffa6f37cf5a002e54ac68c`,
- `DEPLOYER_ADDRESS` matches `DEPLOYER_PRIVATE_KEY`,
- fresh deploy only; `UKI_TOKEN_ADDRESS`, `UKI_VESTING_VAULT_ADDRESS` and `UKI_PRESALE_ADDRESS` must be empty,
- `UKIToken.owner()`, `Presale.owner()` and `VestingVault.DEFAULT_ADMIN_ROLE` are the deployer wallet,
- `UKI_INITIAL_SUPPLY_RECEIVER` is explicit,
- if `UKI_INITIAL_SUPPLY_RECEIVER != DEPLOYER_ADDRESS`, `UKI_INITIAL_SUPPLY_RECEIVER_PRIVATE_KEY` is required so the script can fund the vault,
- sale start is fixed to `1781535600` (`2026-06-15 17:00 Europe/Madrid`, `15:00 UTC`),
- `VestingVault.unallocatedWithdrawalUnlockTime = SALE_END`,
- `TOTAL_UKI_FOR_SALE` is transferred to the vault,
- `PRESALE_VESTING_ROLE` is granted to the presale contract,
- `Presale.saleEnabled` is set to `true`, so the sale opens automatically when `block.timestamp >= saleStart`.

Required mainnet env for the operational deploy:

```bash
DEPLOYER_PRIVATE_KEY=...
DEPLOYER_ADDRESS=0x...
ASM_TOKEN_ADDRESS=0x40af8fd127dcd302d7ffa6f37cf5a002e54ac68c
SALE_TREASURY_ADDRESS=0x...
UKI_INITIAL_SUPPLY_RECEIVER=0x...
# Required only if receiver is not the deployer.
UKI_INITIAL_SUPPLY_RECEIVER_PRIVATE_KEY=...
UKI_INITIAL_SUPPLY=1000000000000000000000000000
SALE_START=1781535600
SALE_END=...
VESTING_START=...
VESTING_DURATION=23328000
UKI_PER_ASM=100000000000000000000
MIN_ASM_PER_PURCHASE=5000000000000000000
TOTAL_UKI_FOR_SALE=250000000000000000000000000
```

Run:

```bash
pnpm --filter @cukies/contracts deploy:mainnet:operational
```

## Mainnet Safe handover phase

After the operational deploy and before relying on public funds, run `handover:mainnet:safe` to move configuration, ownership and remaining tokens to the final wallets/Safes.

The handover script requires the deployer to still be the current `UKIToken`/`Presale` owner and `VestingVault.DEFAULT_ADMIN_ROLE` holder. It performs, in order:

1. set final ASM treasury if needed,
2. set sale window/price/minimum/cap/sale enabled state if needed,
3. set presale vesting config if needed and still unfrozen,
4. verify immutable `unallocatedWithdrawalUnlockTime == SALE_END`,
5. ensure `PRESALE_VESTING_ROLE` belongs to `Presale`,
6. clean/grant `ALLOCATION_MANAGER_ROLE` according to `ALLOCATION_MANAGER_ADDRESS`,
7. transfer remaining UKI from `UKI_REMAINDER_SOURCE_ADDRESS` to `UKI_REMAINDER_RECEIVER_ADDRESS`,
8. transfer `UKIToken` ownership to `SAFE_OWNER_ADDRESS`,
9. transfer `Presale` ownership to `SAFE_OWNER_ADDRESS`,
10. grant `VestingVault.DEFAULT_ADMIN_ROLE` to `SAFE_OWNER_ADDRESS`,
11. revoke `VestingVault.DEFAULT_ADMIN_ROLE` from the deployer,
12. verify final exact role holder sets.

Required env for handover:

```bash
DEPLOYER_PRIVATE_KEY=...
DEPLOYER_ADDRESS=0x...
SAFE_OWNER_ADDRESS=0x...
FINAL_ASM_TREASURY_ADDRESS=0x...
UKI_REMAINDER_RECEIVER_ADDRESS=0x...
# Defaults to DEPLOYER_ADDRESS when omitted.
UKI_REMAINDER_SOURCE_ADDRESS=0x...
# Required only if remainder source is not deployer.
UKI_REMAINDER_SOURCE_PRIVATE_KEY=...
UKI_TOKEN_ADDRESS=0x...
UKI_VESTING_VAULT_ADDRESS=0x...
UKI_PRESALE_ADDRESS=0x...
SALE_START=1781535600
SALE_END=...
VESTING_START=...
VESTING_DURATION=23328000
UKI_PER_ASM=100000000000000000000
MIN_ASM_PER_PURCHASE=5000000000000000000
TOTAL_UKI_FOR_SALE=250000000000000000000000000
SALE_ENABLED_AFTER_HANDOVER=true
# Optional. Omit to leave allocation role empty.
ALLOCATION_MANAGER_ADDRESS=0x...
```

Run:

```bash
pnpm --filter @cukies/contracts handover:mainnet:safe
```

Then run final preflight with `SALE_OWNER_ADDRESS=SAFE_OWNER_ADDRESS` and `DEPLOYER_ADDRESS` still set so deployer cleanup is verified.

## Deployer vs Safe

Use two different concepts:

- **Deployer wallet**: temporary EOA used only to broadcast deployment transactions and pay gas.
- **Launch Safe**: multisig that owns and administers the deployed contracts.

For the standard Safe-first flow, create the Safe before deploying contracts and set `SALE_OWNER_ADDRESS` to the Safe address before running the deploy script. For the dedicated `deploy:mainnet:operational` flow, `DEPLOYER_ADDRESS` is intentionally the temporary owner/admin and `handover:mainnet:safe` must run before treating the launch as final. The deployer may deploy contracts, but should not remain the final owner/admin for mainnet.

Preferred constructor ownership:

| Contract | Constructor/admin value | Required value for launch |
| --- | --- | --- |
| `UKIToken` | `initialOwner` | Launch Safe |
| `VestingVault` | `admin` | Launch Safe |
| `Presale` | `owner` | Launch Safe |

If a contract is ever deployed with the deployer as owner/admin by mistake, do not fund, open or announce the sale. Transfer ownership/admin to the Safe first, then rerun preflight and record the corrective transaction.

## Environment separation

Do not reuse addresses across environments:

| Environment | Network | Chain id | ASM token |
| --- | --- | --- | --- |
| Dev | Hardhat/local | `31337` | `MockERC20` deployed by tests or local simulations. |
| Test | BSC testnet | `97` | `0xf93dd40Bf8bD8dDf7C785AA87dc13C3c3FeB6c8C` (`tASM`) |
| Prod | BSC mainnet | `56` | `0x40af8fd127dcd302d7ffa6f37cf5a002e54ac68c` (`CONCILIUM`) |

The deploy script validates `ASM_TOKEN_ADDRESS` against the approved address for BSC testnet and BSC mainnet. Hardhat/local deployments are exempt so dev simulations can use local mocks.

## Deployment order

1. Create and test the launch Safe on the target network.
2. Set `SALE_OWNER_ADDRESS` to the launch Safe address.
3. Deploy or attach `UKIToken`.
4. Deploy or attach `VestingVault`; constructor `unallocatedWithdrawalUnlockTime` must be `SALE_END`, so unallocated withdrawals remain blocked while purchases can still happen.
5. Deploy `Presale`.
6. Confirm `UKIToken.owner()`, `Presale.owner()` and `VestingVault.DEFAULT_ADMIN_ROLE` point to the launch Safe.
7. Fund `VestingVault` with the UKI amount reserved for sale. If the sale cap is the full ecosystem-pool cap, this is `250,000,000 UKI`. The vault will reject `withdrawUnallocated()` until after `SALE_END`.
8. Grant `PRESALE_VESTING_ROLE` on `VestingVault` to `Presale` through the Safe/admin owner.
9. Grant `ALLOCATION_MANAGER_ROLE` only to the approved Safe/operator used for team, advisors and ecosystem schedules.
10. Create team/advisors/ecosystem schedules with `createVestingWithCliff`, then revoke temporary allocation operators.
11. Review sale parameters and call `setSaleEnabled(true)` before public launch.
12. Keep sale parameters mutable through the Launch Safe while operational risk is active; `ukiPerAsm` updates only affect later purchases.
13. At TGE, update `VestingVault.presaleVestingStart` if needed and call `freezePresaleVestingConfig()` before claims.
14. Run `preflight:presale` against the target network; it must verify `VestingVault.unallocatedWithdrawalUnlockTime() == SALE_END`.
15. Verify contracts on BscScan.
16. Export ABIs and set dapp env addresses.

## Role model

`VestingVault` separates buyer vesting from internal allocation vesting:

| Role | Holder in production | Purpose |
| --- | --- | --- |
| `DEFAULT_ADMIN_ROLE` | Launch Safe multisig/admin owner | Grant/revoke roles and withdraw unallocated UKI when safe. |
| `PRESALE_VESTING_ROLE` | `Presale` contract only | Create buyer schedules with `PRESALE_SCHEDULE_ID`. |
| `ALLOCATION_MANAGER_ROLE` | Safe multisig or temporary allocation operator | Create named schedules such as `TEAM`, `ADVISORS` and `ECOSYSTEM`. |

## Internal pool vesting matrix

Use this matrix before creating any `ALLOCATION_MANAGER_ROLE` schedule. The source of truth is `docs/uki-current-operating-rules.md`.

| Pool | Amount | Schedule id suggestion | Timing |
| --- | ---: | --- | --- |
| Presale buyers | Up to `250,000,000 UKI` | `PRESALE` | Global vault config: `presaleVestingStart = TGE`, `presaleVestingDuration = 9 months`; freeze before claims. |
| Ecosystem 40-day unlock | `30,000,000 UKI` | `ECOSYSTEM_40D` | Cliff `TGE + 40 days`, no linear vesting. Use `duration = 0` to unlock 100% at the cliff. |
| Ecosystem remainder | TBD after sale | `ECOSYSTEM_REMAINDER` | 9 months cliff + 12 months linear vesting. |
| Team | `120,000,000 UKI` total | `TEAM_*` | 9 months cliff + 24 months linear vesting. |
| Concilium/Ascensum incentives | Variable | `CONCILIUM_INCENTIVES` | Same as team: 9 months cliff + 24 months linear vesting. |
| Rewards program | `450,000,000 UKI` | TBD | Documented as 6-year distribution, but final cliff/start/duration model is not yet specified. Do not create a single vault schedule until product approves the exact rewards distribution model. |
| Liquidity | `180,000,000 UKI` | Not a vesting schedule | Pancake liquidity plus LP lock/burn evidence for at least 9 months. |

## Preflight

After deploy, funding and role grants, run preflight with the expected operational state:

```bash
UKI_PRESALE_ADDRESS=0x... \
UKI_VESTING_VAULT_ADDRESS=0x... \
UKI_TOKEN_ADDRESS=0x... \
ASM_TOKEN_ADDRESS=0x... \
SALE_OWNER_ADDRESS=0x... \
SALE_TREASURY_ADDRESS=0x... \
SALE_START=... \
SALE_END=... \
VESTING_START=... \
VESTING_DURATION=... \
UKI_PER_ASM=... \
MIN_ASM_PER_PURCHASE=... \
TOTAL_UKI_FOR_SALE=... \
SALE_ENABLED=false \
VESTING_CONFIG_FROZEN=false \
DEPLOYER_ADDRESS=0x... \
pnpm --filter @cukies/contracts preflight:presale -- --network bscTestnet
```

The preflight fails unless:

- `Presale.owner()` matches `SALE_OWNER_ADDRESS`,
- `VestingVault` admin is the same approved owner,
- `UKIToken.owner()` is the same approved owner,
- treasury matches `SALE_TREASURY_ADDRESS`,
- ASM token, UKI token and vault token linkage match env values,
- sale window, vault presale vesting config, current price, minimum purchase and sale cap match env values,
- `Presale` and `UKIToken` are not paused,
- `Presale` points to the expected vault,
- `Presale` has `PRESALE_VESTING_ROLE` and is the only holder of that role,
- deployer has no owner/admin/manager powers when `DEPLOYER_ADDRESS` is provided,
- `DEFAULT_ADMIN_ROLE`, `PRESALE_VESTING_ROLE` and `ALLOCATION_MANAGER_ROLE` holder sets exactly match the approved matrix,
- vault unallocated UKI covers `totalUkiForSale`,
- `VestingVault.unallocatedWithdrawalUnlockTime()` equals `SALE_END`,
- `vestingStart >= saleEnd`,
- `saleEnabled()` matches `SALE_ENABLED` when that env var is provided.

There is no approved maximum per purchase or per wallet in the current sale contract. The on-chain minimum is `5 ASM`. The on-chain maximum is only the global UKI sale cap, currently `250,000,000 UKI` from the ecosystem pool.

Sale parameters are intentionally editable by the Launch Safe during the sale: `treasury`, `saleStart`, `saleEnd`, `minAsmPerPurchase`, `totalUkiForSale` and `ukiPerAsm`. For safety, `totalUkiForSale` cannot be set below `totalUkiSold`.

`VESTING_CONFIG_FROZEN=false` is expected before TGE if the final liquidity/TGE timestamp is still unknown. Before buyer claims are enabled, run preflight again with `VESTING_CONFIG_FROZEN=true`.

For presale buyer schedules, the authoritative TGE/vesting start is `VestingVault.presaleVestingStart()`, not the historical `VestingCreated` event value. Indexers and the dapp must read the vault global config, because the Safe can update it before `freezePresaleVestingConfig()`.

Before mainnet, complete `packages/contracts/docs/SECURITY.md`.
Role ownership and emergency procedures are documented in `packages/contracts/docs/MULTISIG_RUNBOOK.md`.
The final freeze checklist lives in `packages/contracts/docs/FREEZE_CHECKLIST.md`.

## Dapp env

```bash
NEXT_PUBLIC_UKI_CHAIN_ID=97
NEXT_PUBLIC_ASM_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_UKI_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_UKI_VESTING_VAULT_ADDRESS=0x...
NEXT_PUBLIC_UKI_PRESALE_ADDRESS=0x...
NEXT_PUBLIC_BSCSCAN_BASE_URL=https://testnet.bscscan.com
```
