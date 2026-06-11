# UKI sale contracts security checklist

Estado: baseline pre-testnet.

## Local checks

Run before every deploy candidate:

```bash
pnpm --filter @cukies/contracts compile
pnpm --filter @cukies/contracts test
pnpm --filter @cukies/contracts coverage
pnpm --filter @cukies/contracts security:slither
pnpm --filter @cukies/contracts preflight:presale -- --network bscTestnet
```

## Static analysis

Slither is the preferred static analyzer before testnet/mainnet.

```bash
cd packages/contracts
slither . --config-file slither.config.json
```

If Slither is unavailable locally, install it in an isolated virtualenv:

```bash
cd packages/contracts
python3 -m venv .venv-slither
.venv-slither/bin/python -m pip install --upgrade pip
.venv-slither/bin/pip install slither-analyzer
PATH="$PWD/.venv-slither/bin:$PATH" pnpm security:slither
```

The current Slither triage intentionally excludes these detectors in `slither.config.json`:

| Detector | Reason accepted |
| --- | --- |
| `timestamp` | Sale windows and linear vesting are explicitly timestamp-based. Launch operations use buffered windows; no randomness depends on timestamp. |
| `incorrect-equality` | `== 0` checks are guard clauses for empty schedules or no releasable amount, not value-sensitive authorization. |
| `costly-loop` | `releaseAll()` is a convenience method over a beneficiary's schedule ids; users can call `release(bytes32)` per schedule if needed. |

Any new Slither finding outside this accepted list must be triaged before testnet/mainnet.

## Deep audit findings 2026-06-08

These findings are blockers, explicit launch decisions or final-evidence requirements from the 2026-06-08 deep audit. A04 and A07 require a fix or an approved exception before deploy. A01, A02, A03 and A05 are implemented in the current code and still require final deploy/preflight evidence. A06 and A08-A10 require final launch evidence.

| ID | Severity | Finding | Required resolution before mainnet |
| --- | --- | --- | --- |
| A01 | High | `Presale.buy()` did not require an explicit on-chain launch gate. | Current code requires `saleEnabled == true` in `buy()`; sale parameters remain editable by Safe. Attach final preflight/deploy evidence. |
| A02 | High | `UKIToken` and `Presale` inherit `renounceOwnership()`; pausing then renouncing ownership can permanently remove the ability to unpause. | Current code overrides `renounceOwnership()` in both contracts and reverts with `OwnershipRenounceDisabled()`. Attach final deploy/preflight evidence. |
| A03 | High | `VestingVault` used non-enumerable `AccessControl`; preflight could prove required holders existed but not prove no extra holder had `PRESALE_VESTING_ROLE`, `ALLOCATION_MANAGER_ROLE` or `DEFAULT_ADMIN_ROLE`. | Current code exposes `getRoleMemberCount()`/`getRoleMember()` for audited privileged roles and preflight validates exact holder sets. Attach final deploy/preflight evidence. |
| A04 | High | Legacy Cukies mainnet contracts still have a critical EOA owner recorded in `docs/contract-ownership-inventory.md`. | Rotate legacy owner/admin powers to the approved Safe or prove those contracts are fully out of launch scope. |
| A05 | Medium | `withdrawUnallocated()` can withdraw sale reserve before the sale closes, causing future purchases to revert. | Current code locks unallocated withdrawals until `block.timestamp > unallocatedWithdrawalUnlockTime`; deploy scripts set that unlock time to `SALE_END` and preflight verifies it. Attach final deploy evidence. |
| A06 | Medium | Hardened preflight must run with final env values; it validates token/vault linkage, full sale parameters, pause state, owner/admins and deployer cleanup when `DEPLOYER_ADDRESS` is provided. | Attach passing `preflight:presale` output before mainnet and keep the script in sync with launch parameters. |
| A07 | Medium | `UKIToken` supply and `initialSupplyReceiver` are launch-critical deploy parameters. | Production deploys must provide expected supply, require an explicit receiver when deploying a new UKI token, and record final `totalSupply()` evidence. |
| A08 | Medium | Vesting duration starts when the cliff ends; `duration` is measured from `cliff`, not from `start`. | Final schedule table must use `cliff + duration` as the full-vesting timestamp. |
| A09 | Low | Extreme price/minimum/cap and vesting-overflow cases have dedicated tests and custom-error guards. | Keep the expanded A09 test batch passing before launch. |
| A10 | Low | Production-style deployment uses `deploy-presale.production.cjs`; local/dev deployment and mocks stay separate. | Use only `deploy:testnet`/`deploy:mainnet` for non-local deploys and keep `MockERC20` out of production flows. |

