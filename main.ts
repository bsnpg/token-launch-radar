// token-launch-radar: read the sealed DefiLlama snapshot, rank the protocols
// that still record no token by what their launch would be worth, and write
// the ranked board, the dashboard's data, the dashboard itself and the
// judge's dossier into the output directory.
//
// Run it from the repository root:
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
//
// The snapshot comes from --input; with no --input it defaults to the
// sealed snapshot the grader mounts at /input/snapshot.json
// (MAKEFUN_INPUT_DIR in the environment, /input when that is unset).
// The output directory comes from the MAKEFUN_OUTPUT_DIR environment
// variable and falls back to "out".

import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier, canonicalJson } from './vendor/makefun-board.ts';

// The dossier's text cap, and the caps the gate holds the dashboard and the
// screenshots to: at most 4 screenshots of 512 KiB, at most 400 dashboard
// files of 4 MiB in all.
const TEXT_LIMIT = 65536;
const SHOT_LIMIT = 512 * 1024;
const SHOT_COUNT = 4;
const DASH_LIMIT_FILES = 400;
const DASH_LIMIT_BYTES = 4 * 1024 * 1024;

function inputPath(argv: string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && i + 1 < argv.length) return argv[i + 1] as string;
    if ((argv[i] as string).startsWith('--input=')) return (argv[i] as string).slice('--input='.length);
  }
  return null;
}

function fail(message: string): never {
  console.error(`token radar: ${message}`);
  process.exit(1);
}

// Copy every file of one directory into another, in name order.
function copyDir(src: string, dst: string, keep: (name: string) => boolean): string[] {
  const names = readdirSync(src).filter(keep).sort();
  for (const name of names) cpSync(join(src, name), join(dst, name));
  return names;
}

function main(): void {
  // The grader runs `node /bot/main.ts` with no arguments: the sealed
  // snapshot is at /input/snapshot.json (MAKEFUN_INPUT_DIR in the env).
  // --input still overrides it for local runs.
  const input = inputPath(process.argv.slice(2))
    ?? join(process.env.MAKEFUN_INPUT_DIR ?? '/input', 'snapshot.json');
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || 'out';
  const root = fileURLToPath(new URL('.', import.meta.url));

  const snapshot = parseSnapshot(readFileSync(input, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const problem = boardIssue(board, snapshot);
  if (problem !== null) fail(`board refused: ${problem}`);

  const dashOut = join(outDir, 'dashboard');
  const shotsOut = join(outDir, 'screenshots');
  mkdirSync(dashOut, { recursive: true });
  mkdirSync(shotsOut, { recursive: true });

  writeFileSync(join(outDir, 'board.json'), `${canonicalJson({ rows: board })}\n`, 'utf8');
  writeFileSync(join(outDir, 'data.js'), dataScript(radar), 'utf8');

  const dashFiles = copyDir(join(root, 'dashboard'), dashOut, (f) => f.endsWith('.html') || f.endsWith('.css') || f.endsWith('.js'));
  const shotFiles = copyDir(join(root, 'screenshots'), shotsOut, (f) => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'));

  const dossier = buildDossier(outDir, {
    text_max_bytes: TEXT_LIMIT,
    screenshots: { max: SHOT_COUNT, max_bytes: SHOT_LIMIT },
    dashboard: { max_files: DASH_LIMIT_FILES, max_bytes: DASH_LIMIT_BYTES },
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  console.log(`token radar: snapshot holds ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist`);
  console.log(`token radar: board scored ${board.length} rows (${radar.early_size} early, ${radar.live_size} live set aside)`);
  console.log(`token radar: wrote board.json, data.js, dashboard/ (${dashFiles.length} files), screenshots/ (${shotFiles.length} images), dossier.json into ${outDir}`);
}

try {
  main();
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
