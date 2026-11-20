import type { Key, Mode, PartChoice, Project, Texture } from './types';

export const sectionNames = ['Intro','Verse','Pre','Chorus','Bridge','Build','Break','Outro'] as const;
export const feels = [
  { label: 'Bright', mode: 'major' }, { label: 'Dark', mode: 'minor' },
  { label: 'Bittersweet', mode: 'dorian' }, { label: 'Heroic', mode: 'mixolydian' },
  { label: 'Dreamy', mode: 'lydian' }, { label: 'Uneasy', mode: 'phrygian' },
  { label: 'Ancient', mode: 'harmonic minor' }
] as const;
export type Spice = 'plain' | 'softer' | 'richer' | 'darker' | 'brighter' | 'lean';
export interface DegreeChord { degree: number; alter?: number; quality?: 'major' | 'minor' | 'dominant'; spice: Spice; pedal?: number }
export type HarmonicRhythm = 'steady' | 'breathe' | 'unfold' | 'lean' | 'rush' | 'offbeat';
export interface Bar { chords: DegreeChord[]; push: boolean; hold?: boolean; weights?: number[] }
export type Register = 'low' | 'middle' | 'high';
export type Curve = 'swell' | 'steady' | 'pulse';
export interface Block {
  id: string; section: typeof sectionNames[number]; emotion: string; key: Key | 'same';
  bars: Bar[]; energy: number; complexity: number; texture: Texture; register: Register;
  runs: boolean; bigEntrance: boolean; locked: boolean; take: number; curve: Curve; rhythm?: HarmonicRhythm;
}
export interface Song {
  version: 2; key: Key; tempo: number; meter: [number,number]; ensemble: 'strings';
  take: number; nextId: number; controllers: boolean; articulationNames: boolean;
  blocks: Block[]; expert?: Project;
  /** Locked songs keep every block in the song's key and every chord inside its scale. */
  keyLocked?: boolean;
  /** What each string section plays across the song; missing or 'auto' follows each block. */
  parts?: Partial<Record<string, PartChoice>>;
}
export const stringParts = ['Basses','Cellos','Violas','Violins II','Violins I'] as const;
export const blockKey = (song: Song, block: Block): Key => block.key === 'same' ? song.key : block.key;
export const registerStyle = (register: Register): Project['voicing'] => ({ low: 'close', middle: 'open', high: 'colour' })[register] as Project['voicing'];
export const modeFeeling = (mode: Mode) => feels.find(feel => feel.mode === mode)?.label ?? 'Custom colour';

export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  constructor(public value: T, private limit = 100) {}
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  set(value: T): void {
    this.past.push(structuredClone(this.value));
    if (this.past.length > this.limit) this.past.shift();
    this.value = structuredClone(value); this.future = [];
  }
  undo(): void { if (this.canUndo) { this.future.push(structuredClone(this.value)); this.value = this.past.pop()!; } }
  redo(): void { if (this.canRedo) { this.past.push(structuredClone(this.value)); this.value = this.future.pop()!; } }
}
