import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMidi } from 'midi-file';
import { parse, parseKey } from '../engine/parser';
import { analyse, chordTones, detectKey, harmoniseScale, keyScale } from '../engine/theory';
import { scaleNames, modes, spellScale, signatureFor } from '../engine/scales';
import { arrange, defaults } from '../engine/arrange';
import { audit } from '../engine/audit';
import { writeMidi } from '../engine/midi';

const harmony = (source: string, key = 'C major') => analyse(parse(source),parseKey(key)).chords;
describe('scale vocabulary and spelling', () => {
  it('accepts aliases while preserving a canonical project value', () => {
    assert.equal(parseKey('C ionian').mode,'major');
    assert.equal(parseKey('A aeolian').mode,'minor');
    assert.equal(parseKey('G superlocrian').mode,'altered');
    assert.equal(parseKey('D  Locrian Natural 2').mode,'locrian natural 2');
    assert.throws(() => parseKey('C imaginary'));
    for (const mode of scaleNames) assert.equal(parseKey(`Db ${mode}`).mode,mode);
  });
  it('spells diatonic and altered scale degrees rather than using a flat-only chromatic table', () => {
    assert.deepEqual(spellScale(parseKey('F# major')),['F#','G#','A#','B','C#','D#','E#']);
    assert.deepEqual(spellScale(parseKey('Bb lydian')),['Bb','C','D','E','F','G','A']);
    assert.deepEqual(spellScale(parseKey('G altered')),['G','Ab','A#','B','C#','Eb','F']);
    assert.deepEqual(spellScale(parseKey('C whole-half diminished')),['C','D','Eb','F','Gb','Ab','Bbb','B']);
  });
  it('contains the distinctive pentatonic, symmetric and melodic-minor collections', () => {
    assert.deepEqual(modes['minor pentatonic'],[0,3,5,7,10]);
    assert.deepEqual(modes['major pentatonic'],[0,2,4,7,9]);
    assert.deepEqual(modes['whole tone'],[0,2,4,6,8,10]);
    assert.deepEqual(modes['lydian dominant'],[0,2,4,6,7,9,10]);
    assert.deepEqual(modes['locrian natural 2'],[0,2,3,5,6,8,10]);
  });
  it('harmonises seven-note scales into a correctly spelled chord palette', () => {
    const dorian = harmoniseScale(parseKey('D dorian'));
    assert.deepEqual(dorian.map(chord => chord.triad),['Dm','Em','F','G','Am','Bdim','C']);
    assert.deepEqual(dorian.map(chord => chord.seventh),['Dm7','Em7','Fmaj7','G7','Am7','Bm7b5','Cmaj7']);
    assert.deepEqual(harmoniseScale(parseKey('F# major'))[6].notes,['E#','G#','B','D#']);
    assert.deepEqual(harmoniseScale(parseKey('C major pentatonic')),[]);
    assert.deepEqual(harmoniseScale(parseKey('C whole-half diminished')),[]);
  });
  it('exports real key signatures and describes nonstandard collections without fabricating signatures', () => {
    assert.deepEqual(signatureFor(parseKey('F# major')),{ sharps: 6, minor: false });
    assert.deepEqual(signatureFor(parseKey('Gb major')),{ sharps: -6, minor: false });
    assert.deepEqual(signatureFor(parseKey('C# major')),{ sharps: 7, minor: false });
    assert.deepEqual(signatureFor(parseKey('A locrian')),{ sharps: -2, minor: false });
    for (const mode of ['whole tone','minor pentatonic','altered']) {
      assert.equal(signatureFor(parseKey(`C ${mode}`)),undefined);
      const project = { ...defaults(), source: '| C | C |', keyOverride: `C ${mode}` };
      const midi = parseMidi(writeMidi(arrange(project)));
      assert.ok(!midi.tracks[0].some(event => event.type === 'keySignature'));
      assert.ok(midi.tracks[0].some(event => event.type === 'text' && event.text === `Key: C ${mode}`));
    }
  });
});
describe('contextual chord scales', () => {
  it('hears the fourth degree as lydian while preserving the parent scale', () => {
    const [chord] = harmony('| Bbmaj7 |','F major');
    assert.equal(chord.scaleName,'Bb lydian');
    assert.deepEqual(chord.scaleNotes,['Bb','C','D','E','F','G','A']);
    assert.ok(chord.tensions.includes(4));
    assert.ok(!chord.avoid.includes(4));
  });
  it('keeps natural ninths and fifths out of an altered dominant scale', () => {
    const [chord] = harmony('| G7alt | Cm |');
    assert.equal(chord.scaleName,'G altered');
    assert.deepEqual(chord.scale,[7,8,10,11,1,3,5]);
    assert.ok(!chord.scale.includes(9));
    assert.ok(!chord.scale.includes(2));
  });
  it('distinguishes diminished seventh, half-diminished and dominant diminished colours', () => {
    assert.equal(harmony('| Bdim7 |')[0].scaleName,'B whole-half diminished');
    assert.equal(harmony('| Bm7b5 |')[0].scaleName,'B locrian');
    assert.equal(harmony('| G7#9 | C |')[0].scaleName,'G half-whole diminished');
    assert.equal(harmony('| G7b9 | Cm |')[0].scaleName,'G phrygian dominant');
    assert.equal(harmony('| G7#11 | C |')[0].scaleName,'G lydian dominant');
    assert.ok(!harmony('| G7#11 | C |')[0].scale.includes(0));
  });
  it('gives a secondary dominant into minor a local scale instead of the blanket key', () => {
    const [chord] = harmony('| A7 | Dm |');
    assert.equal(chord.function,'secondary dominant');
    assert.equal(chord.roman,'V7/ii');
    assert.equal(chord.scaleName,'A phrygian dominant');
    assert.ok(chord.scale.includes(1));
    assert.ok(!chord.scale.includes(0));
  });
  it('reports available tensions and separates avoid tones from written chord tones', () => {
    const [major] = harmony('| Cmaj7 |');
    assert.ok(major.avoid.includes(5));
    assert.ok(!major.tensions.includes(5));
    assert.ok(major.tensions.includes(2));
    const [eleventh] = harmony('| C11 |');
    assert.ok(eleventh.scale.includes(5));
    assert.ok(!eleventh.avoid.includes(5));
    assert.ok(major.alternatives.some(alternative => alternative.name === 'C lydian'));
  });
  it('preserves every entered chord tone and slash-bass scale audit across the chord vocabulary', () => {
    const symbols = 'C Cm C7 Cmaj7 CM7 Cm7 Cm(maj7) Cm7b5 Cø Cdim Cdim7 Caug C+ Csus2 Csus4 C7sus4 C6 Cm6 C6/9 Cadd9 C9 Cm9 Cmaj9 C11 C13 C7b9 C7#9 C7#11 C7alt C5 C/E'.split(' ');
    for (const symbol of symbols) for (const key of ['C major','D minor','F# lydian']) {
      const score = parse(`| ${symbol} | C |`);
      const analysis = analyse(score,parseKey(key));
      for (const tone of chordTones(score.chords[0])) assert.ok(analysis.chords[0].scale.includes(tone),`${symbol} in ${key}`);
      assert.equal(analysis.chords[0].scale.length,analysis.chords[0].scaleNotes.length);
    }
  });
});
describe('harmonic explanation and uncertainty', () => {
  it('labels inversions, half diminished harmony, borrowed chords and chromatic mediants', () => {
    assert.equal(harmony('| C/E |')[0].inversion,'first inversion');
    assert.equal(harmony('| C/G |')[0].inversion,'second inversion');
    assert.equal(harmony('| C6/A |')[0].inversion,'extension in bass');
    assert.equal(harmony('| E/D |','D lydian')[0].inversion,'non-chord pedal bass');
    assert.equal(harmony('| Bm7b5 |')[0].roman,'viiø7');
    const borrowed = harmony('| Fm | C |')[0];
    assert.equal(borrowed.function,'borrowed');
    assert.match(borrowed.explanation,/parallel C minor/);
    assert.equal(harmony('| E | C |')[0].function,'chromatic mediant');
    assert.equal(harmony('| Db7 | C |')[0].function,'tritone sub');
    assert.equal(harmony('| Db7 | C |')[0].scaleName,'Db lydian dominant');
  });
  it('reports harmonic motion without claiming a phrase-ending cadence from chords alone', () => {
    const result = harmony('| Dm | G7 | C | F | C | G7 | Am | G7 |');
    assert.equal(result[0].role,'predominant');
    assert.equal(result[1].role,'dominant');
    assert.equal(result[2].cadence,'authentic motion');
    assert.equal(result[4].cadence,'plagal motion');
    assert.equal(result[6].cadence,'deceptive motion');
    assert.equal(result[7].cadence,'half-cadence candidate');
  });
  it('keeps confidence modest on ambiguous or insufficient harmony', () => {
    assert.ok(detectKey(parse('| C |').chords).confidence < 0.7);
    assert.equal(detectKey(parse('| N.C. |').chords).confidence,0);
    const explicit = analyse(parse('| C |'),parseKey('C major pentatonic'));
    assert.equal(explicit.sections[0].confidence,1);
    assert.deepEqual(explicit.chords[0].scale,keyScale(parseKey('C major pentatonic')));
  });
  it('recognises section changes of tonic and same-tonic mode', () => {
    const changedMode = analyse(parse('key C major\n[A] | C | F | G7 | C |\n[B] | Cm | Fm | G7 | Cm | Cm | Fm | G7 | Cm |'));
    assert.equal(changedMode.sections[0].key.mode,'major');
    assert.equal(changedMode.sections[1].key.mode,'minor');
    const changedTonic = analyse(parse('key C major\n[A] | C | F | G7 | C |\n[B] | D | G | A7 | D | D | G | A7 | D |'));
    assert.equal(changedTonic.sections[1].key.root,2);
    assert.equal(changedTonic.sections[1].key.mode,'major');
  });
  it('lets an explicit non-diatonic scale guide runs without compromising written harmony', () => {
    for (const mode of scaleNames) {
      const project = { ...defaults(), source: '| C | Am | F | G | C |', keyOverride: `C ${mode}`, sections: { 0: { texture: 'arpeggio' as const, density: 8, complexity: 5, take: 1, runs: true } } };
      const result = audit(arrange(project));
      for (const metric of ['outsideFull','scaleConflicts','runLandingErrors','parallels','unresolved'] as const) assert.equal(result[metric],0,`${mode}: ${metric}`);
    }
  });
  it('honours explicit colour-scale headers even when individual chords need a different local scale', () => {
    const result = analyse(parse('key C minor pentatonic\n| Cm | Fm | G7 | Cm |'));
    assert.equal(result.sections[0].key.mode,'minor pentatonic');
    assert.equal(result.chords[0].scaleName,'C minor pentatonic');
    assert.equal(result.chords[1].scaleName,'F dorian');
    assert.ok(result.chords[1].scale.includes(8));
  });
});