## Operational runbooks

Review role ownership and emergency procedures before each deploy candidate:

- `packages/contracts/docs/MULTISIG_RUNBOOK.md`

## Threat model

Review the launch threat model before each deploy candidate:

- `packages/contracts/docs/THREAT_MODEL.md`

The current model covers `UKIToken`, `Presale` and `VestingVault`. `UKIStaking` and `RewardsDistributor` need their own threat-model update before those contracts can be considered launch-ready.

## Manual review checklist

- Presale owner is the launch Safe multisig or explicitly approved launch admin wallet, not a personal hot wallet.
- `UKIToken.owner()` is the approved Safe multisig/admin owner.
- `VestingVault` `DEFAULT_ADMIN_ROLE` is held by the approved Safe multisig/admin owner.
- `Presale` has only `PRESALE_VESTING_ROLE`, not the allocation role.
- Team/advisors/ecosystem operators use `ALLOCATION_MANAGER_ROLE`; temporary operators are revoked after schedules are created.
- `VestingVault` is funded with at least `totalUkiForSale`; current sale cap is `250,000,000 UKI` from the ecosystem pool unless product approves a lower cap before deploy. Unallocated withdrawals must stay locked until after `SALE_END`.
- `Presale` has `PRESALE_VESTING_ROLE` in `VestingVault`.
- ASM token address matches the approved BSC address; the approved ASM token is treated as a standard ERC-20 with no fee-on-transfer/rebase behavior.
- Treasury address is controlled and can receive ASM.
- `saleStart`, `saleEnd`, `presaleVestingStart` and `presaleVestingDuration` are UTC timestamps, with `presaleVestingStart >= saleEnd`.
- Minimum purchase and sale cap match the public sale terms; there is no approved max per purchase or per wallet.
- `ukiPerAsm` is scaled by `1e18` and remains mutable by the Safe while ASM price risk is active; updates affect only later purchases.
- `Presale.setSaleEnabled(true)` has been executed only after launch approval.
- `Presale.buy()` cannot execute before `saleEnabled` is true.
- Sale parameters remain editable by the Launch Safe after enabling; every edit must be recorded with reason, calldata and tx hash.
- `VestingVault.freezePresaleVestingConfig()` is executed before buyer claims are enabled at TGE.
- `UKIToken` and `Presale` cannot strand the system through `pause()` plus `renounceOwnership()`; both should revert renounce attempts with `OwnershipRenounceDisabled()`.
- Role-holder exclusivity for `VestingVault` has been proven through `getRoleMemberCount()`/`getRoleMember()`, not only the presence of required holders.
- Final vesting schedules treat `duration` as the post-cliff vesting period.
- Production deployments use `deploy-presale.production.cjs`, not local/dev deploy scripts.
- If the sale token address ever changes from the approved ASM address, review transfer behavior again before accepting funds.
- BscScan verification succeeds for all deployed contracts.
- Emergency pause flow has been tested on testnet.
- Dapp env addresses match the deployed contracts and chain id.

## Known limits

- Refunds are not implemented in the baseline sale contract.
- Purchases create vested UKI allocations, not immediate liquid UKI transfers.
- Contract ownership transfer is an operational step after deploy.
- `UKIToken.pause()` intentionally freezes vault releases too; use only through the multisig emergency runbook.
- External audit is still required before mainnet funds are accepted.
