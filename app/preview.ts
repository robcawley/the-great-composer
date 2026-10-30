import { PPQ, type Arrangement, type Part } from '../engine/types';

const samples = [ ['low',36], ['mid',60], ['high',72], ['pluck',60] ] as const;
export class Preview {
  private context?: AudioContext;
  private buffers = new Map<string,AudioBuffer>();
  private files?: Promise<ArrayBuffer[]>;
  private warming?: Promise<void>;
  private sources = new Set<AudioBufferSourceNode>();
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private origin = 0;
  private bounds = { start: 0, end: 0 };
  private seconds = 1;
  private looping = false;
  private running = false;
  preload(): void {
    this.files ??= Promise.all(samples.map(async ([name]) => {
      const response = await fetch(`/samples/string-${name}.wav`);
      if (!response.ok) throw new Error('Bundled preview sample is missing');
      return response.arrayBuffer();
    }));
    void this.files.catch(() => {});
  }
  async warm(): Promise<void> {
    this.preload(); this.context ??= new AudioContext();
    const resumed = this.context.resume();
    this.warming ??= this.files!.then(async files => { await Promise.all(files.map(async (bytes,index) => this.buffers.set(samples[index][0],await this.context!.decodeAudioData(bytes.slice(0))))); });
    await Promise.all([resumed,this.warming]);
  }
  get tick(): number | undefined {
    if (!this.running || !this.context) return undefined;
    const duration = this.bounds.end - this.bounds.start;
    const elapsed = Math.max(0,(this.context.currentTime - this.origin) / this.seconds);
    if (!this.looping && elapsed >= duration) return undefined;
    return this.bounds.start + (this.looping ? elapsed % duration : elapsed);
  }
  stop(): void {
    this.generation++; this.running = false; clearTimeout(this.timer);
    for (const source of this.sources) { try { source.stop(); } catch {} }
    this.sources.clear();
  }
  async play(arrangement: Arrangement, audible: Set<string>, section?: number, loop = false, block = false): Promise<void> {
    this.stop(); const generation = this.generation;
    await this.warm();
    if (generation !== this.generation) return;
    this.bounds = section === undefined ? { start: 0, end: arrangement.score.duration } : arrangement.score.sections[section];
    this.seconds = 60 / arrangement.score.tempo / PPQ;
    this.origin = this.context!.currentTime + 0.025; this.looping = loop; this.running = true;
    const parts: Pick<Part,'name' | 'notes'>[] = block ? [{ name: 'Harmony', notes: arrangement.score.chords.flatMap((chord,index) => chord.intervals.length ? arrangement.core[index].map(pitch => ({ pitch, start: chord.start, duration: chord.duration * 0.94, velocity: 65 })) : []) }] : arrangement.parts;
    const schedule = (origin: number) => {
      if (generation !== this.generation) return;
      const context = this.context!;
      for (const part of parts) {
        if (!block && !audible.has(part.name)) continue;
        for (const note of part.notes) {
          if (note.start >= this.bounds.end || note.start + note.duration <= this.bounds.start) continue;
          const start = Math.max(note.start,this.bounds.start);
          const duration = (Math.min(note.start + note.duration,this.bounds.end) - start) * this.seconds;
          const pluck = duration < 0.28;
          const sample = pluck ? samples[3] : note.pitch < 50 ? samples[0] : note.pitch < 75 ? samples[1] : samples[2];
          const source = context.createBufferSource(); source.buffer = this.buffers.get(sample[0])!;
          source.playbackRate.value = 2 ** ((note.pitch - sample[1]) / 12);
          source.loop = !pluck; source.loopStart = 0.3; source.loopEnd = 1.3;
          const gain = context.createGain(), time = origin + (start - this.bounds.start) * this.seconds, level = note.velocity / 127 * 0.1;
          gain.gain.setValueAtTime(0,time); gain.gain.linearRampToValueAtTime(level,time + Math.min(0.02,duration / 4));
          gain.gain.setValueAtTime(level,time + duration * 0.8); gain.gain.linearRampToValueAtTime(0,time + duration);
          source.connect(gain).connect(context.destination); source.start(time); source.stop(time + duration + 0.005);
          this.sources.add(source);
          source.onended = () => { source.disconnect(); gain.disconnect(); this.sources.delete(source); };
        }
      }
      if (loop) {
        const next = origin + (this.bounds.end - this.bounds.start) * this.seconds;
        this.timer = setTimeout(() => schedule(next),Math.max(10,(next - context.currentTime - 0.2) * 1000));
      }
    };
    schedule(this.origin);
  }
  /** Play a short run of chords (each a list of MIDI pitches) for tapping keys, moods and chord tiles. */
  async chords(sequence: number[][], seconds = 0.9): Promise<void> {
    this.stop(); const generation = this.generation;
    await this.warm();
    if (generation !== this.generation) return;
    const context = this.context!, origin = context.currentTime + 0.02;
    sequence.forEach((pitches, index) => pitches.forEach(pitch => {
      const sample = pitch < 50 ? samples[0] : pitch < 75 ? samples[1] : samples[2];
      const source = context.createBufferSource(); source.buffer = this.buffers.get(sample[0])!;
      source.playbackRate.value = 2 ** ((pitch - sample[1]) / 12); source.loop = true; source.loopStart = 0.3; source.loopEnd = 1.3;
      const gain = context.createGain(), time = origin + index * seconds, length = seconds * 0.95, level = 0.07;
      gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(level, time + 0.04);
      gain.gain.setValueAtTime(level, time + length * 0.75); gain.gain.linearRampToValueAtTime(0, time + length);
      source.connect(gain).connect(context.destination); source.start(time); source.stop(time + length + 0.01);
      this.sources.add(source); source.onended = () => { source.disconnect(); gain.disconnect(); this.sources.delete(source); };
    }));
  }
}
