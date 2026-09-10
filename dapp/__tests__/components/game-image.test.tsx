import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

jest.unmock('next/image');

import { getImageProps, type ImageProps } from 'next/image';

type GameImageModule = typeof import('../../../games/sybil-slayer/src/components/game-image');

const gameImageModulePath = '../../../games/sybil-slayer/src/components/game-image';

function loadGameImageModule(basePath: string): GameImageModule {
  const previousBasePath = process.env.NEXT_PUBLIC_GAME_BASE_PATH;

  if (basePath) {
    process.env.NEXT_PUBLIC_GAME_BASE_PATH = basePath;
  } else {
    delete process.env.NEXT_PUBLIC_GAME_BASE_PATH;
  }

  try {
    jest.resetModules();
    let module: GameImageModule | undefined;
    jest.isolateModules(() => {
      module = require(gameImageModulePath) as GameImageModule;
    });
    if (!module) throw new Error('GameImage module did not load');
    return module;
  } finally {
    if (previousBasePath === undefined) {
      delete process.env.NEXT_PUBLIC_GAME_BASE_PATH;
    } else {
      process.env.NEXT_PUBLIC_GAME_BASE_PATH = previousBasePath;
    }
  }
}

const localImage: ImageProps = {
  src: '/assets/characters/1p.png',
  alt: 'Jugador local',
  width: 430,
  height: 500,
  priority: true,
  loading: 'eager',
};

describe('GameImage public asset boundary', () => {
  it('uses the direct prefixed asset with real Next image props', () => {
    const { resolveGameImageProps } = loadGameImageModule('/treasurehunt-game');
    const resolved = resolveGameImageProps(localImage);
    const rendered = getImageProps(resolved).props;

    expect(resolved.src).toBe('/treasurehunt-game/assets/characters/1p.png');
    expect(resolved.unoptimized).toBe(true);
    expect(resolved.priority).toBe(true);
    expect(resolved.loading).toBe('eager');
    expect(rendered.src).toBe('/treasurehunt-game/assets/characters/1p.png');
    expect(rendered.srcSet).toBeUndefined();
  });

  it('keeps the root asset when the game has no base path', () => {
    const { resolveGameImageProps } = loadGameImageModule('');
    const resolved = resolveGameImageProps(localImage);

    expect(resolved.src).toBe('/assets/characters/1p.png');
    expect(resolved.unoptimized).toBe(true);
  });

  it('does not duplicate an already prefixed asset path', () => {
    const { resolveGameImageProps } = loadGameImageModule('/treasurehunt-game');
    const resolved = resolveGameImageProps({
      ...localImage,
      src: '/treasurehunt-game/assets/characters/1p.png',
    });

    expect(resolved.src).toBe('/treasurehunt-game/assets/characters/1p.png');
    expect(resolved.unoptimized).toBe(true);
  });

  it('preserves remote, protocol-relative and statically imported sources', () => {
    const { resolveGameImageProps } = loadGameImageModule('/treasurehunt-game');
    const remote: ImageProps = { ...localImage, src: 'https://example.com/player.png' };
    const protocolRelative: ImageProps = { ...localImage, src: '//cdn.example.com/player.png' };
    const staticallyImported: ImageProps = {
      ...localImage,
      src: { src: '/assets/characters/1p.png', width: 600, height: 600 },
    };

    expect(resolveGameImageProps(remote)).toBe(remote);
    expect(resolveGameImageProps(protocolRelative)).toBe(protocolRelative);
    expect(resolveGameImageProps(staticallyImported)).toBe(staticallyImported);
    expect(resolveGameImageProps(remote).unoptimized).toBeUndefined();
    expect(resolveGameImageProps(protocolRelative).unoptimized).toBeUndefined();
    expect(resolveGameImageProps(staticallyImported).unoptimized).toBeUndefined();
  });

  it('routes every current local next/image consumer through GameImage', () => {
    const files = [
      'games/sybil-slayer/src/components/game-container.tsx',
      'games/sybil-slayer/src/components/mode-select-modal.tsx',
      'games/sybil-slayer/src/components/info-modal.tsx',
      'games/sybil-slayer/src/components/treasure-hunt-ui.tsx',
    ];

    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), '..', file), 'utf8');
      expect(source).toContain('GameImage');
      expect(source).not.toContain("from 'next/image'");
    }
  });
});
