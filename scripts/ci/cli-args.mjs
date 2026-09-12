export function requireValue(argv, name, { fallback } = {}) {
  const index = argv.indexOf(name);
  if (index !== -1) {
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} requiere un valor.`);
    return value;
  }
  if (fallback !== undefined && fallback !== null && fallback !== '') return fallback;
  throw new Error(`${name} es obligatorio.`);
}
