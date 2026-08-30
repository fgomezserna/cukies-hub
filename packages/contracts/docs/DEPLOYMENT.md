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
pnpm --filter @cukies/contracts deploy:testnet:nft-source
pnpm --filter @cukies/contracts rehearse:testnet:liquidity-locker
pnpm --filter @cukies/contracts complete:testnet:liquidity-locker
pnpm --filter @cukies/contracts preflight:mainnet:uki-launch
pnpm --filter @cukies/contracts deploy:mainnet:staking
pnpm --filter @cukies/contracts deploy:mainnet:liquidity-locker
pnpm --filter @cukies/contracts prepare:mainnet:liquidity-safe-batch
pnpm --filter @cukies/contracts verify:mainnet:uki-launch
pnpm --filter @cukies/contracts derive:mainnet:competition-draw-seed
pnpm --filter @cukies/contracts deploy:mainnet:operational
pnpm --filter @cukies/contracts handover:mainnet:safe
pnpm --filter @cukies/contracts preflight:presale --network bscTestnet
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
- `ETHERSCAN_API_KEY` for Etherscan API V2 verification. `BSCSCAN_API_KEY` remains a temporary fallback for existing local operator envs.

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
- `ASM_TOKEN_ADDRESS=0x707F0f4a39a4a26239F7D00463B15AB5656861f9`,
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
ASM_TOKEN_ADDRESS=0x707F0f4a39a4a26239F7D00463B15AB5656861f9
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
| Prod | BSC mainnet | `56` | `0x707F0f4a39a4a26239F7D00463B15AB5656861f9` (`Ascensum token`, `ASM`) |

The deploy script validates `ASM_TOKEN_ADDRESS` against the approved address for BSC testnet and BSC mainnet. Hardhat/local deployments are exempt so dev simulations can use local mocks.

## BSC Testnet NFT source for Cukie Master

`deploy:testnet:nft-source` is a separate, testnet-only harness. It deploys:

- `StagingCukiesNft`, an intentionally minimal ownership/event source with immutable mint metadata;
- `StagingCukiesMarketplaceSource`, matching the historical marketplace events without custody or value movement;
- `StagingCukiesBridgeSource`, matching the historical bridge events without bridging or custody.

The script rejects every network except `bscTestnet` / chain `97`, requires the configured private key to resolve to `DEPLOYER_ADDRESS`, and additionally requires:

```bash
STAGING_NFT_DEPLOYMENT_CONFIRM=BSC_TESTNET_97_ONLY
```

It mints six original-generation fixtures to the testnet deployer, one for each stable rarity value `1..6`. Their expected Cukie Master points are `1, 2, 4, 7, 10, 15` (39 total), which must produce the route maximum of five slots. The output includes only public evidence: contract addresses, deployment receipts/blocks, runtime bytecode hashes and fixture mint transactions. Never reuse these contracts or fixtures in mainnet/production.

## BSC Testnet Pancake V2 liquidity-lock rehearsal

Before changing any public Stage link, run the read-only liquidity verifier. It refuses every
network except BSC Testnet 97, pins the PancakeSwap V2 router/factory and verifies the deployed
tASM/UKI pair, its reserves and the routes currently accepted by the router. It does not need a
private key and never broadcasts:

```bash
pnpm --filter @cukies/contracts verify:testnet:pancake-liquidity
```

The verified Stage pair is `0x8fa397B4E1DED911161f13C128DF369cE9a95B3A`. The verifier emits
the exact Stage URL for the direct ASM to UKI route. BNB remains disabled while neither
WBNB/ASM nor WBNB/UKI has liquidity. USDT remains unconfigured until an explicitly approved
Testnet token address is supplied as `PANCAKE_TESTNET_USDT_ADDRESS` and the verifier proves a
working route. Never infer a Testnet USDT address from an unofficial list.

