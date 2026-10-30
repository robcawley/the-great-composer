import { mod, type Mode, type Texture } from './types';
import { blockKey, type Block, type Curve, type DegreeChord, type Register, type Song } from './song';
import { applyRhythm } from './harmonic-rhythm';

interface Bank { chords: DegreeChord[]; endsPull: boolean }
interface Emotion {
  label: string; icon: string; colour: string; preferred: Mode[]; bank: Bank[];
  texture: Texture; energy: number; complexity: number; register: Register; runs: boolean; curve: Curve;
}
const plain = (degree: number): DegreeChord => ({ degree, spice: 'plain' });
function bank(patterns: number[][], spice: DegreeChord['spice'] = 'plain', colour = false): Bank[] {
  return patterns.map((degrees,index) => ({ chords: degrees.map((degree,slot) => ({ ...plain(degree), spice: patterns === wistful && index === 0 && slot === 1 ? 'darker' : slot === 0 || slot === 2 ? spice : 'plain', ...(colour && index % 3 === 2 && slot === 1 ? { degree: 2, alter: -1, quality: 'major' as const } : {}), ...(colour && index % 2 === 1 && slot < 3 ? { pedal: 1 } : {}) })), endsPull: degrees[3] === 5 || degrees[3] === 7 }));
}
const opening = [[1,5,6,4],[1,3,4,5],[4,1,5,6],[1,6,4,5],[1,4,2,5],[6,4,1,5],[1,2,4,1],[4,5,1,1]];
const inward = [[1,6,3,7],[1,4,6,5],[6,7,1,1],[1,3,7,4],[1,7,6,5],[4,6,1,5],[1,6,4,1],[6,3,4,5]];
const suspense = [[1,2,1,5],[1,4,2,5],[6,2,5,1],[1,7,2,5],[1,6,2,1],[4,2,1,5],[1,3,2,7],[2,1,4,5]];
const floating = [[1,2,4,1],[4,1,2,1],[1,6,2,5],[1,3,2,4],[6,2,1,1],[1,4,1,2],[4,2,6,5],[1,2,5,1]];
const wistful = [[4,4,1,5],[1,6,4,1],[4,1,3,6],[1,3,4,5],[6,4,1,5],[4,2,1,1],[1,7,4,5],[6,3,4,1]];
const emotion = (label: string, icon: string, colour: string, preferred: Mode[], patterns: number[][], texture: Texture, energy: number, complexity: number, register: Register, runs: boolean, curve: Curve, spice: DegreeChord['spice'] = 'plain', colourChords = false): Emotion =>
  ({ label, icon, colour, preferred, bank: bank(patterns,spice,colourChords), texture, energy, complexity, register, runs, curve });
