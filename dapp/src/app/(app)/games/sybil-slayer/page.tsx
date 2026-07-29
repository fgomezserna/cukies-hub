import { redirect } from 'next/navigation';

type LegacyGamePageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LegacyTreasureHuntRoute({ searchParams }: LegacyGamePageProps) {
  const legacyParams = await searchParams;
  const canonicalParams = new URLSearchParams();

  for (const [key, value] of Object.entries(legacyParams)) {
    if (Array.isArray(value)) {
      for (const item of value) canonicalParams.append(key, item);
    } else if (value !== undefined) {
      canonicalParams.set(key, value);
    }
  }

  const query = canonicalParams.toString();
  redirect(`/games/treasure-hunt${query ? `?${query}` : ''}`);
}
