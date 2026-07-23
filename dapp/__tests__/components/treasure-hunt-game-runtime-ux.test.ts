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

describe('contrato UX del runtime de Treasure Hunt', () => {
  it('usa la etiqueta solicitada para el modo 1 vs 1 aún deshabilitado', () => {
    expect(gameContainerSource).toContain("const multiplayerMenuLabel = 'JUGAR 1 VS 1'");
    expect(gameContainerSource).not.toContain('1V1 NO DISPONIBLE');
  });

  it('no reproduce la voz de Trump al recoger checkpoint ni Haku', () => {
    expect(gameContainerSource).not.toContain("playSound('jeff_goit')");
    expect(gameContainerSource).not.toContain("playSound('whale_chad')");
    expect(audioSource).not.toContain('jeff_goit:');
    expect(audioSource).not.toContain('whale_chad:');
  });

  it('reinicia una partida 1P directamente desde ambos resultados', () => {
    expect(gameContainerSource).toMatch(
      /void startSinglePlayer\(\)[\s\S]{0,900}Jugar de nuevo/,
    );
    expect(gameContainerSource).toMatch(
      /Play Again[\s\S]{0,900}void startSinglePlayer\(\)/,
    );
  });
});
