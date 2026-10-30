import { it } from 'node:test';
import assert from 'node:assert/strict';
import { arrangeSong, buildScore, songText } from '../engine/blocks';
import { createSong, setEmotion } from '../engine/emotions';
import { applyRhythm, harmonicRhythms } from '../engine/harmonic-rhythm';
import { audit } from '../engine/audit';
import { parse } from '../engine/parser';
import { scaleNames } from '../engine/scales';

it('gives the starter song genuinely different chord lengths instead of a change every bar', () => {
  const song = createSong(), score = buildScore(song).score;
  assert.ok(new Set(score.chords.map(chord => chord.duration)).size >= 3);
  assert.ok(score.chords.some(chord => chord.duration > 3840));
  assert.ok(score.chords.some(chord => chord.duration < 3840));
  applyRhythm(song,song.blocks[0],'lean');
  assert.deepEqual(buildScore(song).score.chords.filter(chord => chord.section === 0).map(chord => chord.duration),[2880,960,5760,5760]);
});
it('keeps weighted turns and held bars exact when exporting expert text in every meter', () => {
  const song = createSong(); song.blocks = [song.blocks[0]];
  for (const meter of [[2,4],[3,4],[4,4],[5,4],[6,8],[7,8],[9,8],[12,8]] as [number,number][]) for (const rhythm of harmonicRhythms) {
    song.meter = meter; applyRhythm(song,song.blocks[0],rhythm.value);
    const expected = buildScore(song).score;
    const imported = parse(songText(song));
    const events = (score: typeof expected) => score.chords.map(chord => ({ symbol: chord.symbol, start: chord.start, duration: chord.duration }));
    assert.deepEqual(events(imported),events(expected),`${meter.join('/')} ${rhythm.value}`);
    const result = audit(arrangeSong(song));
    for (const metric of ['outsideFull','scaleConflicts','parallels','unresolved','runLandingErrors','invalidNotes','overlaps'] as const) assert.equal(result[metric],0,`${rhythm.value}/${metric}`);
  }
});
it('uses every chord rhythm safely in all supported scales', () => {
  const song = createSong(); song.blocks = [song.blocks[0]];
  for (const mode of scaleNames) for (const rhythm of harmonicRhythms) {
    song.key.mode = mode; setEmotion(song,song.blocks[0],'tense');
    applyRhythm(song,song.blocks[0],rhythm.value);
    const result = audit(arrangeSong(song));
    for (const metric of ['outsideFull','scaleConflicts','parallels','unresolved','runLandingErrors','invalidNotes','overlaps'] as const) assert.equal(result[metric],0,`${mode}/${rhythm.value}/${metric}`);
  }
});
it('rejects invalid weighted durations with a located parse error', () => {
  assert.throws(() => parse('| C@3 G@3 |'),/total 4.*bar 1/);
  assert.throws(() => parse('| C@0 G@4 |'),/positive @duration/);
  assert.throws(() => parse('| ~ |'),/previous chord/);
});
