import { mkdir, writeFile } from 'node:fs/promises';

const rate = 22050;
const length = rate * 2;
const data = Buffer.alloc(44 + length * 2);
data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
data.writeUInt16LE(1,20); data.writeUInt16LE(1,22); data.writeUInt32LE(rate,24); data.writeUInt32LE(rate * 2,28);
data.writeUInt16LE(2,32); data.writeUInt16LE(16,34); data.write('data',36); data.writeUInt32LE(length * 2,40);
for (let index = 0; index < length; index++) {
  const time = index / rate;
  let value = 0;
  for (let harmonic = 1; harmonic <= 12; harmonic++) value += Math.sin(2 * Math.PI * 261.625565 * harmonic * time) / (harmonic * harmonic ** 0.35);
  const envelope = Math.min(1, time / 0.08) * Math.min(1, (2 - time) / 0.18);
  data.writeInt16LE(Math.round(value * envelope * 9000), 44 + index * 2);
}
await mkdir('public/samples', { recursive: true });
await writeFile('public/samples/string-c4.wav', data);