The UKI logo used by Stage is the repository asset
`dapp/public/brand/official/uki-token-cukies-world-coin.png`. PancakeSwap does not provide a
repository-side metadata switch for this Testnet token: its current default and extended lists
contain no chain-97 entries. Its published process points token icons to Trust Wallet assets and
discourages unsolicited additions to the Pancake default/extended lists. Treat that as a separate
external production-token process; do not submit a mainnet asset or third-party PR from this
Testnet verification task.

`LiquidityLocker` holds one V2 LP ERC-20 until an immutable UTC timestamp. Its beneficiary cannot be changed or renounced after deployment. Anyone may execute the matured release, but the LP tokens always go to that fixed beneficiary.

The rehearsal is chain-97-only and creates the initial tASM/tUKI PancakeSwap V2 pair with `0.1 tASM + 60 tUKI`, preserving the target ratio `1 ASM = 600 UKI`. It transfers every LP token minted to a short-lived test locker, proves that early release reverts and prints the public receipt/code-hash evidence needed for the completion step.

```bash
set -a
source /path/to/ignored-testnet-operational.env
set +a
export LIQUIDITY_LOCK_TESTNET_CONFIRM=CREATE_PANCAKE_V2_TEST_LP_AND_LOCK
export LIQUIDITY_LOCK_TEST_DELAY_SECONDS=180
pnpm --filter @cukies/contracts rehearse:testnet:liquidity-locker

export LIQUIDITY_LOCKER_ADDRESS=0x...
pnpm --filter @cukies/contracts complete:testnet:liquidity-locker
```

The completion command refuses to broadcast before maturity. After maturity it waits for 12 confirmations, validates both release events from the receipt, verifies that the locker balance becomes zero and proves that the exact locked amount reaches the immutable beneficiary. This short delay is exclusively a testnet release rehearsal and must not be copied into a production deployment.

Do not derive the mainnet timestamp from this rehearsal. The approved intermediate listing uses `SixMonthLiquidityLocker`, whose bytecode fixes the duration to exactly `180 days` from its deployment block. The generic short-delay rehearsal remains testnet-only.

The complete mainnet workflow, Safe batch review and production gates live in `docs/uki-mainnet-intermediate-listing-runbook.md`.

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
| Presale buyers | Up to `250,000,000 UKI` | `PRESALE` | Global vault config: approved start date `2026-09-15` (exact UTC time pending the later vesting phase), `presaleVestingDuration = 9 months`; freeze before claims. |
| Ecosystem 40-day unlock | `30,000,000 UKI` | `ECOSYSTEM_40D` | Cliff `TGE + 40 days`, no linear vesting. Use `duration = 0` to unlock 100% at the cliff. |
| Ecosystem remainder | TBD after sale | `ECOSYSTEM_REMAINDER` | 9 months cliff + 12 months linear vesting. |
| Team | `120,000,000 UKI` total | `TEAM_*` | 9 months cliff + 24 months linear vesting. |
| Concilium/Ascensum incentives | Variable | `CONCILIUM_INCENTIVES` | Same as team: 9 months cliff + 24 months linear vesting. |
| Rewards program | `450,000,000 UKI` | TBD | Documented as 6-year distribution, but final cliff/start/duration model is not yet specified. Do not create a single vault schedule until product approves the exact rewards distribution model. |
| Liquidity | Amount calculated from 50% of ASM raised at `0.012 USD/UKI` | Not a vesting schedule | Initial PancakeSwap V2 listing; every LP minted by the launch Safe is sent directly to the immutable 180-day locker. |

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
pnpm --filter @cukies/contracts preflight:presale --network bscTestnet
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
- en BSC mainnet, el deployer no conserva ownership ni permisos admin/manager cuando se proporciona `DEPLOYER_ADDRESS`,
- en BSC testnet el deployer puede conservar ownership/admin para operar el ensayo, pero no puede tener `PRESALE_VESTING_ROLE` ni `ALLOCATION_MANAGER_ROLE`,
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
