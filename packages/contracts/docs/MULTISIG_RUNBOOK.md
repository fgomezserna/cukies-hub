# UKI multisig and roles runbook

Estado: baseline pre-testnet.
Issue: #128 `UKI-081.3`.
Fecha: 2026-05-13.

## Policy

Mainnet contracts must not be operated by a personal hot wallet.

For BSC testnet and mainnet deploys, `SALE_OWNER_ADDRESS` is mandatory and must be a launch-controlled Safe multisig or an explicitly approved launch admin wallet. Mainnet must use Safe multisig.

The deployer can pay gas and execute deployment, but should not remain the final owner/admin of launch contracts.

## Safe creation

Create the Safe before deploying launch contracts.

Recommended setup:

- Testnet rehearsal: Safe on BSC testnet with the same signer model planned for production.
- Mainnet launch: Safe on BSC mainnet before mainnet deploy.
- Minimum threshold: `2 of 3`.
- Preferred threshold for production operations: `3 of 5` when enough independent signers exist.
- Avoid `1 of N`; it behaves too much like a normal hot wallet.
- Avoid `N of N`; one lost key can permanently block operations.
- Each signer must use a separate wallet. Do not share one seed phrase across multiple signers.
- At least one signer should be a hardware wallet or equivalent cold key.

Record before deploy:

- Safe address.
- Network and chain id.
- Signer addresses.
- Threshold.
- Who controls each signer.
- A small test transaction proving the Safe can execute on the target network.

The deployer wallet is not a Safe signer requirement. It only needs enough BNB to pay deployment gas.

## Role matrix

| Contract | Privileged role | Target holder | Capabilities | Mainnet requirement |
| --- | --- | --- | --- | --- |
| `UKIToken` | `owner()` | Launch Safe | Pause/unpause transfers. | Safe before funds/users depend on UKI transfers. |
| `Presale` | `owner()` | Launch Safe | Pause/unpause sale, enable/disable purchases, update treasury, sale window, minimum purchase, sale cap and `ukiPerAsm`. | Safe before opening sale. |
| `VestingVault` | `DEFAULT_ADMIN_ROLE` | Launch Safe | Grant/revoke vesting managers, withdraw unallocated UKI and update/freeze presale TGE vesting config. | Safe before funding material UKI. |
| `VestingVault` | `PRESALE_VESTING_ROLE` | `Presale` contract | Create presale buyer vesting schedules only. | Required before sale opens. |
| `VestingVault` | `ALLOCATION_MANAGER_ROLE` | Optional allocation operator Safe | Create team/advisor/ecosystem schedules. | Allowed only if documented and revocable. |

## Deployment requirements

Required environment for non-local deploys:

```bash
SALE_OWNER_ADDRESS=0x...      # Safe multisig/admin owner
SALE_TREASURY_ADDRESS=0x...   # ASM treasury
ASM_TOKEN_ADDRESS=0x...       # verified ASM token for target chain
DEPLOYER_PRIVATE_KEY=...
BSCSCAN_API_KEY=...
```

The deploy script intentionally fails on `bscTestnet` and `bsc` if `SALE_OWNER_ADDRESS` is missing.

## Pre-open checklist

Complete this before opening the presale:

- Safe address, signer list and threshold are recorded.
- Safe has executed a small test transaction on the target network.
- `UKIToken.owner()` equals the approved Safe multisig/admin owner.
- `Presale.owner()` equals the approved Safe multisig/admin owner.
- `VestingVault` `DEFAULT_ADMIN_ROLE` is held by the approved Safe multisig/admin owner.
- `Presale` has `PRESALE_VESTING_ROLE` in `VestingVault`.
- Any team/advisor/ecosystem operator has `ALLOCATION_MANAGER_ROLE` only while allocations are being created.
- Deployer has no unnecessary owner/admin/manager powers.
- Vault holds at least `totalUkiForSale`.
- `Presale.saleEnabled()` matches the intended state for the phase. It should be `true` only when public purchases are intentionally open.
- Any live sale parameter edit has a recorded reason, calldata review and tx hash.
- `ukiPerAsm` is reviewed as current, but remains mutable by Safe while ASM price risk is active.
- `VestingVault.presaleVestingStart()` and `presaleVestingDuration()` are reviewed; `freezePresaleVestingConfig()` is required before buyer claims at TGE.
- Treasury address has been verified by the Safe signers.
- Sale token is the approved ASM address; approved ASM has no fee-on-transfer/rebase behavior. Re-review transfer behavior only if the token address changes.
- Pause/unpause has been tested on testnet for `UKIToken` and `Presale`.
- A role revoke transaction has been simulated or executed on testnet.

