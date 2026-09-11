jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('@/lib/indexer-db/mongodb', () => ({ getIndexerDb: jest.fn() }));

import type { Collection } from 'mongodb';

import {
  MongoUkiMarketplaceRepository,
} from '@/lib/uki-marketplace/repository';

const collection = '0x0000000000000000000000000000000000001002' as `0x${string}`;
const foreignCollection = '0x0000000000000000000000000000000000001003' as `0x${string}`;

function cursor<T>(rows: T[]) {
  const value = {} as {
    limit: () => typeof value;
    toArray: () => Promise<T[]>;
  };
  value.limit = jest.fn(() => value);
  value.toArray = jest.fn(async () => rows);
  return value;
}

describe('MongoUkiMarketplaceRepository.listAssetMetadata', () => {
  it('consulta identidad completa y devuelve metadata aunque la propiedad actual haya cambiado', async () => {
    const documents = [
      {
        _id: 'asset-42',
        chainId: 97,
        collectionAddressNormalized: collection,
        tokenId: '42',
        ownerNormalized: '0x9999999999999999999999999999999999999999',
        network: 'BSC',
        img: 'https://minio.example/cukie-42.png',
        cardImageUrl: 'https://minio.example/card-cukie-42.png',
        rarity: 3,
        generation: 1,
      },
      {
        _id: 'wrong-collection',
        chainId: 97,
        collectionAddressNormalized: foreignCollection,
        tokenId: '42',
        network: 'BSC',
        img: 'https://wrong.example/42.png',
        rarity: 1,
        generation: 1,
      },
      {
        _id: 'wrong-chain',
        chainId: 56,
        collectionAddressNormalized: collection,
        tokenId: '42',
        network: 'BSC',
        img: 'https://wrong.example/chain.png',
        rarity: 5,
        generation: 2,
      },
    ];
    const find = jest.fn(() => cursor(documents));
    const assets = jest.fn(async () => ({ find } as unknown as Collection));
    const repository = new MongoUkiMarketplaceRepository(
      jest.fn() as never,
      assets,
    );

    const result = await repository.listAssetMetadata({
      identities: [
        { chainId: 97, collectionAddress: collection, tokenId: '42' },
        { chainId: 56, collectionAddress: collection, tokenId: '42' },
      ],
    });

    expect(find).toHaveBeenCalledWith({
      $or: [
        {
          chainId: 97,
          collectionAddressNormalized: collection,
          tokenId: { $in: ['42', 42] },
        },
        {
          chainId: 56,
          collectionAddressNormalized: collection,
          tokenId: { $in: ['42', 42] },
        },
      ],
    });
    expect(result).toEqual([
      {
        chainId: 97,
        collectionAddress: collection,
        tokenId: '42',
        imageUrl: 'https://minio.example/card-cukie-42.png',
        rarity: 'rare',
        generation: 'original',
      },
      {
        chainId: 56,
        collectionAddress: collection,
        tokenId: '42',
        imageUrl: 'https://wrong.example/chain.png',
        rarity: 'legendary',
        generation: 'second_generation',
      },
    ]);
  });

  it('omite identidad duplicada en la fuente en vez de elegir una imagen arbitraria', async () => {
    const find = jest.fn(() => cursor([
      {
        _id: 'duplicate-a',
        chainId: 97,
        collectionAddressNormalized: collection,
        tokenId: '7',
        network: 'BSC',
        img: 'https://minio.example/a.png',
        rarity: 1,
        generation: 1,
      },
      {
        _id: 'duplicate-b',
        chainId: 97,
        collectionAddressNormalized: collection,
        tokenId: '7',
        network: 'BSC',
        img: 'https://minio.example/b.png',
        rarity: 2,
        generation: 1,
      },
    ]));
    const assets = jest.fn(async () => ({ find } as unknown as Collection));
    const repository = new MongoUkiMarketplaceRepository(
      jest.fn() as never,
      assets,
    );

    await expect(repository.listAssetMetadata({
      identities: [{ chainId: 97, collectionAddress: collection, tokenId: '7' }],
    })).resolves.toEqual([]);
  });
});
