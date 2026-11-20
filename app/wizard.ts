// The guided flow: one decision per screen. Feeling → key (locked in) → pace → shape → each block
// (emotion, chords, movement) → the string parts one at a time, bass upwards → finish and export.
import { arrangeSong, chordFor, friendlyChord, loadSong } from '../engine/blocks';
import { createSong, emotions, newBlock, setEmotion } from '../engine/emotions';
import { editSong, type Edit } from '../engine/editor';
import { harmonicRhythms } from '../engine/harmonic-rhythm';
import { chordWord, conformSong, palette, stabilise, type Job } from '../engine/lock';
import { writeMidi } from '../engine/midi';
import { modes } from '../engine/scales';
import { blockKey, feels, History, stringParts, type Block, type Song } from '../engine/song';
import { names } from '../engine/theory';
import { mod, type Arrangement, type Key, type Mode, type PartChoice, type Texture } from '../engine/types';
import { Preview } from './preview';

type Step = 'start' | 'feeling' | 'key' | 'pace' | 'shape' | 'block' | 'parts' | 'finish';
type Stage = 'emotion' | 'chords' | 'movement';
const flow: { id: Exclude<Step, 'start'>; label: string }[] = [
  { id: 'feeling', label: 'Feeling' }, { id: 'key', label: 'Key' }, { id: 'pace', label: 'Pace' }, { id: 'shape', label: 'Shape' },
  { id: 'block', label: 'Blocks' }, { id: 'parts', label: 'Parts' }, { id: 'finish', label: 'Finish' }
];
const feelText: Record<string, string> = {
  major: 'Open and sunny.', minor: 'Serious and shadowed.', dorian: 'Dark, with a lift of hope.', mixolydian: 'Big, rousing, a bit of swagger.',
  lydian: 'Floating and a little unreal.', phrygian: 'Close and tense. Something is wrong.', 'harmonic minor': 'Old-world drama with a strong pull home.'
};
// A short phrase that shows off each scale's character, as chord degrees.
const feelDemo: Record<string, number[]> = { major: [1,4,5,1], minor: [1,6,7,1], dorian: [1,4,1,4], mixolydian: [1,7,4,1], lydian: [1,2,1,2], phrygian: [1,2,1,2], 'harmonic minor': [1,4,5,1] };
const shapes = [
  { id: 'loop', label: 'Loop', text: 'Two blocks that repeat. Good for a bed under dialogue.', sections: ['Verse','Chorus'] },
  { id: 'sketch', label: 'Sketch', text: 'In, up, out. Four blocks, about a minute.', sections: ['Intro','Verse','Chorus','Outro'] },
  { id: 'cue', label: 'Slow build', text: 'Starts quiet and climbs to a big finish.', sections: ['Intro','Build','Build','Chorus','Chorus','Outro'] },
  { id: 'song', label: 'Song', text: 'Verses, choruses and a bridge. Eight blocks.', sections: ['Intro','Verse','Chorus','Verse','Chorus','Bridge','Chorus','Outro'] }
] as const;
const brightModes: Mode[] = ['major','lydian','mixolydian'];
export const sectionMood = (section: Block['section'], mode: Mode) => (brightModes.includes(mode)
  ? { Intro: 'calm', Verse: 'hopeful', Pre: 'determined', Chorus: 'triumphant', Bridge: 'nostalgic', Build: 'determined', Break: 'dreamy', Outro: 'tender' }
  : { Intro: 'mysterious', Verse: 'sad', Pre: 'tense', Chorus: 'epic', Bridge: 'lonely', Build: 'tense', Break: 'dread', Outro: 'lonely' })[section];
