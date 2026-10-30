import { it } from 'node:test';
import assert from 'node:assert/strict';
import { Preview } from '../app/preview';
import { createSong } from '../engine/emotions';
import { arrangeSong } from '../engine/blocks';

it('uses distinct bundled registers and a pluck, schedules promptly, and cancels stale previews', async () => {
  const paths: string[] = [], starts: { time: number; sample: number; loop: boolean; rate: number }[] = [];
  class Context {
    currentTime = 10; destination = {};
    async resume(): Promise<void> {}
    async decodeAudioData(bytes: ArrayBuffer) { return { sample: new Uint8Array(bytes)[0] }; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    createBufferSource() {
      return { buffer: { sample: -1 }, loop: false, loopStart: 0, loopEnd: 0, playbackRate: { value: 1 }, onended: () => {},
        connect(gain: unknown) { return gain; }, disconnect() {}, stop() {},
        start(time: number) { starts.push({ time, sample: this.buffer.sample, loop: this.loop, rate: this.playbackRate.value }); } };
    }
  }
  const originals = new Map<string,PropertyDescriptor | undefined>();
  for (const [name,value] of Object.entries({ AudioContext: Context, fetch: async (path: string) => { const index = paths.push(path) - 1; return { ok: true, arrayBuffer: async () => new Uint8Array([index]).buffer }; } })) {
    originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name)); Object.defineProperty(globalThis,name,{ value, configurable: true, writable: true });
  }
  const preview = new Preview();
  try {
    const arrangement = arrangeSong(createSong());
    arrangement.parts.forEach(part => part.notes = []);
    arrangement.parts[0].notes = [36,60,84,60].map((pitch,index) => ({ pitch, start: 0, duration: index === 3 ? 100 : 960, velocity: 80 }));
    const audible = new Set([arrangement.parts[0].name]);
    const stale = preview.play(arrangement,audible); preview.stop(); await stale;
    assert.equal(starts.length,0);
    await preview.play(arrangement,audible);
    assert.deepEqual(paths,['/samples/string-low.wav','/samples/string-mid.wav','/samples/string-high.wav','/samples/string-pluck.wav']);
    assert.deepEqual(starts.map(start => start.sample),[0,1,2,3]);
    assert.equal(starts[3].loop,false); assert.equal(starts[0].loop,true);
    assert.equal(starts[2].rate,2);
    for (const start of starts) assert.ok(start.time >= 10 && start.time <= 10.1);
  } finally { preview.stop(); for (const [name,descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis,name,descriptor); else Reflect.deleteProperty(globalThis,name); } }
});
