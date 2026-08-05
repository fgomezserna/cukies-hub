import { resolveIndexerDbName } from '@/lib/indexer-db/name';

describe('indexer DB name guard', () => {
  it('defaults to the new hub database', () => {
    expect(resolveIndexerDbName(undefined)).toBe('cukieshub-new');
  });

  it('trims configured names', () => {
    expect(resolveIndexerDbName('  cukieshub-preview  ')).toBe('cukieshub-preview');
  });

  it('rejects empty database names', () => {
    expect(() => resolveIndexerDbName('   ')).toThrow('no puede estar vacio');
  });

  it('rejects the legacy cukies database as operational indexer target', () => {
    expect(() => resolveIndexerDbName('Cukies')).toThrow('base legacy `cukies`');
  });
});
