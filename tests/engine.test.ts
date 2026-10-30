import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkMidi } from './midi-check';
import { arrange, defaults, loadProject, sectionSettings } from '../engine/arrange';
import { parse, parseChord, ParseError } from '../engine/parser';
import { analyse, detectKey } from '../engine/theory';
import { audit } from '../engine/audit';
import { writeMidi } from '../engine/midi';
import { type Project, type Texture } from '../engine/types';

const fixtures = readdirSync('fixtures').filter(name => name.endsWith('.txt'));
describe('input grammar', () => {
  it('accepts the complete chord vocabulary', () => {
    const symbols = 'C Cm C7 Cmaj7 CM7 Cm7 Cm(maj7) Cm7b5 Cø Cdim Cdim7 Caug C+ Csus2 Csus4 C7sus4 C6 Cm6 C6/9 Cadd9 C9 Cm9 Cmaj9 C11 C13 C7b9 C7#9 C7#11 C7alt C5 C/E N.C.'.split(' ');
    for (const symbol of symbols) assert.equal(parseChord(symbol).symbol,symbol);
    assert.ok(parseChord('C6/9').intervals.includes(14));
    assert.equal(parseChord('Bb/D').bass,2);
  });
  it('locates malformed chords at their bar', () => {
    assert.throws(() => parse('| C | potato |'),/bar 2, line 1, column/);
    assert.throws(() => parse('| % |'),ParseError);
    assert.throws(() => parse('| C . G |'),/4 slots/);
    assert.throws(() => parse('meter 8/4\n| C |'),/Unsupported meter/);
  });
  it('handles dots, repeats, rests, anticipated chords and slash bass', () => {
    const score = parse('[A] | C . G . | % | N.C. | [B] | ^C/E |');
    assert.deepEqual(score.chords.map(chord => chord.start),[0,1920,3840,7680,11040]);
    assert.equal(score.chords[2].symbol,'G');
    assert.deepEqual(score.chords[3].intervals,[]);
    assert.equal(score.sections[1].start,11520);
  });
  it('validates project JSON', () => {
    assert.throws(() => loadProject({ ...defaults(), take: -1 }));
    assert.throws(() => loadProject({ ...defaults(), sections: { 0: { density: 100 } } }));
  });
});
for (const filename of fixtures) describe(filename, () => {
  const source = readFileSync(`fixtures/${filename}`,'utf8');
  const project: Project = { ...defaults(), source };
  it('parses and round-trips deterministic, compliant MIDI with CC on and off', () => {
    const arrangement = arrange(project);
    const midi = writeMidi(arrangement);
    checkMidi(midi,arrangement);
    assert.deepEqual(writeMidi(arrange(project)),midi);
    const dry = arrange({ ...project, controllers: false });
    checkMidi(writeMidi(dry),dry);
    assert.deepEqual(dry.parts.map(part => part.notes),arrangement.parts.map(part => part.notes));
  });
  it('keeps every texture in range, scale, with valid core voice leading and run landings', () => {
    for (const texture of ['pad','ostinato','arpeggio','tremolo','pulses'] as Texture[]) {
      const varied = structuredClone(project);
      for (const section of parse(source).sections) varied.sections[section.index] = { texture, density: 8, complexity: 5, take: 2, runs: true };
      const arrangement = arrange(varied);
      const result = audit(arrangement);
      for (const metric of ['outsideFull','scaleConflicts','parallels','unresolved','runLandingErrors','invalidNotes','overlaps'] as const) assert.equal(result[metric],0,`${texture}: ${metric}`);
      checkMidi(writeMidi(arrangement),arrangement);
    }
  });
  it('detects the intended tonic and mode without the fixture key hint', () => {
    const score = parse(source);
    const detectionChords = filename === 'end-of-the-road.txt' ? score.chords.filter(chord => chord.section === 1) : score.chords;
    const result = detectKey(detectionChords);
    assert.equal(result.key.root,score.key!.root);
    assert.equal(result.key.mode,score.key!.mode);
  });
});
it('labels secondary dominants and borrowed minor subdominant', () => {
  const analysis = analyse(parse(readFileSync('fixtures/secondary-dominants.txt','utf8')));
  for (const index of [1,3,6]) assert.equal(analysis.chords[index].function,'secondary dominant');
  assert.equal(analysis.chords[9].function,'borrowed');
});
it('keeps other sections byte-for-byte identical when a section TAKE changes', () => {
  const project = defaults();
  const before = arrange(project);
  project.sections[1] = { ...sectionSettings(project,1), take: 2 };
  const after = arrange(project);
  const section = before.score.sections[1];
  assert.notDeepEqual(writeMidi(before),writeMidi(after));
  for (const [index, part] of before.parts.entries()) {
    const outside = (note: { start: number }) => note.start < section.start || note.start >= section.end;
    assert.deepEqual(after.parts[index].notes.filter(outside),part.notes.filter(outside));
    assert.deepEqual(after.parts[index].controls.filter(control => outside({ start: control.tick })),part.controls.filter(control => outside({ start: control.tick })));
  }
});
describe('string writing (review)', () => {
  const settings = (texture: Texture, complexity = 4, density = 7) => ({ texture, density, complexity, take: 1, runs: true });
  it('ties common tones in sustained parts instead of re-striking them', () => {
    const project = { ...defaults(), source: 'tempo 80\n| Dm | Dm | Dm | Dm |' };
    const arrangement = arrange(project);
    for (const part of arrangement.parts) assert.equal(part.notes.length, 1, `${part.name} should hold one note`);
  });
  it('keeps the basses in the bass register', () => {
    const arrangement = arrange(defaults());
    const basses = arrangement.parts.find(part => part.name === 'Basses')!;
    assert.ok(Math.max(...basses.notes.map(note => note.pitch)) <= 50);
  });
  it('lets power-chord riffs move in parallel without octave jumps', () => {
    const arrangement = arrange({ ...defaults(), source: '| A5 | G5 | D5 | A5 |' });
    for (let index = 1; index < arrangement.core.length; index++) assert.ok(Math.abs(arrangement.core[index][0] - arrangement.core[index - 1][0]) <= 7);
  });
  it('gives the violas an off-beat complement to the violin ostinato', () => {
    const project = { ...defaults(), source: '| Am | F | C | G |', sections: { 0: settings('ostinato', 3, 7) } };
    const arrangement = arrange(project);
    const violas = arrangement.parts.find(part => part.name === 'Violas')!;
    const violins = arrangement.parts.find(part => part.name === 'Violins II')!;
    assert.ok(violas.notes.every(note => note.start % 960 === 480));
    assert.notDeepEqual(violas.notes.map(note => note.start), violins.notes.map(note => note.start));
  });
  it('groups 7/8 as 2+2+3 and 6/8 in dotted beats', () => {
    const odd = arrange({ ...defaults(), source: 'meter 7/8\n| Am | F |', sections: { 0: settings('ostinato', 3, 7) } });
    const starts = odd.parts.find(part => part.name === 'Violins II')!.notes.filter(note => note.start < 3360).map(note => note.start);
    assert.deepEqual(starts, [0, 480, 960, 1440, 1920, 2400, 2880]);
    const accents = odd.parts.find(part => part.name === 'Violins II')!.notes.filter(note => note.start < 3360);
    assert.ok(accents[4].velocity > accents[3].velocity && accents[4].velocity > accents[5].velocity, 'group of three starts on the fifth eighth');
  });
  it('names articulations from what each part plays', () => {
    const arrangement = arrange({ ...defaults(), source: '| Am | F |', articulationNames: true, sections: { 0: settings('tremolo', 4, 8) } });
    assert.equal(arrangement.parts.find(part => part.name === 'Violins I')!.articulation, 'Tremolo');
    assert.equal(arrangement.parts.find(part => part.name === 'Basses')!.articulation, 'Sustain');
  });
});
