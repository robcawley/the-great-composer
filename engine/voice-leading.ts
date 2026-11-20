import { chordTones } from './theory';
import { mod, type Chord, type Project, type Score } from './types';

export function parallelPerfect(previous: number[], current: number[]): boolean {
  for (let lower = 0; lower < previous.length; lower++) for (let upper = lower + 1; upper < previous.length; upper++) {
    const before = mod(previous[upper] - previous[lower]);
    const after = mod(current[upper] - current[lower]);
    if ((before === 0 || before === 7) && before === after &&
      Math.sign(current[lower] - previous[lower]) === Math.sign(current[upper] - previous[upper]) && current[lower] !== previous[lower]) return true;
  }
  return false;
}
/** Power chord to power chord moves in parallel fifths by design; every other connection is checked. */
export const parallelsMatter = (previous: Chord, current: Chord) => !(previous.quality === '5' && current.quality === '5');
export function resolutions(previousChord: Chord, chord: Chord, previous: number[], current: number[]): boolean {
  const dominantResolution = previousChord.intervals.includes(4) && mod(previousChord.root - chord.root) === 7;
  if (!dominantResolution) return true;
  for (let voice = 1; voice < previous.length; voice++) {
    const relative = mod(previous[voice] - previousChord.root);
    if (relative === 4 && current[voice] !== previous[voice] + 1) return false;
    if (relative === 10 && previousChord.intervals.includes(10) && ![-1,-2].includes(current[voice] - previous[voice])) return false;
  }
  return true;
}
/** Spacing and doubling costs: avoid doubled thirds (and leading notes), favour doubled roots, keep the upper voices within an octave. */
export function voicingPenalty(chord: Chord, voicing: number[]): number {
  let penalty = 0;
  const third = chord.intervals.includes(4) ? mod(chord.root + 4) : chord.intervals.includes(3) ? mod(chord.root + 3) : undefined;
  const count = (tone: number) => voicing.filter(pitch => mod(pitch) === tone).length;
  if (third !== undefined && count(third) > 1) penalty += chord.intervals.includes(4) ? 6 : 2.5;
  const doubledSeventh = chord.intervals.some(interval => interval === 10 || interval === 11) && voicing.filter(pitch => [10,11].includes(mod(pitch - chord.root)) && chord.intervals.includes(mod(pitch - chord.root))).length > 1;
  if (doubledSeventh) penalty += 6;
  if (count(chord.root) < 2 && chordTones(chord).length <= 3) penalty += 1.5;
  for (let voice = 2; voice < 4; voice++) if (voicing[voice + 1] - voicing[voice] > 12) penalty += 4;
  if (voicing[1] - voicing[0] > 24) penalty += 2;
  if (voicing[1] < 52 && voicing[1] - voicing[0] < 7) penalty += 3; // muddy low thirds
  return penalty;
}
export function candidates(chord: Chord, style: Project['voicing']): number[][] {
  let tones = chordTones(chord);
  if (!tones.length) return [[36,48,55,60,67]];
  if (tones.length > 5) tones = [chord.root, mod(chord.root + chord.intervals[1]), mod(chord.root + chord.intervals[3]), ...tones.slice(-2)];
  const bounds = [[28,47],[43,65],[53,74],[58,81],[64,88]];
  const choices = bounds.map(([low, high], voice) => Array.from({ length: high - low + 1 }, (_, offset) => offset + low).filter(pitch => voice === 0 ? mod(pitch) === chord.bass : tones.includes(mod(pitch))));
  const results: number[][] = [];
  function visit(current: number[]): void {
    if (current.length === 5) {
      const required = tones.filter(tone => tone !== mod(chord.root + 7) || tones.length <= 4);
      if (required.every(tone => current.some(pitch => mod(pitch) === tone))) results.push(current);
      return;
    }
    for (const pitch of choices[current.length]) {
      const previous = current.at(-1);
      if (previous !== undefined && (pitch <= previous || (previous < 52 && pitch - previous < 7) || pitch - previous > (current.length === 1 ? 24 : 12))) continue;
      visit([...current, pitch]);
    }
  }
  visit([]);
  const ideal = style === 'close' ? [38,52,60,65,69] : style === 'open' ? [38,50,60,70,79] : [38,55,64,74,83];
  results.sort((first, second) => first.reduce((sum, pitch, voice) => sum + Math.abs(pitch - ideal[voice]), 0) - second.reduce((sum, pitch, voice) => sum + Math.abs(pitch - ideal[voice]), 0));
  return results;
}
export function voiceLead(score: Score, style: Project['voicing']): number[][] {
  type State = { cost: number; path: number[][] };
  let beam: State[] = [{ cost: 0, path: [] }];
  for (const [index, chord] of score.chords.entries()) {
    if (!chord.intervals.length) {
      beam = beam.map(state => ({ ...state, path: [...state.path, state.path.at(-1) ?? [36,48,55,60,67]] }));
      continue;
    }
    const options = candidates(chord, style);
    if (!options.length) throw new Error(`No playable core voicing for ${chord.symbol} at bar ${chord.bar + 1}`);
    const next: State[] = [];
    for (const [rank, current] of options.entries()) {
      let best: State | undefined;
      for (const state of beam) {
        const previous = state.path.at(-1);
        const connected = previous && score.chords[index - 1].intervals.length;
        if (connected && ((parallelsMatter(score.chords[index - 1], chord) && parallelPerfect(previous, current)) || !resolutions(score.chords[index - 1], chord, previous, current))) continue;
        const motion = connected ? current.reduce((sum, pitch, voice) => sum + Math.abs(pitch - previous[voice]) + Math.max(0, Math.abs(pitch - previous[voice]) - 7) * 2, 0) : 0;
        const cost = state.cost + motion + rank * 0.015 + voicingPenalty(chord, current) * 2;
        if (!best || cost < best.cost) best = { cost, path: [...state.path, current] };
      }
      if (best) next.push(best);
    }
    next.sort((first, second) => first.cost - second.cost);
    if (!next.length) throw new Error(`Voice-leading constraints cannot be met at bar ${chord.bar + 1}; try another voicing`);
    beam = next.slice(0, 32);
  }
  return beam[0].path;
}
