import type { Key, Mode } from './types';

interface ScaleDefinition {
  intervals: number[]; degrees: number[]; family: string; description: string;
  detect: boolean; signature?: { offset: number; minor: boolean };
}
const seven = [0,1,2,3,4,5,6];
export const scaleDefinitions = {
  major: { intervals: [0,2,4,5,7,9,11], degrees: seven, family: 'Diatonic', description: 'Stable major colour; the natural fourth needs care over a major third.', detect: true, signature: { offset: 0, minor: false } },
  minor: { intervals: [0,2,3,5,7,8,10], degrees: seven, family: 'Diatonic', description: 'Natural minor; the dominant may locally raise the seventh.', detect: true, signature: { offset: 3, minor: true } },
  dorian: { intervals: [0,2,3,5,7,9,10], degrees: seven, family: 'Diatonic', description: 'Minor with a natural sixth; useful for open minor textures.', detect: true, signature: { offset: 10, minor: false } },
  phrygian: { intervals: [0,1,3,5,7,8,10], degrees: seven, family: 'Diatonic', description: 'Minor with a flat second; a close upper neighbour to the tonic.', detect: true, signature: { offset: 8, minor: false } },
  lydian: { intervals: [0,2,4,6,7,9,11], degrees: seven, family: 'Diatonic', description: 'Major with a sharp fourth; an open major-seventh colour.', detect: true, signature: { offset: 7, minor: false } },
  mixolydian: { intervals: [0,2,4,5,7,9,10], degrees: seven, family: 'Diatonic', description: 'Major with a flat seventh; the basic unaltered dominant scale.', detect: true, signature: { offset: 5, minor: false } },
  locrian: { intervals: [0,1,3,5,6,8,10], degrees: seven, family: 'Diatonic', description: 'Minor with a flat second and flat fifth; fits a half-diminished chord.', detect: true, signature: { offset: 1, minor: false } },
  'harmonic minor': { intervals: [0,2,3,5,7,8,11], degrees: seven, family: 'Minor', description: 'Minor with a raised seventh for leading-tone and dominant pull.', detect: true, signature: { offset: 3, minor: true } },
  'melodic minor': { intervals: [0,2,3,5,7,9,11], degrees: seven, family: 'Minor', description: 'Ascending melodic minor, used as a fixed collection in both directions.', detect: true, signature: { offset: 3, minor: true } },
  'dorian b2': { intervals: [0,1,3,5,7,9,10], degrees: seven, family: 'Melodic minor modes', description: 'Dorian with a flat second; a dark suspended-minor colour.', detect: false },
  'lydian augmented': { intervals: [0,2,4,6,8,9,11], degrees: seven, family: 'Melodic minor modes', description: 'Major seventh with a sharp fourth and sharp fifth.', detect: false },
  'lydian dominant': { intervals: [0,2,4,6,7,9,10], degrees: seven, family: 'Melodic minor modes', description: 'Dominant seventh with a sharp eleventh; useful for tritone substitutions.', detect: false },
  'mixolydian b6': { intervals: [0,2,4,5,7,8,10], degrees: seven, family: 'Melodic minor modes', description: 'Dominant with a flat thirteenth and natural ninth.', detect: false },
  'locrian natural 2': { intervals: [0,2,3,5,6,8,10], degrees: seven, family: 'Melodic minor modes', description: 'Half-diminished colour with a natural ninth.', detect: false },
  altered: { intervals: [0,1,3,4,6,8,10], degrees: [0,1,1,2,3,5,6], family: 'Melodic minor modes', description: 'Dominant third and seventh with flat/sharp ninth and altered fifths; no natural ninth or fifth.', detect: false },
  'phrygian dominant': { intervals: [0,1,4,5,7,8,10], degrees: seven, family: 'Harmonic colours', description: 'Dominant into minor: flat ninth, major third and flat thirteenth.', detect: false },
  'harmonic major': { intervals: [0,2,4,5,7,8,11], degrees: seven, family: 'Harmonic colours', description: 'Major with a flat sixth, connecting major tonic and minor subdominant colours.', detect: false },
  'double harmonic major': { intervals: [0,1,4,5,7,8,11], degrees: seven, family: 'Harmonic colours', description: 'Major third with flat second and sixth; contains two augmented seconds.', detect: false },
  'major pentatonic': { intervals: [0,2,4,7,9], degrees: [0,1,2,4,5], family: 'Pentatonic & blues', description: 'Five-note major collection without the fourth or seventh.', detect: false },
  'minor pentatonic': { intervals: [0,3,5,7,10], degrees: [0,2,3,4,6], family: 'Pentatonic & blues', description: 'Five-note minor collection without the second or sixth.', detect: false },
  'minor blues': { intervals: [0,3,5,6,7,10], degrees: [0,2,3,4,4,6], family: 'Pentatonic & blues', description: 'Minor pentatonic plus a flat-fifth passing colour; not a universal major-chord scale.', detect: false },
  'whole tone': { intervals: [0,2,4,6,8,10], degrees: [0,1,2,3,4,6], family: 'Symmetric', description: 'Six whole steps; fits augmented triads and dominant sharp-fifth colour.', detect: false },
  'half-whole diminished': { intervals: [0,1,3,4,6,7,9,10], degrees: [0,1,1,2,3,4,5,6], family: 'Symmetric', description: 'Alternating half/whole steps from the root; fits altered dominant colour with a natural fifth.', detect: false },
  'whole-half diminished': { intervals: [0,2,3,5,6,8,9,11], degrees: [0,1,2,3,4,5,6,6], family: 'Symmetric', description: 'Alternating whole/half steps from the root; contains the fully diminished seventh chord.', detect: false }
} satisfies Record<string, ScaleDefinition>;

export const scaleNames = Object.keys(scaleDefinitions) as Mode[];
export const modes = Object.fromEntries(scaleNames.map(name => [name, scaleDefinitions[name].intervals])) as Record<Mode, number[]>;
const aliases: Record<string, Mode> = { ionian: 'major', aeolian: 'minor', 'natural minor': 'minor', 'super locrian': 'altered', superlocrian: 'altered', 'dominant diminished': 'half-whole diminished', 'diminished whole-half': 'whole-half diminished', 'blues': 'minor blues' };
export function normaliseMode(value: string): Mode | undefined {
  const name = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return Object.hasOwn(scaleDefinitions, name) ? name as Mode : aliases[name];
}
export function spellScale(key: Key): string[] {
  const letters = ['C','D','E','F','G','A','B'];
  const naturals = [0,2,4,5,7,9,11];
  const tonicLetter = letters.indexOf(key.name[0]);
  return modes[key.mode].map((interval,index) => {
    const letter = (tonicLetter + scaleDefinitions[key.mode].degrees[index]) % 7;
    const difference = ((key.root + interval - naturals[letter] + 18) % 12) - 6;
    return letters[letter] + (difference > 0 ? '#'.repeat(difference) : 'b'.repeat(-difference));
  });
}
export function signatureFor(key: Key): { sharps: number; minor: boolean } | undefined {
  const definition: ScaleDefinition = scaleDefinitions[key.mode];
  if (!definition.signature) return undefined;
  const signatures = [0,-5,2,-3,4,-1,6,1,-4,3,-2,5];
  let sharps = signatures[(key.root + definition.signature.offset) % 12];
  if (key.name.includes('#') && sharps < 0 && sharps + 12 <= 7) sharps += 12;
  if (key.name.includes('b') && sharps > 0 && sharps - 12 >= -7) sharps -= 12;
  return { sharps, minor: definition.signature.minor };
}
