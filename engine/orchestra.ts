export interface Instrument {
  family: 'Strings' | 'Brass' | 'Woodwinds' | 'Colour'; full: [number, number]; comfortable: [number, number];
  weak: [number, number]; strong: [number, number]; agility: number; sustain: boolean;
  loudness: { low: number; mid: number; high: number; soft: number; loud: number }; doublings: string[]; divisi: boolean;
}
function instrument(family: Instrument['family'], full: [number, number], comfortable: [number, number], agility: number, sustain: boolean, doublings: string[] = [], divisi = false): Instrument {
  return { family, full, comfortable, weak: [full[0], comfortable[0]], strong: [comfortable[0], comfortable[1]], agility, sustain,
    loudness: { low: family === 'Woodwinds' ? 0.4 : 0.7, mid: family === 'Brass' ? 1.7 : 1, high: family === 'Brass' ? 2 : 1.2, soft: 0.4, loud: 1.4 }, doublings, divisi };
}
export const orchestra: Record<string, Instrument> = {
  'Violins I': instrument('Strings',[55,103],[67,91],8,true,['Flutes'],true),
  'Violins II': instrument('Strings',[55,100],[60,84],8,true,['Violins I'],true),
  Violas: instrument('Strings',[48,88],[55,76],7,true,['Clarinets'],true),
  Cellos: instrument('Strings',[36,84],[43,69],6,true,['Bassoons','Basses'],true),
  Basses: instrument('Strings',[28,67],[33,55],4,true,['Cellos'],true),
  Horns: instrument('Brass',[34,82],[48,74],4,false,['Violas','Cellos']),
  Trumpets: instrument('Brass',[54,86],[60,79],6,false),
  Trombones: instrument('Brass',[40,77],[46,70],3,false),
  'Bass Trombone': instrument('Brass',[34,70],[40,62],3,false,['Basses']),
  Tuba: instrument('Brass',[28,65],[33,57],2,false,['Basses']),
  Piccolo: instrument('Woodwinds',[74,108],[79,100],10,false,['Violins I']),
  Flutes: instrument('Woodwinds',[60,96],[72,90],10,false,['Violins I']),
  Oboes: instrument('Woodwinds',[58,91],[65,84],8,false),
  'Cor Anglais': instrument('Woodwinds',[52,81],[58,76],6,false),
  Clarinets: instrument('Woodwinds',[50,94],[58,86],10,false,['Violas']),
  'Bass Clarinet': instrument('Woodwinds',[34,79],[40,69],7,false),
  Bassoons: instrument('Woodwinds',[34,79],[43,70],6,false,['Cellos']),
  Contrabassoon: instrument('Woodwinds',[22,58],[28,50],3,false,['Basses']),
  Piano: instrument('Colour',[21,108],[36,96],12,false),
  Harp: instrument('Colour',[24,103],[36,91],10,false),
  Celesta: instrument('Colour',[60,108],[67,100],10,false),
  Glockenspiel: instrument('Colour',[79,108],[84,103],7,false),
  Timpani: instrument('Colour',[38,57],[41,53],5,false),
  'Low Percussion': instrument('Colour',[36,60],[36,60],6,false),
  Cymbals: instrument('Colour',[60,84],[60,84],8,true),
  'Pulse Percussion': instrument('Colour',[48,84],[48,84],10,false)
};
