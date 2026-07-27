import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const gameContainerSource = readFileSync(
  resolve(process.cwd(), '../games/sybil-slayer/src/components/game-container.tsx'),
  'utf8',
);
const audioSource = readFileSync(
  resolve(process.cwd(), '../games/sybil-slayer/src/hooks/useAudio.ts'),
  'utf8',
);
const treasureHuntPageSource = readFileSync(
  resolve(process.cwd(), 'src/components/games/treasure-hunt-game-view.tsx'),
  'utf8',
);
const serviceWorkerSource = readFileSync(
  resolve(process.cwd(), '../games/sybil-slayer/public/sw.js'),
  'utf8',
);
const pwaSetupSource = readFileSync(
  resolve(process.cwd(), '../games/sybil-slayer/src/components/pwa-setup.tsx'),
  'utf8',
);
const treasureHuntProfilePageSource = readFileSync(
  resolve(process.cwd(), 'src/app/(app)/games/treasure-hunt/profile/page.tsx'),
  'utf8',
);
const headerSource = readFileSync(
  resolve(process.cwd(), 'src/components/layout/header.tsx'),
  'utf8',
);

describe('contrato UX del runtime de Treasure Hunt', () => {
  it('usa la etiqueta solicitada para el modo 1 vs 1 aún deshabilitado', () => {
    expect(gameContainerSource).toContain("const multiplayerMenuLabel = 'JUGAR 1 VS 1'");
    expect(gameContainerSource).not.toContain('1V1 NO DISPONIBLE');
  });

  it('renombra solo la ayuda situada bajo JUGAR 1 VS 1', () => {
    expect(gameContainerSource).toContain('CÓMO JUGAR');
    expect(gameContainerSource).not.toContain('La sesión anterior caducó y se está renovando');
  });

  it('recupera silenciosamente una GameSession caducada', () => {
    expect(gameContainerSource).toContain(
      "access.reason === 'GAME_SESSION_RESTART_REQUIRED'",
    );
    expect(gameContainerSource).toContain(
      'const retry = window.setTimeout(() => void startSinglePlayer(), 0)',
    );
  });

  it('permite el runtime en portrait y reduce el coste de render móvil', () => {
    expect(gameContainerSource).not.toContain('<OrientationOverlay');
    expect(gameContainerSource).toContain('isMobile ? MOBILE_FPS : FPS');
  });

  it('no reproduce la voz de Trump al recoger checkpoint ni Haku', () => {
    expect(gameContainerSource).not.toContain("playSound('jeff_goit')");
    expect(gameContainerSource).not.toContain("playSound('whale_chad')");
    expect(audioSource).not.toContain('jeff_goit:');
    expect(audioSource).not.toContain('whale_chad:');
  });

  it('mantiene el guardado durable en segundo plano sin bloquear el resultado', () => {
    expect(gameContainerSource).not.toContain('Guardando resultado…');
    expect(gameContainerSource).toContain(
      "{ type: 'TREASURE_HUNT_RETURN_TO_MENU' }",
    );
    expect(gameContainerSource).toMatch(
      /onClick=\{returnToTreasureHuntMenu\}[\s\S]{0,500}Volver al menú/,
    );
    expect(treasureHuntPageSource).toContain(
      "event.data?.type === 'TREASURE_HUNT_RETURN_TO_MENU'",
    );
    expect(treasureHuntPageSource).toContain(
      "window.location.assign('/games/treasure-hunt')",
    );
  });

  it('pausa el juego cuando su vista persistente queda oculta', () => {
    expect(gameContainerSource).toContain(
      "event.data?.type === 'TREASURE_HUNT_VIEW_VISIBILITY'",
    );
    expect(gameContainerSource).toContain(
      "Vista del juego oculta en el Hub - Pausando partida",
    );
    expect(gameContainerSource).toMatch(
      /isHubViewVisible \|\| localControlsLocked \|\| gameState\.status !== 'playing'[\s\S]{0,500}togglePause\(\)/,
    );
  });

  it('usa caché estática versionada y stale-while-revalidate', () => {
    expect(pwaSetupSource).toContain('NEXT_PUBLIC_GAME_CACHE_VERSION');
    expect(pwaSetupSource).toContain('`/sw.js?v=${cacheVersion}`');
    expect(serviceWorkerSource).toContain(
      "new URL(self.location.href).searchParams.get('v')",
    );
    expect(serviceWorkerSource).toContain('staleWhileRevalidate');
    expect(serviceWorkerSource).toContain("requestUrl.pathname.startsWith('/assets/')");
    expect(serviceWorkerSource).toContain(
      "requestUrl.pathname.startsWith('/_next/static/')",
    );
    expect(serviceWorkerSource).not.toContain('cache.put(event.request, responseToCache)');
  });

  it('redirige Mi perfil al perfil propio de Treasure Hunt y simplifica su cabecera', () => {
    expect(headerSource).toContain(
      "isGameOverlay ? '/games/treasure-hunt/profile' : '/profile'",
    );
    expect(treasureHuntProfilePageSource).not.toContain(
      'Gestiona el alias con el que apareces en la clasificación.',
    );
  });
});
