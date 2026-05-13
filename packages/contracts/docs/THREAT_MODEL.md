# UKI contracts threat model

Estado: baseline pre-testnet.
Issue: #127 `UKI-081.2`.
Fecha: 2026-05-13.

## Scope

This threat model covers the currently implemented sale contracts:

- `UKIToken`
- `Presale`
- `VestingVault`

It also records launch blockers for planned contracts that are not implemented yet:

- `UKIStaking`
- `RewardsDistributor`

The model assumes BNB Smart Chain as the settlement layer, Mongo/backend as an indexed/cache layer only, and wallets as the transaction authorizers.

## Protected assets

| Asset | Owner of truth | Main risk |
| --- | --- | --- |
| UKI total supply | `UKIToken` | Unexpected minting or frozen transfers. |
| ASM collected in presale | `Presale` + treasury wallet | Wrong treasury, wrong sale token, or wrong price. |
| Buyer UKI allocations | `Presale` + `VestingVault` | Over-allocation, vesting bypass, or release accounting error. |
| Team/advisor/ecosystem vesting | `VestingVault` | Unauthorized schedule creation or early release. |
| Admin permissions | Owner/admin roles | Hot wallet compromise or accidental role assignment. |
| Future reward claims | `RewardsDistributor` | Double claim, malicious root, or invalid proof domain. |
| Future UKI staking state | `UKIStaking` | Stake accounting mismatch, unlock bypass, or snapshot manipulation. |

## Trust boundaries

| Boundary | Trusted for | Not trusted for |
| --- | --- | --- |
| BSC contracts | Token balances, sale state, vesting state, final claims. | Game scores, NFT rarity, credit balances, rankings. |
| Backend/Mongo | Indexing, UI cache, games, rewards calculation inputs. | Final token custody or final claim status without BSC evidence. |
| Dapp/browser | Wallet orchestration and display. | Price authority, eligibility authority, reward finality. |
| Admin/multisig | Parameter operations and emergency controls. | Unreviewed root publication, undocumented role changes, private hot wallet ops. |

## Threat matrix

| ID | Threat | Impact | Current controls | Required before mainnet |
| --- | --- | --- | --- | --- |
| T01 | Admin key compromise | Owner can pause token/presale, update sale window/limits/treasury, and manage vault roles. | `Ownable`/`AccessControl` restrict privileged calls. Emergency pause exists. | Transfer owner/admin roles to multisig, document signers/threshold, rehearse pause and role revocation on testnet. |
| T02 | Presale price error | Buyers receive too much/too little UKI for ASM. | `ukiPerAsm` is constructor-only and scaled by `1e18`; tests cover quote and sale cap behavior. | Pre-deploy config review with human-readable ratio, dry-run deploy, BscScan verification, dapp/API cross-check against on-chain value. |
| T03 | Wrong ASM token or fee-on-transfer sale token | Treasury may receive less/different token than expected while vesting uses nominal `asmAmount`. | `ASM_TOKEN_ADDRESS` is configured at deploy; `SafeERC20` handles standard ERC-20 failures. | Verify ASM address per chain; confirm token has no fee-on-transfer/rebase behavior or change presale to account by treasury balance delta before accepting funds. |
| T04 | Wrong treasury | ASM proceeds go to an unintended address. | Constructor requires non-zero treasury; owner can update treasury. Event emitted on update. | Use multisig-controlled treasury, preflight address checksum, testnet transfer check, issue/PR record for final address. |
| T05 | Sale window manipulation | Presale could open/close at wrong time. | Owner-only `setSaleWindow`; invalid zero/end-before-start rejected; events emitted. | Freeze final timestamps before launch; publish UTC timestamps; monitor events; restrict owner to multisig. |
| T06 | Purchase limit misconfiguration | Wallet cap, min/max or total sale cap can block users or oversell sale allocation. | Min/max/wallet cap guards; total UKI sale cap enforced; tests cover boundaries. | Final parameter sheet, dry-run purchase matrix, dapp/API consistency check. |
| T07 | Vault underfunding | Purchases revert or allocations cannot be created. | `VestingVault.createVesting` checks unallocated balance, reverting full purchase if insufficient. | Fund vault with at least `totalUkiForSale`; verify role grant and vault balance before opening sale. |
| T08 | Unauthorized vesting creation | Attacker or wrong operator creates schedules. | `VESTING_MANAGER_ROLE` required; invalid schedules rejected. | Only presale and approved multisig/operator have manager role; record role grants/revokes; test role matrix on testnet. |
| T09 | Vesting bypass or early release | Beneficiary receives UKI before allowed vesting time. | Linear vesting uses `start`, `cliff`, `duration`, `releasedAmount`; release only transfers releasable amount. | Test final schedules with exact timestamps; review cliff/duration config; keep admin tools separate from user claim UI. |
| T10 | Double release from vesting | Beneficiary claims same vested amount twice. | `releasedAmount` is incremented before transfer and deducted from future `releasable`. | Keep coverage for `release`, `release(bytes32)`, `releaseAll`; run testnet repeated claim attempts. |
| T11 | Pause misuse | Token or presale pause can disrupt users. | Pause is owner-only and emits standard pause state through OpenZeppelin. | Multisig procedure, public incident template, test pause/unpause runbook. |
| T12 | Timestamp edge manipulation | Miner/validator timestamp variance can slightly affect open/close and vesting. | Sale and vesting use timestamp comparisons; no per-block randomness. | Avoid second-level launch assumptions; use buffered operational windows. |
| T13 | Malicious rewards root | Future distributor could publish a root that overpays or excludes users. | Not implemented. | Block launch of rewards until root publication requires multisig, batch hash, input hash, period id, immutable root history and reproducible generation script. |
| T14 | Double claim of rewards | Future distributor users claim same batch twice. | Not implemented. | `claimed[batchId][account]` or equivalent, domain-separated leaf, tests for repeated claim, wrong proof, wrong batch and amount tampering. |
| T15 | Staking unlock bypass | Future staking users withdraw earlier than rules allow or snapshot sees wrong stake. | Not implemented. | Define stake lock model, emergency behavior, snapshot semantics and backend reconciliation before Cukie Master launch. |
| T16 | Backend overrides on-chain truth | UI/support marks purchase, vesting or claim state incorrectly. | ADR assigns BSC as source of truth for transferable value. | Indexer must treat Mongo as cache; support actions need tx hash/event evidence. |

