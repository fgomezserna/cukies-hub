# UKI multisig and roles runbook

Estado: baseline pre-testnet.
Issue: #128 `UKI-081.3`.
Fecha: 2026-05-13.

## Policy

Mainnet contracts must not be operated by a personal hot wallet.

For BSC testnet and mainnet deploys, `SALE_OWNER_ADDRESS` is mandatory and must be a launch-controlled multisig or an explicitly approved launch admin wallet. Mainnet must use multisig.

The deployer can pay gas and execute deployment, but should not remain the final owner/admin of launch contracts.

## Role matrix

| Contract | Privileged role | Target holder | Capabilities | Mainnet requirement |
| --- | --- | --- | --- | --- |
| `UKIToken` | `owner()` | Launch multisig | Pause/unpause transfers. | Multisig before funds/users depend on UKI transfers. |
| `Presale` | `owner()` | Launch multisig | Pause/unpause sale, update treasury, sale window, purchase limits and vesting config. | Multisig before opening sale. |
| `VestingVault` | `DEFAULT_ADMIN_ROLE` | Launch multisig | Grant/revoke vesting managers and withdraw unallocated UKI. | Multisig before funding material UKI. |
| `VestingVault` | `VESTING_MANAGER_ROLE` | `Presale` contract | Create presale buyer vesting schedules. | Required before sale opens. |
| `VestingVault` | `VESTING_MANAGER_ROLE` | Optional allocation operator multisig | Create team/advisor/ecosystem schedules. | Allowed only if documented and revocable. |

## Deployment requirements

Required environment for non-local deploys:

```bash
SALE_OWNER_ADDRESS=0x...      # multisig/admin owner
SALE_TREASURY_ADDRESS=0x...   # ASM treasury
ASM_TOKEN_ADDRESS=0x...       # verified ASM token for target chain
DEPLOYER_PRIVATE_KEY=...
BSCSCAN_API_KEY=...
```

The deploy script intentionally fails on `bscTestnet` and `bsc` if `SALE_OWNER_ADDRESS` is missing.

## Pre-open checklist

Complete this before opening the presale:

- `UKIToken.owner()` equals the approved multisig/admin owner.
- `Presale.owner()` equals the approved multisig/admin owner.
- `VestingVault` `DEFAULT_ADMIN_ROLE` is held by the approved multisig/admin owner.
- `Presale` has `VESTING_MANAGER_ROLE` in `VestingVault`.
- Deployer has no unnecessary owner/admin/manager powers.
- Vault holds at least `totalUkiForSale`.
- Treasury address has been verified by the multisig signers.
- Sale token has been verified as the intended ASM token and reviewed for transfer behavior.
- Pause/unpause has been tested on testnet for `UKIToken` and `Presale`.
- A role revoke transaction has been simulated or executed on testnet.

## Setup sequence

1. Deploy or attach `UKIToken` with `SALE_OWNER_ADDRESS` as owner.
2. Deploy or attach `VestingVault` with `SALE_OWNER_ADDRESS` as default admin.
3. Deploy `Presale` with `SALE_OWNER_ADDRESS` as owner.
4. Fund `VestingVault` with sale UKI.
5. From the multisig/admin owner, grant `VESTING_MANAGER_ROLE` to `Presale`.
6. If needed, grant `VESTING_MANAGER_ROLE` to an allocation operator multisig.
7. Verify contracts on BscScan.
8. Export ABIs and configure dapp env addresses.
9. Run a test purchase and vesting read on BSC testnet.
10. Freeze final parameters before mainnet.

## Emergency pause runbook

Use this when there is suspected exploit, wrong parameters, wrong token address, wrong treasury, unexpected purchase behavior or UI/API mismatch.

1. Identify affected surface:
   - Presale purchase issue: pause `Presale`.
   - Transfer/systemic UKI issue: pause `UKIToken`.
   - Unauthorized vesting creation: revoke `VESTING_MANAGER_ROLE` from the suspect account.
2. Prepare multisig transaction with reason and target function.
3. Have one signer independently verify target address, calldata and chain id.
4. Execute multisig transaction.
5. Record tx hash, reason, timestamp and affected contracts in the launch incident log.
6. Keep dapp in locked/maintenance state until on-chain state and backend cache/indexer agree.
7. Publish user-facing status only after transaction finality.

## Resume runbook

1. Confirm root cause and affected state.
2. Confirm no further privileged role is compromised.
3. Reconcile BSC events with backend/indexer.
4. If parameters changed, verify dapp/API copy and env values.
5. Execute unpause or role grant through multisig.
6. Record tx hash and reason.
7. Run a small testnet-equivalent flow or production read-only smoke check.

## Revocation runbook

Use this if deployer, allocation operator or any hot wallet should lose authority.

1. List current role holders on BscScan or through contract reads.
2. Prepare `revokeRole(role, account)` from `VestingVault` admin for manager roles.
3. For `Ownable` contracts, transfer ownership to the approved multisig if not already done.
4. Execute through multisig/admin owner.
5. Confirm role/owner reads after finality.
6. Update deployment notes and incident log.

## Evidence to keep

- Multisig address and signer threshold.
- Contract addresses and BscScan verification links.
- Role grant/revoke tx hashes.
- Pause/unpause tx hashes.
- Final parameter sheet for sale window, caps, price, treasury and vesting.
- Testnet dry-run tx hashes.
