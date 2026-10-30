import { arrangeSong, chordFor, friendlyChord, loadSong, songText } from '../engine/blocks';
import { createSong, emotions } from '../engine/emotions';
import { editSong, type Edit } from '../engine/editor';
import { blockKey, feels, History, modeFeeling, sectionNames, type DegreeChord, type Song } from '../engine/song';
import { writeMidi } from '../engine/midi';
import { PPQ, type Key, type Mode, type Texture } from '../engine/types';
import { names } from '../engine/theory';
import { voiceLead } from '../engine/voice-leading';
import { harmonicRhythms } from '../engine/harmonic-rhythm';
import { Preview } from './preview';

const escape = (text: string) => text.replace(/[&<>"']/g,letter => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[letter]!);
const movements: { value: Texture; label: string; icon: string }[] = [ { value: 'pad', label: 'Long notes', icon: '━━━━' }, { value: 'ostinato', label: 'Quick pattern', icon: '▰ ▪ ▪ ▰' }, { value: 'arpeggio', label: 'Arpeggios', icon: '▁▃▅▇▅▃' }, { value: 'tremolo', label: 'Shimmer', icon: '≋≋≋' }, { value: 'pulses', label: 'Pulse', icon: '▌ ▌ ▌ ▌' } ];
const complexityNames = ['Still','Gentle','Moving','Busy','Wild'];
const meterChoices: { label: string; value: [number,number] }[] = [{ label: 'Straight 4', value: [4,4] },{ label: 'Waltz 3', value: [3,4] },{ label: 'Rolling 6/8', value: [6,8] },{ label: 'Odd 7/8', value: [7,8] }];
const button = (label: string, action: Edit, selected = false, extra = '') => `<button type="button" data-edit="${escape(JSON.stringify(action))}" aria-pressed="${selected}" ${extra}>${label}</button>`;
export function mountBuilder(root: HTMLElement): { getSong(): Song; dispatch(action: Edit): boolean; destroy(): void } {
  const history = new History(createSong());
  const preview = new Preview(); preview.preload();
  let selected = history.value.blocks[0].id;
  let theory = false, automatic = true, loop = true, changeKey = false;
  let slot = 0, half = 0, error = '', expert = false;
  let arrangement = arrangeSong(history.value);
  const muted = new Set<string>(), soloed = new Set<string>();
  let taps: number[] = [], destroyed = false, frame = 0;
  const current = () => history.value.blocks.find(block => block.id === selected) ?? history.value.blocks[0];
  const audible = () => new Set(arrangement.parts.filter(part => !muted.has(part.name) && (!soloed.size || soloed.has(part.name))).map(part => part.name));
  const index = () => history.value.blocks.indexOf(current());
  async function play(whole = false, harmony = false): Promise<void> {
    try { await preview.play(arrangement,audible(),whole ? undefined : index(),whole ? false : loop,harmony); }
    catch (caught) { error = `Preview could not start: ${(caught as Error).message}`; render(); }
  }
  function changed(): void { render(); if (automatic) void play(); }
  function dispatch(action: Edit): boolean {
    if (automatic) void preview.warm().catch(() => {});
    try {
      if (history.value.expert && action.type !== 'new') throw new Error('This saved progression uses Expert mode. Choose Start fresh to begin a new block song.');
      const song = editSong(history.value,current().id,action), next = arrangeSong(song);
      history.set(song); arrangement = next;
      if (!song.blocks.some(block => block.id === selected)) selected = song.blocks[0].id;
      if (action.type === 'duplicate' || action.type === 'add') selected = `block-${song.nextId - 1}`;
      if (action.type === 'new') selected = song.blocks[0].id;
      error = ''; preview.stop(); render();
      if (automatic) {
        if (action.type === 'key') void hearChord({ degree: 1, spice: 'plain' },action.block ? blockKey(song,current()) : song.key);
        else if (action.type === 'chord' || action.type === 'spice') void hearChord(current().bars[action.slot].chords[action.half],blockKey(song,current()));
        else void play();
      }
      return true;
    } catch (caught) { error = (caught as Error).message; render(); return false; }
  }
  async function hearChord(choice: DegreeChord, key: Key): Promise<void> {
    const chord = { ...chordFor(choice,key), start: 0, duration: PPQ * 2, bar: 0, section: 0 };
    const score = { ...arrangement.score, chords: [chord], sections: [{ name: 'Home', start: 0, end: PPQ * 2, index: 0 }], duration: PPQ * 2 };
    try { await preview.play({ ...arrangement, score, core: voiceLead(score,'open') },audible(),undefined,false,true); }
    catch (caught) { error = `Preview could not start: ${(caught as Error).message}`; render(); }
  }
  function save(filename: string, data: BlobPart, type: string): void {
    const url = URL.createObjectURL(new Blob([data],{ type }));
    const anchor = document.createElement('a'); anchor.download = filename; anchor.href = url; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  const filename = () => `the-great-composer-${new Intl.DateTimeFormat('en-CA',{ timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())}-${history.value.key.name}`;
  function keys(key: Key, forBlock = false): string {
    return `<div class="key-buttons" aria-label="${forBlock ? 'Block' : 'Song'} home note">${names.map((name,root) => button(name,{ type: 'key', root, block: forBlock },key.root === root)).join('')}</div>`;
  }
  function moods(mode: Mode, forBlock = false): string {
    return `<div class="feel-buttons" aria-label="${forBlock ? 'Block' : 'Song'} mood">${feels.map(feel => button(`${feel.label}${theory ? `<small>${feel.mode}</small>` : ''}`,{ type: 'mode', value: feel.mode, block: forBlock },mode === feel.mode)).join('')}</div>`;
  }
  function timeline(): string {
    const song = history.value;
    return `<div class="timeline" role="list" aria-label="Four-bar song blocks">${song.blocks.map((block,position) => {
      const emotion = emotions[block.emotion], key = blockKey(song,block);
      return `<article role="listitem" class="block-card ${block.id === current().id ? 'chosen' : ''}" style="--emotion:${emotion.colour}" draggable="true" data-block="${block.id}"><button class="block-open" data-select="${block.id}" aria-pressed="${block.id === current().id}"><span class="block-meta">${String(position + 1).padStart(2,'0')} <b>${block.section}</b> ${block.locked ? '🔒' : ''}</span><strong>${emotion.icon} ${emotion.label}</strong><small>${key.name} · ${modeFeeling(key.mode)}</small><span class="mini-chords">${block.bars.map(bar => `<span>${bar.chords.map(chord => theory ? chordFor(chord,key).symbol : names[chordFor(chord,key).root]).join(' / ')}${bar.push ? ' ↖' : ''}</span>`).join('')}</span><span class="energy-bar"><i style="width:${block.energy * 10}%"></i></span><small>4 bars · ${complexityNames[block.complexity - 1]}</small></button><div class="block-tools"><button data-block-action="${block.id}" data-action="repeat" aria-label="Repeat ${block.section} block">×2</button><button data-block-action="${block.id}" data-action="up" aria-label="Move ${block.section} earlier" ${position === 0 ? 'disabled' : ''}>←</button><button data-block-action="${block.id}" data-action="down" aria-label="Move ${block.section} later" ${position === song.blocks.length - 1 ? 'disabled' : ''}>→</button></div><span class="card-playhead" data-head="${position}"></span></article>`;
    }).join('')}<button class="add-block" data-edit="${escape(JSON.stringify({ type: 'add' }))}"><b>＋</b>Add block</button></div>`;
  }
  function editor(): string {
    const song = history.value, block = current(), emotion = emotions[block.emotion], key = blockKey(song,block);
    const jobs: { label: string; choices: DegreeChord[] }[] = [
      { label: 'Home · settle in', choices: [{ degree: 1, spice: 'plain' },{ degree: 3, spice: 'plain' },{ degree: 6, spice: 'plain' }] },
      { label: 'Away · keep moving', choices: [{ degree: 2, spice: 'plain' },{ degree: 4, spice: 'plain' }] },
      { label: 'Pull · want to come home', choices: [{ degree: 5, spice: 'plain' },{ degree: 7, spice: 'plain' }] },
      { label: 'Colour · a little surprise', choices: [{ degree: 4, spice: 'darker' },{ degree: 2, alter: -1, quality: 'major', spice: 'plain' },{ degree: 3, quality: 'major', spice: 'plain' }] }
    ];
    const chosenChord = block.bars[slot].chords[half] ?? block.bars[slot].chords[0];
    const rhythmPanel = `<h2>When should the chords turn?</h2><p class="hint">Linger, hurry, or lean across the lines. Four-bar blocks don’t have to mean four equal changes.</p><div class="harmonic-grid">${harmonicRhythms.map(rhythm => button(`<strong>${rhythm.label}</strong><small>${rhythm.description}</small>`,{ type: 'rhythm', value: rhythm.value },block.rhythm === rhythm.value)).join('')}</div>`;
    return `<section class="block-editor" style="--emotion:${emotion.colour}" aria-label="Selected block editor"><div class="editor-heading"><div><p class="eyebrow">FOUR BARS. YOUR NEXT MOVE.</p><h1>${emotion.icon} ${block.section} <em>${emotion.label}</em></h1></div><div class="button-row">${button('🎲 Surprise this block',{ type: 'surprise' })}${button(block.locked ? '🔒 Locked' : '♡ Lock block',{ type: 'locked' },block.locked)}</div></div>
      <div class="button-row section-chips" aria-label="Section">${sectionNames.map(name => button(name,{ type: 'section', value: name },block.section === name)).join('')}</div>
      <h2>How should it feel?</h2><div class="emotion-grid">${Object.entries(emotions).map(([name,value]) => button(`<span>${value.icon}</span>${value.label}`,{ type: 'emotion', value: name },block.emotion === name,`style="--tile:${value.colour}"`)).join('')}</div>
      <div class="block-key"><div class="button-row">${button('Same as song',{ type: 'same-key' },block.key === 'same')}<button id="change-key" aria-expanded="${changeKey}">Change home note · ${key.name} ${modeFeeling(key.mode)}</button>${button('↗ Lift',{ type: 'key-move', value: 'lift' })}${button('☀ Brighter',{ type: 'key-move', value: 'brighter' })}${button('☾ Darker',{ type: 'key-move', value: 'darker' })}${button('◐ Same key, other mood',{ type: 'key-move', value: 'parallel' })}</div>${changeKey ? `${keys(key,true)}${moods(key.mode,true)}` : ''}</div>${rhythmPanel}
      <div class="section-heading"><h2>Four little stepping stones</h2>${button('🎲 New four chords',{ type: 'dice' })}</div><div class="bar-slots">${block.bars.map((bar,barIndex) => `<div class="bar-slot ${slot === barIndex ? 'active' : ''}"><span>BAR ${barIndex + 1}</span><div class="bar-chords">${bar.chords.map((chord,splitIndex) => `<button data-slot="${barIndex}" data-half="${splitIndex}" aria-pressed="${slot === barIndex && half === splitIndex}">${escape(theory ? chordFor(chord,key).symbol : friendlyChord(chord,key))}</button>`).join('')}</div><div class="button-row">${button(bar.chords.length === 1 ? 'Split' : 'Join',{ type: 'split', slot: barIndex })}${button('Push ↖',{ type: 'push', slot: barIndex },bar.push)}${button('🎲',{ type: 'dice', slot: barIndex, half: 0 },false,`aria-label="New chord for bar ${barIndex + 1}"`)}</div></div>`).join('')}</div>
      <details class="chord-picker" open><summary>Change bar ${slot + 1}${block.bars[slot].chords.length === 2 ? ` · ${half === 0 ? 'first' : 'second'} half` : ''}</summary><div class="chord-jobs">${jobs.map(job => `<div><h3>${job.label}</h3><div class="button-row">${job.choices.map(chord => button(escape(theory ? chordFor(chord,key).symbol : friendlyChord(chord,key)),{ type: 'chord', slot, half, value: chord })).join('')}</div></div>`).join('')}</div><div class="spice-row"><span>A little flavour</span>${(['plain','softer','richer','darker','brighter','lean'] as const).map((spice,index) => button(['Simple','Softer','Richer','Darker','Brighter','Lean'][index],{ type: 'spice', slot, half, value: spice },chosenChord.spice === spice)).join('')}</div></details>
      <div class="shape-grid"><section><h2>Energy</h2><div class="stepper">${button('−',{ type: 'energy', value: block.energy - 1 },false,'aria-label="Less energy"')}<strong>${block.energy}<small>/ 10</small></strong>${button('＋',{ type: 'energy', value: block.energy + 1 },false,'aria-label="More energy"')}</div><p>${block.energy < 4 ? 'A little room to breathe.' : block.energy < 8 ? 'Finding its feet.' : 'Fill the room.'}</p></section><section><h2>Complexity</h2><div class="stepper">${button('−',{ type: 'complexity', value: block.complexity - 1 },false,'aria-label="Less complexity"')}<strong>${complexityNames[block.complexity - 1]}</strong>${button('＋',{ type: 'complexity', value: block.complexity + 1 },false,'aria-label="More complexity"')}</div><p>From a held breath to a busy little world.</p></section><section><h2>Where it lives</h2><div class="button-row">${(['low','middle','high'] as const).map(register => button(register[0].toUpperCase() + register.slice(1),{ type: 'register', value: register },block.register === register)).join('')}</div><div class="button-row">${button('Runs into next block',{ type: 'runs' },block.runs)}${button('✦ Big entrance',{ type: 'bigEntrance' },block.bigEntrance)}</div></section></div>
      <h2>Give it movement</h2><div class="movement-grid">${movements.map(movement => button(`<span class="rhythm">${movement.icon}</span>${movement.label}${theory ? `<small>${movement.value}</small>` : ''}`,{ type: 'texture', value: movement.value },block.texture === movement.value)).join('')}</div>
      ${theory ? `<details><summary>Show this block’s harmony</summary><div class="chord-grid">${arrangement.score.chords.flatMap((chord,chordIndex) => chord.section === index() ? [`<article><strong>${chord.symbol}</strong><b>${arrangement.analysis.chords[chordIndex].roman}</b><small>${arrangement.analysis.chords[chordIndex].scaleName}</small><small>${arrangement.analysis.chords[chordIndex].explanation}</small></article>`] : []).join('')}</div></details>` : ''}
      <div class="editor-end button-row">${button('Duplicate block',{ type: 'duplicate' })}${button('Delete block',{ type: 'delete' },false,song.blocks.length === 1 ? 'disabled' : '')}<span>TAKE ${block.take} · changes are always undoable</span></div></section>`;
  }
  function render(): void {
    if (destroyed || expert) return;
    half = Math.min(half,current().bars[slot].chords.length - 1);
    const song = history.value;
    const active = root.contains(document.activeElement) ? document.activeElement as HTMLElement : undefined;
    const focus = active ? { id: active.id, label: active.getAttribute('aria-label'), edit: active.dataset.edit, select: active.dataset.select, slot: active.dataset.slot, half: active.dataset.half } : undefined;
    const timelineScroll = root.querySelector('.timeline')?.scrollLeft ?? 0;
    root.innerHTML = `<div class="builder"><div class="song-top"><div class="builder-brand"><a href="#">THE GREAT <b>COMPOSER</b></a><span>Small choices. A bigger sound.</span><div class="button-row"><button id="undo" ${history.canUndo ? '' : 'disabled'} aria-label="Undo">↶ Undo</button><button id="redo" ${history.canRedo ? '' : 'disabled'} aria-label="Redo">↷ Redo</button><button id="theory" aria-pressed="${theory}">Show the theory</button><button id="expert">Expert</button></div></div><div class="song-home"><span>Home note</span>${keys(song.key)}<span>Mood</span>${moods(song.key.mode)}</div><div class="song-rhythm"><span>Speed</span><div class="button-row">${[66,84,100,120,144].map((tempo,position) => button(['Slow','Walking','Moving','Fast','Racing'][position],{ type: 'tempo', value: tempo },song.tempo === tempo)).join('')}${button('−',{ type: 'tempo', value: song.tempo - 2 },false,'aria-label="Slower"')}<b>${song.tempo}</b>${button('＋',{ type: 'tempo', value: song.tempo + 2 },false,'aria-label="Faster"')}<button id="tap-tempo">Tap tempo</button></div><span>Feel</span><div class="button-row">${meterChoices.map(meter => button(meter.label,{ type: 'meter', value: meter.value },song.meter.join() === meter.value.join())).join('')}<details><summary>More</summary><div class="button-row">${([[2,4],[5,4],[9,8],[12,8]] as [number,number][]).map(meter => button(meter.join('/'),{ type: 'meter', value: meter },song.meter.join() === meter.join())).join('')}</div></details></div></div></div>
      <main class="builder-main"><div class="song-heading"><div><p class="eyebrow">YOUR STRING SKETCHBOOK</p><h1>Build a feeling.</h1><p>Pick a block. Follow your ears. There’s no wrong place to start.</p></div><div class="button-row">${button('✦ Surprise me',{ type: 'surprise', whole: true })}${button('Start fresh',{ type: 'new' })}<label class="load-button">Open project<input id="load-song" type="file" accept=".json"></label></div></div>
      <div id="builder-error" role="alert" ${error ? '' : 'hidden'}>${escape(error)}</div>${song.expert ? '<p class="expert-notice">Expert progression loaded. Open Expert to edit it, or choose Start fresh to begin a block song.</p>' : timeline()}<div class="ensemble-row"><b>♪ Strings</b><button disabled>Chamber · coming</button><button disabled>Full orchestra · coming</button><button disabled>Hybrid · coming</button><span>Five parts. Your instruments in Logic.</span></div>${song.expert ? '' : editor()}
      <details class="export-options"><summary>Export options</summary><div class="button-row">${button('Dynamics & expression',{ type: 'controllers' },song.controllers)}${button('Articulation in track names',{ type: 'articulationNames' },song.articulationNames)}<button id="export-text">Download expert chord text</button></div></details><p class="builder-footnote">Everything stays on your Mac. The bundled preview is an approximation; choose your own strings in Logic.</p></main>
      <div class="play-bar"><div class="button-row"><button id="play-song" class="primary">▶ Whole song</button><button id="play-block">▶ This block</button><button id="stop">■ Stop</button><button id="loop-block" aria-pressed="${loop}">↻ Loop block</button><button id="auto-preview" aria-pressed="${automatic}">Tap to hear ${automatic ? 'on' : 'off'}</button></div><div class="string-mixer">${arrangement.parts.map(part => `<div><span>${part.name}</span><button data-mute="${part.name}" aria-label="Mute ${part.name}" aria-pressed="${muted.has(part.name)}">M</button><button data-solo="${part.name}" aria-label="Solo ${part.name}" aria-pressed="${soloed.has(part.name)}">S</button></div>`).join('')}</div><div class="button-row"><button id="export-midi" class="primary">Export MIDI ↓</button><button id="save-song">Save project</button></div><span class="sr-only" id="play-status" role="status"></span></div></div>`;
    bind();
    root.querySelectorAll<HTMLElement>('.bar-slot [data-edit]').forEach(button => {
      const action = JSON.parse(button.dataset.edit!);
      if (action.type === 'dice' && action.slot === slot) { action.half = half; button.dataset.edit = JSON.stringify(action); button.setAttribute('aria-label',`New chord for bar ${slot + 1}${current().bars[slot].chords.length === 2 ? `, ${half === 0 ? 'first' : 'second'} half` : ''}`); }
    });
    root.querySelectorAll<HTMLElement>('.bar-slot>span').forEach((label,index) => { if (current().bars[index]?.hold) label.textContent += ' · KEEP HOLDING'; });
    root.querySelectorAll<HTMLElement>('.block-card .mini-chords').forEach((card,index) => {
      [...card.children].forEach((tile,bar) => { if (song.blocks[index].bars[bar].hold) tile.textContent = '↔ ' + tile.textContent; });
    });
    const timelineElement = root.querySelector('.timeline');
    if (timelineElement) timelineElement.scrollLeft = timelineScroll;
    if (focus) {
      const target = [...root.querySelectorAll<HTMLElement>('button')].find(button => focus.id ? button.id === focus.id : focus.label ? button.getAttribute('aria-label') === focus.label : focus.edit ? button.dataset.edit === focus.edit : focus.select ? button.dataset.select === focus.select : focus.slot ? button.dataset.slot === focus.slot && button.dataset.half === focus.half : false);
      target?.focus({ preventScroll: true });
    }
  }
  async function openExpert(): Promise<void> {
    preview.stop(); const module = await import('./expert'); expert = true;
    const song = history.value;
    module.mountExpert(song.expert ?? { ...arrangement.project, source: songText(song) });
    const bar = document.createElement('div'); bar.className = 'expert-return';
    bar.innerHTML = '<button id="return-builder">← Return to blocks</button><button id="keep-expert">Save expert edits as project</button>';
    root.before(bar);
    bar.querySelector('#return-builder')!.addEventListener('click',() => { module.stopExpert(); bar.remove(); expert = false; render(); });
    bar.querySelector('#keep-expert')!.addEventListener('click',() => {
      try { const next = structuredClone(history.value); next.expert = module.expertProject(); history.set(next); save(filename() + '.json',JSON.stringify(history.value,null,2),'application/json'); }
      catch (caught) { let message = bar.querySelector<HTMLElement>('[role=alert]'); if (!message) { message = document.createElement('span'); message.setAttribute('role','alert'); bar.append(message); } message.textContent = (caught as Error).message; }
    });
  }
  function bind(): void {
    const song = history.value;
    const on = (selector: string, callback: (element: HTMLElement) => void) => root.querySelectorAll<HTMLElement>(selector).forEach(element => element.addEventListener('click',() => callback(element)));
    on('[data-edit]',element => dispatch(JSON.parse(element.dataset.edit!)));
    on('[data-select]',element => { selected = element.dataset.select!; slot = half = 0; changeKey = false; render(); if (automatic) void play(); });
    on('[data-slot]',element => { slot = Number(element.dataset.slot); half = Number(element.dataset.half); render(); if (automatic) void hearChord(current().bars[slot].chords[half],blockKey(history.value,current())); });
    on('#change-key',() => { changeKey = !changeKey; render(); }); on('#theory',() => { theory = !theory; render(); });
    on('#undo',() => { history.undo(); arrangement = arrangeSong(history.value); error = ''; preview.stop(); changed(); });
    on('#redo',() => { history.redo(); arrangement = arrangeSong(history.value); error = ''; preview.stop(); changed(); });
    on('#play-song',() => void play(true)); on('#play-block',() => void play()); on('#stop',() => preview.stop());
    on('#loop-block',() => { loop = !loop; preview.stop(); render(); }); on('#auto-preview',() => { automatic = !automatic; preview.stop(); render(); });
    on('#tap-tempo',() => { const now = performance.now(); taps = taps.filter(time => now - time < 4000); taps.push(now); if (taps.length > 5) taps.shift(); if (taps.length >= 2) dispatch({ type: 'tempo', value: Math.round(60000 * (taps.length - 1) / (taps.at(-1)! - taps[0])) }); });
    on('[data-block-action]',element => { selected = element.dataset.blockAction!; const action = element.dataset.action; if (action === 'repeat') dispatch({ type: 'duplicate' }); else dispatch({ type: 'move', to: index() + (action === 'up' ? -1 : 1) }); });
    on('[data-mute]',element => { const name = element.dataset.mute!; if (muted.has(name)) muted.delete(name); else muted.add(name); preview.stop(); render(); if (automatic) void play(); });
    on('[data-solo]',element => { const name = element.dataset.solo!; if (soloed.has(name)) soloed.delete(name); else soloed.add(name); preview.stop(); render(); if (automatic) void play(); });
    on('#export-midi',() => save(filename() + '.mid',writeMidi(arrangement).buffer as ArrayBuffer,'audio/midi'));
    on('#save-song',() => save(filename() + '.json',JSON.stringify(history.value,null,2),'application/json'));
    on('#export-text',() => save(filename() + '.txt',songText(song),'text/plain')); on('#expert',() => void openExpert());
    root.querySelector<HTMLInputElement>('#load-song')!.addEventListener('change',async event => {
      try { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; const loaded = loadSong(JSON.parse(await file.text())), next = arrangeSong(loaded); history.set(loaded); arrangement = next; selected = loaded.blocks[0].id; error = ''; if (loaded.expert) await openExpert(); else changed(); }
      catch (caught) { error = (caught as Error).message; render(); }
    });
    let dragged = '';
    root.querySelectorAll<HTMLElement>('[data-block]').forEach(card => {
      card.addEventListener('dragstart',event => { dragged = card.dataset.block!; event.dataTransfer?.setData('text/plain',dragged); });
      card.addEventListener('dragover',event => event.preventDefault());
      card.addEventListener('drop',event => { event.preventDefault(); const id = dragged || event.dataTransfer?.getData('text/plain'); if (!id || !song.blocks.some(block => block.id === id)) return; selected = id; dispatch({ type: 'move', to: song.blocks.findIndex(block => block.id === card.dataset.block) }); });
    });
  }
  function animate(): void {
    if (destroyed) return;
    const tick = preview.tick, duration = history.value.meter[0] * 4 / history.value.meter[1] * PPQ * 4;
    root.querySelectorAll<HTMLElement>('[data-head]').forEach(head => { const progress = tick === undefined ? -1 : (tick - Number(head.dataset.head) * duration) / duration; head.style.display = progress >= 0 && progress < 1 ? 'block' : 'none'; head.style.left = `${progress * 100}%`; });
    frame = requestAnimationFrame(animate);
  }
  render(); frame = requestAnimationFrame(animate);
  return { getSong: () => structuredClone(history.value), dispatch, destroy: () => { destroyed = true; preview.stop(); cancelAnimationFrame(frame); root.innerHTML = ''; } };
}