const textures: { value: Texture; label: string; text: string }[] = [
  { value: 'pad', label: 'Long notes', text: 'Held chords that breathe.' },
  { value: 'ostinato', label: 'Ostinato', text: 'A driving repeated figure.' },
  { value: 'arpeggio', label: 'Arpeggios', text: 'Chords broken into rippling notes.' },
  { value: 'tremolo', label: 'Shimmer', text: 'Fast trembling bows.' },
  { value: 'pulses', label: 'Pulse', text: 'Everyone strikes together.' }
];
const complexityNames = ['Still','Gentle','Moving','Busy','Wild'];
const partText: Record<PartChoice, string> = {
  auto: 'Follow each block', hold: 'Hold the chords', pulse: 'Pulse the rhythm', figure: 'Drive an ostinato', answer: 'Answer off the beat',
  arpeggio: 'Ripple arpeggios', shimmer: 'Shimmer', off: 'Rest'
};
const partHint: Record<PartChoice, string> = {
  auto: 'Plays whatever each block’s movement asks for.', hold: 'Long notes under everything else.', pulse: 'Repeated notes on the beat.',
  figure: 'A busy repeated pattern that pushes the music on.', answer: 'Short notes between the beats.', arpeggio: 'Runs up and down the chord.',
  shimmer: 'Fast repeated bowing, full of tension.', off: 'Leave this section out of the piece.'
};
const partOptions = (name: string): PartChoice[] => name === 'Basses' ? ['auto','hold','pulse','off'] : ['auto','hold','pulse','figure','answer','arpeggio','shimmer','off'];
const jobText: Record<Job, [string, string]> = { home: ['Home', 'Settled. Good for starting and ending.'], away: ['Away', 'Moves the music somewhere new.'], pull: ['Pull', 'Tension that wants to come home.'] };
const STORE = 'the-great-composer:guided';
const spoken: Record<string, string> = { Basses: 'basses', Cellos: 'cellos', Violas: 'violas', 'Violins II': 'second violins', 'Violins I': 'first violins' };
const moodCss = Object.entries(emotions).map(([name, data]) => `.mood-${name}{--mood:${data.colour}}`).join('');
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const realName = (key: Key) => `${key.name} ${key.mode}`;
const feelName = (mode: Mode) => feels.find(feel => feel.mode === mode)?.label ?? mode;

/** Voiced pitches for hearing one chord: a bass note under a close chord around middle C. */
function voiced(chord: ReturnType<typeof chordFor>): number[] {
  const bass = 36 + mod(chord.bass);
  const top = chord.intervals.slice(0, 4).map(interval => 57 + mod(chord.root + interval - 9));
  return [bass, ...top.sort((a, b) => a - b)];
}

