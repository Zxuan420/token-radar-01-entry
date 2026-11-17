// Token Radar CLI Runner - Node 22 Standard Library Only
// Processes pre-token protocol snapshots, applies the radar-2 valuation model,
// generates ranked outputs, packages dashboard assets, and compiles dossiers.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const MODULE_DIR = fileURLToPath(new URL('.', import.meta.url));

const TEXT_BYTE_LIMIT = 65_536;
const SCREENSHOT_CONFIG = { max: 4, max_bytes: 524_288 };
const VALID_IMAGE_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function getCliFlag(flagName: string, defaultVal: string): string {
  const prefix = `--${flagName}`;
  const idx = process.argv.indexOf(prefix);
  if (idx >= 0 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1]!;
  }
  const match = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  if (match !== undefined) {
    return match.slice(flagName.length + 3);
  }
  return defaultVal;
}

const inputParam = getCliFlag('input', '/input');
const snapshotSource = inputParam.endsWith('.json') ? inputParam : join(inputParam, 'snapshot.json');

if (!existsSync(snapshotSource)) {
  process.stderr.write(`[TokenRadar] Error: Snapshot file not found at ${snapshotSource}. Provide --input <file|dir> or mount /input.\n`);
  process.exit(2);
}

const outputDir = getCliFlag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const rawData = readFileSync(snapshotSource, 'utf8');
const parsedSnapshot = parseSnapshot(rawData);
const { board, radar } = buildRadar(parsedSnapshot);

const validationError = boardIssue(board, parsedSnapshot);
if (validationError !== null) {
  process.stderr.write(`[TokenRadar] Model output rejected by gate validation: ${validationError}\n`);
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'board.json'), JSON.stringify({ rows: board }, null, 0) + '\n');
writeFileSync(join(outputDir, 'data.js'), dataScript(radar));

function transferDirectoryAssets(sourceSubdir: string, targetSubdir: string): string[] {
  const sourcePath = join(MODULE_DIR, sourceSubdir);
  if (!existsSync(sourcePath)) return [];
  const targetPath = join(outputDir, targetSubdir);
  mkdirSync(targetPath, { recursive: true });
  const transferredFiles: string[] = [];
  for (const filename of readdirSync(sourcePath)) {
    if (filename.startsWith('.')) continue;
    const fullPath = join(sourcePath, filename);
    if (!statSync(fullPath).isFile()) continue;
    copyFileSync(fullPath, join(targetPath, filename));
    transferredFiles.push(filename);
  }
  return transferredFiles;
}

transferDirectoryAssets('dashboard', 'dashboard');
const screenshotsFound = transferDirectoryAssets('screenshots', 'screenshots');

if (screenshotsFound.length < 3) {
  process.stderr.write(`[TokenRadar] Error: Found only ${screenshotsFound.length} screenshots in screenshots/ directory. Exactly 3 required.\n`);
  process.exit(1);
}

for (const imgName of screenshotsFound) {
  if (!VALID_IMAGE_PATTERN.test(imgName)) {
    process.stderr.write(`[TokenRadar] Error: Invalid screenshot filename format "${imgName}". Must match /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.\n`);
    process.exit(1);
  }
}

writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: TEXT_BYTE_LIMIT,
    screenshots: SCREENSHOT_CONFIG,
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  })
);

process.stdout.write(
  `[TokenRadar] Successfully processed ${parsedSnapshot.protocols.length} total protocols (${parsedSnapshot.watchlist.length} watchlist floor, ${board.length} ranked board rows).\n` +
    `[TokenRadar] Artifacts written to ${resolve(outputDir)}: board.json, data.js, dashboard/, screenshots/ (${screenshotsFound.length} files), and dossier.json.\n`
);
