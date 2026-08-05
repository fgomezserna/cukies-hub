#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const { generateRewardsMerkle } = require('./lib/rewards-merkle.cjs');

function parseArguments(argv) {
  const args = argv.filter((argument) => argument !== '--');
  let inputPath;
  let outputPath;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--input') {
      inputPath = args[index + 1];
      index += 1;
    } else if (argument === '--output') {
      outputPath = args[index + 1];
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }

  if (!inputPath || !outputPath) {
    throw new Error('usage: rewards:merkle -- --input <json> --output <json>');
  }
  return { inputPath, outputPath };
}

function writeJsonAtomically(outputPath, value) {
  const absoluteOutputPath = path.resolve(outputPath);
  const outputDirectory = path.dirname(absoluteOutputPath);
  fs.mkdirSync(outputDirectory, { recursive: true });

  const temporaryPath = path.join(
    outputDirectory,
    `.${path.basename(absoluteOutputPath)}.${process.pid}.${Date.now()}.tmp`
  );

  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, absoluteOutputPath);
  } catch (error) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') throw cleanupError;
    }
    throw error;
  }

  return absoluteOutputPath;
}

function main() {
  const { inputPath, outputPath } = parseArguments(process.argv.slice(2));
  const input = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
  const manifest = generateRewardsMerkle(input);
  const writtenPath = writeJsonAtomically(outputPath, manifest);
  console.log(`Rewards Merkle manifest written to ${writtenPath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Unable to generate rewards Merkle manifest: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  main,
  parseArguments,
  writeJsonAtomically,
};
