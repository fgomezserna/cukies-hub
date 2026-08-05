const RAW_ZERO = BigInt('0');
const RAW_ONE = BigInt('1');
const UINT256_BITS = BigInt('256');

export const UINT256_MAX = (RAW_ONE << UINT256_BITS) - RAW_ONE;

function assertRawBigInt(value: bigint, label: string) {
  if (typeof value !== 'bigint') {
    throw new TypeError(`${label} debe ser bigint.`);
  }

  if (value < RAW_ZERO) {
    throw new RangeError(`${label} no puede ser negativo.`);
  }

  if (value > UINT256_MAX) {
    throw new RangeError(`${label} excede uint256.`);
  }

  return value;
}

export function parseRawAmount(value: string) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new TypeError('El monto raw debe ser una cadena decimal entera sin signo.');
  }

  return assertRawBigInt(BigInt(value), 'El monto raw');
}

export function formatRawAmount(value: bigint) {
  return assertRawBigInt(value, 'El monto raw').toString(10);
}

export function addRawAmounts(left: bigint, right: bigint) {
  const result = assertRawBigInt(left, 'El sumando izquierdo')
    + assertRawBigInt(right, 'El sumando derecho');

  return assertRawBigInt(result, 'El resultado de la suma');
}

export function sumRawAmounts(values: readonly bigint[]) {
  return values.reduce((total, value) => addRawAmounts(total, value), RAW_ZERO);
}

export function subtractRawAmounts(left: bigint, right: bigint) {
  const minuend = assertRawBigInt(left, 'El minuendo');
  const subtrahend = assertRawBigInt(right, 'El sustraendo');

  if (subtrahend > minuend) {
    throw new RangeError('La resta de montos raw no puede ser negativa.');
  }

  return minuend - subtrahend;
}

export function mulDiv(value: bigint, multiplier: bigint, divisor: bigint) {
  const checkedValue = assertRawBigInt(value, 'El valor');
  const checkedMultiplier = assertRawBigInt(multiplier, 'El multiplicador');
  const checkedDivisor = assertRawBigInt(divisor, 'El divisor');

  if (checkedDivisor === RAW_ZERO) {
    throw new RangeError('El divisor no puede ser cero.');
  }

  const result = (checkedValue * checkedMultiplier) / checkedDivisor;
  return assertRawBigInt(result, 'El resultado de mulDiv');
}

export const multiplyDivideRawAmount = mulDiv;

export function assertCreditAmount(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('El monto de creditos debe ser un entero seguro no negativo.');
  }

  return value;
}
