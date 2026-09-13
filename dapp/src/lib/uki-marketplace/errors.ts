export class UkiMarketplaceUnavailableError extends Error {
  constructor() {
    super('UKI marketplace unavailable');
    this.name = 'UkiMarketplaceUnavailableError';
  }
}

export class UkiMarketplaceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UkiMarketplaceValidationError';
  }
}
