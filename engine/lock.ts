import { chordFor } from './blocks';
import { modes } from './scales';
import { blockKey, type Block, type DegreeChord, type Song, type Spice } from './song';
import { mod, type Key } from './types';

/** True when every note of the chord (and any pedal bass) sits inside the key's scale. */
export function inScale(chord: DegreeChord, key: Key): boolean {
  const scale = modes[key.mode].map(interval => mod(key.root + interval));
  const parsed = chordFor(chord, key);
  return [parsed.bass, ...parsed.intervals.map(interval => parsed.root + interval)].every(pitch => scale.includes(mod(pitch)));
}
/** The nearest in-scale version of a chord: drop borrowed alterations first, then the spice, keep the degree. */
export function conformChord(chord: DegreeChord, key: Key): DegreeChord {
  if (inScale(chord, key)) return chord;
  const { alter, quality, ...rest } = chord;
  const diatonic: DegreeChord = { ...rest };
  if (inScale(diatonic, key)) return diatonic;
  const plain: DegreeChord = { ...diatonic, spice: 'plain' };
  if (inScale(plain, key)) return plain;
  const { pedal, ...bare } = plain;
  return bare;
}
/** Keep a locked song inside its key and scale: every block uses the song key, every chord fits the scale. */
export function conformSong(song: Song): void {
  if (!song.keyLocked) return;
  for (const block of song.blocks) {
    block.key = 'same';
    for (const bar of block.bars) bar.chords = bar.chords.map(chord => conformChord(chord, song.key));
  }
}
/** For chords the tool chose itself: swap a diminished result for the stable chord a third below
 * (it shares two notes), so locked modes don't open phrases on a restless chord. Hand-picked chords are left alone. */
export function stabilise(song: Song, block: Block): void {
  if (!song.keyLocked) return;
  const key = blockKey(song, block);
  const restless = (chord: DegreeChord) => ['dim', 'aug', 'm7b5'].includes(chordFor(chord, key).quality);
  for (const bar of block.bars) bar.chords = bar.chords.map(chord => {
    const fitted = conformChord(chord, key);
    if (!restless(fitted)) return fitted;
    for (const step of [-2, 2, -3]) {
      const degree = ((fitted.degree - 1 + step + 7) % 7) + 1;
      const candidate = conformChord({ ...fitted, degree }, key);
      if (!restless(candidate)) return candidate;
    }
    return fitted;
  });
}
export type Job = 'home' | 'away' | 'pull';
/** Chord jobs in plain words: home is stable, away moves, pull wants to come home. */
export function jobOf(degree: number, key: Key): Job {
  const quality = chordFor({ degree, spice: 'plain' }, key).quality;
  if (degree === 1) return 'home';
  if (degree === 5 || degree === 7 || quality === 'dim' || quality === 'aug') return 'pull';
  if (degree === 3 || degree === 6) return 'home';
  return 'away';
}
/** A chord's character in plain words, by what it is built from rather than its symbol. */
export function chordWord(chord: DegreeChord, key: Key): string {
  if (chord.spice === 'richer') return 'rich';
  if (chord.spice === 'softer') return 'soft';
  if (chord.spice === 'lean') return 'bold';
  const quality = chordFor(chord, key).quality;
  return quality === 'dim' ? 'restless' : quality === 'aug' ? 'strange' : quality.startsWith('m') && !quality.startsWith('maj') ? 'warm' : 'open';
}
export interface PaletteChord { chord: DegreeChord; job: Job }
/** Every in-scale chord a locked song can use, grouped by job, plain first then spiced versions. */
export function palette(song: Song, block?: Block): PaletteChord[] {
  const key = block ? blockKey(song, block) : song.key;
  const spices: Spice[] = ['plain', 'richer', 'softer', 'lean'];
  const result: PaletteChord[] = [];
  for (const spice of spices) for (let degree = 1; degree <= Math.min(7, modes[key.mode].length); degree++) {
    const chord: DegreeChord = { degree, spice };
    if (!inScale(chord, key)) continue;
    if (spice !== 'plain' && chordFor(chord, key).symbol === chordFor({ degree, spice: 'plain' }, key).symbol) continue;
    result.push({ chord, job: jobOf(degree, key) });
  }
  const order: Spice[] = ['plain', 'richer', 'softer', 'lean'];
  return result.sort((first, second) => first.chord.degree - second.chord.degree || order.indexOf(first.chord.spice) - order.indexOf(second.chord.spice));
}
