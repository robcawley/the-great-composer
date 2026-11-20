import { parse, parseKey } from './parser';
import { analyse, chordTones } from './theory';
import { orchestra } from './orchestra';
import { voiceLead } from './voice-leading';
import { PPQ, mod, partChoices, type Analysis, type Arrangement, type Note, type Part, type Project, type Score, type SectionSettings } from './types';

export const defaultSource = 'tempo 85\nmeter 4/4\nkey D minor\n[Verse] | Dm | Dm | Bb | C |\n[Chorus] | Dm | Bb | F | C |\n[Bridge] | Dm | Gm | Bb | A |\n[Build] | Bb | C | Dm | A |';
export const defaults = (): Project => ({ version: 1, source: defaultSource, take: 1, voicing: 'open', controllers: true, articulationNames: false, sections: {} });
export function sectionSettings(project: Project, section: number): SectionSettings {
  return project.sections[String(section)] ?? { texture: 'pad', density: 5, complexity: 2, take: 1, runs: true };
}
export function loadProject(value: unknown): Project {
  if (!value || typeof value !== 'object') throw new Error('Project must be an object');
  const project = value as Project;
  if (project.version !== 1 || typeof project.source !== 'string' || !Number.isSafeInteger(project.take) || project.take < 1 ||
    !['close','open','colour'].includes(project.voicing) || typeof project.controllers !== 'boolean' || typeof project.articulationNames !== 'boolean' ||
    !project.sections || typeof project.sections !== 'object' || Array.isArray(project.sections)) throw new Error('Invalid version 1 project');
  if (project.keyOverride !== undefined) parseKey(project.keyOverride);
  for (const settings of Object.values(project.sections)) {
    if (!settings || !['pad','ostinato','arpeggio','tremolo','pulses'].includes(settings.texture) || !Number.isInteger(settings.density) || settings.density < 1 || settings.density > 10 ||
      !Number.isInteger(settings.complexity) || settings.complexity < 1 || settings.complexity > 5 || !Number.isSafeInteger(settings.take) || settings.take < 1 || typeof settings.runs !== 'boolean' || (settings.parts !== undefined && (typeof settings.parts !== 'object' || Object.entries(settings.parts).some(([name, choice]) => !partNames.includes(name) || !partChoices.includes(choice!))))) throw new Error('Invalid section settings');
  }
  parse(project.source);
  return structuredClone(project);
}
type Role = 'sustain' | 'bass' | 'figure' | 'offbeat' | 'pulse' | 'arp' | 'counter' | 'tremolo';
interface Ev { at: number; len: number; tone: number }
const SIXTEENTH = PPQ / 4;
const partNames = ['Basses','Cellos','Violas','Violins II','Violins I'];

