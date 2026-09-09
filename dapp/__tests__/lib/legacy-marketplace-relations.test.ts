jest.mock('server-only', () => ({}));
jest.mock('@/lib/mongodb-cukies', () => ({cukiesDb: {cukies: jest.fn()}}));
jest.mock('@/lib/legacy-marketplace/graphql', () => ({fetchLegacyMarketplaceGraphQL: jest.fn(), legacyMarketplaceCukiSelection: ''}));

import { cukiesDb } from '@/lib/mongodb-cukies';
import { listLegacyMarketplaceCukies } from '@/lib/legacy-marketplace/data';

function collectionFor(items: unknown[], relations: unknown[]) {
  const page = {sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), toArray: jest.fn().mockResolvedValue(items)};
  const collection = {
    find: jest.fn().mockReturnValueOnce(page).mockReturnValue({toArray: jest.fn().mockResolvedValue(relations)}),
    countDocuments: jest.fn().mockResolvedValue(items.length),
    aggregate: jest.fn().mockReturnValue({toArray: jest.fn().mockResolvedValue([])}),
  };
  (cukiesDb.cukies as jest.Mock).mockResolvedValue(collection);
  return collection;
}

describe('imágenes de relaciones legacy en páginas del catálogo', () => {
  it('hidrata padres/hijos en un único batch, preservando redes, identidades, orden y documentos originales', async () => {
    const items = [
      {_id: '4000000008733', network: 'TRON', children: ['4000000015494'], parents: ['1000000000000', 'missing']},
      {_id: 'another', network: 'BSC', children: [{_id: '4000000015494', img: 'https://old.example/stale.png'}]},
    ];
    const original = JSON.stringify(items);
    const relations = [
      {_id: '4000000015494', network: 'TRON', birthNetwork: 'TRON', img: 'https://assets-staging.cukies.world/child/hash.png', skills: {generation: 2}},
      {_id: '1000000000000', network: 'BSC', birthNetwork: 'BSC', img: 'https://assets-staging.cukies.world/parent/hash.png'},
    ];
    const collection = collectionFor(items, relations);
    const result = await listLegacyMarketplaceCukies({limit: 24});
    expect(collection.find).toHaveBeenCalledTimes(2);
    expect(collection.find.mock.calls[1][0]).toEqual({_id: {$in: ['1000000000000', 'missing', '4000000015494']}});
    expect(result.items[0].children[0]).toMatchObject({id: '4000000015494', network: 'TRON', imageUrl: relations[0].img, generation: 2});
    expect(result.items[1].children[0].imageUrl).toBe(relations[0].img);
    expect(result.items[0].parents[0]).toMatchObject({id: '1000000000000', network: 'BSC', imageUrl: relations[1].img});
    expect(result.items[0].parents[1].id).toBe('missing');
    expect(JSON.stringify(items)).toBe(original);
  });

  it('no añade una consulta si la página no contiene relaciones', async () => {
    const collection = collectionFor([{_id: '42', network: 'BSC', parents: [null, null], children: []}], []);
    const result = await listLegacyMarketplaceCukies({limit: 24});
    expect(collection.find).toHaveBeenCalledTimes(1);
    expect(result.items[0].parents).toEqual([]);
  });
});
