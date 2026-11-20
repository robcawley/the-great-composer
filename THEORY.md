# Theory and scale guide

## Scale library

All scales transpose to any supported tonic. Sharp/flat spellings follow scale degrees, so F-sharp
major includes E-sharp, rather than displaying F as its leading tone.

| Family | Scales |
| --- | --- |
| Diatonic | Major / ionian, natural minor / aeolian, dorian, phrygian, lydian, mixolydian, locrian |
| Minor | Harmonic minor, melodic minor |
| Melodic minor modes | Dorian b2, lydian augmented, lydian dominant, mixolydian b6, locrian natural 2, altered |
| Harmonic colours | Phrygian dominant, harmonic major, double harmonic major |
| Pentatonic and blues | Major pentatonic, minor pentatonic, minor blues |
| Symmetric | Whole tone, half-whole diminished, whole-half diminished |

Melodic minor uses its ascending form as a fixed collection in both directions. This is an explicit
convention, not an automatic classical descending-natural-minor rule. Altered also accepts
`superlocrian` / `super locrian`; `blues` means minor blues.

Set `key F# major` or `key C whole tone` before the bars. In Analysis, open the scale library to inspect
each collection on the current tonic and choose it. Saved JSON retains the selection in `keyOverride`.
Seven-note scales also have a reference table of triads, sevenths and spelled chord notes. The table
does not change the progression. Pentatonic and octatonic collections do not receive a fabricated
seven-degree harmonisation.

## How chord scales are selected

Written chord tones are mandatory. A compatible section scale is retained and named from the chord
root where a recognised modal rotation exists: Bbmaj7 in F major gets Bb lydian, with E natural.
An incompatible chord receives a local supporting collection rather than an indiscriminate union of
the section scale and altered chord tones.

| Chord / context | Default local choice |
| --- | --- |
| G7alt | G altered; excludes natural ninth and perfect fifth |
| G7#11 | G lydian dominant; excludes natural eleventh |
| G7#9 | G half-whole diminished |
| G7b9 resolving to Cm | G phrygian dominant |
| G7b9 without a minor resolution | G half-whole diminished |
| Fully diminished seventh | Whole-half diminished |
| Half-diminished in compatible major context | Locrian |
| Half-diminished outside the section collection | Locrian natural 2 |
| Augmented outside the section collection | Whole tone |
| Tritone-substitute dominant | Lydian dominant, unless an explicit alteration dictates otherwise |
| Secondary dominant resolving into minor | Phrygian dominant |

For example, a C-minor-pentatonic setting preserves Cm, but Fm needs Ab and therefore receives a local
F-dorian scale. Changing a scale never silently removes a written third, seventh or alteration.
Chord-compatible alternatives are reference suggestions, not separately selected project settings.

Available tensions exclude chord tones and default avoid tones. A non-chord scale tone one semitone
above a chord tone is marked as an avoid tone for sustained voicing. This is a conservative arranging
heuristic, not a prohibition on passing notes. An explicitly written eleventh or flat ninth remains a
chord tone. Runs use the selected local scale; avoid notes can occur briefly while moving to a target.

## Harmonic analysis

The engine distinguishes diatonic, borrowed, secondary-dominant, tritone-substitution, passing-
diminished and chromatic-mediant relationships. Modal borrowing identifies a compatible parallel
collection. Applied dominants use the target chord quality in their numeral, for example A7 → Dm in
C major is V7/ii. Half-diminished chords use ø7, and slash chords report their inversion or pedal bass.

Tonic, predominant, dominant and connecting roles give the functional shape. Authentic, plagal and
deceptive **motion** are reported from chord relationships. A final dominant is a half-cadence
candidate: harmony alone cannot establish phrase endings or the soprano conditions of a perfect
authentic cadence.

Detection ranks the nine tonal modes (seven diatonic plus harmonic and melodic minor), with tonic,
duration, chord-fit and dominant evidence. Natural minor tolerates a raised leading tone on its major
dominant. Confidence is a heuristic score, not a calibrated probability; short or ambiguous inputs
stay modest. Pentatonic, symmetric and other colour collections require an explicit choice, avoiding
overconfident inference from incomplete chord sets. Section detection can recognise tonic changes
and a major/minor change on the same tonic. A global override fixes the selected centre across sections.

## MIDI representation

Traditional tonal modes use their parent key signature; harmonic and melodic minor use the minor
signature. Enharmonic tonic spelling is respected where a signature with up to seven accidentals
exists. Other collections have no unique standard MIDI key signature, so they receive a conductor
text event naming the collection instead. Every section includes a `Key: tonic scale` text event to
preserve the exact modal name alongside conventional metadata.

## Verification and references

`npm test` includes specific altered-note exclusions, modal spelling, chord-palette construction,
inversion and function labels, section modulation, honest ambiguity, nonstandard MIDI metadata, and
generated-run audits under every library scale. Existing fixture and sound-neutral MIDI tests remain.
This does not replace hearing the results with assigned instruments in Logic.

The scale collections and chord-tone-first approach follow conventional theory described in
[Collections](https://viva.pressbooks.pub/openmusictheory/chapter/collections/) and
[How to Determine Chord-Scale Relationships](https://musictheory.pugetsound.edu/mt21c/HowToDetermineChord-ScaleRelationships.html).
Descriptions and implementation here are original; no source text or music examples are bundled.
