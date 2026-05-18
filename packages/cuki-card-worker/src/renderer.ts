import fs from 'node:fs/promises';
import path from 'node:path';

import Jimp from 'jimp';

import type { CardWorkerConfig, CukiDocument, CukiSkills, RenderResult } from './types.js';

const idFontsByGeneration = new Map<number, string>([
  [1, 'fonts/Mitr/Regular/Purple/20/Xg_2ExwkkfDZg3xOD9D_QPn9.ttf.fnt'],
  [2, 'fonts/Mitr/Regular/White/20/6q99RXUafhjt5UTXiHstaR2W.ttf.fnt'],
]);

const statsFontPath = 'fonts/Mitr/SemiBold/36/wCB31JsU8xWl0auEcHNcKxzZ.ttf.fnt';
const skillsFontPath = 'fonts/Mitr/SemiBold/50/MziT1_JbUu1_X3L_EMti22bq.ttf.fnt';

type SkillKey = keyof Pick<CukiSkills, 'miner' | 'engineer' | 'farmer' | 'gatherer' | 'scout' | 'breeder'>;

const skillPositions: Array<{ key: SkillKey; filledX: number; zeroX: number }> = [
  { key: 'miner', filledX: 119, zeroX: 114 },
  { key: 'engineer', filledX: 221, zeroX: 216 },
  { key: 'farmer', filledX: 320.5, zeroX: 317 },
  { key: 'gatherer', filledX: 422, zeroX: 418 },
  { key: 'scout', filledX: 522.5, zeroX: 519 },
  { key: 'breeder', filledX: 624, zeroX: 620 },
];

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function requiredNumber(value: unknown, fieldName: string) {
  const parsed = asNumber(value, Number.NaN);

  if (!Number.isFinite(parsed)) {
    throw new Error(`El Cuki no tiene un valor valido para ${fieldName}.`);
  }

  return parsed;
}

async function assertReadable(filePath: string, description: string) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`No se encuentra ${description}: ${filePath}`);
  }
}

function fontPath(config: CardWorkerConfig, relativePath: string) {
  return path.join(config.assetsDir, relativePath);
}

function outputPath(config: CardWorkerConfig, tokenId: string) {
  return path.join(config.outputDir, `${tokenId}.png`);
}

export async function renderCukiCard(cuki: CukiDocument, config: CardWorkerConfig): Promise<RenderResult> {
  const tokenId = cuki._id || cuki.tokenId;

  if (!tokenId) {
    throw new Error('El documento de Cuki no tiene _id ni tokenId.');
  }

  const skills = cuki.skills ?? {};
  const generation = requiredNumber(skills.generation, 'skills.generation');
  const type = requiredNumber(cuki.type, 'type');
  const idFontRelativePath = idFontsByGeneration.get(generation);

  if (!idFontRelativePath) {
    throw new Error(`Generacion no soportada para cards: ${generation}.`);
  }

  const backgroundPath = path.join(config.assetsDir, `backgrounds/Gen${generation}/1920/${type}.png`);
  const idFontPath = fontPath(config, idFontRelativePath);
  const statsFontFullPath = fontPath(config, statsFontPath);
  const skillsFontFullPath = fontPath(config, skillsFontPath);
  const renderedOutputPath = outputPath(config, tokenId);

  await Promise.all([
    assertReadable(backgroundPath, 'el fondo de card'),
    assertReadable(idFontPath, 'la fuente de id'),
    assertReadable(statsFontFullPath, 'la fuente de stats'),
    assertReadable(skillsFontFullPath, 'la fuente de skills'),
    fs.mkdir(path.dirname(renderedOutputPath), { recursive: true }),
  ]);

  const [image, idFont, statsFont, skillsFont] = await Promise.all([
    Jimp.read(backgroundPath),
    Jimp.loadFont(idFontPath),
    Jimp.loadFont(statsFontFullPath),
    Jimp.loadFont(skillsFontFullPath),
  ]);

  image.scale(0.6);

  const idX = tokenId.length >= 15 ? 258 : 274;
  image.print(idFont, idX, 136, `#${tokenId}`);

  image.print(
    statsFont,
    200,
    840,
    {
      text: String(asNumber(skills.life)),
      alignmentX: Jimp.HORIZONTAL_ALIGN_RIGHT,
    },
    150,
    50,
  );
  image.print(
    statsFont,
    510,
    840,
    {
      text: String(asNumber(skills.energy)),
      alignmentX: Jimp.HORIZONTAL_ALIGN_RIGHT,
    },
    150,
    50,
  );

  for (const position of skillPositions) {
    const value = asNumber(skills[position.key]);
    image.print(skillsFont, value !== 0 ? position.filledX : position.zeroX, 983, String(value));
  }

  await image.writeAsync(renderedOutputPath);

  return {
    tokenId,
    outputPath: renderedOutputPath,
    width: image.bitmap.width,
    height: image.bitmap.height,
  };
}
