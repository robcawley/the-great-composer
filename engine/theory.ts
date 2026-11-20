import { mod, type Analysis, type Chord, type Key, type Mode, type Score } from './types';
import { modes, scaleDefinitions, scaleNames, spellScale } from './scales';

export { modes } from './scales';
export const names = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
export const keyScale = (key: Key) => modes[key.mode].map(interval => mod(key.root + interval));
export const chordTones = (chord: Chord) => [...new Set(chord.intervals.map(interval => mod(chord.root + interval)))];
export function harmoniseScale(key: Key): { roman: string; triad: string; seventh?: string; notes: string[] }[] {
  const scale = keyScale(key);
  if (scale.length !== 7) return [];
  const spelled = spellScale(key);
  const triads: Record<string,string> = { '0,4,7': '', '0,3,7': 'm', '0,3,6': 'dim', '0,4,8': 'aug' };
  const sevenths: Record<string,string> = { '0,4,7,11': 'maj7', '0,4,7,10': '7', '0,3,7,10': 'm7', '0,3,7,11': 'm(maj7)', '0,3,6,10': 'm7b5', '0,3,6,9': 'dim7' };
  return scale.map((root,index) => {
    const tones = [0,2,4,6].map(step => scale[(index + step) % 7]);
    const intervals = tones.map(tone => mod(tone - root));
    const triadQuality = triads[intervals.slice(0,3).join(',')];
    const seventhQuality = sevenths[intervals.join(',')];
    let roman = degreeNames[mod(root - key.root)];
    if (intervals[1] === 3) roman = roman.toLowerCase();
    if (triadQuality === 'dim') roman += '°';
    if (triadQuality === 'aug') roman += '+';
    return { roman, triad: triadQuality === undefined ? tones.slice(0,3).map((_,voice) => spelled[(index + voice * 2) % 7]).join('–') : spelled[index] + triadQuality,
      seventh: seventhQuality === undefined ? undefined : spelled[index] + seventhQuality, notes: [0,2,4,6].map(step => spelled[(index + step) % 7]) };
  });
}
export function detectKey(chords: Chord[], preferred?: Key): { key: Key; confidence: number } {
  const sounding = chords.filter(chord => chord.intervals.length);
  if (!sounding.length) return { key: preferred ?? { root: 0, name: 'C', mode: 'major' }, confidence: 0 };
  const candidates: { key: Key; score: number }[] = [];
  for (let root = 0; root < 12; root++) for (const mode of scaleNames.filter(name => scaleDefinitions[name].detect)) {
    const key = { root, name: names[root], mode };
    const scale = keyScale(key);
    let score = 0;
    for (const [index, chord] of sounding.entries()) {
      const weight = Math.sqrt(chord.duration / 960);
      const raisedLeading = mode === 'minor' && mod(chord.root - root) === 7 && chord.intervals.includes(4);
      score += chordTones(chord).reduce((sum, tone) => sum + (scale.includes(tone) || (raisedLeading && tone === mod(root + 11)) ? 1 : -2.2), 0) * weight;
      if (chord.root === root) score += (index === 0 ? 6 : 1.4) * weight;
      if (mod(chord.root - root) === 7 && chord.intervals.includes(4)) score += 0.8 * weight;
    }
    if (preferred?.root === root && preferred.mode === mode) score += 1.5;
    if (mode === 'major' || mode === 'minor') score += 0.35;
    candidates.push({ key, score });
  }
  candidates.sort((first, second) => second.score - first.score);
  const margin = candidates[0].score - candidates[1].score;
  return { key: candidates[0].key, confidence: Math.min(0.95, 0.25 + Math.min(0.35, sounding.length * 0.04) + margin / Math.max(8, sounding.length * 2)) };
}
const degreeNames = ['I','bII','II','bIII','III','IV','#IV','V','bVI','VI','bVII','VII'];
const isMinorKey = (key: Key) => modes[key.mode].includes(3) && !modes[key.mode].includes(4);
const hasMinorThird = (chord: Chord) => chord.intervals.includes(3);
const hasDominantThird = (chord: Chord) => chord.intervals.includes(4);
const isDominant = (chord: Chord) => hasDominantThird(chord) && chord.intervals.includes(10);
function degree(chord: Chord, key: Key): string {
  const base = degreeNames[mod(chord.root - key.root)];
  return hasMinorThird(chord) ? base.toLowerCase() : base;
}
function romanNumeral(chord: Chord, key: Key): string {
  let roman = degree(chord,key);
  if (chord.quality === 'ø' || chord.quality === 'm7b5') return roman + 'ø7';
  if (chord.quality === 'dim7') return roman + '°7';
  if (chord.quality === 'dim') return roman + '°';
  if (chord.quality === '+' || chord.quality === 'aug') roman += '+';
  if (chord.intervals.includes(11)) roman += 'maj7';
  else if (chord.intervals.includes(10)) roman += '7';
  if (chord.quality.includes('sus')) roman += chord.quality.includes('sus2') ? 'sus2' : 'sus4';
  return roman;
}
function inversion(chord: Chord): string {
  const interval = mod(chord.bass - chord.root);
  if (!interval) return 'root position';
  if (!chordTones(chord).includes(chord.bass)) return 'non-chord pedal bass';
  if ([3,4].includes(interval)) return 'first inversion';
  if ([6,7,8].includes(interval)) return 'second inversion';
  if ([10,11].includes(interval) || (interval === 9 && chord.quality === 'dim7')) return 'third inversion';
  return 'extension in bass';
}
function selectScale(chord: Chord, key: Key, next?: Chord, tritone = false): { mode?: Mode; scale: number[]; name: string; notes: string[]; reason: string } {
  const tones = chordTones(chord);
  const context = keyScale(key);
  const compatible = tones.every(tone => context.includes(tone));
  let choice: Mode | undefined;
  let reason = 'The chord fits the section collection; keep that harmonic context.';
  if (chord.quality === '7alt') choice = 'altered';
  else if (chord.quality === '7#11') choice = 'lydian dominant';
  else if (chord.quality === '7#9') choice = 'half-whole diminished';
  else if (chord.quality === '7b9') choice = next && hasMinorThird(next) && mod(chord.root - next.root) === 7 ? 'phrygian dominant' : 'half-whole diminished';
  else if (chord.quality === 'dim7') choice = 'whole-half diminished';
  else if (tritone) choice = 'lydian dominant';
  else if (!compatible) {
    if (chord.quality.includes('sus')) choice = 'mixolydian';
    else if (chord.quality === 'm(maj7)') choice = 'melodic minor';
    else if (chord.quality === 'ø' || chord.quality === 'm7b5' || chord.quality === 'dim') choice = 'locrian natural 2';
    else if (chord.quality === 'aug' || chord.quality === '+') choice = 'whole tone';
    else if (hasDominantThird(chord) && mod(chord.root - key.root) === 7 && isMinorKey(key)) choice = 'phrygian dominant';
    else if (isDominant(chord)) choice = next && hasMinorThird(next) && mod(chord.root - next.root) === 7 ? 'phrygian dominant' : 'mixolydian';
    else choice = hasMinorThird(chord) ? 'dorian' : 'lydian';
  }
  if (choice) {
    if (!tones.every(tone => modes[choice!].includes(mod(tone - chord.root)))) {
      choice = scaleNames.filter(mode => tones.every(tone => modes[mode].includes(mod(tone - chord.root))))
        .sort((first,second) => keyScale({ root: chord.root, name: names[chord.root], mode: second }).filter(tone => context.includes(tone)).length - keyScale({ root: chord.root, name: names[chord.root], mode: first }).filter(tone => context.includes(tone)).length)[0];
      if (!choice) throw new Error(`No supporting scale for ${chord.symbol}`);
    }
    reason = `${scaleDefinitions[choice].description} The scale contains every written chord tone.`;
    const scaleKey = { root: chord.root, name: chord.symbol.match(/^[A-G][#b]?/)![0], mode: choice };
    const scale = keyScale(scaleKey);
    if (!tones.every(tone => scale.includes(tone))) throw new Error(`Scale ${choice} does not support ${chord.symbol}`);
    return { mode: choice, scale, name: `${scaleKey.name} ${choice}`, notes: spellScale(scaleKey), reason };
  }
  const intervals = context.map(tone => mod(tone - chord.root)).sort((first,second) => first - second);
  const rotation = scaleNames.find(mode => modes[mode].length === intervals.length && modes[mode].every((interval,index) => interval === intervals[index]));
  const rootName = chord.symbol.match(/^[A-G][#b]?/)![0];
  const noteMap = new Map(context.map((tone,index) => [tone,spellScale(key)[index]]));
  const scale = intervals.map(interval => mod(chord.root + interval));
  return { mode: rotation, scale, name: rotation ? `${rootName} ${rotation}` : `${key.name} ${key.mode} over ${rootName}`, notes: scale.map(tone => noteMap.get(tone)!), reason };
}
function describe(chord: Chord, key: Key, next?: Chord, previous?: Chord): Analysis['chords'][number] {
  if (!chord.intervals.length) return { roman: '—', function: 'silence', role: 'rest', inversion: '—', scale: [], scaleName: 'No chord', scaleNotes: [], explanation: 'Leave space; no harmony is sounding.', tensions: [], avoid: [], alternatives: [] };
  const context = keyScale(key);
  const tones = chordTones(chord);
  const relative = mod(chord.root - key.root);
  let roman = romanNumeral(chord,key);
  let functionName = tones.every(tone => context.includes(tone)) ? 'diatonic' : 'chromatic';
  let explanation = '';
  const borrowedFrom = (['major','minor','dorian','phrygian','lydian','mixolydian','harmonic minor'] as Mode[]).find(mode => mode !== key.mode && tones.every(tone => keyScale({ ...key, mode }).includes(tone)));
  const tritone = isDominant(chord) && next && mod(chord.root - next.root) === 1;
  const minorDominant = relative === 7 && hasDominantThird(chord) && isMinorKey(key);
  if (minorDominant) functionName = 'dominant (harmonic minor)';
  else if (hasDominantThird(chord) && next && mod(chord.root - next.root) === 7 && relative !== 7) {
    functionName = 'secondary dominant';
    roman = `V${chord.intervals.includes(10) ? '7' : ''}/${degree(next,key)}`;
    explanation = `Temporarily tonicises ${next.symbol}; the major third leads up to its root.`;
  } else if (tritone) { functionName = 'tritone sub'; explanation = `Dominant resolves down a semitone to ${next.symbol}.`; }
  else if (['dim','dim7'].includes(chord.quality) && next && [1,11].includes(mod(next.root - chord.root))) functionName = 'passing diminished';
  else if (functionName === 'chromatic' && borrowedFrom) { functionName = 'borrowed'; explanation = `Modal interchange from parallel ${key.name} ${borrowedFrom}.`; }
  else if (functionName === 'chromatic' && [3,4,8,9].includes(relative) && hasMinorThird(chord) === isMinorKey(key)) functionName = 'chromatic mediant';
  let role = relative === 0 ? 'tonic' : [2,5].includes(relative) ? 'predominant' : relative === 7 || (relative === 11 && chord.intervals.includes(6)) ? 'dominant' : 'tonic prolongation / colour';
  if (['secondary dominant','tritone sub','dominant (harmonic minor)'].includes(functionName)) role = 'dominant';
  if (functionName === 'passing diminished') role = 'connecting harmony';
  let cadence: string | undefined;
  if (previous?.intervals.length && mod(previous.root - key.root) === 7 && hasDominantThird(previous)) {
    if (relative === 0) cadence = 'authentic motion';
    else if ([8,9].includes(relative)) cadence = 'deceptive motion';
  }
  if (previous?.intervals.length && mod(previous.root - key.root) === 5 && relative === 0) cadence = 'plagal motion';
  if (!next && role === 'dominant' && relative === 7) cadence = 'half-cadence candidate';
  const selected = selectScale(chord,key,next,Boolean(tritone));
  const avoid = selected.scale.filter(tone => !tones.includes(tone) && tones.some(chordTone => mod(tone - chordTone) === 1));
  const tensions = selected.scale.filter(tone => !tones.includes(tone) && !avoid.includes(tone));
  const alternatives = scaleNames.filter(mode => mode !== selected.mode && tones.every(tone => modes[mode].includes(mod(tone - chord.root))))
    .map(mode => ({ mode, shared: keyScale({ root: chord.root, name: names[chord.root], mode }).filter(tone => context.includes(tone)).length }))
    .sort((first,second) => second.shared - first.shared)
    .slice(0,3).map(({ mode }) => { const scaleKey = { root: chord.root, name: chord.symbol.match(/^[A-G][#b]?/)![0], mode }; return { name: `${scaleKey.name} ${mode}`, notes: spellScale(scaleKey) }; });
  return { roman, function: functionName, role, inversion: inversion(chord), cadence, scale: selected.scale, scaleName: selected.name, scaleNotes: selected.notes,
    explanation: [explanation,selected.reason,avoid.length ? 'Avoid tones are passing colours, not default sustained tensions.' : 'No extra semitone-above-chord-tone avoid notes in this collection.'].filter(Boolean).join(' '), tensions, avoid, alternatives };
}
export function analyse(score: Score, override?: Key): Analysis {
  const global = detectKey(score.chords, score.key);
  const sections = score.sections.map(section => detectKey(score.chords.filter(chord => chord.section === section.index), override ?? score.key ?? global.key));
  if (override) for (const section of sections) { section.key = override; section.confidence = 1; }
  else if (score.key) {
    for (const section of sections) {
      const sectionIndex = sections.indexOf(section);
      const localChords = score.chords.filter(chord => chord.section === sectionIndex);
      const writtenFits = localChords.every(chord => chordTones(chord).every(tone => keyScale(score.key!).includes(tone)));
      if (!scaleDefinitions[score.key.mode].detect || writtenFits || section.confidence < 0.58 || (section.key.root === score.key.root && section.key.mode === score.key.mode)) {
        section.key = score.key;
        section.confidence = 1;
      }
    }
  }
  return { key: override ?? score.key ?? global.key, confidence: override || score.key ? 1 : global.confidence,
    sections, chords: score.chords.map((chord, index) => describe(chord, sections[chord.section].key,
      score.chords[index + 1]?.section === chord.section ? score.chords[index + 1] : undefined,
      score.chords[index - 1]?.section === chord.section ? score.chords[index - 1] : undefined)) };
}
