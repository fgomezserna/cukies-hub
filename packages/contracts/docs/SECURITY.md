# UKI sale contracts security checklist

Estado: baseline pre-testnet.

## Local checks

Run before every deploy candidate:

```bash
pnpm --filter @cukies/contracts compile
pnpm --filter @cukies/contracts test
pnpm --filter @cukies/contracts coverage
```

## Static analysis

Slither is the preferred static analyzer before testnet/mainnet.

```bash
cd packages/contracts
slither . --config-file slither.config.json
```

If Slither is unavailable in the local environment, record that explicitly in the PR and run it in CI or in a Python/Solc environment before mainnet.

## Threat model

Review the launch threat model before each deploy candidate:

- `packages/contracts/docs/THREAT_MODEL.md`

The current model covers `UKIToken`, `Presale` and `VestingVault`. `UKIStaking` and `RewardsDistributor` need their own threat-model update before those contracts can be considered launch-ready.

## Manual review checklist

- Presale owner is a multisig or launch-controlled wallet, not a personal hot wallet.
- `VestingVault` is funded with at least `totalUkiForSale`.
- `Presale` has `VESTING_MANAGER_ROLE` in `VestingVault`.
- ASM token address matches the intended BSC network.
- Treasury address is controlled and can receive ASM.
- `saleStart`, `saleEnd`, `vestingStart` and `vestingDuration` are UTC timestamps.
- Min, max, wallet cap and sale cap match the public sale terms.
- `ukiPerAsm` is scaled by `1e18`.
- ASM token address is verified for the target chain and does not have fee-on-transfer/rebase behavior unless the presale is updated to account by balance delta.
- BscScan verification succeeds for all deployed contracts.
- Emergency pause flow has been tested on testnet.
- Dapp env addresses match the deployed contracts and chain id.

## Known limits

- Refunds are not implemented in the baseline sale contract.
- Purchases create vested UKI allocations, not immediate liquid UKI transfers.
- Contract ownership transfer is an operational step after deploy.
- External audit is still required before mainnet funds are accepted.
