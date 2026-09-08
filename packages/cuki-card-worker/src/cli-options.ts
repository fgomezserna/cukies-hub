import type { AssetIdentityContext } from './types.js';

export function parseIdentityArgs(args: string[]) {
  const values = new Map<string, string>();
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--source-')) {
      positional.push(argument);
      continue;
    }
    const [name, inlineValue] = argument.split('=', 2);
    const value = inlineValue ?? args[++index];
    if (!value) throw new Error(`Falta valor para ${name}.`);
    values.set(name, value);
  }
  if (values.size === 0) return { positional, identity: undefined as AssetIdentityContext | undefined };
  if (!values.has('--source-network') || !values.has('--source-collection')) {
    throw new Error('El contexto de origen CLI requiere --source-network y --source-collection.');
  }
  const chainId = values.get('--source-chain-id');
  return {
    positional,
    identity: {
      network: values.get('--source-network')!,
      ...(chainId === undefined ? {} : { chainId: Number(chainId) }),
      collectionAddressNormalized: values.get('--source-collection')!,
    } satisfies AssetIdentityContext,
  };
}