/** Which job each string section does for a texture. Voice 0 = Basses … 4 = Violins I. */
function roleFor(voice: number, settings: SectionSettings): Role | undefined {
  const { texture, density, complexity } = settings;
  const choice = settings.parts?.[partNames[voice]] ?? 'auto';
  if (choice === 'off') return undefined;
  if (choice !== 'auto') return ({ hold: voice === 0 ? 'bass' : 'sustain', pulse: 'pulse', figure: 'figure', answer: 'offbeat', arpeggio: 'arp', shimmer: 'tremolo' } as const)[choice];
  const active = voice === 0 || voice === 4 || density >= (voice === 2 ? 5 : 3);
  if (!active) return undefined;
  if (voice === 0) return texture === 'pulses' && complexity >= 3 ? 'pulse' : 'bass';
  if (complexity === 1 || texture === 'pad') return 'sustain';
  if (texture === 'ostinato') return voice === 3 ? 'figure' : voice === 2 ? (density >= 6 ? 'offbeat' : 'sustain') : voice === 1 ? (density >= 6 ? 'pulse' : 'sustain') : 'sustain';
  if (texture === 'arpeggio') return voice === 3 ? 'arp' : voice === 2 && density >= 6 ? 'counter' : 'sustain';
  if (texture === 'tremolo') return voice === 1 && density < 6 ? 'sustain' : 'tremolo';
  return 'pulse';
}
/** Beat groups in sixteenths: simple meters in beats, compound in dotted beats, 7/8 as 2+2+3. */
export function meterGroups(meter: [number, number]): number[] {
  const [count, unit] = meter;
  if (unit === 4) return Array(count).fill(4);
  if (count === 7) return [4,4,6];
  if (count % 3 === 0) return Array(count / 3).fill(6);
  return Array(Math.floor(count / 2)).fill(4).concat(count % 2 ? [2] : []);
}
const figures: Record<number, Ev[][][]> = {
  4: [
    [[{ at: 0, len: 2, tone: 0 }, { at: 2, len: 2, tone: 0 }]],
    [[{ at: 0, len: 2, tone: 0 }, { at: 2, len: 2, tone: 1 }], [{ at: 0, len: 2, tone: 1 }, { at: 2, len: 2, tone: 0 }]],
    [[{ at: 0, len: 2, tone: 0 }, { at: 2, len: 1, tone: 1 }, { at: 3, len: 1, tone: 0 }], [{ at: 0, len: 1, tone: 0 }, { at: 1, len: 1, tone: 1 }, { at: 2, len: 2, tone: 0 }]],
    [[{ at: 0, len: 1, tone: 0 }, { at: 1, len: 1, tone: 1 }, { at: 2, len: 1, tone: 2 }, { at: 3, len: 1, tone: 1 }], [{ at: 0, len: 1, tone: 0 }, { at: 1, len: 1, tone: 2 }, { at: 2, len: 1, tone: 1 }, { at: 3, len: 1, tone: 2 }]]
  ],
  6: [
    [[{ at: 0, len: 2, tone: 0 }, { at: 2, len: 2, tone: 0 }, { at: 4, len: 2, tone: 0 }]],
    [[{ at: 0, len: 2, tone: 0 }, { at: 2, len: 2, tone: 1 }, { at: 4, len: 2, tone: 2 }], [{ at: 0, len: 2, tone: 0 }, { at: 2, len: 2, tone: 2 }, { at: 4, len: 2, tone: 1 }]],
    [[{ at: 0, len: 2, tone: 0 }, { at: 2, len: 1, tone: 1 }, { at: 3, len: 1, tone: 2 }, { at: 4, len: 2, tone: 1 }], [{ at: 0, len: 2, tone: 0 }, { at: 2, len: 2, tone: 1 }, { at: 4, len: 1, tone: 2 }, { at: 5, len: 1, tone: 1 }]],
    [[0,1,2,1,2,1].map((tone, at) => ({ at, len: 1, tone })), [0,2,1,2,1,2].map((tone, at) => ({ at, len: 1, tone }))]
  ],
  2: [[[{ at: 0, len: 2, tone: 0 }]], [[{ at: 0, len: 2, tone: 0 }]], [[{ at: 0, len: 1, tone: 0 }, { at: 1, len: 1, tone: 1 }]], [[{ at: 0, len: 1, tone: 0 }, { at: 1, len: 1, tone: 1 }]]]
};
function pattern(role: Role, size: number, complexity: number, variant: number): Ev[] {
  const level = Math.min(3, Math.max(0, complexity - 2));
  if (role === 'figure') { const set = figures[size][level]; return set[variant % set.length]; }
  if (role === 'offbeat') {
    if (size === 6) return [{ at: 2, len: 2, tone: 0 }, { at: 4, len: 2, tone: variant % 2 ? 1 : 0 }];
    if (size === 2) return [{ at: 1, len: 1, tone: 0 }];
    return complexity >= 5 ? [{ at: 2, len: 1, tone: 0 }, { at: 3, len: 1, tone: 1 }] : [{ at: 2, len: 2, tone: 0 }];
  }
  // pulse
  if (size === 2) return [{ at: 0, len: 2, tone: 0 }];
  if (complexity <= 2) return [{ at: 0, len: size, tone: 0 }];
  if (size === 6) return complexity >= 5 ? [{ at: 0, len: 2, tone: 0 }, { at: 2, len: 1, tone: 0 }, { at: 3, len: 1, tone: 0 }, { at: 4, len: 2, tone: 0 }] : [{ at: 0, len: 2, tone: 0 }, { at: 2, len: 2, tone: 0 }, { at: 4, len: 2, tone: 0 }];
  return complexity >= 5 ? [{ at: 0, len: 2, tone: 0 }, { at: 2, len: 1, tone: 0 }, { at: 3, len: 1, tone: 0 }] : [{ at: 0, len: 2, tone: 0 }, { at: 2, len: 2, tone: 0 }];
}
function random(seed: string): () => number {
  let state = 2166136261;
  for (const character of seed) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => { state += 0x6D2B79F5; let value = Math.imul(state ^ state >>> 15, state | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
}
function cleanNotes(notes: Note[]): Note[] {
  notes.sort((first, second) => first.start - second.start || first.pitch - second.pitch);
  const previous = new Map<number, Note>();
  for (const note of notes) {
    const last = previous.get(note.pitch);
    if (last && last.start + last.duration > note.start) last.duration = note.start - last.start;
    previous.set(note.pitch, note);
  }
  return notes.filter(note => note.duration > 0);
}
type Draft = Note & { tie?: number };
/** Join sustained notes that repeat the same pitch across chord changes inside one section. */
function tieNotes(notes: Draft[]): Note[] {
  notes.sort((first, second) => first.start - second.start || first.pitch - second.pitch);
  const open = new Map<number, Draft>();
  const kept: Draft[] = [];
  for (const note of notes) {
    const last = open.get(note.pitch);
    if (note.tie !== undefined && last?.tie === note.tie && note.start - (last.start + last.duration) <= 40 && note.start >= last.start + last.duration) {
      last.duration = note.start + note.duration - last.start;
      continue;
    }
    open.set(note.pitch, note);
    kept.push(note);
  }
  return kept.map(({ tie, ...note }) => note);
}
export function arrange(input: Project): Arrangement {
  const project = loadProject(input);
  const score = parse(project.source);
  const analysis = analyse(score, project.keyOverride ? parseKey(project.keyOverride) : undefined);
  const core = voiceLead(score, project.voicing);
  return arrangeScore(project,score,analysis,core);
}
export function arrangeScore(project: Project, score: Score, analysis: Analysis, core: number[][]): Arrangement {
  const barTicks = score.meter[0] * 4 / score.meter[1] * PPQ;
  const groups = meterGroups(score.meter);
  const strong = (tick: number) => { // bar starts and the half-bar in even groupings
    const offset = mod(tick, barTicks);
    return offset === 0 || (groups.length % 2 === 0 && groups.length > 2 && offset === groups.slice(0, groups.length / 2).reduce((sum, size) => sum + size, 0) * SIXTEENTH);
  };
  const base = (density: number) => 0.3 + density * 0.058;
  const level = (sectionIndex: number, tick: number) => {
    const section = score.sections[sectionIndex];
    const settings = sectionSettings(project, sectionIndex);
    const bars = Math.max(1, Math.round((section.end - section.start) / barTicks));
    const phrase = Math.min(4, bars);
    const position = ((tick - section.start) / barTicks % phrase) / phrase;
    let value = base(settings.density) + (settings.curve === 'steady' ? 0 : settings.curve === 'pulse' ? 0.035 * Math.cos(2 * Math.PI * (tick - section.start) / PPQ) : 0.07 * Math.sin(Math.PI * Math.min(1, position / 0.8)));
    const next = score.sections[sectionIndex + 1];
    if (next && tick >= section.end - barTicks && !settings.seed) {
      const target = base(sectionSettings(project, next.index).density);
      const amount = (tick - (section.end - barTicks)) / barTicks;
      value += (target - base(settings.density)) * amount * (target > base(settings.density) ? 1 : 0.5);
    }
    if (settings.bigEntrance && tick >= section.end - barTicks) value += 0.14 * (tick - section.end + barTicks) / barTicks;
    return Math.min(1, Math.max(0.15, value));
  };
  const parts: (Part & { notes: Draft[]; roles: Set<Role> })[] = partNames.map(name => ({ name, instrument: name, articulation: 'Mixed', notes: [], controls: [], roles: new Set<Role>() }));
  const counters = new Map<string, number>();
  const sectionBar = (tick: number, section: number) => Math.floor((tick - score.sections[section].start) / barTicks);
  for (const [chordIndex, chord] of score.chords.entries()) {
    if (!chord.intervals.length) continue;
    const settings = sectionSettings(project, chord.section);
    const next = score.chords[chordIndex + 1];
    const tones = chordTones(chord);
    for (const [voice, part] of parts.entries()) {
      const role = roleFor(voice, settings);
      if (!role) continue;
      part.roles.add(role === 'bass' ? 'sustain' : role === 'counter' ? 'arp' : role === 'offbeat' ? 'figure' : role);
      const seed = `${project.take}:${settings.take}:${settings.seed ?? chord.section}:${part.name}`;
      const sectionRng = random(seed);
      const variant = Math.floor(sectionRng() * 2);
      const rng = random(`${seed}:${settings.seed ? chord.start - score.sections[chord.section].start : chord.start}`);
      const instrument = orchestra[part.instrument];
      const [low, high] = instrument.full;
      const fit = (pitch: number) => { while (pitch < low) pitch += 12; while (pitch > high) pitch -= 12; return pitch; };
      const pitch0 = fit(core[chordIndex][voice]);
      const tieGroup = settings.seed ? chord.section * 3 + (chord.bar % 4 === 0 ? 0 : chord.bar % 4 === 3 ? 2 : 1) : chord.section;
      const above = (pitch: number) => { for (let candidate = pitch + 1; candidate <= high; candidate++) if (tones.includes(mod(candidate))) return candidate; return pitch; };
      const toneOf = (index: number) => index === 0 ? pitch0 : index === 1 ? above(pitch0) : above(above(pitch0));
      const add = (pitch: number, start: number, duration: number, accent: number, extras: Partial<Draft> = {}) => {
        const velocity = Math.round(24 + level(chord.section, start) * 84 + accent + rng() * 6 - 3);
        part.notes.push({ pitch, start: Math.round(start), duration: Math.max(1, Math.round(duration)), velocity: Math.min(127, Math.max(1, velocity)), ...extras });
      };
      // Run into the next chord (Violins I), at phrase ends or every two bars at complexity 5.
      let runLength = 0;
      let runPitches: number[] = [];
      if (voice === 4 && settings.runs && (settings.complexity >= 3 || settings.bigEntrance) && next?.intervals.length && next.bar !== chord.bar && (next.section === chord.section || settings.exitRuns !== false)) {
        const nextBar = sectionBar(next.start + PPQ / 2, next.section);
        const phraseEnd = next.section !== chord.section || nextBar % 4 === 0 || (settings.complexity === 5 && nextBar % 2 === 0);
        if (phraseEnd) {
          const target = fit(core[chordIndex + 1][voice]);
          const scale = analysis.chords[chordIndex].scale;
          const count = Math.min(settings.complexity === 3 ? 4 : settings.complexity === 4 ? 6 : 8, Math.floor(chord.duration / 2 / SIXTEENTH));
          const rising = target >= pitch0;
          const pool = Array.from({ length: 25 }, (_, index) => rising ? target - 1 - index : target + 1 + index).filter(pitch => pitch >= low && pitch <= high && scale.includes(mod(pitch)));
          if (count >= 3 && pool.length >= count) { runPitches = pool.slice(0, count).reverse(); runLength = count * SIXTEENTH; }
        }
      }
      const start = chord.start;
      const end = chord.start + chord.duration - runLength;
      const short = (len: number) => len * SIXTEENTH * 0.55;
      const gridHits = (role: Role, pick: (size: number) => Ev[], onEvent: (tick: number, ev: Ev, accent: number) => void) => {
        const events: { tick: number; ev: Ev; accent: number }[] = [];
        for (let bar = Math.floor(start / barTicks) * barTicks; bar < end; bar += barTicks) {
          let offset = 0;
          for (const [groupIndex, size] of groups.entries()) {
            for (const ev of pick(size)) {
              const tick = bar + (offset + ev.at) * SIXTEENTH;
              if (tick >= start && tick < end) events.push({ tick, ev, accent: ev.at === 0 ? (groupIndex === 0 ? 12 : 6) : 0 });
            }
            offset += size;
          }
        }
        // A pushed or off-grid chord change always gets a hit on the change itself.
        const onBeat = mod(start, PPQ) === 0;
        if (!events.length || (events[0].tick > start && !(role === 'offbeat' && onBeat))) events.unshift({ tick: start, ev: { at: 0, len: ((events[0]?.tick ?? end) - start) / SIXTEENTH, tone: 0 }, accent: 8 });
        for (const { tick, ev, accent } of events) onEvent(tick, ev, accent);
      };
      const stream = (step: number, choose: (count: number) => number, length: number) => {
        const key = `${chord.section}:${part.name}`;
        const ticks: number[] = [];
        let tick = Math.ceil(start / step) * step;
        if (tick > start) ticks.push(start);
        for (; tick < end; tick += step) ticks.push(tick);
        ticks.forEach((at, index) => {
          const count = counters.get(key) ?? 0;
          counters.set(key, count + 1);
          const following = ticks[index + 1] ?? end;
          add(choose(count), at, Math.min(step * length, following - at, end - at), mod(at, PPQ) === 0 ? 8 : 0);
        });
      };
      if (role === 'sustain') add(pitch0, start, end - start - 20, 4, { tie: tieGroup });
      else if (role === 'bass') {
        const fifth = tones.includes(mod(chord.bass + 7)) ? (pitch0 + 7 <= high ? pitch0 + 7 : pitch0 - 5) : pitch0;
        if (settings.complexity <= 2 || settings.texture === 'pad') add(pitch0, start, end - start - 20, 4, { tie: tieGroup });
        else {
          const hits: number[] = [start];
          for (let tick = Math.ceil((start + 1) / SIXTEENTH) * SIXTEENTH; tick < end; tick += SIXTEENTH) if (strong(tick)) hits.push(tick);
          let pickup: number | undefined;
          if (settings.complexity === 5 && next?.intervals.length && next.section === chord.section && mod(next.bass - chord.bass) !== 0 && end - start >= PPQ * 2) pickup = next.start - PPQ / 2;
          hits.forEach((tick, index) => {
            const stop = Math.min(hits[index + 1] ?? end, pickup ?? end);
            if (tick >= stop) return;
            add(settings.complexity >= 4 && index % 2 ? fifth : pitch0, tick, (stop - tick) * 0.92, index ? 4 : 10);
          });
          if (pickup !== undefined) {
            const target = fit(core[chordIndex + 1][0]);
            const scale = analysis.chords[chordIndex].scale;
            const step = target > pitch0 ? -1 : 1;
            let approach = target + step;
            while (!scale.includes(mod(approach)) && Math.abs(approach - target) < 3) approach += step;
            if (approach >= low && approach <= high) add(approach, pickup, PPQ / 2 * 0.8, 6, { approach: !scale.includes(mod(approach)) || undefined });
          }
        }
      } else if (role === 'figure' || role === 'offbeat' || role === 'pulse') {
        const eighths = groups.reduce((sum, size) => sum + size, 0) / 2;
        const crossAccent = role === 'pulse' && settings.complexity === 4 && eighths === 8;
        gridHits(role, size => pattern(role, size, settings.complexity, variant), (tick, ev, accent) => {
          const eighth = mod(tick, barTicks) / (PPQ / 2);
          const extra = crossAccent ? ([0,3,6].includes(eighth) ? 12 : -4) : accent;
          const length = role === 'pulse' && settings.complexity <= 2 ? ev.len * SIXTEENTH * 0.85 : short(ev.len);
          add(toneOf(ev.tone), tick, Math.min(length, end - tick), extra);
        });
      } else if (role === 'tremolo') {
        const step = settings.complexity === 5 && score.tempo <= 100 ? SIXTEENTH / 2 : SIXTEENTH;
        stream(step, () => pitch0, 0.88);
      } else {
        const span = settings.complexity >= 5 ? 19 : 12;
        const set = Array.from({ length: span + 6 }, (_, index) => pitch0 - 5 + index).filter(pitch => pitch >= low && pitch <= high && tones.includes(mod(pitch)));
        const period = Math.max(1, set.length * 2 - 2);
        const shape = (count: number) => { const position = count % period; return set[position < set.length ? position : period - position]; };
        if (role === 'arp') stream(settings.complexity >= 4 ? SIXTEENTH : PPQ / 2, count => shape(count + (variant ? set.length - 1 : 0)), 0.8);
        else stream(PPQ / 2, count => shape(count + set.length - 1), 0.75);
      }
      runPitches.forEach((pitch, index) => add(pitch, end + index * SIXTEENTH, SIXTEENTH * 0.9, 2 + index, { runTarget: next!.start }));
    }
  }
  // Dynamics: CC1 follows the phrase and section arc on every beat; CC11 holds a section level and swells into a louder section.
  if (project.controllers) for (const section of score.sections) {
    const settings = sectionSettings(project, section.index);
    const next = score.sections[section.index + 1];
    const rising = settings.seed ? Boolean(settings.bigEntrance && next) : next && sectionSettings(project, next.index).density > settings.density;
    let lastModulation = -1, lastExpression = -1;
    for (let tick = section.start; tick < section.end; tick += settings.curve === 'pulse' ? PPQ / 2 : PPQ) {
      const modulation = Math.min(127, Math.round(12 + level(section.index, tick) * 108));
      const ramp = rising && tick >= section.end - barTicks ? (tick - (section.end - barTicks)) / barTicks : 0;
      const expression = Math.min(127, Math.round(88 + settings.density * 2 + ramp * 14));
      for (const part of parts) {
        if (modulation !== lastModulation) part.controls.push({ tick, controller: 1, value: modulation });
        if (expression !== lastExpression) part.controls.push({ tick, controller: 11, value: expression });
      }
      lastModulation = modulation; lastExpression = expression;
    }
  }
  const names: Record<string, string> = { sustain: 'Sustain', figure: 'Spiccato', pulse: 'Spiccato', arp: 'Arpeggio', tremolo: 'Tremolo' };
  const finished: Part[] = parts.map(({ roles, ...part }) => ({ ...part, notes: cleanNotes(tieNotes(part.notes)), articulation: roles.size === 1 ? names[[...roles][0]] : roles.size ? 'Mixed' : 'Sustain' }));
  return { score, analysis, core, parts: finished.reverse(), project };
}
