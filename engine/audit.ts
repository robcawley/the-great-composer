import { orchestra } from './orchestra';
import { chordTones } from './theory';
import { parallelPerfect, parallelsMatter, resolutions } from './voice-leading';
import { mod, type Arrangement } from './types';

export function audit(arrangement: Arrangement) {
  const { score, analysis, core } = arrangement;
  let notes = 0;
  let outsideFull = 0;
  let outsideComfort = 0;
  let scaleConflicts = 0;
  let approaches = 0;
  let parallels = 0;
  let unresolved = 0;
  let runNotes = 0;
  let runLandingErrors = 0;
  let invalidNotes = 0;
  let overlaps = 0;
  for (const [index, chord] of score.chords.entries()) {
    if (!index || !chord.intervals.length || !score.chords[index - 1].intervals.length) continue;
    if (parallelsMatter(score.chords[index - 1],chord) && parallelPerfect(core[index - 1],core[index])) parallels++;
    if (!resolutions(score.chords[index - 1],chord,core[index - 1],core[index])) unresolved++;
  }
  for (const part of arrangement.parts) {
    const instrument = orchestra[part.instrument];
    const previous = new Map<number, number>();
    for (const note of part.notes) {
      notes++;
      if (note.pitch < instrument.full[0] || note.pitch > instrument.full[1]) outsideFull++;
      if (note.pitch < instrument.comfortable[0] || note.pitch > instrument.comfortable[1]) outsideComfort++;
      if (note.duration <= 0 || note.start < 0 || note.start + note.duration > score.duration || note.velocity < 1 || note.velocity > 127) invalidNotes++;
      if ((previous.get(note.pitch) ?? -1) > note.start) overlaps++;
      previous.set(note.pitch,note.start + note.duration);
      if (note.approach) approaches++;
      else for (const [chordIndex, chord] of score.chords.entries()) {
        // A tied note must belong to the chord-scale of every chord it sounds over.
        if (chord.start >= note.start + note.duration || chord.start + chord.duration <= note.start || !chord.intervals.length) continue;
        if (!analysis.chords[chordIndex].scale.includes(mod(note.pitch))) { scaleConflicts++; break; }
      }
      if (note.runTarget !== undefined) {
        runNotes++;
        const target = score.chords.find(chord => chord.start === note.runTarget);
        const landing = part.notes.find(candidate => candidate.start === note.runTarget);
        if (!target || !landing || !chordTones(target).includes(mod(landing.pitch))) runLandingErrors++;
      }
    }
  }
  return { notes, outsideFull, outsideComfort, outsideComfortPercent: Number((100 * outsideComfort / Math.max(1,notes)).toFixed(2)), scaleConflicts, approaches, parallels, unresolved, runNotes, runLandingErrors, invalidNotes, overlaps };
}
