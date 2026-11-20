import './style.css';
import { arrange, defaults, loadProject, sectionSettings } from '../engine/arrange';
import { writeMidi } from '../engine/midi';
import { harmoniseScale, names } from '../engine/theory';
import { scaleDefinitions, scaleNames, spellScale } from '../engine/scales';
import { PPQ, type Arrangement, type Project, type Texture } from '../engine/types';
import { Preview } from './preview';

const root = document.querySelector<HTMLDivElement>('#app')!;
let project = defaults();
let arrangement: Arrangement;
let step = 0;
let error = '';
const muted = new Set<string>();
const soloed = new Set<string>();
let familyMuted = false;
let previewSection = -1;
let looping = false;
const preview = new Preview();
const steps = ['Chords','Analysis','Harmony','Textures','Review','Export'];
const textures: { value: Texture; title: string; text: string }[] = [
  { value: 'pad', title: 'Open string canopy', text: 'Held voices, gentle dynamic arches, room to breathe.' },
  { value: 'ostinato', title: 'Moving inner strings', text: 'Second violins drive a figure, violas answer off the beat, cellos pulse beneath held first violins.' },
  { value: 'arpeggio', title: 'Woven string lattice', text: 'Second violins arpeggiate; violas counter in the opposite direction at higher density.' },
  { value: 'tremolo', title: 'Measured shimmer', text: 'Fast measured repetitions with a grounded bass.' },
  { value: 'pulses', title: 'Broad string pulse', text: 'The whole section strikes together; accents shift with complexity and meter.' }
];
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
function generate(): boolean {
  preview.stop();
  try { arrangement = arrange(project); error = ''; return true; }
  catch (caught) { error = (caught as Error).message; return false; }
}
function audible(): Set<string> { return new Set(arrangement.parts.filter(part => !familyMuted && !muted.has(part.name) && (!soloed.size || soloed.has(part.name))).map(part => part.name)); }
async function play(block = false): Promise<void> {
  try { await preview.play(arrangement, audible(), previewSection < 0 ? undefined : previewSection, looping, block); }
  catch (caught) { error = `Preview: ${(caught as Error).message}`; render(); }
}
function download(filename: string, content: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function body(): string {
  if (step === 0) return `<div class="split"><section><p class="eyebrow">01 / THE LEAD SHEET</p><h1>Begin with harmony.</h1><p class="lede">A few chords. A place to go. Build a string arrangement you can make your own in Logic.</p><label for="source">Progression, tempo & meter</label><textarea id="source" spellcheck="false">${escape(project.source)}</textarea><p class="hint">Use | Am . G . | for two changes in 4/4. [Section] names become MIDI markers. ^ anticipates an eighth note.</p><button id="analyse" class="primary">Analyse progression →</button></section><aside><span class="score-icon">𝄞</span><h2>Your harmony,<br>an orchestral sketch.</h2><p>Phase 1 · Five string sections</p><div class="rule"></div><p>Concert pitch · Sound-neutral MIDI<br>All parts on channel 1 · PPQ 960</p><p class="small">Preview uses a bundled synthetic string sample. It approximates register, rhythm and shape. Choose your own instruments in Logic.</p><label class="file-label">Open project JSON<input type="file" id="load" accept=".json"></label></aside></div>`;
  if (step === 1) return analysisPanel();
  if (step === 2) return `<p class="eyebrow">03 / THE HARMONIC CORE</p><h1>Give the chords space.</h1><p class="lede">Five connected voices guide every string part. Choose a register and spacing, then listen.</p><div class="cards">${(['close','open','colour'] as const).map((style,index) => `<article class="choice ${project.voicing === style ? 'selected' : ''}"><span class="number">0${index + 1}</span><h2>${['Close & connected','Open & spacious','High & luminous'][index]}</h2><p>${['A compact core and a warm centre.','Wide lower spacing, a more open upper register.','A higher register with a lighter upper texture.'][index]}</p><button data-voicing="${style}">${project.voicing === style ? 'Selected · ' : ''}Choose & preview</button></article>`).join('')}</div><p class="hint">Phase 1 uses the original harmony. Reharmonisation suggestions are deferred; the high voicing preserves the entered chord tones.</p>`;
  if (step === 3) return `<p class="eyebrow">05 / SECTION TEXTURES</p><h1>Shape the movement.</h1><p class="lede">Give each section its own texture, energy and pace. Complexity 1 always returns to sustains.</p>${arrangement.score.sections.map(section => { const settings = sectionSettings(project, section.index); return `<section class="section-editor"><div class="section-heading"><h2>${escape(section.name)}</h2><button data-listen="${section.index}">▶ Preview section</button></div><div class="texture-grid">${textures.map(texture => `<button class="texture ${settings.texture === texture.value ? 'selected' : ''}" data-section="${section.index}" data-texture="${texture.value}"><strong>${texture.title}</strong><small>${texture.text}</small></button>`).join('')}</div><div class="dials"><label>Density <output>${settings.density}/10</output><input type="range" min="1" max="10" value="${settings.density}" data-setting="density" data-section="${section.index}"></label><label>Complexity <output>${settings.complexity}/5</output><input type="range" min="1" max="5" value="${settings.complexity}" data-setting="complexity" data-section="${section.index}"></label><label><input type="checkbox" data-setting="runs" data-section="${section.index}" ${settings.runs ? 'checked' : ''}> Simple scale fills</label><button data-reroll="${section.index}">New section TAKE · ${settings.take}</button></div></section>`; }).join('')}`;
  if (step === 4) return `<p class="eyebrow">07 / THE STRING SKETCH</p><h1>Listen to the whole.</h1><p class="lede">${arrangement.score.chords.length} chord changes · ${arrangement.parts.reduce((sum,part) => sum + part.notes.length,0)} notes · TAKE ${project.take}</p><div class="toolbar"><button id="take">New whole-piece TAKE</button><button id="family-mute" aria-pressed="${familyMuted}">${familyMuted ? 'Unmute' : 'Mute'} string family</button><button id="family-solo">Solo string family</button></div><div class="roll-scroll"><canvas id="roll" width="1600" height="460" aria-label="Piano roll showing the five string parts" role="img"></canvas></div><div class="mixer">${arrangement.parts.map(part => `<div><strong>${part.name}</strong><span>${part.notes.length} notes</span><button data-mute="${part.name}" aria-pressed="${muted.has(part.name)}">${muted.has(part.name) ? 'Unmute' : 'Mute'}</button><button data-solo="${part.name}" aria-pressed="${soloed.has(part.name)}">Solo</button></div>`).join('')}</div><p class="hint">Section TAKE changes affect that section’s generated notes. Part locks and individual-part rerolls arrive in Phase 3.</p>`;
  return `<p class="eyebrow">08 / INTO YOUR SESSION</p><h1>Make it yours.</h1><p class="lede">Five string tracks, ready for your instruments. Drag the MIDI into Logic and assign the sounds you want.</p><section class="export-panel"><h2>The Great Composer · String sketch</h2><p>${arrangement.score.tempo} BPM · ${arrangement.score.meter.join('/')} · ${arrangement.score.sections.length} sections</p><label><input id="cc" type="checkbox" ${project.controllers ? 'checked' : ''}> Include CC1 dynamics and CC11 expression</label><label><input id="articulation" type="checkbox" ${project.articulationNames ? 'checked' : ''}> Add articulation to track names (e.g. “Violins II – Spiccato”)</label><p class="hint">Parts that change role between sections are labelled “Mixed”. Names are labels only; nothing in the file chooses a sound.</p><div class="toolbar"><button id="midi" class="primary">Download MIDI ↓</button><button id="save">Save project JSON</button></div><p class="small">Type 1 · 960 PPQ · Channel 1 throughout<br>Tempo, meter, key signatures and section markers included.</p></section>`;
}
function analysisPanel(): string {
  const key = arrangement.analysis.key;
  const palette = harmoniseScale(key);
  return `<p class="eyebrow">02 / HARMONIC MAP</p><h1>Find the centre.</h1>
    <p class="lede">${escape(key.name)} ${key.mode} · ${Math.round(arrangement.analysis.confidence * 100)}% ${project.keyOverride || arrangement.score.key ? 'user-specified' : 'detection confidence'}</p>
    <div class="toolbar"><label>Override key & scale <input id="key" list="scale-keys" placeholder="e.g. D harmonic minor" value="${escape(project.keyOverride ?? '')}"></label><datalist id="scale-keys">${scaleNames.map(mode => `<option value="${escape(key.name)} ${mode}"></option>`).join('')}</datalist><button id="key-apply">Apply override</button><button id="key-clear">Use input / detection</button></div>
    <details><summary>Chords built from ${escape(key.name)} ${key.mode}</summary>${palette.length ? `<p class="hint">Stacking thirds gives these triads and sevenths. This is a reference palette; your progression stays as entered.</p><div class="chord-grid">${palette.map(chord => `<article><b>${chord.roman}</b><strong>${chord.triad}</strong><small>${chord.seventh ?? 'Seventh: ' + chord.notes.join(' ')}</small><small>${chord.notes.join(' ')}</small></article>`).join('')}</div>` : '<p class="hint">This collection is not a seven-note scale. A conventional seven-degree triad/seventh table would be misleading; use the chord-scale compatibility shown below.</p>'}</details>
    <details class="theory-library"><summary>Explore ${scaleNames.length} scales & modes in ${escape(key.name)}</summary><p class="hint">Choose a collection to guide the arrangement. Written chord tones take priority: an incompatible chord gets its own supporting scale. Detection considers tonal modes; symmetric and pentatonic collections are explicit choices.</p>
    <div class="chord-grid">${scaleNames.map(mode => `<article><small>${scaleDefinitions[mode].family}</small><strong>${mode}</strong><b>${spellScale({ ...key, mode }).join(' ')}</b><small>${scaleDefinitions[mode].description}</small><button data-scale="${mode}">Use ${escape(key.name)} ${mode}</button></article>`).join('')}</div></details>
    ${arrangement.score.sections.map(section => {
      const local = arrangement.analysis.sections[section.index];
      return `<div class="section-heading"><h2>${escape(section.name)}</h2><span>${escape(local.key.name)} ${local.key.mode} · ${Math.round(local.confidence * 100)}%</span></div><div class="chord-grid">${arrangement.score.chords.map((chord,index) => {
        if (chord.section !== section.index) return '';
        const harmony = arrangement.analysis.chords[index];
        const spell = (tone: number) => harmony.scaleNotes[harmony.scale.indexOf(tone)] ?? names[tone];
        return `<article><strong>${escape(chord.symbol)}</strong><b>${escape(harmony.roman)}</b><small>${harmony.function} · ${harmony.role}</small><small>${harmony.inversion}${harmony.cadence ? ` · ${harmony.cadence}` : ''}</small><b>${escape(harmony.scaleName)}</b><small>Scale: ${harmony.scaleNotes.join(' ')}</small><small>Tensions: ${harmony.tensions.map(spell).join(' ') || '—'} · avoid: ${harmony.avoid.map(spell).join(' ') || '—'}</small><details><summary>Why this scale?</summary><p class="small">${escape(harmony.explanation)}</p>${harmony.alternatives.length ? `<small>Other chord-compatible colours (not applied):<br>${harmony.alternatives.map(alternative => `${escape(alternative.name)}: ${alternative.notes.join(' ')}`).join('<br>')}</small>` : ''}</details></article>`;
      }).join('')}</div>`;
    }).join('')}`;
}
function render(): void {
  root.innerHTML = `<header><a class="brand" href="#">THE GREAT<br><b>COMPOSER</b></a><span class="edition">THE STRING SKETCHBOOK <i> / PHASE 1</i></span><span class="local">● Local by design</span></header><nav aria-label="Arrangement steps">${steps.map((name,index) => `<button data-step="${index}" class="${step === index ? 'active' : ''}"><span>0${index + 1}</span>${name}</button>`).join('')}</nav><main>${error ? `<div class="error" role="alert">${escape(error)}</div>` : ''}${body()}${step > 0 ? `<footer><button id="back">← Back</button>${step < 5 ? '<button id="next" class="primary">Continue →</button>' : ''}</footer>` : ''}</main><div class="transport"><div><strong>Approximate preview</strong><small>${arrangement.score.tempo} BPM · ${arrangement.score.meter.join('/')} · ${arrangement.analysis.key.name} ${arrangement.analysis.key.mode}</small></div><button id="play" class="primary">▶ Play</button><button id="stop">■ Stop</button><select id="preview-section" aria-label="Preview section"><option value="-1">Whole piece</option>${arrangement.score.sections.map(section => `<option value="${section.index}" ${previewSection === section.index ? 'selected' : ''}>${escape(section.name)}</option>`).join('')}</select><label><input id="loop" type="checkbox" ${looping ? 'checked' : ''}> Loop</label><span class="hint">Bundled sample · export unaffected</span></div>`;
  bind();
  if (step === 4) drawRoll();
}
function bind(): void {
  const on = (selector: string, callback: (element: HTMLElement) => void) => root.querySelectorAll<HTMLElement>(selector).forEach(element => element.onclick = () => callback(element));
  const move = (target: number) => { if (step === 0) { project.source = (root.querySelector('#source') as HTMLTextAreaElement).value; if (!generate()) { render(); return; } } preview.stop(); step = target; render(); window.scrollTo(0,0); };
  on('[data-step]', element => move(Number(element.dataset.step)));
  on('#analyse', () => move(1)); on('#next', () => move(Math.min(5,step + 1))); on('#back', () => move(step - 1));
  on('#play', () => void play(step <= 2)); on('#stop', () => preview.stop());
  const sectionSelect = root.querySelector<HTMLSelectElement>('#preview-section')!;
  sectionSelect.onchange = () => { previewSection = Number(sectionSelect.value); preview.stop(); };
  root.querySelector<HTMLInputElement>('#loop')!.onchange = event => { looping = (event.target as HTMLInputElement).checked; preview.stop(); };
  on('#key-apply', () => { project.keyOverride = (root.querySelector('#key') as HTMLInputElement).value.trim() || undefined; generate(); render(); });
  on('#key-clear', () => { delete project.keyOverride; generate(); render(); });
  on('[data-scale]', element => { project.keyOverride = `${arrangement.analysis.key.name} ${element.dataset.scale}`; generate(); render(); });
  on('[data-voicing]', element => { project.voicing = element.dataset.voicing as Project['voicing']; if (generate()) { render(); void play(true); } else render(); });
  on('[data-texture]', element => { const index = Number(element.dataset.section); project.sections[index] = { ...sectionSettings(project,index), texture: element.dataset.texture as Texture }; generate(); render(); });
  root.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(element => element.onchange = () => {
    const index = Number(element.dataset.section);
    project.sections[index] = { ...sectionSettings(project,index), [element.dataset.setting!]: element.type === 'checkbox' ? element.checked : Number(element.value) };
    generate(); render();
  });
  on('[data-listen]', element => { previewSection = Number(element.dataset.listen); render(); void play(); });
  on('[data-reroll]', element => { const index = Number(element.dataset.reroll); project.sections[index] = { ...sectionSettings(project,index), take: sectionSettings(project,index).take + 1 }; generate(); render(); });
  on('#take', () => { project.take++; generate(); render(); });
  on('[data-mute]', element => { const name = element.dataset.mute!; if (muted.has(name)) muted.delete(name); else muted.add(name); preview.stop(); render(); });
  on('[data-solo]', element => { const name = element.dataset.solo!; if (soloed.has(name)) soloed.delete(name); else soloed.add(name); preview.stop(); render(); });
  on('#family-mute', () => { familyMuted = !familyMuted; preview.stop(); render(); });
  on('#family-solo', () => { familyMuted = false; muted.clear(); soloed.clear(); preview.stop(); render(); });
  for (const [id, key] of [['cc','controllers'],['articulation','articulationNames']] as const) {
    const element = root.querySelector<HTMLInputElement>(`#${id}`);
    if (element) element.onchange = () => { project[key] = element.checked; generate(); render(); };
  }
  on('#midi', () => { if (generate()) download('the-great-composer.mid', writeMidi(arrangement).buffer as ArrayBuffer, 'audio/midi'); else render(); });
  on('#save', () => download('the-great-composer.json', JSON.stringify(project,null,2), 'application/json'));
  const load = root.querySelector<HTMLInputElement>('#load');
  if (load) load.onchange = async () => { try { const file = load.files?.[0]; if (!file) return; project = loadProject(JSON.parse(await file.text())); previewSection = -1; generate(); render(); } catch (caught) { error = (caught as Error).message; render(); } };
}
function drawRoll(): void {
  const canvas = root.querySelector<HTMLCanvasElement>('#roll')!;
  const context = canvas.getContext('2d')!;
  const scale = 1460 / arrangement.score.duration;
  const barTicks = arrangement.score.meter[0] * 4 / arrangement.score.meter[1] * PPQ;
  context.fillStyle = '#171e21'; context.fillRect(0,0,1600,460);
  for (const [index, part] of arrangement.parts.entries()) {
    const top = 35 + index * 82;
    context.fillStyle = '#c4c9bd'; context.font = '14px system-ui'; context.fillText(part.name,12,top + 40);
    context.strokeStyle = '#333d3e'; context.beginPath(); context.moveTo(130,top + 78); context.lineTo(1590,top + 78); context.stroke();
    context.fillStyle = ['#e4cf9f','#c4c69a','#91b8a2','#71a5a0','#6c909e'][index];
    for (const note of part.notes) context.fillRect(130 + note.start * scale,top + (100 - note.pitch) * 0.8,Math.max(2,note.duration * scale),3);
  }
  context.font = '12px system-ui';
  for (let tick = 0; tick < arrangement.score.duration; tick += barTicks) { const x = 130 + tick * scale; context.strokeStyle = '#ffffff10'; context.beginPath(); context.moveTo(x,25); context.lineTo(x,450); context.stroke(); context.fillStyle = '#929d99'; context.fillText(String(1 + tick / barTicks),x + 3,18); }
}
export function mountExpert(value?: Project): void { if (value) project = structuredClone(value); generate(); render(); }
export function expertProject(): Project {
  const saved = structuredClone(project);
  const input = root.querySelector<HTMLTextAreaElement>('#source');
  if (input) saved.source = input.value;
  return loadProject(saved);
}
export function stopExpert(): void { preview.stop(); }
