import type { Block, DegreeChord, HarmonicRhythm, Song } from './song';

export const harmonicRhythms: { value: HarmonicRhythm; label: string; description: string }[] = [
  { value: 'steady', label: 'Even steps', description: 'A new chord every bar.' },
  { value: 'breathe', label: 'Room to breathe', description: 'Hold for two bars, then let the changes gather.' },
  { value: 'unfold', label: 'Open out', description: 'Two quick turns, then a long landing.' },
  { value: 'lean', label: 'Long · short', description: 'Uneven changes that lean across the bar lines.' },
  { value: 'rush', label: 'Quick start', description: 'Two quick changes, a held chord, then a turn home.' },
  { value: 'offbeat', label: 'Between the lines', description: 'Changes halfway through bars, with room at the end.' }
];
export function applyRhythm(song: Song, block: Block, rhythm: HarmonicRhythm, supplied?: DegreeChord[]): void {
  const events = supplied ?? block.bars.flatMap(bar => bar.chords.filter((_,index) => !bar.hold || index !== 0));
  const chords = Array.from({ length: 4 },(_,index) => structuredClone(events[index % events.length]));
  const count = song.meter[0];
  const long = count === 7 ? 4 / 7 : count % 3 === 0 ? 2 / 3 : (count - 1) / count;
  const starts = { steady: [0,1,2,3], breathe: [0,2,3,3.5], unfold: [0,1,1.5,2], lean: [0,long,1,2.5], rush: [0,0.5,1,3], offbeat: [0,0.5,1.5,2.5] }[rhythm];
  block.rhythm = rhythm;
  block.bars = Array.from({ length: 4 },(_,bar) => {
    const active = starts.findLastIndex(start => start <= bar);
    const changes = starts.map((start,index) => ({ start,index })).filter(event => event.start > bar && event.start < bar + 1);
    const held = starts[active] !== bar;
    const first = structuredClone(chords[active]);
    if (!changes.length) return { chords: [first], push: false, hold: held };
    const fraction = changes[0].start - bar;
    return { chords: [first,structuredClone(chords[changes[0].index])], push: false, hold: held, weights: [fraction,1 - fraction] };
  });
}
export function followHolds(block: Block): void {
  let previous: DegreeChord | undefined;
  for (const bar of block.bars) {
    if (bar.hold && previous) bar.chords[0] = structuredClone(previous);
    previous = bar.chords.at(-1);
  }
}
