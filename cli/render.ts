import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { arrange, defaults } from '../engine/arrange';
import { writeMidi } from '../engine/midi';
import { arrangeSong, loadSong } from '../engine/blocks';

try {
  const args = process.argv.slice(2);
  if (args[0] === 'render') args.shift();
  const input = args[0];
  const outputIndex = args.indexOf('-o');
  if (!input || outputIndex < 1 || !args[outputIndex + 1]) throw new Error('Usage: npx tgc render <project.json|progression.txt> -o out.mid');
  const content = await readFile(input, 'utf8');
  const arrangement = input.endsWith('.json') ? arrangeSong(loadSong(JSON.parse(content))) : arrange({ ...defaults(), source: content });
  const output = args[outputIndex + 1];
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, writeMidi(arrangement));
  console.log(`Rendered ${arrangement.parts.length} string parts · ${arrangement.score.chords.length} chords → ${output}`);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
