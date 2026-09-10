export async function resolve(specifier, context, defaultResolve) {
  if (specifier === 'server-only') {
    return {
      url: 'data:text/javascript,export%20{}',
      shortCircuit: true,
    };
  }
  return defaultResolve(specifier, context, defaultResolve);
}
