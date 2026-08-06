import { DomainValidationError } from '../errors';
import type { CukieMasterRequirement } from './types';

export type CukieMasterAdminCommand =
  | {
    command: 'expand_capacity';
    route: 'uki' | 'nft';
    capacitySlots: number;
    idempotencyKey: string;
  }
  | {
    command: 'propose_requirement';
    route: 'uki' | 'nft';
    requirement: CukieMasterRequirement;
    idempotencyKey: string;
  };

function object(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainValidationError(`${label} no es un objeto.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[], label: string) {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) {
    throw new DomainValidationError(`${label} contiene campos invalidos o ausentes.`);
  }
}

function route(value: unknown) {
  if (value !== 'uki' && value !== 'nft') throw new DomainValidationError('route no es valida.');
  return value;
}

function idempotencyKey(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 256) {
    throw new DomainValidationError('idempotencyKey no es valida.');
  }
  return value.trim();
}

export function parseCukieMasterAdminCommand(rawBody: Buffer): CukieMasterAdminCommand {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new DomainValidationError('JSON invalido.');
  }
  const body = object(parsed, 'body');
  if (body.command === 'expand_capacity') {
    exactKeys(body, ['command', 'route', 'capacitySlots', 'idempotencyKey'], 'body');
    if (!Number.isSafeInteger(body.capacitySlots)) {
      throw new DomainValidationError('capacitySlots debe ser un entero seguro.');
    }
    return {
      command: 'expand_capacity',
      route: route(body.route),
      capacitySlots: body.capacitySlots as number,
      idempotencyKey: idempotencyKey(body.idempotencyKey),
    };
  }
  if (body.command === 'propose_requirement') {
    exactKeys(body, ['command', 'route', 'requirement', 'idempotencyKey'], 'body');
    const commandRoute = route(body.route);
    const rawRequirement = object(body.requirement, 'requirement');
    if (commandRoute === 'uki') {
      exactKeys(rawRequirement, ['route', 'ukiRaw'], 'requirement');
      if (rawRequirement.route !== 'uki' || typeof rawRequirement.ukiRaw !== 'string') {
        throw new DomainValidationError('requirement UKI no es valido.');
      }
      return {
        command: 'propose_requirement',
        route: commandRoute,
        requirement: { route: 'uki', ukiRaw: rawRequirement.ukiRaw },
        idempotencyKey: idempotencyKey(body.idempotencyKey),
      };
    }
    exactKeys(rawRequirement, ['route', 'nftPoints'], 'requirement');
    if (rawRequirement.route !== 'nft' || !Number.isSafeInteger(rawRequirement.nftPoints)) {
      throw new DomainValidationError('requirement NFT no es valido.');
    }
    return {
      command: 'propose_requirement',
      route: commandRoute,
      requirement: { route: 'nft', nftPoints: rawRequirement.nftPoints as number },
      idempotencyKey: idempotencyKey(body.idempotencyKey),
    };
  }
  throw new DomainValidationError('command no es valido.');
}
