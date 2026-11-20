import { PPQ, type Arrangement } from './types';
import { signatureFor } from './scales';

function variable(value: number): number[] {
  const bytes = [value & 127];
  while ((value = Math.floor(value / 128)) > 0) bytes.unshift((value & 127) | 128);
  return bytes;
}
const utf8 = (text: string) => [...new TextEncoder().encode(text)];
const uint32 = (value: number) => [value >>> 24 & 255, value >>> 16 & 255, value >>> 8 & 255, value & 255];
const meta = (type: number, bytes: number[]) => [255, type, ...variable(bytes.length), ...bytes];
interface Event { tick: number; order: number; data: number[] }
function track(events: Event[], end: number): number[] {
  events.push({ tick: end, order: 9, data: [255,47,0] });
  events.sort((first, second) => first.tick - second.tick || first.order - second.order);
  let tick = 0;
  const bytes: number[] = [];
  for (const event of events) { bytes.push(...variable(event.tick - tick), ...event.data); tick = event.tick; }
  return [...utf8('MTrk'), ...uint32(bytes.length), ...bytes];
}
export function writeMidi(arrangement: Arrangement): Uint8Array {
  const { score, project, analysis } = arrangement;
  const tempo = Math.round(60000000 / score.tempo);
  const conductor: Event[] = [
    { tick: 0, order: 0, data: meta(3, utf8('Conductor')) },
    { tick: 0, order: 1, data: meta(81, [tempo >>> 16 & 255, tempo >>> 8 & 255, tempo & 255]) },
    { tick: 0, order: 2, data: meta(88, [score.meter[0], Math.log2(score.meter[1]), score.meter[1] === 8 ? 36 : 24, 8]) }
  ];
  for (const section of score.sections) {
    const key = analysis.sections[section.index].key;
    const signature = signatureFor(key);
    if (signature) conductor.push({ tick: section.start, order: 3, data: meta(89, [signature.sharps & 255, signature.minor ? 1 : 0]) });
    conductor.push({ tick: section.start, order: 3, data: meta(1, utf8(`Key: ${key.name} ${key.mode}`)) });
  }
  for (const marker of arrangement.markers ?? score.sections) conductor.push({ tick: marker.start, order: 4, data: meta(6, utf8(marker.name)) });
  const tracks = [track(conductor, score.duration)];
  for (const part of arrangement.parts) {
    const label = part.name + (project.articulationNames ? ` – ${part.articulation}` : '');
    const events: Event[] = [{ tick: 0, order: 0, data: meta(3, utf8(label)) }];
    for (const note of part.notes) {
      events.push({ tick: note.start, order: 3, data: [0x90, note.pitch, note.velocity] }, { tick: note.start + note.duration, order: 1, data: [0x80, note.pitch, 0] });
    }
    if (project.controllers) for (const control of part.controls) events.push({ tick: control.tick, order: 2, data: [0xB0, control.controller, control.value] });
    tracks.push(track(events, score.duration));
  }
  const header = [...utf8('MThd'),0,0,0,6,0,1,0,tracks.length,PPQ >>> 8,PPQ & 255];
  const total = header.length + tracks.reduce((sum, bytes) => sum + bytes.length, 0);
  const result = new Uint8Array(total);
  result.set(header);
  let offset = header.length;
  for (const bytes of tracks) { result.set(bytes, offset); offset += bytes.length; }
  return result;
}
