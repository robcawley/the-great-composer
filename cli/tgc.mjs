#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const result = spawnSync(process.execPath, ['--import', fileURLToPath(import.meta.resolve('tsx')), fileURLToPath(new URL('./render.ts', import.meta.url)), ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
