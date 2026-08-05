import {
  UINT256_MAX,
  addRawAmounts,
  assertCreditAmount,
  formatRawAmount,
  mulDiv,
  parseRawAmount,
  subtractRawAmounts,
  sumRawAmounts,
} from '@/lib/uki-economy/money';

describe('UKI raw money helpers', () => {
  it('parses and formats minimum-unit amounts without Number coercion', () => {
    const value = '123456789012345678901234567890';

    expect(parseRawAmount(value)).toBe(BigInt('123456789012345678901234567890'));
    expect(formatRawAmount(parseRawAmount(value))).toBe(value);
    expect(parseRawAmount('0007')).toBe(BigInt('7'));
  });

  it.each(['', '-1', '+1', '1.0', '1e18', ' 1', '1 '])(
    'rejects invalid raw amount %p',
    (value) => {
      expect(() => parseRawAmount(value)).toThrow();
    },
  );

  it('enforces uint256 bounds', () => {
    expect(parseRawAmount(UINT256_MAX.toString())).toBe(UINT256_MAX);
    expect(() => parseRawAmount((UINT256_MAX + BigInt('1')).toString())).toThrow('uint256');
    expect(() => formatRawAmount(BigInt('-1'))).toThrow('negativo');
    expect(() => addRawAmounts(UINT256_MAX, BigInt('1'))).toThrow('uint256');
  });

  it('adds, sums, subtracts and rejects underflow', () => {
    expect(addRawAmounts(BigInt('2'), BigInt('3'))).toBe(BigInt('5'));
    expect(sumRawAmounts([BigInt('1'), BigInt('2'), BigInt('3')])).toBe(BigInt('6'));
    expect(subtractRawAmounts(BigInt('5'), BigInt('3'))).toBe(BigInt('2'));
    expect(() => subtractRawAmounts(BigInt('2'), BigInt('3'))).toThrow('no puede ser negativa');
  });

  it('calculates floor mulDiv and rejects zero divisors or invalid results', () => {
    expect(mulDiv(BigInt('10'), BigInt('3'), BigInt('4'))).toBe(BigInt('7'));
    expect(mulDiv(UINT256_MAX, UINT256_MAX, UINT256_MAX)).toBe(UINT256_MAX);
    expect(() => mulDiv(BigInt('1'), BigInt('1'), BigInt('0'))).toThrow('cero');
    expect(() => mulDiv(UINT256_MAX, BigInt('2'), BigInt('1'))).toThrow('uint256');
  });

  it('accepts only non-negative safe integer credits', () => {
    expect(assertCreditAmount(0)).toBe(0);
    expect(assertCreditAmount(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => assertCreditAmount(-1)).toThrow();
    expect(() => assertCreditAmount(1.5)).toThrow();
    expect(() => assertCreditAmount(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });
});
