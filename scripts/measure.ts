// npm run measure — audits every fixture, renders the Phase 1 MIDI files and rewrites the
// generated table in Measurements/Phase1-results.md. Deterministic: same code → same files.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseMidi } from 'midi-file';
import { arrange, defaults } from '../engine/arrange';
import { audit } from '../engine/audit';
import { writeMidi } from '../engine/midi';
import { parse } from '../engine/parser';
import type { Project, SectionSettings, Texture } from '../engine/types';
import { measureBlocks } from './measure-blocks';

const out = 'renders/phase1';
mkdirSync(`${out}/textures`, { recursive: true });
const fixtures = readdirSync('fixtures').filter(name => name.endsWith('.txt')).sort();
// A listening plan: each section gets a different texture so one file shows the range.
const plan: SectionSettings[] = [
  { texture: 'pad', density: 4, complexity: 2, take: 1, runs: true },
  { texture: 'ostinato', density: 6, complexity: 3, take: 1, runs: true },
  { texture: 'arpeggio', density: 8, complexity: 4, take: 1, runs: true },
  { texture: 'tremolo', density: 7, complexity: 4, take: 1, runs: true },
  { texture: 'pulses', density: 9, complexity: 5, take: 1, runs: true }
];
// Single-section fixtures get one texture that suits the meter.
const single: Record<string, SectionSettings> = {
  'compound-68.txt': { texture: 'arpeggio', density: 7, complexity: 4, take: 1, runs: true },
  'modal-lydian.txt': { texture: 'tremolo', density: 7, complexity: 4, take: 1, runs: true },
  'odd-78.txt': { texture: 'ostinato', density: 7, complexity: 4, take: 1, runs: true },
  'secondary-dominants.txt': { texture: 'pad', density: 6, complexity: 3, take: 1, runs: true },
  'waltz-34.txt': { texture: 'pulses', density: 6, complexity: 3, take: 1, runs: true }
};
const rows: string[] = [];
const midiCheck = (bytes: Uint8Array) => {
  const midi = parseMidi(bytes);
  let channels = new Set<number>(), forbidden = 0, markers = 0;
  for (const track of midi.tracks) for (const event of track) {
    if ('channel' in event) channels.add(event.channel as number);
    if (['programChange', 'sysEx', 'endSysEx'].includes(event.type) || (event.type === 'controller' && ![1, 11].includes(event.controllerType))) forbidden++;
    if (event.type === 'marker') markers++;
  }
  return { format: midi.header.format, tracks: midi.header.numTracks, channels: [...channels].map(c => c + 1).join(',') || '–', forbidden, markers };
};
function record(label: string, project: Project, file: string) {
  const arrangement = arrange(project);
  const bytes = writeMidi(arrangement);
  writeFileSync(file, bytes);
  const again = writeMidi(arrange(project));
  const deterministic = Buffer.compare(Buffer.from(bytes), Buffer.from(again)) === 0;
  const a = audit(arrangement);
  const m = midiCheck(bytes);
  rows.push(`| ${label} | ${a.notes} | ${a.outsideFull} | ${a.outsideComfortPercent}% | ${a.scaleConflicts} | ${a.approaches} | ${a.parallels} | ${a.unresolved} | ${a.runNotes} | ${a.runLandingErrors} | ${a.overlaps + a.invalidNotes} | ${m.format}/${m.tracks} | ${m.channels} | ${m.forbidden} | ${m.markers} | ${deterministic ? 'yes' : 'NO'} |`);
  return a;
}
let failures = 0;
for (const name of fixtures) {
  const source = readFileSync(`fixtures/${name}`, 'utf8');
  const project: Project = { ...defaults(), source };
  const sections = parse(source).sections;
  if (sections.length === 1) project.sections['0'] = single[name] ?? plan[1];
  else sections.forEach((section, index) => { project.sections[String(section.index)] = plan[index % plan.length]; });
  const a = record(name.replace('.txt', ''), project, `${out}/${name.replace('.txt', '.mid')}`);
  failures += a.outsideFull + a.scaleConflicts + a.parallels + a.unresolved + a.runLandingErrors + a.overlaps + a.invalidNotes;
}
const showcase = readFileSync('fixtures/dm-loop-85.txt', 'utf8');
for (const texture of ['pad', 'ostinato', 'arpeggio', 'tremolo', 'pulses'] as Texture[]) for (const complexity of [2, 4, 5]) {
  const project: Project = { ...defaults(), source: showcase };
  parse(showcase).sections.forEach(section => { project.sections[String(section.index)] = { texture, density: 7, complexity, take: 1, runs: true }; });
  const a = record(`dm-loop · ${texture} · c${complexity}`, project, `${out}/textures/dm-loop-85 - ${texture} c${complexity}.mid`);
  failures += a.outsideFull + a.scaleConflicts + a.parallels + a.unresolved + a.runLandingErrors + a.overlaps + a.invalidNotes;
}
const table = ['| Render | Notes | Out of range | Outside comfortable | Scale conflicts | Approach notes | Parallels | Unresolved | Run notes | Run landing errors | Overlaps/invalid | SMF format/tracks | Channels | Forbidden events | Markers | Deterministic |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|', ...rows].join('\n');
writeFileSync('Measurements/Phase1-results.md', `# Phase 1 — generated measurements\n\nWritten by \`npm run measure\`. Do not edit by hand.\n\nSingle-section fixtures use one texture suited to their meter (6/8 arpeggio c4, lydian tremolo c4, 7/8 ostinato c4, secondary dominants pad c3 with runs, waltz pulses c3). Multi-section fixture renders use a listening plan: section 1 pad (c2), 2 ostinato (c3), 3 arpeggio (c4), 4 tremolo (c4), 5 pulses (c5), then repeating. Texture renders apply one texture to the whole D-minor loop at density 7.\n\n${table}\n\n"Outside comfortable" is reported, not failed: extremes are allowed. Approach notes are deliberate chromatic or scale-step pickups and are excluded from scale conflicts.\n`);
console.log(table);
console.log(failures ? `\n${failures} hard failures` : '\nAll hard checks pass.');
failures += measureBlocks();
process.exitCode = failures ? 1 : 0;
