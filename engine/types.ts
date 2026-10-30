export const PPQ = 960;
export type Mode = keyof typeof import('./scales').scaleDefinitions;
export interface Key { root: number; name: string; mode: Mode }
export interface Chord { symbol: string; root: number; bass: number; intervals: number[]; quality: string; start: number; duration: number; bar: number; section: number }
export interface Section { name: string; start: number; end: number; index: number }
export interface Score { tempo: number; meter: [number, number]; key?: Key; chords: Chord[]; sections: Section[]; duration: number }
export interface ChordAnalysis {
  roman: string; function: string; role: string; inversion: string; cadence?: string;
  scale: number[]; scaleName: string; scaleNotes: string[]; explanation: string;
  tensions: number[]; avoid: number[]; alternatives: { name: string; notes: string[] }[];
}
export interface Analysis { key: Key; confidence: number; sections: { key: Key; confidence: number }[]; chords: ChordAnalysis[] }
export type Texture = 'pad' | 'ostinato' | 'arpeggio' | 'tremolo' | 'pulses';
/** What one string section plays: 'auto' follows the block's movement; the rest are the user's choice. */
export type PartChoice = 'auto' | 'off' | 'hold' | 'pulse' | 'figure' | 'answer' | 'arpeggio' | 'shimmer';
export const partChoices: PartChoice[] = ['auto','hold','pulse','figure','answer','arpeggio','shimmer','off'];
export interface SectionSettings { parts?: Partial<Record<string, PartChoice>>; texture: Texture; density: number; complexity: number; take: number; runs: boolean; seed?: string; curve?: 'swell' | 'steady' | 'pulse'; exitRuns?: boolean; bigEntrance?: boolean }
export interface Project { version: 1; source: string; take: number; voicing: 'close' | 'open' | 'colour'; controllers: boolean; articulationNames: boolean; keyOverride?: string; sections: Record<string, SectionSettings> }
export interface Note { pitch: number; start: number; duration: number; velocity: number; approach?: boolean; runTarget?: number }
export interface Control { tick: number; controller: 1 | 11; value: number }
export interface Part { name: string; instrument: string; notes: Note[]; controls: Control[]; articulation: string }
export interface Arrangement { score: Score; analysis: Analysis; core: number[][]; parts: Part[]; project: Project; markers?: { name: string; start: number }[] }
export const mod = (value: number, divisor = 12) => ((value % divisor) + divisor) % divisor;
