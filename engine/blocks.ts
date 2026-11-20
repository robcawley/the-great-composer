import { arrange, arrangeScore, defaults, loadProject } from './arrange';
import { emotions, createSong } from './emotions';
import { parseChord, pitchClass } from './parser';
import { modes, scaleNames } from './scales';
import { analyse, names } from './theory';
import { candidates, parallelPerfect, parallelsMatter, resolutions, voiceLead, voicingPenalty } from './voice-leading';
import { blockKey, registerStyle, sectionNames, stringParts, type Block, type DegreeChord, type Song } from './song';
import { mod, partChoices, PPQ, type Analysis, type Arrangement, type Key, type Project, type Score } from './types';
import { harmonicRhythms } from './harmonic-rhythm';

export function chordFor(chord: DegreeChord, key: Key): ReturnType<typeof parseChord> {
  const scale = modes[key.mode];
  const index = (chord.degree - 1) % scale.length;
  const root = mod(key.root + (chord.alter === undefined ? scale[index] : modes.major[chord.degree - 1] + chord.alter));
  const thirds = [0,2,4].map(offset => mod(scale[(index + offset) % scale.length] - scale[index]));
  let suffix = thirds[1] === 3 ? thirds[2] === 6 ? 'dim' : 'm' : thirds[1] === 4 && thirds[2] === 8 ? 'aug' : '';
  if (chord.quality) suffix = chord.quality === 'major' ? '' : chord.quality === 'minor' ? 'm' : '7';
  if (chord.spice === 'softer') suffix = 'sus4';
  if (chord.spice === 'richer') suffix = suffix === 'm' ? 'm7' : suffix === 'dim' ? 'm7b5' : suffix === 'aug' ? 'aug' : suffix === '7' ? '9' : 'add9';
  if (chord.spice === 'darker') suffix = 'm';
  if (chord.spice === 'brighter') suffix = '';
  if (chord.spice === 'lean') suffix = '5';
  const pedal = chord.pedal === undefined ? '' : `/${names[mod(key.root + scale[(chord.pedal - 1) % scale.length])]}`;
  return parseChord(names[root] + suffix + pedal);
}
export function friendlyChord(chord: DegreeChord, key: Key): string {
  const actual = chordFor(chord,key);
  const quality = actual.quality === '5' ? 'bold' : actual.quality.includes('sus') ? 'soft' : actual.quality.startsWith('m') && !actual.quality.startsWith('maj') ? 'warm' : actual.quality.includes('dim') ? 'restless' : actual.quality.includes('9') ? 'rich' : 'open';
  return `${names[actual.root]} · ${quality}`;
}
export function buildScore(song: Song): { score: Score; keys: Key[]; project: Project } {
  const project = { ...defaults(), take: song.take, controllers: song.controllers, articulationNames: song.articulationNames };
  const barTicks = song.meter[0] * 4 / song.meter[1] * PPQ;
  const score: Score = { tempo: song.tempo, meter: [...song.meter], key: song.key, chords: [], sections: [], duration: song.blocks.length * 4 * barTicks };
  const keys: Key[] = [];
  for (const [index,block] of song.blocks.entries()) {
    const key = blockKey(song,block); keys.push(key);
    score.sections.push({ name: block.section, start: index * 4 * barTicks, end: (index + 1) * 4 * barTicks, index });
    project.sections[index] = { texture: block.texture, density: block.energy, complexity: block.complexity, take: block.take, runs: block.runs || block.bigEntrance, seed: block.id, curve: block.curve, exitRuns: block.runs || block.bigEntrance, bigEntrance: block.bigEntrance, ...(song.parts ? { parts: { ...song.parts } } : {}) };
    for (const [barIndex,bar] of block.bars.entries()) for (const [slot,chord] of bar.chords.entries()) {
      if (bar.hold && slot === 0) continue;
      const weights = bar.weights ?? bar.chords.map(() => 1);
      const fraction = weights.slice(0,slot).reduce((sum,value) => sum + value,0) / weights.reduce((sum,value) => sum + value,0);
      const start = Math.max(0,Math.round((index * 4 + barIndex) * barTicks + fraction * barTicks - (bar.push ? PPQ / 2 : 0)));
      const previous = score.chords.at(-1);
      if (previous) previous.duration = start - previous.start;
      score.chords.push({ ...chordFor(chord,key), start, duration: 0, bar: index * 4 + barIndex, section: index });
    }
  }
  score.chords.at(-1)!.duration = score.duration - score.chords.at(-1)!.start;
  if (score.chords.some(chord => chord.duration <= 0)) throw new Error('Those pushes put two changes on top of each other. Turn off Push or choose a wider chord rhythm.');
  if (song.blocks.length > 1 && score.sections.some(section => score.chords.filter(chord => chord.section === section.index).length < 3)) throw new Error('Keep one more chord change in this block so its edges can connect. Split a bar or choose another chord rhythm.');
  return { score, keys, project };
}
const coreCache = new Map<string, number[][]>();
const joinCache = new Map<string, number[][]>();
function blockCores(score: Score, song: Song): number[][] {
  const core: number[][] = [];
  for (const [index,block] of song.blocks.entries()) {
    const chords = score.chords.filter(chord => chord.section === index);
    const style = registerStyle(block.register);
    const cacheKey = JSON.stringify([style,chords.map(chord => [chord.root,chord.bass,chord.quality])]);
    let local = coreCache.get(cacheKey);
    if (!local) {
      local = voiceLead({ ...score, chords },style);
      if (coreCache.size > 2048) coreCache.clear();
      coreCache.set(cacheKey,local);
    }
    core.push(...local.map(voices => [...voices]));
  }
  const valid = (index: number, previous: number[], current: number[]) => (!parallelsMatter(score.chords[index - 1],score.chords[index]) || !parallelPerfect(previous,current)) && resolutions(score.chords[index - 1],score.chords[index],previous,current);
  const motion = (previous: number[], current: number[]) => current.reduce((sum,pitch,voice) => sum + Math.abs(pitch - previous[voice]) + Math.max(0,Math.abs(pitch - previous[voice]) - 7) * 3,0);
  for (let index = 1; index < score.chords.length; index++) {
    if (score.chords[index].section === score.chords[index - 1].section) continue;
    const left = score.chords[index - 1];
    const right = score.chords[index];
    const joinKey = JSON.stringify([score.chords.slice(index - 2,index + 2).map(chord => [chord.root,chord.bass,chord.quality]),core[index - 2],core[index + 1],song.blocks[left.section].register,song.blocks[right.section].register]);
    const cached = joinCache.get(joinKey);
    if (cached) { core[index - 1] = [...cached[0]]; core[index] = [...cached[1]]; continue; }
    const leftOptions = candidates(left,registerStyle(song.blocks[left.section].register)).filter(option => valid(index - 1,core[index - 2],option));
    const rightOptions = candidates(right,registerStyle(song.blocks[right.section].register)).filter(option => valid(index + 1,option,core[index + 1]));
    let best: { cost: number; left: number[]; right: number[] } | undefined;
    for (const first of leftOptions) for (const second of rightOptions) {
      if (!valid(index,first,second)) continue;
      const cost = motion(core[index - 2],first) + motion(first,second) + motion(second,core[index + 1]) + voicingPenalty(left,first) + voicingPenalty(right,second);
      if (!best || cost < best.cost) best = { cost, left: first, right: second };
    }
    if (!best) throw new Error(`These two blocks need a different joining chord. Try dice on ${song.blocks[right.section].section}.`);
    if (joinCache.size > 2048) joinCache.clear();
    joinCache.set(joinKey,[best.left,best.right]);
    core[index - 1] = best.left; core[index] = best.right;
  }
  return core;
}
export function arrangeSong(song: Song): Arrangement {
  if (song.expert) return arrange(song.expert);
  const { score,keys,project } = buildScore(song);
  const analysis: Analysis = { key: song.key, confidence: 1, sections: keys.map(key => ({ key, confidence: 1 })), chords: [] };
  for (const [index,key] of keys.entries()) {
    const chords = score.chords.filter(chord => chord.section === index);
    const local = analyse({ ...score, key, sections: [{ name: song.blocks[index].section, start: chords[0].start, end: chords.at(-1)!.start + chords.at(-1)!.duration, index: 0 }], chords: chords.map(chord => ({ ...chord, section: 0 })) },key);
    for (const [chordIndex,chord] of chords.entries()) {
      const description = local.chords[chordIndex];
      if (!description.scale.includes(chord.bass)) { description.scale.push(chord.bass); description.scaleNotes.push(names[chord.bass]); description.explanation += ' The written pedal bass is retained as an additional colour.'; }
      analysis.chords.push(description);
    }
  }
  const result = arrangeScore(project,score,analysis,blockCores(score,song));
  result.markers = score.sections.filter((section,index) => index === 0 || score.sections[index - 1].name !== section.name).map(section => ({ name: section.name, start: section.start }));
  return result;
}
export function songText(song: Song): string {
  if (song.expert) return song.expert.source;
  return `tempo ${song.tempo}\nmeter ${song.meter.join('/')}\nkey ${song.key.name} ${song.key.mode}\n` + song.blocks.map(block => {
    const key = blockKey(song,block);
    return `# Block home: ${key.name} ${key.mode}\n[${block.section}] | ${block.bars.map(bar => {
      if (bar.hold && bar.chords.length === 1) return '~';
      if (bar.chords.length === 1) return (bar.push ? '^' : '') + chordFor(bar.chords[0],key).symbol;
      const weights = bar.weights ?? [1,1];
      return bar.chords.map((chord,index) => `${bar.push ? '^' : ''}${bar.hold && index === 0 ? '~' : chordFor(chord,key).symbol}@${Number((weights[index] / (weights[0] + weights[1]) * song.meter[0]).toFixed(6))}`).join(' ');
    }).join(' | ')} |`;
  }).join('\n');
}
export function loadSong(value: unknown): Song {
  if (!value || typeof value !== 'object') throw new Error('Choose a valid saved project');
  if ((value as { version?: number }).version === 1) {
    const song = createSong(); song.expert = loadProject(value); return song;
  }
  const song = value as Song;
  const integer = (value: unknown, low: number, high: number) => Number.isSafeInteger(value) && Number(value) >= low && Number(value) <= high;
  const keyValid = (key: Key) => key && integer(key.root,0,11) && typeof key.name === 'string' && /^[A-G][#b]?$/.test(key.name) && pitchClass(key.name) === key.root && scaleNames.includes(key.mode);
  if (song.version !== 2 || !keyValid(song.key) || !integer(song.tempo,20,300) || !Array.isArray(song.meter) || !['2/4','3/4','4/4','5/4','6/8','7/8','9/8','12/8'].includes(song.meter.join('/')) || song.ensemble !== 'strings' || !integer(song.take,1,1e9) || !integer(song.nextId,1,1e9) || typeof song.controllers !== 'boolean' || typeof song.articulationNames !== 'boolean' || !Array.isArray(song.blocks) || song.blocks.length < 1 || song.blocks.length > 128) throw new Error('Invalid song settings');
  if ((song.keyLocked !== undefined && typeof song.keyLocked !== 'boolean') || (song.parts !== undefined && (typeof song.parts !== 'object' || Object.entries(song.parts).some(([name,choice]) => !(stringParts as readonly string[]).includes(name) || !partChoices.includes(choice!))))) throw new Error('Invalid song settings');
  const ids = new Set<string>();
  for (const block of song.blocks) {
    if (!block || typeof block.id !== 'string' || !/^block-\d+$/.test(block.id) || ids.has(block.id) || Number(block.id.slice(6)) >= song.nextId || !sectionNames.includes(block.section) || !Object.hasOwn(emotions,block.emotion) || (block.key !== 'same' && !keyValid(block.key)) || !integer(block.energy,1,10) || !integer(block.complexity,1,5) || !integer(block.take,1,1e9) || !['pad','ostinato','arpeggio','tremolo','pulses'].includes(block.texture) || !['low','middle','high'].includes(block.register) || !['steady','pulse','swell'].includes(block.curve) || (block.rhythm !== undefined && !harmonicRhythms.some(rhythm => rhythm.value === block.rhythm)) || [block.runs,block.bigEntrance,block.locked].some(flag => typeof flag !== 'boolean') || !Array.isArray(block.bars) || block.bars.length !== 4) throw new Error('Invalid four-bar block');
    ids.add(block.id);
    for (const bar of block.bars) {
      if (!bar || !Array.isArray(bar.chords) || ![1,2].includes(bar.chords.length) || typeof bar.push !== 'boolean' || (bar.hold !== undefined && typeof bar.hold !== 'boolean') || (bar === block.bars[0] && bar.hold) || (bar.weights !== undefined && (!Array.isArray(bar.weights) || bar.weights.length !== bar.chords.length || bar.weights.some(value => typeof value !== 'number' || !Number.isFinite(value) || value <= 0)))) throw new Error('Invalid bar');
      for (const chord of bar.chords) if (!chord || !integer(chord.degree,1,7) || (chord.alter !== undefined && !integer(chord.alter,-1,1)) || !['plain','softer','richer','darker','brighter','lean'].includes(chord.spice) || (chord.quality !== undefined && !['major','minor','dominant'].includes(chord.quality)) || (chord.pedal !== undefined && !integer(chord.pedal,1,7))) throw new Error('Invalid chord choice');
    }
  }
  if (song.expert) loadProject(song.expert);
  buildScore(song);
  return structuredClone(song);
}