export const emotions: Record<string, Emotion> = {
  calm: emotion('Calm','≈','#8abdb1',['major','dorian'],opening,'pad',3,1,'middle',false,'steady','richer'),
  hopeful: emotion('Hopeful','↗','#c9d58b',['major','dorian'],opening,'arpeggio',5,3,'middle',true,'swell'),
  tender: emotion('Tender','♡','#dfb3c0',['major','minor'],wistful,'pad',3,2,'middle',false,'swell','richer'),
  sad: emotion('Sad','☂','#8fa7cd',['minor','harmonic minor'],inward,'pad',4,2,'low',true,'swell'),
  lonely: emotion('Lonely','☾','#a5a3ca',['minor','dorian'],inward,'arpeggio',2,2,'high',false,'steady'),
  mysterious: emotion('Mysterious','✧','#b3a3d1',['dorian','phrygian'],suspense,'arpeggio',4,3,'middle',true,'swell','plain',true),
  tense: emotion('Tense','⌁','#d5b583',['phrygian','harmonic minor'],suspense,'ostinato',7,4,'middle',true,'pulse','plain',true),
  dread: emotion('Dread','◈','#a99cb3',['phrygian','minor'],suspense,'tremolo',6,3,'low',true,'swell','lean',true),
  determined: emotion('Determined','➜','#b9bd8a',['minor','mixolydian'],inward,'pulses',7,3,'low',true,'pulse'),
  epic: emotion('Epic','▲','#d9b580',['minor','harmonic minor'],inward,'ostinato',9,4,'middle',true,'swell','lean'),
  triumphant: emotion('Triumphant','⚑','#dfc67d',['major','mixolydian'],opening,'pulses',9,4,'high',true,'swell'),
  joyful: emotion('Joyful','☀','#ded38f',['major','mixolydian'],opening,'arpeggio',7,3,'high',true,'pulse'),
  nostalgic: emotion('Nostalgic','◷','#cfb6a5',['major','dorian'],wistful,'pad',5,2,'middle',false,'swell','richer'),
  dreamy: emotion('Dreamy','☁','#b2c9dc',['lydian','major'],floating,'arpeggio',4,3,'high',true,'swell','richer')
};
export function seeded(seed: string): () => number {
  let state = 2166136261;
  for (const letter of seed) state = Math.imul(state ^ letter.charCodeAt(0),16777619);
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}
export function chooseBank(song: Song, block: Block, beforeNewSection = false): number {
  const data = emotions[block.emotion];
  const rng = seeded(`${song.take}:${block.id}:${block.take}:${blockKey(song,block).mode}`);
  const preferred = data.preferred.includes(blockKey(song,block).mode);
  const options = data.bank.map((entry,index) => ({ entry,index })).filter(({ entry }) => !beforeNewSection || entry.endsPull);
  const weighted = preferred ? [...options,...options.filter(({ index }) => index % 2 === 0)] : options;
  const available = weighted.length ? weighted : data.bank.map((entry,index) => ({ entry,index }));
  return available[Math.floor(rng() * available.length)].index;
}
export function fillBlock(song: Song, block: Block, bankIndex?: number): void {
  const index = song.blocks.indexOf(block);
  const next = index >= 0 ? song.blocks[index + 1] : undefined;
  const chosen = bankIndex ?? chooseBank(song,block,Boolean(next && next.section !== block.section));
  applyRhythm(song,block,block.rhythm ?? 'steady',emotions[block.emotion].bank[chosen].chords);
}
export function setEmotion(song: Song, block: Block, name: string): void {
  const data = emotions[name];
  if (!data) throw new Error('Unknown emotion');
  Object.assign(block,{ emotion: name, energy: data.energy, complexity: data.complexity, texture: data.texture, register: data.register, runs: data.runs, curve: data.curve, bigEntrance: false,
    rhythm: data.texture === 'pad' ? 'breathe' : data.texture === 'arpeggio' ? 'unfold' : data.texture === 'pulses' ? 'lean' : 'rush' });
  fillBlock(song,block);
}
export function newBlock(song: Song, section: Block['section'] = 'Verse'): Block {
  const block: Block = { id: `block-${song.nextId++}`, section, emotion: 'hopeful', key: 'same', bars: [], energy: 5, complexity: 3, texture: 'arpeggio', register: 'middle', runs: true, bigEntrance: false, locked: false, take: 1, curve: 'swell' };
  fillBlock(song,block); return block;
}
export function createSong(): Song {
  const song: Song = { version: 2, key: { root: 0, name: 'C', mode: 'major' }, tempo: 100, meter: [4,4], ensemble: 'strings', take: 1, nextId: 1, controllers: true, articulationNames: false, blocks: [] };
  for (const [index,section] of (['Intro','Verse','Chorus','Outro'] as const).entries()) {
    const block = newBlock(song,section);
    setEmotion(song,block,['calm','hopeful','epic','tender'][index]);
    song.blocks.push(block);
  }
  return song;
}
export function surprise(song: Song, onlyId?: string): void {
  const rng = seeded(`${song.take}:${song.blocks.map(block => block.take).join(':')}:${onlyId ?? 'all'}`);
  const names = Object.keys(emotions);
  for (const [index,block] of song.blocks.entries()) {
    if ((!onlyId && block.locked) || (onlyId && block.id !== onlyId)) continue;
    block.take++;
    setEmotion(song,block,names[Math.floor(rng() * names.length)]);
    fillBlock(song,block,chooseBank(song,block,song.blocks[index + 1]?.section !== block.section));
  }
}
export function moveKey(song: Song, block: Block, move: 'lift' | 'brighter' | 'darker' | 'parallel'): void {
  const key = structuredClone(blockKey(song,block));
  const minor = ['minor','dorian','phrygian','harmonic minor','melodic minor'].includes(key.mode);
  if (move === 'lift') key.root = mod(key.root + 2);
  if (move === 'brighter') { if (minor) key.root = mod(key.root + 3); key.mode = 'major'; }
  if (move === 'darker') { if (!minor) key.root = mod(key.root - 3); key.mode = 'minor'; }
  if (move === 'parallel') key.mode = minor ? 'major' : 'minor';
  key.name = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'][key.root];
  block.key = key;
}