export interface Wizard { getSong(): Song; getStep(): string; act(name: string, value?: string): void; destroy(): void }
export function mountWizard(root: HTMLElement): Wizard {
  const preview = new Preview(); preview.preload();
  let saved: Song | undefined;
  try { const text = localStorage.getItem(STORE); if (text) saved = loadSong(JSON.parse(text)); } catch { saved = undefined; }
  const history = new History<Song>(saved ?? createSong());
  let step: Step = 'start', reached = saved ? flow.length - 1 : 0, blockIndex = 0, stage: Stage = 'emotion', slot = 0, partIndex = 0;
  let autoPlay = true, theory = false, error = '', listenBlock = -1, arrangement: Arrangement | undefined, taps: number[] = [];

  const song = () => history.value;
  const block = () => song().blocks[Math.min(blockIndex, song().blocks.length - 1)];
  const arranged = () => (arrangement ??= arrangeSong(song()));
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(song())); } catch { /* storage unavailable */ } };
  const commit = (next: Song) => { conformSong(next); arrangeSong(next); history.set(next); arrangement = undefined; error = ''; persist(); };
  const edit = (action: Edit, id = block()?.id ?? song().blocks[0].id) => { commit(editSong(song(), id, action)); };
  const audible = () => new Set<string>(step === 'parts' ? stringParts.slice(0, partIndex + 1) : stringParts.filter(name => song().parts?.[name] !== 'off'));
  const playBlock = (index = blockIndex) => { void preview.play(arranged(), audible(), index, true).catch(() => {}); };
  const playSong = () => { void preview.play(arranged(), audible(), undefined, false).catch(() => {}); };
  const hearChords = (key: Key, degrees: number[], seconds = 0.8) => { void preview.chords(degrees.map(degree => voiced(chordFor({ degree, spice: 'plain' }, key))), seconds).catch(() => {}); };
  const index = (id: Step) => flow.findIndex(item => item.id === id);
  const go = (next: Step) => { preview.stop(); step = next; if (next !== 'start') reached = Math.max(reached, index(next)); render(); root.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true }); };
  const defaultListen = () => Math.max(0, song().blocks.findIndex(item => item.section === 'Chorus'));

  function buildShape(sections: readonly Block['section'][]): void {
    const next = structuredClone(song());
    next.blocks = [];
    const firstOf = new Map<string, Block>();
    for (const section of sections) {
      const earlier = firstOf.get(section);
      if (earlier) { next.blocks.push({ ...structuredClone(earlier), id: `block-${next.nextId++}` }); continue; }
      const created = newBlock(next, section);
      next.blocks.push(created);
      setEmotion(next, created, sectionMood(section, next.key.mode));
      if (section === 'Build') created.bigEntrance = true;
      stabilise(next, created);
      firstOf.set(section, created);
    }
    commit(next); blockIndex = 0; stage = 'emotion'; slot = 0;
  }
  const sameAsEarlier = () => song().blocks.slice(0, blockIndex).find(item => item.section === block().section);
  function copyEarlier(): void {
    const source = sameAsEarlier(); if (!source) return;
    const next = structuredClone(song()), target = next.blocks[blockIndex];
    Object.assign(target, { ...structuredClone(source), id: target.id, locked: target.locked });
    commit(next);
  }
  function forward(): void {
    if (step === 'start') return go('feeling');
    if (step === 'key' && !song().keyLocked) edit({ type: 'key-lock', value: true });
    if (step === 'block') {
      if (stage === 'emotion') { stage = 'chords'; return go('block'); }
      if (stage === 'chords') { stage = 'movement'; return go('block'); }
      if (blockIndex < song().blocks.length - 1) { blockIndex++; stage = 'emotion'; slot = 0; return go('block'); }
      partIndex = 0; return go('parts');
    }
    if (step === 'parts' && partIndex < stringParts.length - 1) { partIndex++; return go('parts'); }
    if (step === 'shape') { blockIndex = 0; stage = 'emotion'; slot = 0; }
    const position = index(step);
    if (position < flow.length - 1) go(flow[position + 1].id);
  }
  function backward(): void {
    if (step === 'block') {
      if (stage === 'movement') { stage = 'chords'; return go('block'); }
      if (stage === 'chords') { stage = 'emotion'; return go('block'); }
      if (blockIndex > 0) { blockIndex--; stage = 'movement'; return go('block'); }
    }
    if (step === 'parts' && partIndex > 0) { partIndex--; return go('parts'); }
    if (step === 'parts') { blockIndex = song().blocks.length - 1; stage = 'movement'; return go('block'); }
    if (step === 'finish') { partIndex = stringParts.length - 1; return go('parts'); }
    const position = index(step);
    go(position <= 0 ? 'start' : flow[position - 1].id);
  }

  // ---------- screens ----------
  const staff = () => {
    if (step === 'start') return '';
    const current = index(step);
    // The progress bar is a stave: one note per step, filled once you've reached it.
    const notes = flow.map((_, position) => {
      const x = 40 + position * 96, y = 50 - position * 4;
      const state = position === current ? 'current' : position <= reached ? 'done' : 'todo';
      return `<g class="note ${state}"><ellipse cx="${x}" cy="${y}" rx="8.5" ry="6" transform="rotate(-20 ${x} ${y})"/><line x1="${x + 7.6}" y1="${y - 2}" x2="${x + 7.6}" y2="${y - 30}"/></g>`;
    }).join('');
    const lines = [26, 34, 42, 50, 58].map(y => `<line class="stave-line" x1="0" y1="${y}" x2="680" y2="${y}"/>`).join('');
    const labels = flow.map((item, position) => `<button class="stave-label ${position === current ? 'current' : ''}" data-act="goto" data-val="${item.id}" ${position > reached ? 'disabled' : ''} style="left:${(40 + position * 96) / 680 * 100}%">${item.label}</button>`).join('');
    return `<nav class="stave" aria-label="Steps"><svg viewBox="0 0 680 66" preserveAspectRatio="none" aria-hidden="true">${lines}${notes}</svg><div class="stave-labels">${labels}</div></nav>`;
  };
  const lockChip = () => song().keyLocked
    ? `<span class="lock-chip" title="Every chord stays inside this scale"><svg viewBox="0 0 12 14" aria-hidden="true"><rect x="1" y="6" width="10" height="7.5" rx="1.5"/><path d="M3.5 6V4a2.5 2.5 0 0 1 5 0v2" fill="none"/></svg>${escape(song().key.name)} ${escape(feelName(song().key.mode))}${theory ? ` <small>${escape(realName(song().key))}</small>` : ''}</span>` : '';
  const header = () => `<header class="top"><button class="wordmark" data-act="home" aria-label="Back to the start">The Great<br>Composer</button>${staff()}<div class="top-tools">${lockChip()}<button data-act="undo" ${history.canUndo ? '' : 'disabled'}>Undo</button><button data-act="redo" ${history.canRedo ? '' : 'disabled'}>Redo</button><button data-act="theory" aria-pressed="${theory}">Theory ${theory ? 'on' : 'off'}</button></div></header>`;
  const unlockNote = () => `<div class="note-bar"><span>The piece is locked to ${escape(song().key.name)} ${escape(feelName(song().key.mode)).toLowerCase()}. Unlock to change it; any chords that no longer fit will be swapped for ones that do.</span><button data-act="unlock">Unlock</button></div>`;

  const startScreen = () => `<section class="screen start"><h1>Write for strings without reading a note.</h1><p class="lede">Choose a feeling, lock in a key, then build your piece four bars at a time. You finish with a MIDI file of five string parts, ready for your own instruments in Logic.</p>
    <div class="start-actions"><button class="primary big" data-act="new">Start a new piece</button>${saved ? '<button class="big" data-act="resume">Continue where you left off</button>' : ''}<label class="big file">Open a saved piece<input type="file" accept=".json,application/json" data-change="open"></label><button class="big" data-act="surprise">Surprise me</button></div>
    <p class="small">Know your theory? <a href="#workbench">Open the workbench</a> to type chords and see every setting at once.</p></section>`;
  const feelingScreen = () => `<section class="screen"><h1>What should it feel like?</h1><p class="lede">This picks the scale your whole piece is built from. Tap one to hear it.</p>
    ${song().keyLocked ? unlockNote() : ''}
    <div class="grid feels">${feels.map(feel => `<button class="tile feel ${song().key.mode === feel.mode ? 'chosen' : ''}" data-act="feel" data-val="${feel.mode}" ${song().keyLocked ? 'disabled' : ''}><strong>${feel.label}</strong><span>${feelText[feel.mode]}</span>${theory ? `<small>${feel.mode}</small>` : ''}</button>`).join('')}</div></section>`;
  const keyScreen = () => {
    const key = song().key;
    const keys = names.map((name, root) => `<button class="key ${key.root === root ? 'chosen' : ''} ${[1,3,6,8,10].includes(root) ? 'black' : ''}" data-act="key" data-val="${root}" ${song().keyLocked ? 'disabled' : ''}>${name}</button>`).join('');
    return `<section class="screen"><h1>Pick a home note.</h1><p class="lede">Your piece will be ${escape(feelName(key.mode)).toLowerCase()}, with ${escape(key.name)} as home. Tap a note to hear its home chord. Lower notes sound darker and heavier on strings; higher ones lighter.</p>
      <div class="keys">${keys}</div>
      ${song().keyLocked ? unlockNote() : `<div class="lock-panel"><div><strong>Lock it in</strong><p>Once it’s locked, every chord you choose stays inside ${escape(key.name)} ${escape(feelName(key.mode)).toLowerCase()}${theory ? ` (${escape(realName(key))})` : ''}, so nothing can sound out of place.</p></div><button class="primary" data-act="lock">Lock in ${escape(key.name)} ${escape(feelName(key.mode))}</button></div>`}
      ${theory ? `<p class="theory">Scale: ${modes[key.mode].map(interval => names[mod(key.root + interval)]).join(' ')}</p>` : ''}</section>`;
  };
  const paceScreen = () => {
    const tempo = song().tempo;
    const speeds: [string, number][] = [['Slow', 66], ['Walking', 84], ['Moving', 100], ['Fast', 120], ['Racing', 144]];
    const meters: [string, string, string][] = [['4/4', 'Straight', 'Counts in fours. Most music.'], ['3/4', 'Waltz', 'One-two-three, swaying.'], ['6/8', 'Rolling', 'Two big rocking beats.'], ['7/8', 'Odd', 'Off-kilter and restless.']];
    return `<section class="screen"><h1>How fast does it move?</h1>
      <div class="grid speeds">${speeds.map(([label, value]) => `<button class="tile ${tempo === value ? 'chosen' : ''}" data-act="tempo" data-val="${value}"><strong>${label}</strong><span>${value} beats a minute</span></button>`).join('')}</div>
      <div class="tempo-row"><button data-act="nudge" data-val="-2" aria-label="A little slower">−</button><output aria-live="polite">${tempo}</output><button data-act="nudge" data-val="2" aria-label="A little faster">+</button><button class="tap" data-act="tap">Tap the beat here</button></div>
      <h2>What’s the pulse?</h2>
      <div class="grid meters">${meters.map(([meter, label, text]) => `<button class="tile ${song().meter.join('/') === meter ? 'chosen' : ''}" data-act="meter" data-val="${meter}"><strong>${label}</strong><span>${text}</span>${theory ? `<small>${meter}</small>` : ''}</button>`).join('')}</div></section>`;
  };
  const shapeScreen = () => `<section class="screen"><h1>How long, and what shape?</h1><p class="lede">Your piece is built from four-bar blocks. Pick a shape to start from. Next you’ll set up each block, and you can add or remove blocks at the end.</p>
    <div class="grid shapes">${shapes.map(shape => `<button class="tile shape" data-act="shape" data-val="${shape.id}"><strong>${shape.label}</strong><span>${shape.text}</span><span class="blocks">${shape.sections.map(section => `<i class="mood-${sectionMood(section, song().key.mode)}">${section}</i>`).join('')}</span></button>`).join('')}</div>
    <p class="small">Right now: ${song().blocks.map(item => item.section).join(', ')}. Choosing a shape replaces these; Next keeps them.</p></section>`;

  const blockHeader = (title: string) => {
    const dots = (['emotion','chords','movement'] as Stage[]).map(name => `<span class="dot ${name === stage ? 'on' : ''}">${name === 'emotion' ? 'Feeling' : name === 'chords' ? 'Chords' : 'Movement'}</span>`).join('<i></i>');
    const strip = song().blocks.map((item, position) => `<button class="strip-block mood-${item.emotion} ${position === blockIndex ? 'current' : ''}" data-act="block-jump" data-val="${position}" aria-label="Block ${position + 1}, ${item.section}">${item.section}</button>`).join('');
    return `<div class="block-head"><div class="strip">${strip}</div><div class="block-meta"><p class="where">Block ${blockIndex + 1} of ${song().blocks.length}, ${block().section.toLowerCase()}</p><div class="dots">${dots}</div></div><h1>${title}</h1></div>`;
  };
  const emotionStage = () => {
    const current = block(), earlier = sameAsEarlier();
    return `${blockHeader(`How should this ${current.section.toLowerCase()} feel?`)}
      ${earlier ? `<div class="note-bar"><span>There’s already a ${current.section.toLowerCase()} earlier in the piece. Repeating it helps the piece hang together.</span><button data-act="copy-earlier">Same as before</button></div>` : ''}
      <div class="grid emotions">${Object.entries(emotions).map(([name, data]) => `<button class="tile emotion mood-${name} ${current.emotion === name ? 'chosen' : ''}" data-act="emotion" data-val="${name}"><span class="icon" aria-hidden="true">${data.icon}</span><strong>${data.label}</strong></button>`).join('')}</div>
      <p class="small">A feeling picks chords and movement to match. You can change both in the next two steps.</p>`;
  };
  const chordName = (chord: Block['bars'][number]['chords'][number], key: Key) => {
    const name = names[chordFor(chord, key).root], quality = chordWord(chord, key);
    return `<b>${name}</b><em>${quality}</em>${theory ? `<small>${chordFor(chord, key).symbol}</small>` : ''}`;
  };
  const chordStage = () => {
    const current = block(), key = blockKey(song(), current);
    const slots = current.bars.map((bar, position) => `<button class="slot ${position === slot ? 'chosen' : ''}" data-act="slot" data-val="${position}"><span class="bar-number">Bar ${position + 1}${bar.push ? ', arrives early' : ''}</span><span class="slot-chord">${bar.hold ? '<em>keeps the last chord</em>' : bar.chords.map(chord => `<span>${chordName(chord, key)}</span>`).join('')}</span></button>`).join('');
    const options = palette(song(), current).map((option, position) => ({ option, position }));
    const groups = (['home','away','pull'] as Job[]).map(job => `<div class="job job-${job}"><h3>${jobText[job][0]}</h3><p>${jobText[job][1]}</p><div class="chords">${options.filter(({ option }) => option.job === job).map(({ option, position }) => {
      const chosen = !current.bars[slot].hold && chordFor(current.bars[slot].chords[0], key).symbol === chordFor(option.chord, key).symbol;
      return `<button class="chord ${chosen ? 'chosen' : ''} ${option.chord.spice !== 'plain' ? 'spiced' : ''}" data-act="chord" data-val="${position}">${chordName(option.chord, key)}</button>`;
    }).join('')}</div></div>`).join('');
    const rhythm = harmonicRhythms.map(item => `<button class="pill ${current.rhythm === item.value ? 'chosen' : ''}" data-act="rhythm" data-val="${item.value}" title="${escape(item.description)}">${escape(item.label)}</button>`).join('');
    return `${blockHeader('Choose the chords.')}
      <div class="slots">${slots}</div>
      <div class="slot-tools"><button data-act="dice" data-val="${slot}">Try another chord for bar ${slot + 1}</button><button data-act="dice">Try new chords for the whole block</button><button data-act="split" aria-pressed="${current.bars[slot].chords.length === 2}">Two chords in bar ${slot + 1}</button><button data-act="push" aria-pressed="${current.bars[slot].push}">Arrive early</button></div>
      <p class="small">Pick a bar above, then tap a chord to put it there. Every chord below fits your locked scale.</p>
      <div class="jobs">${groups}</div>
      <h3 class="rhythm-title">When the chords change</h3><div class="pills">${rhythm}</div>`;
  };
  const movementStage = () => {
    const current = block();
    const energy = Array.from({ length: 10 }, (_, position) => `<button class="level ${position < current.energy ? 'on' : ''}" data-act="energy" data-val="${position + 1}" aria-label="Energy ${position + 1} of 10" aria-pressed="${current.energy === position + 1}" style="--h:${20 + position * 5}px"></button>`).join('');
    return `${blockHeader('How should the strings move?')}
      <div class="grid textures">${textures.map(item => `<button class="tile texture tx-${item.value} ${current.texture === item.value ? 'chosen' : ''}" data-act="texture" data-val="${item.value}"><span class="motion" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span><strong>${item.label}</strong><span>${item.text}</span></button>`).join('')}</div>
      <div class="dials"><div><h3>Energy</h3><div class="energy">${energy}</div><p class="small">How many players, and how loud.</p></div>
      <div><h3>Busyness</h3><div class="pills">${complexityNames.map((name, position) => `<button class="pill ${current.complexity === position + 1 ? 'chosen' : ''}" data-act="complexity" data-val="${position + 1}">${name}</button>`).join('')}</div><p class="small">How many notes each part plays.</p></div>
      <div><h3>Height</h3><div class="pills">${(['low','middle','high'] as const).map(value => `<button class="pill ${current.register === value ? 'chosen' : ''}" data-act="register" data-val="${value}">${value[0].toUpperCase() + value.slice(1)}</button>`).join('')}</div><p class="small">Where the chords sit.</p></div></div>
      <button class="entrance ${current.bigEntrance ? 'chosen' : ''}" data-act="entrance" aria-pressed="${current.bigEntrance}"><strong>Big entrance into the next block</strong><span>A rising run and a swell at the end of this block.</span></button>`;
  };
  const partsScreen = () => {
    const name = stringParts[partIndex], choice = song().parts?.[name] ?? 'auto';
    const stack = [...stringParts].reverse().map(part => {
      const position = stringParts.indexOf(part), state = position < partIndex ? 'added' : position === partIndex ? 'current' : 'waiting';
      return `<li class="${state}"><span>${part}</span><em>${position <= partIndex ? partText[song().parts?.[part] ?? 'auto'] : 'Not yet'}</em></li>`;
    }).join('');
    const listening = listenBlock >= 0 ? listenBlock : defaultListen();
    const listen = song().blocks.map((item, position) => `<button class="pill ${listening === position ? 'chosen' : ''}" data-act="listen" data-val="${position}">${item.section} ${position + 1}</button>`).join('');
    return `<section class="screen parts"><div class="parts-layout"><div><p class="where">Part ${partIndex + 1} of 5, from the bottom up</p><h1>${partIndex === 0 ? 'Start with the basses.' : `Add the ${spoken[name]}.`}</h1><p class="lede">${partIndex === 0 ? 'The basses are the floor everything stands on. Choose what they do across the whole piece.' : 'You’ll hear it on top of the parts you’ve already added.'}</p>
      <div class="grid part-choices">${partOptions(name).map(value => `<button class="tile ${choice === value ? 'chosen' : ''}" data-act="part" data-val="${value}"><strong>${partText[value]}</strong><span>${partHint[value]}</span></button>`).join('')}</div>
      <h3>Listen in</h3><div class="pills">${listen}</div></div>
      <ol class="stack" aria-label="Parts so far">${stack}</ol></div></section>`;
  };
  const finishScreen = () => {
    const blocks = song().blocks.map((item, position) => `<li class="mood-${item.emotion}"><button class="tl-block" data-act="edit-block" data-val="${position}"><strong>${item.section}</strong><span>${emotions[item.emotion].label}</span><small>${item.bars.map(bar => bar.hold ? '–' : bar.chords.map(chord => friendlyChord(chord, blockKey(song(), item)).split(' · ')[0]).join('/')).join(' ')}</small></button><span class="block-tools"><button data-act="dup" data-val="${position}">Repeat</button>${song().blocks.length > 1 ? `<button data-act="remove" data-val="${position}">Remove</button>` : ''}</span></li>`).join('');
    const seconds = Math.round(song().blocks.length * 4 * song().meter[0] * (4 / song().meter[1]) * 60 / song().tempo);
    return `<section class="screen"><h1>Your piece is ready.</h1><p class="lede">${song().blocks.length} blocks, about ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} long, ${escape(feelName(song().key.mode)).toLowerCase()} in ${escape(song().key.name)} at ${song().tempo} beats a minute. Tap a block to change it.</p>
      <ol class="timeline">${blocks}</ol>
      <div class="export"><div><h2>Take it into Logic</h2><p>Five tracks, one per string section, all on MIDI channel 1. Nothing in the file picks a sound; you choose your instruments in Logic.</p>
      <label><input type="checkbox" data-change="cc" ${song().controllers ? 'checked' : ''}> Include dynamics (CC1 and CC11)</label>
      <label><input type="checkbox" data-change="artic" ${song().articulationNames ? 'checked' : ''}> Add the playing style to track names</label></div>
      <div class="export-buttons"><button class="primary big" data-act="export">Download MIDI file</button><button class="big" data-act="save">Save this piece</button><button data-act="new">Start another piece</button></div></div></section>`;
  };

  const screen = () => step === 'start' ? startScreen() : step === 'feeling' ? feelingScreen() : step === 'key' ? keyScreen() : step === 'pace' ? paceScreen()
    : step === 'shape' ? shapeScreen() : step === 'block' ? `<section class="screen">${stage === 'emotion' ? emotionStage() : stage === 'chords' ? chordStage() : movementStage()}</section>`
    : step === 'parts' ? partsScreen() : finishScreen();
  const nextLabel = () => step === 'key' && !song().keyLocked ? 'Lock in and continue'
    : step === 'block' && stage === 'emotion' ? 'Next: chords' : step === 'block' && stage === 'chords' ? 'Next: movement'
    : step === 'block' && blockIndex === song().blocks.length - 1 ? 'On to the parts' : step === 'block' ? `Next block: ${song().blocks[blockIndex + 1].section.toLowerCase()}`
    : step === 'parts' && partIndex === stringParts.length - 1 ? 'Finish' : step === 'parts' ? `Add the ${spoken[stringParts[partIndex + 1]]}` : 'Next';
  const footer = () => step === 'start' ? '' : `<footer class="bar"><button data-act="back">Back</button><div class="transport">${['block','parts'].includes(step) ? '<button data-act="play-block">Play this block</button>' : ''}<button data-act="play-song">Play the piece</button><button data-act="stop">Stop</button><label><input type="checkbox" data-change="auto" ${autoPlay ? 'checked' : ''}> Play as I choose</label></div>${step === 'finish' ? '<span></span>' : `<button class="primary" data-act="next">${escape(nextLabel())}</button>`}</footer>`;
  function render(): void {
    root.innerHTML = `<style>${moodCss}</style><div class="wizard step-${step}">${header()}<main>${error ? `<p class="error" role="alert">${escape(error)}</p>` : ''}${screen()}</main>${footer()}</div>`;
    root.querySelector<HTMLElement>('main h1')?.setAttribute('tabindex', '-1');
  }
  const replay = () => { render(); if (autoPlay) playBlock(); };

  function act(name: string, value?: string): void {
    try {
      switch (name) {
        case 'new': { const fresh = createSong(); fresh.keyLocked = false; commit(fresh); saved = fresh; reached = 0; blockIndex = 0; partIndex = 0; listenBlock = -1; go('feeling'); return; }
        case 'resume': go('finish'); return;
        case 'home': go('start'); return;
        case 'surprise': {
          const next = createSong(), feel = feels[Math.floor(Math.random() * feels.length)], home = Math.floor(Math.random() * 12);
          next.key = { root: home, name: names[home], mode: feel.mode }; next.tempo = [66, 84, 100, 120][Math.floor(Math.random() * 4)]; next.keyLocked = true;
          commit(next); buildShape(shapes[1 + Math.floor(Math.random() * 3)].sections); reached = flow.length - 1; go('finish'); playSong(); return;
        }
        case 'goto': if (value === 'block') { stage = 'emotion'; slot = 0; } if (value === 'parts') partIndex = 0; go(value as Step); return;
        case 'next': forward(); return;
        case 'back': backward(); return;
        case 'undo': history.undo(); arrangement = undefined; blockIndex = Math.min(blockIndex, song().blocks.length - 1); persist(); render(); return;
        case 'redo': history.redo(); arrangement = undefined; blockIndex = Math.min(blockIndex, song().blocks.length - 1); persist(); render(); return;
        case 'theory': theory = !theory; render(); return;
        case 'feel': edit({ type: 'mode', value: value as Mode }); render(); hearChords(song().key, feelDemo[value!] ?? [1,4,5,1], 0.7); return;
        case 'key': edit({ type: 'key', root: Number(value) }); render(); hearChords(song().key, [1], 1.4); return;
        case 'lock': edit({ type: 'key-lock', value: true }); forward(); return;
        case 'unlock': edit({ type: 'key-lock', value: false }); render(); return;
        case 'tempo': edit({ type: 'tempo', value: Number(value) }); render(); if (autoPlay) playBlock(0); return;
        case 'nudge': edit({ type: 'tempo', value: song().tempo + Number(value) }); render(); return;
        case 'tap': {
          const now = performance.now(); taps = [...taps.filter(time => now - time < 3000), now];
          if (taps.length >= 3) { const gaps = taps.slice(1).map((time, position) => time - taps[position]); edit({ type: 'tempo', value: Math.round(60000 / (gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length)) }); }
          render(); return;
        }
        case 'meter': edit({ type: 'meter', value: value!.split('/').map(Number) as [number, number] }); render(); return;
        case 'shape': buildShape(shapes.find(item => item.id === value)!.sections); forward(); return;
        case 'block-jump': case 'edit-block': blockIndex = Number(value); stage = 'emotion'; slot = 0; go('block'); if (autoPlay) playBlock(); return;
        case 'copy-earlier': copyEarlier(); replay(); return;
        case 'emotion': edit({ type: 'emotion', value: value! }); replay(); return;
        case 'slot': {
          slot = Number(value); render();
          const bar = block().bars[slot];
          if (!bar.hold) void preview.chords(bar.chords.map(chord => voiced(chordFor(chord, blockKey(song(), block())))), 0.9).catch(() => {});
          return;
        }
        case 'chord': {
          const option = palette(song(), block())[Number(value)];
          edit({ type: 'chord', slot, half: 0, value: option.chord }); render();
          void preview.chords([voiced(chordFor(option.chord, blockKey(song(), block())))], 1.1).catch(() => {}); return;
        }
        case 'dice': edit(value === undefined ? { type: 'dice' } : { type: 'dice', slot: Number(value) }); replay(); return;
        case 'split': edit({ type: 'split', slot }); replay(); return;
        case 'push': edit({ type: 'push', slot }); replay(); return;
        case 'rhythm': edit({ type: 'rhythm', value: value as NonNullable<Block['rhythm']> }); replay(); return;
        case 'texture': edit({ type: 'texture', value: value as Texture }); replay(); return;
        case 'energy': edit({ type: 'energy', value: Number(value) }); replay(); return;
        case 'complexity': edit({ type: 'complexity', value: Number(value) }); replay(); return;
        case 'register': edit({ type: 'register', value: value as Block['register'] }); replay(); return;
        case 'entrance': edit({ type: 'bigEntrance' }); replay(); return;
        case 'part': edit({ type: 'part', name: stringParts[partIndex], value: value as PartChoice }); render(); if (autoPlay) playBlock(listenBlock >= 0 ? listenBlock : defaultListen()); return;
        case 'listen': listenBlock = Number(value); render(); playBlock(listenBlock); return;
        case 'dup': edit({ type: 'duplicate' }, song().blocks[Number(value)].id); render(); return;
        case 'remove': edit({ type: 'delete' }, song().blocks[Number(value)].id); blockIndex = Math.min(blockIndex, song().blocks.length - 1); render(); return;
        case 'play-block': playBlock(step === 'parts' ? (listenBlock >= 0 ? listenBlock : defaultListen()) : blockIndex); return;
        case 'play-song': playSong(); return;
        case 'stop': preview.stop(); return;
        case 'export': download(`${song().key.name} ${feelName(song().key.mode)} strings.mid`, writeMidi(arranged()), 'audio/midi'); return;
        case 'save': download(`${song().key.name} ${feelName(song().key.mode)} piece.json`, new TextEncoder().encode(JSON.stringify(song(), null, 2)), 'application/json'); return;
      }
    } catch (problem) { error = (problem as Error).message; render(); }
  }
  function download(name: string, bytes: Uint8Array, type: string): void {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const onClick = (event: Event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!target || target.hasAttribute('disabled')) return;
    act(target.dataset.act!, target.dataset.val);
  };
  const onChange = async (event: Event) => {
    const input = event.target as HTMLInputElement, kind = input.dataset.change;
    if (kind === 'auto') { autoPlay = input.checked; if (!autoPlay) preview.stop(); return; }
    if (kind === 'cc') { edit({ type: 'controllers' }); render(); return; }
    if (kind === 'artic') { edit({ type: 'articulationNames' }); render(); return; }
    if (kind === 'open') {
      try { const file = input.files?.[0]; if (!file) return; commit(loadSong(JSON.parse(await file.text()))); reached = flow.length - 1; go('finish'); }
      catch (problem) { error = (problem as Error).message; render(); }
    }
  };
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  render();
  return {
    getSong: () => structuredClone(song()), getStep: () => step === 'block' ? `block:${blockIndex}:${stage}` : step === 'parts' ? `parts:${partIndex}` : step, act,
    destroy: () => { preview.stop(); root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); root.innerHTML = ''; }
  };
}