## Setup sequence

1. Create the Safe and execute a small test transaction.
2. Set `SALE_OWNER_ADDRESS` to the Safe address.
3. Deploy or attach `UKIToken` with `SALE_OWNER_ADDRESS` as owner.
4. Deploy or attach `VestingVault` with `SALE_OWNER_ADDRESS` as default admin.
5. Deploy `Presale` with `SALE_OWNER_ADDRESS` as owner.
6. Confirm the deployer is not owner/admin of the launch contracts.
7. Fund `VestingVault` with sale UKI.
8. From the Safe/admin owner, grant `PRESALE_VESTING_ROLE` to `Presale`.
9. If needed, grant `ALLOCATION_MANAGER_ROLE` to an allocation operator Safe.
10. Create team/advisor/ecosystem schedules and revoke temporary allocation operators.
11. Enable public purchases with `setSaleEnabled(true)` only after final launch approval.
12. Keep sale parameter updates under Safe approval while operational or ASM price risk is active.
13. At TGE, update presale vesting config if needed and freeze it with `freezePresaleVestingConfig()` before claims.
14. Run `preflight:presale` on the target network.
15. Verify contracts on BscScan.
16. Export ABIs and configure dapp env addresses.
17. Run a test purchase and vesting read on BSC testnet.

## Emergency pause runbook

Use this when there is suspected exploit, wrong parameters, wrong token address, wrong treasury, unexpected purchase behavior or UI/API mismatch.

1. Identify affected surface:
   - Presale purchase issue: pause `Presale`.
   - Transfer/systemic UKI issue: pause `UKIToken`.
   - Unauthorized buyer vesting creation: revoke `PRESALE_VESTING_ROLE` from the suspect account.
   - Unauthorized internal allocation creation: revoke `ALLOCATION_MANAGER_ROLE` from the suspect account.
2. Prepare Safe transaction with reason and target function.
3. Have one signer independently verify target address, calldata and chain id.
4. Execute Safe transaction.
5. Record tx hash, reason, timestamp and affected contracts in the launch incident log.
6. Keep dapp in locked/maintenance state until on-chain state and backend cache/indexer agree.
7. Publish user-facing status only after transaction finality.

## Resume runbook

1. Confirm root cause and affected state.
2. Confirm no further privileged role is compromised.
3. Reconcile BSC events with backend/indexer.
4. If parameters changed, verify dapp/API copy and env values.
5. Execute unpause or role grant through Safe.
6. Record tx hash and reason.
7. Run a small testnet-equivalent flow or production read-only smoke check.

## Revocation runbook

Use this if deployer, allocation operator or any hot wallet should lose authority.

1. List current role holders on BscScan or through contract reads.
2. Prepare `revokeRole(role, account)` from `VestingVault` admin for manager roles.
3. For `Ownable` contracts, transfer ownership to the approved Safe if not already done.
4. Execute through Safe/admin owner.
5. Confirm role/owner reads after finality.
6. Update deployment notes and incident log.

## Evidence to keep

- Safe address and signer threshold.
- Signer address list and ownership notes.
- Safe test transaction hash.
- Contract addresses and BscScan verification links.
- Role grant/revoke tx hashes.
- Pause/unpause tx hashes.
- Final parameter sheet for sale window, caps, price, treasury and vesting.
- Testnet dry-run tx hashes.
