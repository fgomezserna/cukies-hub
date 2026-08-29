import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const gameContainerSource = readFileSync(
  resolve(process.cwd(), '../games/sybil-slayer/src/components/game-container.tsx'),
  'utf8',
);
const gameCanvasSource = readFileSync(
  resolve(process.cwd(), '../games/sybil-slayer/src/components/game-canvas.tsx'),
  'utf8',
);
const assetLoaderSource = readFileSync(
  resolve(process.cwd(), '../games/sybil-slayer/src/lib/assetLoader.ts'),
  'utf8',
);
const spriteManagerSource = readFileSync(
  resolve(process.cwd(), '../games/sybil-slayer/src/lib/spriteManager.ts'),
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
const gameStylesSource = readFileSync(
  resolve(process.cwd(), '../games/sybil-slayer/src/app/globals.css'),
  'utf8',
);
const hubStylesSource = readFileSync(
  resolve(process.cwd(), 'src/app/globals.css'),
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

  it('mantiene estable el fondo del menú al desplazar el Hub en móvil', () => {
    expect(gameStylesSource).toMatch(
      /@media \(hover: none\) and \(pointer: coarse\), \(max-width: 767px\)[\s\S]*?\.th-backdrop--menu[\s\S]*?animation: none !important/,
    );
    expect(hubStylesSource).toMatch(
      /\[data-game-layout='mobile-focus'\] \[data-game-viewport\][\s\S]*?contain: paint/,
    );
    expect(hubStylesSource).toMatch(
      /\[data-game-layout='mobile-focus'\] \[data-game-viewport\] iframe[\s\S]*?transform: translateZ\(0\)/,
    );
    expect(hubStylesSource).not.toMatch(
      /\[data-game-layout='mobile-focus'\] \[data-game-viewport\] > \[data-game-landscape-surface\][^{]*\{[^}]*transform\s*:/,
    );
  });

  it('no reproduce la voz de Trump al recoger checkpoint ni Haku', () => {
    expect(gameContainerSource).not.toContain("playSound('jeff_goit')");
    expect(gameContainerSource).not.toContain("playSound('whale_chad')");
    expect(audioSource).not.toContain('jeff_goit:');
    expect(audioSource).not.toContain('whale_chad:');
  });

  it('bloquea la salida del resultado hasta recibir confirmación durable', () => {
    expect(gameContainerSource).toContain(
      'Guardando resultado… No cierres la partida.',
    );
    expect(gameContainerSource).not.toContain(
      "{ type: 'TREASURE_HUNT_RETURN_TO_MENU' }",
    );
    expect(gameContainerSource).toMatch(
      /onClick=\{handleResetClick\}[\s\S]{0,200}disabled=\{!singlePlayerResultSaved\}/,
    );
    expect(gameContainerSource).toContain(
      'advanceSinglePlayerResultSaveState(current, runId, hasPendingGameEnd)',
    );
  });

  it('mantiene el tablero azul de Treasure Hunt y evita el Hyppie legacy', () => {
    expect(gameCanvasSource).toContain(
      "gridImg.src = '/assets/ui/game-container/pantallajuego3.png'",
    );
    expect(gameCanvasSource).not.toContain(
      "gridImg.src = '/assets/ui/game-container/grid-background.png'",
    );
    expect(gameCanvasSource).not.toContain(
      "tokenImg.src = '/assets/characters/token.png'",
    );
    expect(gameCanvasSource).toContain(
      "assetLoader.getAsset('grid_background')",
    );
    expect(gameCanvasSource).toContain(
      "assetLoader.getAsset('token')",
    );
    expect(assetLoaderSource).toContain(
      "token: { path: '/assets/characters/cukiesprites/south/cukie_walk_s_01.png'",
    );
    expect(assetLoaderSource).toContain(
      "grid_background: { path: '/assets/ui/game-container/pantallajuego3.png'",
    );
    expect(assetLoaderSource).not.toContain(
      "grid_background: { path: '/assets/ui/game-container/grid-background.png'",
    );
    expect(assetLoaderSource).not.toContain(
      "path: '/assets/characters/token.png'",
    );
  });

  it('no inicia la partida hasta que los assets críticos estén realmente listos', () => {
    expect(gameContainerSource).toContain('await assetLoader.preloadCritical');
    expect(gameContainerSource).toContain('assetLoader.areCriticalAssetsLoaded()');
    expect(gameContainerSource).toContain('await spriteManager.loadGameSprites');
    expect(gameContainerSource).toContain('spriteManager.areGameSpritesLoaded()');
    expect(gameContainerSource).toContain('setAssetLoadError(');
    expect(gameContainerSource).toContain('Reintentar carga');
    expect(gameContainerSource).not.toContain('CRITICAL_ASSET_GATE_TIMEOUT_MS');
    expect(gameContainerSource).not.toContain('Promise.race([');
    expect(assetLoaderSource).toContain('Missing critical assets:');
    expect(assetLoaderSource).toContain('image.naturalWidth > 0');
    expect(gameContainerSource).toContain('singlePlayerStartAfterAssetsRef.current = true');
    expect(gameContainerSource).toMatch(
      /if \(!criticalAssetsLoaded\)[\s\S]{0,260}singlePlayerStartAfterAssetsRef\.current = true/,
    );
    expect(gameContainerSource).toMatch(
      /if \(!criticalAssetsLoaded \|\| !singlePlayerStartAfterAssetsRef\.current\) return;[\s\S]{0,160}startSinglePlayer\(\)/,
    );
  });

  it('precarga y reutiliza los sprites con concurrencia limitada y reintentos', () => {
    expect(spriteManagerSource).toContain('MAX_CONCURRENT_SPRITE_REQUESTS = 6');
    expect(spriteManagerSource).toContain('MAX_SPRITE_LOAD_ATTEMPTS = 3');
    expect(spriteManagerSource).toContain('this.acquireRequestSlot()');
    expect(spriteManagerSource).toContain('this.gameSpritesPromise = null');
    expect(gameCanvasSource).toContain(
      "spriteManager.getSpriteSheet(`token_${direction}`)",
    );
    expect(gameCanvasSource).toContain(
      "spriteManager.getSpriteSheet(`fee_${direction}`)",
    );
    expect(gameCanvasSource).toContain(
      "spriteManager.getSpriteSheet(`hacker_${direction}`)",
    );
  });

  it('precarga fallbacks visuales reales para todos los elementos iniciales', () => {
    expect(assetLoaderSource).toContain(
      "energy_point: { path: '/assets/collectibles/gemas.png'",
    );
    expect(assetLoaderSource).toContain(
      "quicksand: { path: '/assets/obstacles/arenasmovedizas2.png'",
    );
    expect(gameCanvasSource).toContain("feeImgRef.current = assetLoader.getAsset('fee')");
    expect(gameCanvasSource).toContain(
      "quicksandImgRef.current = assetLoader.getAsset('quicksand')",
    );
    expect(gameCanvasSource).toContain(
      "const loadedEnergyImg = assetLoader.getAsset('energy_point')",
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
      /isHubViewVisible \|\| localControlsLocked \|\| gameState\.status !== 'playing'[\s\S]{0,500}pauseGame\(\)/,
    );
  });

  it('muestra las reglas por encima y conserva el menú de pausa al cerrarlas', () => {
    expect(gameContainerSource).toContain(
      "currentStatus === 'playing'",
    );
    expect(gameContainerSource).toMatch(
      /currentStatus === 'playing'[\s\S]{0,180}pauseGame\(\)/,
    );
    expect(gameContainerSource).toContain(
      "gameState.status === 'paused' && !isInfoModalOpen",
    );
  });

  it('no cuenta el tiempo en pausa dentro de la evidencia de competición', () => {
    expect(gameContainerSource).toContain('getPausableGameTime() - startedAt');
    expect(gameContainerSource).toContain('const gameTime = getActiveGameTimeMs()');
    expect(gameContainerSource).not.toContain('Date.now() - gameState.gameStartTime');
  });

  it('finaliza una partida iniciada antes de permitir volver al menú', () => {
    expect(gameContainerSource).toMatch(
      /gameState\.status === 'playing' \|\| gameState\.status === 'paused'[\s\S]{0,120}forceGameOver\('manual'\)/,
    );
    expect(gameContainerSource).toContain('Finalizar partida');
  });

  it('conserva los assets entre despliegues y versiona solo el shell', () => {
    expect(pwaSetupSource).toContain('NEXT_PUBLIC_GAME_CACHE_VERSION');
    expect(pwaSetupSource).toContain("`${gamePublicPath('/sw.js')}?v=${cacheVersion}`");
    expect(pwaSetupSource).toContain('scope: gameServiceWorkerScope()');
    expect(serviceWorkerSource).toContain(
      "new URL(self.location.href).searchParams.get('v')",
    );
    expect(serviceWorkerSource).toContain(
      'new URL(self.registration.scope).pathname',
    );
    expect(serviceWorkerSource).toContain(
      "const ASSET_CACHE_NAME = 'treasure-hunt-assets-v1'",
    );
    expect(serviceWorkerSource).toContain(
      "const SHELL_CACHE_NAME = `${SHELL_CACHE_PREFIX}-${CACHE_VERSION}`",
    );
    expect(serviceWorkerSource).toContain(
      "cacheName.startsWith(LEGACY_CACHE_PREFIX)",
    );
    expect(serviceWorkerSource).toContain(
      'await assetCache.put(request, response)',
    );
    expect(serviceWorkerSource).toContain('staleWhileRevalidate');
    expect(serviceWorkerSource).toContain(
      "pathWithinScope(requestUrl.pathname).startsWith('/assets/')",
    );
    expect(serviceWorkerSource).toContain(
      "pathWithinScope(requestUrl.pathname).startsWith('/_next/static/')",
    );
    expect(serviceWorkerSource).toContain(
      'staleWhileRevalidate(event, ASSET_CACHE_NAME)',
    );
    expect(serviceWorkerSource).toContain(
      'staleWhileRevalidate(event, SHELL_CACHE_NAME)',
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
