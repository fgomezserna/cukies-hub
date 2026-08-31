describe('UKI sale public configuration', () => {
  const originalBscScanBaseUrl = process.env.NEXT_PUBLIC_BSCSCAN_BASE_URL;

  afterEach(() => {
    jest.resetModules();
    if (originalBscScanBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_BSCSCAN_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_BSCSCAN_BASE_URL = originalBscScanBaseUrl;
    }
  });

  it('treats an empty Docker build argument as unconfigured', async () => {
    process.env.NEXT_PUBLIC_BSCSCAN_BASE_URL = '';
    jest.resetModules();

    const { ukiSaleContracts } = await import('@/lib/contracts/uki-sale');

    expect(ukiSaleContracts.blockExplorerBaseUrl).toBe('https://bscscan.com');
  });
});
