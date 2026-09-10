jest.unmock('next/image');

import React from 'react';
import { render } from '@testing-library/react';
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
    // Keep the isolated base-path import on the same React instance as the
    // renderer; otherwise Next Image sees a second dispatcher in Jest.
    jest.doMock('react', () => React);
    let module: GameImageModule | undefined;
    jest.isolateModules(() => {
      module = require(gameImageModulePath) as GameImageModule;
    });
    if (!module) throw new Error('GameImage module did not load');
    return module;
  } finally {
    jest.dontMock('react');
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

function renderCharacterFixture(
  GameImage: GameImageModule['GameImage'],
): HTMLImageElement[] {
  const rendered = render(
    React.createElement(
      'section',
      null,
      React.createElement(GameImage, {
        src: '/assets/characters/1p.png',
        alt: 'Jugador uno',
        width: 430,
        height: 500,
        priority: true,
      }),
      React.createElement(GameImage, {
        src: '/assets/characters/2p.png',
        alt: 'Jugador dos',
        width: 430,
        height: 500,
        loading: 'lazy',
      }),
    ),
  );
  const images = Array.from(rendered.container.querySelectorAll('img'));
  rendered.unmount();
  return images;
}

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

  it.each([
    ['', '/assets/characters/'],
    ['/treasurehunt-game', '/treasurehunt-game/assets/characters/'],
  ])('renders both character assets through real Next Image (%s)', (basePath, assetPrefix) => {
    const { GameImage } = loadGameImageModule(basePath);
    const images = renderCharacterFixture(GameImage);

    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('src', `${assetPrefix}1p.png`);
    expect(images[0]).toHaveAttribute('alt', 'Jugador uno');
    expect(images[0]).toHaveAttribute('width', '430');
    expect(images[0]).toHaveAttribute('height', '500');
    expect(images[0]).not.toHaveAttribute('srcset');
    expect(images[1]).toHaveAttribute('src', `${assetPrefix}2p.png`);
    expect(images[1]).toHaveAttribute('alt', 'Jugador dos');
    expect(images[1]).toHaveAttribute('width', '430');
    expect(images[1]).toHaveAttribute('height', '500');
    expect(images[1]).not.toHaveAttribute('srcset');
    expect(images[1]).toHaveAttribute('loading', 'lazy');
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

});
