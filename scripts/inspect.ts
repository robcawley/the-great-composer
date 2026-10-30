// Quick text dump of an arrangement for review: npx tsx scripts/inspect.ts <fixture> [texture] [complexity] [density] [bars]
import { readFileSync } from 'node:fs';
import { arrange, defaults } from '../engine/arrange';
import { PPQ } from '../engine/types';
const [file, texture = 'pad', complexity = '2', density = '5', bars = '4'] = process.argv.slice(2);
const names = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const n = (p: number) => names[p % 12] + (Math.floor(p / 12) - 1);
const project = { ...defaults(), source: readFileSync(file, 'utf8') };
const first = arrange(project);
for (const s of first.score.sections) project.sections[String(s.index)] = { texture: texture as any, density: +density, complexity: +complexity, take: 1, runs: true };
const a = arrange(project);
const barTicks = a.score.meter[0] * 4 / a.score.meter[1] * PPQ;
console.log('key', a.analysis.key.name, a.analysis.key.mode, a.analysis.confidence.toFixed(2));
a.score.chords.slice(0, 10).forEach((c, i) => console.log(c.symbol, a.analysis.chords[i].roman, a.analysis.chords[i].scaleName, 'core', a.core[i].map(n).join(' ')));
for (const part of a.parts) {
  const notes = part.notes.filter(x => x.start < +bars * barTicks);
  console.log(`\n${part.name} (${part.notes.length} notes)`);
  console.log(notes.map(x => `${(x.start / PPQ).toFixed(2)}:${n(x.pitch)}/${(x.duration / PPQ).toFixed(2)}v${x.velocity}`).join(' '));
}
const cc = a.parts[0].controls.filter(c => c.controller === 11).slice(0, 12).map(c => `${(c.tick/PPQ).toFixed(1)}=${c.value}`).join(' ');
console.log('\nCC11 Violins I', cc);
