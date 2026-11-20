import { blockKey, type Block, type DegreeChord, type Song } from './song';
import { createSong, fillBlock, moveKey, seeded, setEmotion, surprise } from './emotions';
import { modes } from './scales';
import type { Mode, PartChoice, Texture } from './types';
import { conformSong, stabilise } from './lock';
import { applyRhythm, followHolds } from './harmonic-rhythm';
import type { HarmonicRhythm } from './song';
export type Edit =
  | { type: 'emotion'; value: string } | { type: 'dice'; slot?: number; half?: number }
  | { type: 'section'; value: Block['section'] } | { type: 'key'; root: number; block?: boolean }
  | { type: 'mode'; value: Mode; block?: boolean } | { type: 'same-key' }
  | { type: 'key-move'; value: 'lift' | 'brighter' | 'darker' | 'parallel' }
  | { type: 'tempo'; value: number } | { type: 'meter'; value: [number,number] }
  | { type: 'energy' | 'complexity'; value: number } | { type: 'texture'; value: Texture }
  | { type: 'register'; value: Block['register'] } | { type: 'runs' | 'bigEntrance' | 'locked' | 'controllers' | 'articulationNames' }
  | { type: 'duplicate' | 'add' | 'delete' } | { type: 'move'; to: number }
  | { type: 'surprise'; whole?: boolean } | { type: 'chord'; slot: number; half: number; value: DegreeChord }
  | { type: 'spice'; slot: number; half: number; value: DegreeChord['spice'] }
  | { type: 'split' | 'push'; slot: number } | { type: 'rhythm'; value: HarmonicRhythm } | { type: 'new' }
  | { type: 'key-lock'; value: boolean } | { type: 'part'; name: string; value: PartChoice };
export function editSong(input: Song, id: string, action: Edit): Song {
  if (action.type === 'new') return createSong();
  const song = structuredClone(input);
  const block = song.blocks.find(block => block.id === id)!;
  if (!block) throw new Error('Choose a block first');
  const names = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  // A locked song can't move a block out of its key; the song key and mode only change after unlocking.
  if (song.keyLocked && (action.type === 'key-move' || (action.type === 'key' && action.block) || (action.type === 'mode' && action.block))) return song;
  if (song.keyLocked && (action.type === 'key' || action.type === 'mode')) throw new Error('Unlock the key and scale before changing them');
  switch (action.type) {
    case 'emotion': setEmotion(song,block,action.value); break;
    case 'dice': {
      block.take++;
      if (action.slot === undefined) fillBlock(song,block);
      else {
        const rng = seeded(`${song.take}:${block.id}:${block.take}:${action.slot}`);
        block.bars[action.slot].chords[action.half ?? 0] = { degree: 1 + Math.floor(rng() * Math.min(7,modes[blockKey(song,block).mode].length)), spice: 'plain' };
        if (!action.half) { if (block.bars[action.slot].hold) delete block.rhythm; block.bars[action.slot].hold = false; }
      }
      break;
    }
    case 'section': block.section = action.value; break;
    case 'key': {
      const key = action.block ? blockKey(song,block) : song.key;
      const next = { ...key, root: action.root, name: names[action.root] };
      if (action.block) block.key = next; else song.key = next;
      break;
    }
    case 'mode': if (action.block) block.key = { ...blockKey(song,block), mode: action.value }; else song.key.mode = action.value; break;
    case 'same-key': block.key = 'same'; break;
    case 'key-move': moveKey(song,block,action.value); break;
    case 'tempo': song.tempo = Math.max(20,Math.min(300,action.value)); break;
    case 'meter':
      song.meter = action.value;
      for (const item of song.blocks) if (item.rhythm) { const pushes = item.bars.map(bar => bar.push); applyRhythm(song,item,item.rhythm); item.bars.forEach((bar,index) => bar.push = pushes[index]); }
      break;
    case 'energy': block.energy = Math.max(1,Math.min(10,action.value)); break;
    case 'complexity': block.complexity = Math.max(1,Math.min(5,action.value)); break;
    case 'texture': block.texture = action.value; break;
    case 'register': block.register = action.value; break;
    case 'runs': case 'bigEntrance': case 'locked': block[action.type] = !block[action.type]; break;
    case 'controllers': case 'articulationNames': song[action.type] = !song[action.type]; break;
    case 'duplicate': case 'add': {
      if (song.blocks.length >= 128) throw new Error('This sketch has reached 128 blocks');
      const index = action.type === 'add' ? song.blocks.length - 1 : song.blocks.indexOf(block);
      const copy = structuredClone(song.blocks[index]); copy.id = `block-${song.nextId++}`; copy.locked = false;
      song.blocks.splice(index + 1,0,copy); break;
    }
    case 'delete': if (song.blocks.length > 1) song.blocks.splice(song.blocks.indexOf(block),1); break;
    case 'move': song.blocks.splice(Math.max(0,Math.min(song.blocks.length - 1,action.to)),0,song.blocks.splice(song.blocks.indexOf(block),1)[0]); break;
    case 'surprise': surprise(song,action.whole ? undefined : id); break;
    case 'chord': block.bars[action.slot].chords[action.half] = action.value; if (!action.half) { if (block.bars[action.slot].hold) delete block.rhythm; block.bars[action.slot].hold = false; } break;
    case 'spice': block.bars[action.slot].chords[action.half].spice = action.value; if (!action.half) { if (block.bars[action.slot].hold) delete block.rhythm; block.bars[action.slot].hold = false; } break;
    case 'split': {
      const bar = block.bars[action.slot];
      bar.chords = bar.chords.length === 2 ? [bar.chords[0]] : [bar.chords[0],{ degree: 5, spice: 'plain' }];
      delete bar.weights; delete block.rhythm; break;
    }
    case 'push': block.bars[action.slot].push = !block.bars[action.slot].push; break;
    case 'rhythm': applyRhythm(song,block,action.value); break;
    case 'key-lock': song.keyLocked = action.value; break;
    case 'part': song.parts = { ...song.parts, [action.name]: action.value }; break;
  }
  // Chords the tool picked itself (feelings, dice, surprise, locking a fresh song) are steered off restless chords.
  if (['emotion', 'dice', 'surprise'].includes(action.type)) for (const item of action.type === 'surprise' && action.whole ? song.blocks : [song.blocks.find(candidate => candidate.id === id)!]) stabilise(song, item);
  if (action.type === 'key-lock' && action.value) for (const item of song.blocks) stabilise(song, item);
  conformSong(song);
  for (const block of song.blocks) followHolds(block);
  return song;
}
