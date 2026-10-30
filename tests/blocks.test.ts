import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseMidi } from 'midi-file';
import { arrangeSong, buildScore, loadSong, songText } from '../engine/blocks';
import { createSong, emotions, fillBlock, moveKey, seeded, setEmotion, surprise } from '../engine/emotions';
import { defaults } from '../engine/arrange';
import { audit } from '../engine/audit';
import { writeMidi } from '../engine/midi';
import { names } from '../engine/theory';
import { scaleNames } from '../engine/scales';
import { History } from '../engine/song';
import { checkMidi } from './midi-check';
import { editSong, type Edit } from '../engine/editor';

const hardChecks = (result: ReturnType<typeof audit>, label = '') => {
  for (const metric of ['outsideFull','scaleConflicts','parallels','unresolved','runLandingErrors','invalidNotes','overlaps'] as const) assert.equal(result[metric],0,`${label}: ${metric}`);
};
describe('block builder', () => {
  it('exhaustively writes every emotion bank in every key and library mode', () => {
    const song = createSong(); song.blocks = [song.blocks[0]];
    let count = 0;
    for (const [name,emotion] of Object.entries(emotions)) {
      assert.ok(emotion.bank.length >= 8);
      for (let root = 0; root < 12; root++) for (const mode of scaleNames) for (let bank = 0; bank < emotion.bank.length; bank++) {
        song.key = { root, name: names[root], mode };
        setEmotion(song,song.blocks[0],name); fillBlock(song,song.blocks[0],bank);
        const label = `${name}/${bank}/${names[root]} ${mode}`;
        try { hardChecks(audit(arrangeSong(song)),label); } catch (error) { throw new Error(label,{ cause: error }); }
        count++;
      }
    }
    assert.equal(count,14 * 8 * 12 * 24);
    console.log(`Exhaustive emotion bank audit: ${count} arrangements`);
  });
  it('keeps interiors and distant blocks identical after a block edit or TAKE', () => {
    const original = createSong();
    const before = arrangeSong(original);
    const changed = structuredClone(original);
    changed.blocks[1].take++;
    fillBlock(changed,changed.blocks[1],4);
    const after = arrangeSong(changed);
    const bar = original.meter[0] * 4 / original.meter[1] * 960;
    for (const [index,part] of before.parts.entries()) {
      const stable = (note: { start: number }) => note.start < 3 * bar || (note.start >= 9 * bar && note.start < 11 * bar) || note.start >= 12 * bar;
      assert.deepEqual(part.notes.filter(stable),after.parts[index].notes.filter(stable));
    }
    hardChecks(audit(after));
    assert.notDeepEqual(writeMidi(before),writeMidi(after));
    assert.deepEqual(writeMidi(after),writeMidi(arrangeSong(changed)));
  });
  it('isolates emotion, key, register, density, split and push edits to the allowed neighbourhood', () => {
    const original = createSong(), before = arrangeSong(original);
    const edits: Edit[] = [{ type: 'emotion', value: 'dreamy' },{ type: 'key-move', value: 'lift' },{ type: 'register', value: 'high' },{ type: 'energy', value: 9 },{ type: 'split', slot: 2 },{ type: 'push', slot: 0 }];
    for (const edit of edits) {
      const after = arrangeSong(editSong(original,original.blocks[1].id,edit));
      hardChecks(audit(after),edit.type);
      const stable = (note: { start: number }) => note.start < 3 * 3840 || (note.start >= 9 * 3840 && note.start < 11 * 3840) || note.start >= 12 * 3840;
      for (const [index,part] of before.parts.entries()) assert.deepEqual(part.notes.filter(stable),after.parts[index].notes.filter(stable),edit.type);
    }
  });
  it('respects locks and makes surprise repeatable', () => {
    const song = createSong(); song.blocks[0].locked = true;
    const twin = structuredClone(song), locked = structuredClone(song.blocks[0]);
    surprise(song); surprise(twin);
    assert.deepEqual(song,twin);
    assert.deepEqual(song.blocks[0],locked);
    assert.notEqual(song.blocks[1].take,1);
    hardChecks(audit(arrangeSong(song)));
  });
  it('joins every emotion pair across different keys without changing the fixed block interiors', () => {
    for (const first of Object.keys(emotions)) for (const second of Object.keys(emotions)) {
      const song = createSong(); song.blocks = song.blocks.slice(0,2);
      setEmotion(song,song.blocks[0],first); setEmotion(song,song.blocks[1],second);
      moveKey(song,song.blocks[1],'lift');
      hardChecks(audit(arrangeSong(song)),`${first} → ${second}`);
    }
  });
  it('audits varied multi-block songs with splits, pushes, key changes and busy entrances', () => {
    const rng = seeded('multi-block-regression');
    for (let take = 1; take <= 100; take++) {
      const song = createSong(); song.take = take;
      for (const block of song.blocks) {
        const mode = scaleNames[Math.floor(rng() * scaleNames.length)];
        const root = Math.floor(rng() * 12); block.key = { root, name: names[root], mode };
        setEmotion(song,block,Object.keys(emotions)[Math.floor(rng() * 14)]);
        block.complexity = 5; block.runs = true; block.bigEntrance = true;
        block.bars[0].push = rng() > 0.5;
        if (rng() > 0.5) block.bars[2].chords = [block.bars[2].chords[0],{ degree: 5, spice: 'softer' }];
      }
      hardChecks(audit(arrangeSong(loadSong(song))),`multi-block TAKE ${take}`);
    }
  });
  it('round-trips v2 and loads v1 as an expert song', () => {
    const song = createSong();
    assert.deepEqual(loadSong(JSON.parse(JSON.stringify(song))),song);
    assert.deepEqual(loadSong(defaults()).expert,defaults());
    assert.throws(() => loadSong({ ...song, nextId: 1 }));
    const bad = structuredClone(song); bad.blocks[0].bars[0].chords[0].degree = 99;
    assert.throws(() => loadSong(bad));
    assert.match(songText(song),/\[Intro\] \|/);
  });
  it('supports more than 50 undo/redo steps without aliasing', () => {
    const history = new History(createSong());
    for (let step = 0; step < 60; step++) { const next = structuredClone(history.value); next.tempo = 100 + step; history.set(next); }
    const final = structuredClone(history.value);
    for (let step = 0; step < 60; step++) history.undo();
    assert.equal(history.value.tempo,100);
    for (let step = 0; step < 60; step++) history.redo();
    assert.deepEqual(history.value,final);
  });
  it('handles per-block lift, chord scales, split/push, merged markers and MIDI rules', () => {
    const song = createSong();
    song.blocks[1].section = 'Intro';
    song.blocks[2].bars[0].chords = [song.blocks[2].bars[0].chords[0],{ degree: 5, spice: 'richer' }]; song.blocks[2].bars[0].push = true;
    moveKey(song,song.blocks[3],'lift');
    const arrangement = arrangeSong(song); hardChecks(audit(arrangement));
    checkMidi(writeMidi(arrangement),arrangement);
    assert.equal(arrangement.analysis.sections[3].key.root,2);
    assert.ok(arrangement.analysis.chords.at(-1)!.scale.includes(buildScore(song).score.chords.at(-1)!.root));
    const midi = parseMidi(writeMidi(arrangement));
    assert.equal(midi.header.format,1); assert.equal(midi.header.ticksPerBeat,960);
    assert.equal(midi.tracks.length,6);
    assert.deepEqual(midi.tracks[0].filter(event => event.type === 'marker').map(event => event.text),['Intro','Chorus','Outro']);
    let tick = 0;
    let lifted = false;
    for (const event of midi.tracks[0]) { tick += event.deltaTime; if (event.type === 'keySignature' && tick === 12 * 3840) { assert.equal(event.key,2); lifted = true; } }
    assert.ok(lifted);
    for (const track of midi.tracks) for (const event of track) {
      if ('channel' in event) assert.equal(event.channel,0);
      assert.ok(!['programChange','sysEx','endSysEx'].includes(event.type));
      if (event.type === 'controller') assert.ok([1,11].includes(event.controllerType));
    }
    song.controllers = false;
    const dry = arrangeSong(song); checkMidi(writeMidi(dry),dry);
    for (const track of parseMidi(writeMidi(dry)).tracks) assert.ok(!track.some(event => event.type === 'controller'));
  });
});
