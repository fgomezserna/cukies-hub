import type { ContractAlias, EventName } from '../types.js';

export type ContractEventManifestEntry = {
  artifactEvent: string;
  canonicalEvent: EventName;
};

const entry = (artifactEvent: string, canonicalEvent = artifactEvent as EventName) => ({
  artifactEvent,
  canonicalEvent,
} satisfies ContractEventManifestEntry);

/**
 * ABI coverage manifest. The artifact event name is kept beside the canonical
 * indexer name so namespaced ERC20/NFT/vault homonyms cannot drift silently.
 */
export const contractEventManifest = {
  TOKEN: [
    entry('Transfer'), entry('Approval'), entry('ApprovalForAll'), entry('MinterAdded'),
    entry('MinterRemoved'), entry('OwnershipRenounced'), entry('OwnershipTransferred'),
  ],
  TOKEN_V2: [
    entry('Transfer'), entry('CukieMetadataConfigured'), entry('Approval'), entry('ApprovalForAll'),
    entry('OwnershipTransferred'),
  ],
  UKI_TOKEN: [
    entry('Transfer', 'UkiTokenTransfer'), entry('Approval', 'UkiTokenApproval'),
    entry('OwnershipTransferred', 'UkiTokenOwnershipTransferred'),
    entry('Paused', 'UkiTokenPaused'), entry('Unpaused', 'UkiTokenUnpaused'),
  ],
  POINTS: [
    entry('Mint'), entry('Burn'), entry('MinterAdded'), entry('MinterRemoved'),
    entry('OwnershipRenounced'), entry('OwnershipTransferred'),
  ],
  STAKING_POINTS: [
    entry('Stake'), entry('Unstake'), entry('OwnershipRenounced'), entry('OwnershipTransferred'),
  ],
  BREEDING_POINTS: [
    entry('BreedStart'), entry('BreedFinish'), entry('OwnershipRenounced'), entry('OwnershipTransferred'),
  ],
  MARKETPLACE: [
    entry('TokenOnSale'), entry('TokenBought'), entry('MarketTokenSaleCancelled'),
    entry('MarketTokenPriceChanged'), entry('OwnershipRenounced'), entry('OwnershipTransferred'),
    entry('Paused'), entry('Unpaused'),
  ],
  UKI_MARKETPLACE: [
    entry('CollectionAllowedUpdated'), entry('PaymentTokenAllowedUpdated'),
    entry('NativePaymentAllowedUpdated'), entry('FeeConfigUpdated'),
    entry('OrderCreated', 'UkiMarketplaceOrderCreated'),
    entry('OrderCancelled', 'UkiMarketplaceOrderCancelled'),
    entry('OrderExpired', 'UkiMarketplaceOrderExpired'),
    entry('OrderInvalidated', 'UkiMarketplaceOrderInvalidated'),
    entry('TokenNonceInvalidated', 'UkiMarketplaceTokenNonceInvalidated'),
    entry('OrderFilled', 'UkiMarketplaceOrderFilled'), entry('NativeFeesClaimed'),
    entry('OwnershipTransferred'), entry('OwnershipTransferStarted'), entry('Paused'), entry('Unpaused'),
  ],
  BRIDGE: [
    entry('JumpInBridge'), entry('JumpOutBridge'), entry('OwnershipRenounced'),
    entry('OwnershipTransferred'), entry('Paused'), entry('Unpaused'),
  ],
  BRIDGE_ENDPOINT: [
    entry('JumpInBridge'), entry('JumpOutBridge'), entry('BridgeRequested'), entry('BridgeCompleted'),
    entry('RelayerUpdated'), entry('BridgePriceUpdated'), entry('FeeRecipientUpdated'),
    entry('UntrackedERC721Recovered'), entry('OwnershipTransferred'), entry('Paused'), entry('Unpaused'),
  ],
  MINT: [entry('MintReferral'), entry('OwnershipRenounced'), entry('OwnershipTransferred')],
  REFERRALS: [entry('OwnershipRenounced'), entry('OwnershipTransferred')],
  PRESALE: [
    entry('Purchased'), entry('MinPurchaseUpdated'), entry('OwnershipTransferred'), entry('Paused'),
    entry('SaleEnabledUpdated'), entry('SaleWindowUpdated'), entry('TotalUkiForSaleUpdated'),
    entry('TreasuryUpdated'), entry('UkiPerAsmUpdated'), entry('Unpaused'),
  ],
  UKI_STAKING: [
    entry('Staked'), entry('Unstaked'), entry('OwnershipTransferStarted'), entry('OwnershipTransferred'),
    entry('Paused'), entry('Unpaused'),
  ],
  VESTING_VAULT: [
    entry('VestingCreated'), entry('TokensReleased'), entry('PresaleVestingConfigFrozen'),
    entry('PresaleVestingConfigUpdated'), entry('RoleAdminChanged'), entry('RoleGranted'),
    entry('RoleRevoked'), entry('UnallocatedWithdrawn'),
  ],
  REWARDS_DISTRIBUTOR: [
    entry('BatchPublished'), entry('RewardClaimed'), entry('BatchClosed'), entry('ExcessRecovered'),
    entry('OwnershipTransferStarted'), entry('OwnershipTransferred'), entry('Paused'), entry('Unpaused'),
  ],
  CUKIE_MASTER_NFT_VAULT: [
    entry('CollectionAllowedUpdated', 'CukieMasterCollectionAllowedUpdated'),
    entry('Deposited', 'CukieMasterDeposited'), entry('Withdrawn', 'CukieMasterWithdrawn'),
    entry('UntrackedERC721Recovered', 'CukieMasterUntrackedERC721Recovered'),
    entry('OwnershipTransferStarted'), entry('OwnershipTransferred'), entry('Paused'), entry('Unpaused'),
  ],
  CUKIE_POOL_NFT_VAULT: [
    entry('CollectionAllowedUpdated', 'CukiePoolCollectionAllowedUpdated'),
    entry('CalendarVersionScheduled', 'CukiePoolCalendarVersionScheduled'),
    entry('Deposited', 'CukiePoolDeposited'), entry('ExitRequested', 'CukiePoolExitRequested'),
    entry('WithdrawableAtAdvanced', 'CukiePoolWithdrawableAtAdvanced'),
    entry('Withdrawn', 'CukiePoolWithdrawn'),
    entry('UntrackedERC721Recovered', 'CukiePoolUntrackedERC721Recovered'),
    entry('OwnershipTransferStarted'), entry('OwnershipTransferred'), entry('Paused'), entry('Unpaused'),
  ],
} satisfies Partial<Record<ContractAlias, readonly ContractEventManifestEntry[]>>;

export function canonicalEventsForAlias(alias: ContractAlias) {
  return (contractEventManifest[alias] ?? []).map((item) => item.canonicalEvent);
}
