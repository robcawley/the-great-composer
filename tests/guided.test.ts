import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { arrangeSong, chordFor } from '../engine/blocks';
import { createSong } from '../engine/emotions';
import { editSong } from '../engine/editor';
import { conformSong, inScale, palette, stabilise } from '../engine/lock';
import { audit } from '../engine/audit';
import { writeMidi } from '../engine/midi';
import { feels, stringParts } from '../engine/song';
import { checkMidi } from './midi-check';
import { mountWizard } from '../app/wizard';

describe('scale lock', () => {
  it('keeps every chord of a locked song inside its scale, in every key and feel', () => {
    for (const feel of feels) for (let root = 0; root < 12; root += 5) {
      let song = createSong();
      song.key = { root, name: ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'][root], mode: feel.mode };
      song = editSong(song, song.blocks[0].id, { type: 'key-lock', value: true });
      for (const block of song.blocks) {
        song = editSong(song, block.id, { type: 'emotion', value: 'mysterious' });
        song = editSong(song, block.id, { type: 'dice' });
      }
      for (const block of song.blocks) {
        assert.equal(block.key, 'same');
        for (const bar of block.bars) for (const chord of bar.chords) assert.ok(inScale(chord, song.key), `${feel.mode} ${root}: ${chordFor(chord, song.key).symbol}`);
      }
      const result = audit(arrangeSong(song));
      for (const metric of ['outsideFull','scaleConflicts','parallels','unresolved','runLandingErrors','invalidNotes','overlaps'] as const) assert.equal(result[metric], 0, `${feel.mode}: ${metric}`);
    }
  });
  it('refuses to move a locked block to another key and asks to unlock before changing the song key', () => {
    let song = createSong();
    song = editSong(song, song.blocks[0].id, { type: 'key-lock', value: true });
    const moved = editSong(song, song.blocks[1].id, { type: 'key-move', value: 'lift' });
    assert.equal(moved.blocks[1].key, 'same');
    assert.throws(() => editSong(song, song.blocks[0].id, { type: 'key', root: 4 }), /Unlock/);
    song = editSong(song, song.blocks[0].id, { type: 'key-lock', value: false });
    assert.equal(editSong(song, song.blocks[0].id, { type: 'key', root: 4 }).key.name, 'E');
  });
  it('offers only in-scale chords, sorted by degree, with jobs', () => {
    const song = createSong(); song.key = { root: 2, name: 'D', mode: 'dorian' }; song.keyLocked = true;
    const options = palette(song);
    assert.ok(options.length >= 14);
    assert.ok(options.every(option => inScale(option.chord, song.key)));
    assert.equal(options.find(option => option.chord.degree === 6 && option.chord.spice === 'plain')!.job, 'pull', 'B diminished pulls');
    assert.equal(options[0].job, 'home');
  });
  it('steers chords the tool picked off diminished chords but leaves hand-picked ones', () => {
    const song = createSong(); song.key = { root: 2, name: 'D', mode: 'dorian' }; song.keyLocked = true;
    const block = song.blocks[0];
    block.bars[0].chords = [{ degree: 6, spice: 'lean' }];
    stabilise(song, block);
    assert.notEqual(chordFor(block.bars[0].chords[0], song.key).quality, 'dim');
    const picked = editSong(song, block.id, { type: 'chord', slot: 0, half: 0, value: { degree: 6, spice: 'plain' } });
    assert.equal(chordFor(picked.blocks[0].bars[0].chords[0], song.key).quality, 'dim');
  });
});
describe('parts', () => {
  it('lets each string section be set across the song, and rests silence it', () => {
    let song = createSong();
    song = editSong(song, song.blocks[0].id, { type: 'part', name: 'Basses', value: 'pulse' });
    song = editSong(song, song.blocks[0].id, { type: 'part', name: 'Violas', value: 'off' });
    song = editSong(song, song.blocks[0].id, { type: 'part', name: 'Violins II', value: 'arpeggio' });
    const arrangement = arrangeSong(song);
    const part = (name: string) => arrangement.parts.find(item => item.name === name)!;
    assert.equal(part('Violas').notes.length, 0);
    assert.equal(part('Violins II').articulation, 'Arpeggio');
    assert.ok(part('Basses').notes.length > song.blocks.length * 8, 'pulsing basses');
    checkMidi(writeMidi(arrangement), arrangement);
    assert.deepEqual(writeMidi(arrangeSong(song)), writeMidi(arrangement), 'deterministic');
  });
});
it('walks the guided flow by buttons alone, locks the key, builds parts bottom-up and exports', () => {
  const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'http://localhost' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage, performance,
    fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }) })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  try {
    const root = dom.window.document.querySelector<HTMLElement>('#app')!;
    const wizard = mountWizard(root);
    const click = (selector: string) => { const element = root.querySelector<HTMLElement>(selector); assert.ok(element, selector); element.click(); };
    assert.equal(root.querySelectorAll('input[type=text], textarea').length, 0, 'no typing');
    click('[data-act=new]'); assert.equal(wizard.getStep(), 'feeling');
    click('[data-act=feel][data-val=dorian]'); click('[data-act=next]'); assert.equal(wizard.getStep(), 'key');
    click('[data-act=key][data-val="2"]'); click('[data-act=lock]');
    assert.equal(wizard.getStep(), 'pace'); assert.ok(wizard.getSong().keyLocked); assert.equal(wizard.getSong().key.name, 'D');
    assert.ok(root.querySelector('.lock-chip')?.textContent?.includes('D Bittersweet'));
    click('[data-act=tempo][data-val="84"]'); click('[data-act=meter][data-val="3/4"]'); click('[data-act=next]');
    click('[data-act=shape][data-val=song]'); assert.equal(wizard.getSong().blocks.length, 8); assert.equal(wizard.getStep(), 'block:0:emotion');
    click('[data-act=emotion][data-val=calm]'); click('[data-act=next]'); assert.equal(wizard.getStep(), 'block:0:chords');
    click('[data-act=slot][data-val="1"]'); click('[data-act=chord][data-val="0"]');
    click('[data-act=next]'); click('[data-act=texture][data-val=arpeggio]'); click('[data-act=complexity][data-val="2"]'); click('[data-act=next]');
    assert.equal(wizard.getStep(), 'block:1:emotion');
    for (let block = 1; block < 8; block++) { if (block === 3) click('[data-act=copy-earlier]'); click('[data-act=next]'); click('[data-act=next]'); click('[data-act=next]'); }
    assert.equal(wizard.getStep(), 'parts:0');
    assert.equal(root.querySelectorAll('[data-act=part]').length, 4, 'basses get four choices');
    click('[data-act=part][data-val=hold]'); click('[data-act=next]');
    assert.equal(wizard.getStep(), 'parts:1');
    click('[data-act=part][data-val=pulse]'); click('[data-act=next]'); click('[data-act=part][data-val=answer]'); click('[data-act=next]'); click('[data-act=next]'); click('[data-act=next]');
    assert.equal(wizard.getStep(), 'finish');
    const song = wizard.getSong();
    assert.deepEqual(song.parts, { Basses: 'hold', Cellos: 'pulse', Violas: 'answer' });
    assert.deepEqual(song.meter, [3, 4]); assert.equal(song.tempo, 84);
    assert.deepEqual(song.blocks[3].bars, song.blocks[1].bars, 'second verse repeats the first');
    for (const block of song.blocks) for (const bar of block.bars) for (const chord of bar.chords) assert.ok(inScale(chord, song.key));
    conformSong(song);
    const arrangement = arrangeSong(song); checkMidi(writeMidi(arrangement), arrangement);
    assert.ok(stringParts.every(name => arrangement.parts.some(part => part.name === name)));
    click('[data-act=undo]'); assert.notDeepEqual(wizard.getSong().parts, song.parts);
    wizard.destroy();
  } finally {
    for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  }
});
