export const UKI_PRESALE_START_ISO = process.env.NEXT_PUBLIC_UKI_PRESALE_START_ISO || '';
export const UKI_PRESALE_HAS_EXACT_START = Boolean(UKI_PRESALE_START_ISO);
export const UKI_PRESALE_START_LABEL = process.env.NEXT_PUBLIC_UKI_PRESALE_START_LABEL || 'first week of June 2026';
export const UKI_PRESALE_START_SHORT_LABEL = process.env.NEXT_PUBLIC_UKI_PRESALE_START_SHORT_LABEL || 'early June';
export const UKI_PRESALE_CHAIN_ID = Number(process.env.NEXT_PUBLIC_UKI_CHAIN_ID || 56);
export const UKI_PRESALE_CHAIN_LABEL = UKI_PRESALE_CHAIN_ID === 97 ? 'BNB Smart Chain Testnet' : 'BNB Smart Chain';
