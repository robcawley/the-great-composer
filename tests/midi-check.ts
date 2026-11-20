import assert from 'node:assert/strict';
import { parseMidi } from 'midi-file';
import type { Arrangement } from '../engine/types';
import { signatureFor } from '../engine/scales';

export function checkMidi(bytes: Uint8Array, expected: Arrangement): void {
  const midi = parseMidi(bytes);
  assert.deepEqual(midi.header,{ format: 1, ticksPerBeat: 960, numTracks: 6 });
  const markers: { tick: number; text: string }[] = [];
  let controllers = 0;
  for (const [trackIndex,track] of midi.tracks.entries()) {
    let tick = 0;
    const active = new Map<number,number>();
    assert.equal(track.filter(event => event.type === 'trackName').length,1);
    for (const event of track) {
      tick += event.deltaTime;
      if ('channel' in event) assert.equal(event.channel,0);
      assert.ok(!['programChange','sysEx','endSysEx'].includes(event.type));
      if (event.type === 'controller') { assert.ok([1,11].includes(event.controllerType)); controllers++; }
      if (event.type === 'marker') { assert.equal(trackIndex,0); markers.push({ tick, text: event.text }); }
      if (event.type === 'noteOn') { assert.ok(trackIndex > 0); assert.equal(active.has(event.noteNumber),false); assert.ok(event.velocity > 0); active.set(event.noteNumber,tick); }
      if (event.type === 'noteOff') { assert.equal(active.has(event.noteNumber),true); assert.ok(tick > active.get(event.noteNumber)!); active.delete(event.noteNumber); }
    }
    assert.equal(active.size,0); assert.equal(tick,expected.score.duration);
  }
  assert.deepEqual(markers,(expected.markers ?? expected.score.sections).map(section => ({ tick: section.start, text: section.name })));
  assert.equal(controllers > 0,expected.project.controllers);
  assert.ok(midi.tracks[0].some(event => event.type === 'setTempo'));
  assert.ok(midi.tracks[0].some(event => event.type === 'timeSignature'));
  if (expected.analysis.sections.some(section => signatureFor(section.key))) assert.ok(midi.tracks[0].some(event => event.type === 'keySignature'));
}
