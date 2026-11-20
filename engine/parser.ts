import { PPQ, mod, type Chord, type Key, type Score } from './types';
import { normaliseMode } from './scales';

const roots: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const qualities: Record<string, number[]> = {
  '': [0,4,7], m: [0,3,7], '7': [0,4,7,10], maj7: [0,4,7,11], M7: [0,4,7,11], m7: [0,3,7,10], 'm(maj7)': [0,3,7,11],
  m7b5: [0,3,6,10], 'ø': [0,3,6,10], dim: [0,3,6], dim7: [0,3,6,9], aug: [0,4,8], '+': [0,4,8],
  sus2: [0,2,7], sus4: [0,5,7], '7sus4': [0,5,7,10], '6': [0,4,7,9], m6: [0,3,7,9], '6/9': [0,4,7,9,14],
  add9: [0,4,7,14], '9': [0,4,7,10,14], m9: [0,3,7,10,14], maj9: [0,4,7,11,14],
  '11': [0,4,7,10,14,17], '13': [0,4,7,10,14,21], '7b9': [0,4,7,10,13], '7#9': [0,4,7,10,15],
  '7#11': [0,4,7,10,18], '7alt': [0,4,6,10,13,15,20], '5': [0,7]
};
export class ParseError extends Error {
  constructor(message: string, public bar: number, public line: number, public column: number) {
    super(`${message} (bar ${bar + 1}, line ${line}, column ${column})`);
  }
}
export function pitchClass(name: string): number {
  const match = /^([A-G])([#b]?)$/.exec(name);
  if (!match) throw new Error(`Invalid note: ${name}`);
  return mod(roots[match[1]] + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0));
}
export function parseKey(text: string): Key {
  const match = /^([A-G][#b]?)\s+(.+)$/.exec(text.trim());
  const mode = match && normaliseMode(match[2]);
  if (!match || !mode) throw new Error('Key must be a note followed by a supported scale or mode');
  return { root: pitchClass(match[1]), name: match[1], mode };
}
export function parseChord(symbol: string): Pick<Chord, 'symbol' | 'root' | 'bass' | 'intervals' | 'quality'> {
  if (symbol === 'N.C.') return { symbol, root: 0, bass: 0, intervals: [], quality: 'none' };
  const match = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/.exec(symbol);
  if (!match || !Object.hasOwn(qualities, match[2])) throw new Error(`Unrecognised chord “${symbol}”`);
  return { symbol, root: pitchClass(match[1]), bass: pitchClass(match[3] ?? match[1]), intervals: [...qualities[match[2]]], quality: match[2] };
}
export function parse(source: string): Score {
  const score: Score = { tempo: 120, meter: [4,4], chords: [], sections: [], duration: 0 };
  let tick = 0;
  let bar = 0;
  let previous: ReturnType<typeof parseChord> | undefined;
  let sectionName = 'Main';
  let pendingSection = true;
  const lines = source.split(/\r?\n/);
  for (const [lineIndex, original] of lines.entries()) {
    const line = original.trim();
    if (!line || line.startsWith('#')) continue;
    const fail = (message: string, column = 1): never => { throw new ParseError(message, bar, lineIndex + 1, column); };
    if (/^(tempo|meter|key)\b/.test(line)) {
      if (bar) fail('Headers must precede the progression');
      if (line.startsWith('tempo ')) {
        score.tempo = Number(line.slice(6));
        if (!Number.isFinite(score.tempo) || score.tempo < 20 || score.tempo > 300) fail('Tempo must be 20–300 BPM');
      } else if (line.startsWith('meter ')) {
        const value = line.slice(6);
        if (!['2/4','3/4','4/4','5/4','6/8','7/8','9/8','12/8'].includes(value)) fail('Unsupported meter');
        score.meter = value.split('/').map(Number) as [number, number];
      } else {
        try { score.key = parseKey(line.slice(4)); } catch (error) { fail((error as Error).message); }
      }
      continue;
    }
    const tokens = original.matchAll(/\[[^\]]*\]|\|([^|\[\]]*)|[^\s|]+/g);
    for (const token of tokens) {
      if (token[0].startsWith('[')) {
        sectionName = token[0].slice(1,-1).trim();
        if (!sectionName) fail('Section name cannot be empty', token.index + 1);
        pendingSection = true;
        continue;
      }
      if (token[1] === undefined) fail('Expected a section label or | bar |', token.index + 1);
      const content = token[1].trim();
      if (!content) continue;
      if (pendingSection) {
        if (score.sections.length) score.sections.at(-1)!.end = tick;
        score.sections.push({ name: sectionName, start: tick, end: tick, index: score.sections.length });
        pendingSection = false;
      }
      const units = content.split(/\s+/);
      const barTicks = score.meter[0] * 4 / score.meter[1] * PPQ;
      const weighted = units.some(unit => unit.includes('@'));
      const weightedUnits = weighted ? units.map(unit => {
        const match = /^(.+)@(\d+(?:\.\d+)?)$/.exec(unit);
        if (!match || Number(match[2]) <= 0) fail('Every weighted change needs a positive @duration',token.index + 1);
        return { symbol: match![1], weight: Number(match![2]) };
      }) : [];
      const weightTotal = weightedUnits.reduce((sum,unit) => sum + unit.weight,0);
      if (weighted && Math.abs(weightTotal - score.meter[0]) > 0.00001) fail(`Weighted durations must total ${score.meter[0]}`,token.index + 1);
      if (units[0] === '.') fail('A bar cannot begin with a duration dot', token.index + 1);
      const events: { symbol: string; offset: number; slots: number }[] = [];
      let weightOffset = 0;
      for (const [unitIndex, unit] of units.entries()) {
        if (weighted) { const entry = weightedUnits[unitIndex]; events.push({ symbol: entry.symbol, offset: weightOffset, slots: entry.weight }); weightOffset += entry.weight; }
        else if (unit === '.') events.at(-1)!.slots++;
        else events.push({ symbol: unit, offset: unitIndex, slots: 1 });
      }
      const hasDots = units.includes('.');
      if (hasDots && units.length !== score.meter[0]) fail(`Beat-split bars need ${score.meter[0]} slots`, token.index + 1);
      for (const event of events) {
        const anticipated = event.symbol.startsWith('^');
        const symbol = event.symbol.replace(/^\^/, '');
        if (symbol === '~') {
          if (!previous) fail('A held bar needs a previous chord',token.index + 1);
          continue;
        }
        let chord: ReturnType<typeof parseChord>;
        try {
          if (symbol === '%' && !previous) fail('Repeat has no previous chord', token.index + 1);
          chord = symbol === '%' ? { ...previous!, intervals: [...previous!.intervals] } : parseChord(symbol);
        } catch (error) { fail((error as Error).message, token.index + 1); }
        const offset = weighted ? event.offset / weightTotal : hasDots ? event.offset / units.length : events.indexOf(event) / events.length;
        const duration = weighted ? event.slots / weightTotal : hasDots ? event.slots / units.length : 1 / events.length;
        const start = Math.max(0, Math.round(tick + offset * barTicks - (anticipated ? PPQ / 2 : 0)));
        const last = score.chords.at(-1);
        if (last) last.duration = start - last.start;
        if (last && last.duration <= 0) fail('Chord anticipation collides with previous change', token.index + 1);
        score.chords.push({ ...chord!, start, duration: Math.round(duration * barTicks), bar, section: score.sections.length - 1 });
        previous = chord!;
      }
      tick += barTicks;
      bar++;
    }
  }
  if (!score.chords.length) throw new ParseError('Enter at least one bar', 0, 1, 1);
  score.chords.at(-1)!.duration = tick - score.chords.at(-1)!.start;
  score.sections.at(-1)!.end = tick;
  score.duration = tick;
  return score;
}