## Acceptance-criteria threats

### Double claim

Current vesting double release is mitigated by `releasedAmount` accounting in `VestingVault`.
Future rewards double claim is not covered because `RewardsDistributor` is not implemented. Before rewards launch, the distributor must include batch-scoped claim tracking and tests for:

- same wallet claiming the same batch twice,
- same proof with modified amount,
- proof for one batch used in another batch,
- proof generated for another chain or contract.

### Malicious root

`RewardsDistributor` is not implemented, so root publication must stay blocked. The minimum accepted design is:

- root publication by multisig or tightly scoped role,
- immutable `batchId` or monotonic period id,
- event with `batchId`, `root`, input hash and metadata URI/hash,
- reproducible Merkle input generator,
- documented approval before root publication,
- rollback policy that does not allow silently replacing a claimable batch after users start claiming.

### Admin key compromise

The current contracts rely on privileged owner/admin roles. Mainnet launch must not use a personal hot wallet as final owner. Required actions:

- owner of `UKIToken` and `Presale` controlled by multisig,
- default admin of `VestingVault` controlled by multisig,
- `VESTING_MANAGER_ROLE` granted only to `Presale` and any approved allocation operator,
- deployer stripped of privileged roles after setup when possible,
- emergency pause/unpause and role-revoke runbook tested on BSC testnet.

### Vesting bypass

The vault prevents early release through `start`, `cliff`, `duration` and `releasedAmount`. Remaining operational risks are configuration errors and excessive manager permissions. Mainnet readiness requires:

- final schedule table reviewed before deploy,
- final schedule ids documented,
- no public/admin UI route exposed to non-admin users for `createVestingWithCliff`,
- testnet release attempts before cliff, during vesting, after full vesting and after already released.

### Presale price error

The presale price is constructor-only via `ukiPerAsm` and uses `RATE_SCALE = 1e18`. A wrong value requires redeploy, not a setter correction. Mainnet readiness requires:

- parameter sheet with human units and wei units,
- independent check that `1 ASM = expected UKI`,
- dry-run purchase in Hardhat and BSC testnet,
- `/api/presale/status` cross-check against on-chain `ukiPerAsm`,
- dapp copy must match on-chain ratio.

## Mainnet blockers

The sale contracts must not accept mainnet funds until all of these are complete:

- `pnpm --filter @cukies/contracts test` passes.
- `pnpm --filter @cukies/contracts coverage` meets the launch threshold.
- Slither/static analysis has run and findings are triaged.
- BSC testnet deploy is verified on explorer.
- Multisig ownership and role plan is executed on testnet.
- Vault is funded and `Presale` has `VESTING_MANAGER_ROLE`.
- Final sale token, treasury, timestamps, caps and ratio are reviewed.
- External audit or equivalent independent review is complete.

## Out of scope until later phases

- NFT soft staking security is backend/Mongo scope unless NFT staking moves on-chain.
- Game score fraud and credit abuse are backend/game-economy scope.
- Rewards and staking cannot be approved by this threat model until their contracts exist.
