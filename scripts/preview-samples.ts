import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('public/samples',{ recursive: true });
for (const [name,pitch,decay] of [['low',36,0],['mid',60,0],['high',72,0],['pluck',60,5]] as const) {
  const rate = 22050, length = rate * 2;
  const data = Buffer.alloc(44 + length * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8,4); data.write('WAVEfmt ',8); data.writeUInt32LE(16,16);
  data.writeUInt16LE(1,20); data.writeUInt16LE(1,22); data.writeUInt32LE(rate,24); data.writeUInt32LE(rate * 2,28);
  data.writeUInt16LE(2,32); data.writeUInt16LE(16,34); data.write('data',36); data.writeUInt32LE(length * 2,40);
  const frequency = 440 * 2 ** ((pitch - 69) / 12);
  for (let index = 0; index < length; index++) {
    const time = index / rate;
    let value = 0;
    for (let harmonic = 1; harmonic <= (name === 'high' ? 9 : 16); harmonic++) value += Math.sin(2 * Math.PI * frequency * harmonic * time + (decay ? 0 : 0.003 * Math.sin(time * 31))) / harmonic ** (name === 'low' ? 1.6 : name === 'high' ? 1.2 : 1.35);
    const envelope = Math.min(1,time / (decay ? 0.004 : 0.035)) * Math.min(1,(2 - time) / 0.12) * Math.exp(-decay * time);
    data.writeInt16LE(Math.round(Math.max(-1,Math.min(1,value * envelope * 0.28)) * 32767),44 + index * 2);
  }
  await writeFile(`public/samples/string-${name}.wav`,data);
}
