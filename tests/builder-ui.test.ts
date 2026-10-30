import { it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountBuilder } from '../app/builder';

it('mounts the no-typing builder and applies a keyboard/click sequence to its Song', () => {
  const dom = new JSDOM('<!doctype html><div id="app"></div>',{ url: 'http://localhost' });
  const originals = new Map<string,PropertyDescriptor | undefined>();
  for (const [name,value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    requestAnimationFrame: (): number => 1, cancelAnimationFrame: (): void => {}, fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }) })) {
    originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
    Object.defineProperty(globalThis,name,{ value, configurable: true, writable: true });
  }
  const root = dom.window.document.querySelector<HTMLElement>('#app')!;
  const builder = mountBuilder(root);
  const click = (selector: string) => { const element = root.querySelector<HTMLButtonElement>(selector); assert.ok(element,selector); element.focus(); element.click(); };
  const action = (type: string, value?: string | number) => {
    const element = [...root.querySelectorAll<HTMLButtonElement>('[data-edit]')].find(button => { const action = JSON.parse(button.dataset.edit!); return action.type === type && (value === undefined || action.value === value); });
    assert.ok(element,`${type}/${value}`); element.focus(); element.click();
  };
  try {
    assert.equal(root.querySelectorAll('textarea,input:not([type=file])').length,0);
    assert.equal(root.querySelectorAll('[data-block]').length,4);
    assert.ok(!root.textContent!.includes('dorian'));
    click('#auto-preview');
    action('emotion','hopeful');
    assert.equal(builder.getSong().blocks[0].emotion,'hopeful');
    action('rhythm','unfold');
    assert.equal(builder.getSong().blocks[0].rhythm,'unfold');
    assert.equal(builder.getSong().blocks[0].bars[3].hold,true);
    action('complexity',4); assert.equal(builder.getSong().blocks[0].complexity,4);
    assert.equal(dom.window.document.activeElement?.getAttribute('aria-label'),'More complexity');
    action('split'); assert.equal(builder.getSong().blocks[0].bars[0].chords.length,2);
    click('[data-slot="0"][data-half="1"]');
    action('spice','richer'); assert.equal(builder.getSong().blocks[0].bars[0].chords[1].spice,'richer');
    const firstHalf = builder.getSong().blocks[0].bars[0].chords[0];
    click('.bar-slot [aria-label*="second half"]');
    assert.deepEqual(builder.getSong().blocks[0].bars[0].chords[0],firstHalf);
    action('push'); assert.equal(builder.getSong().blocks[0].bars[0].push,true);
    action('key-move','lift'); assert.equal((builder.getSong().blocks[0].key as { root: number }).root,2);
    action('locked'); action('duplicate'); assert.equal(builder.getSong().blocks.length,5);
    click('#undo'); assert.equal(builder.getSong().blocks.length,4);
    click('#redo'); assert.equal(builder.getSong().blocks.length,5);
    click('#theory'); assert.ok(root.textContent!.includes('dorian'));
    assert.equal(root.querySelectorAll('#builder-error:not([hidden])').length,0);
  } finally {
    builder.destroy(); dom.window.close();
    for (const [name,descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis,name,descriptor); else Reflect.deleteProperty(globalThis,name); }
  }
});
