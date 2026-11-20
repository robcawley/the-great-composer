import './style.css';
import './builder.css';
import './wizard.css';
import { mountWizard } from './wizard';
import { mountBuilder } from './builder';

// Guided mode by default; the all-in-one workbench (with expert text input) lives at #workbench.
const root = document.querySelector<HTMLDivElement>('#app')!;
let current: { destroy(): void } | undefined;
function mount(): void {
  current?.destroy();
  root.className = '';
  if (location.hash === '#workbench') {
    current = mountBuilder(root);
    const back = document.createElement('a'); back.href = '#'; back.className = 'guided-link'; back.textContent = 'Guided mode';
    back.style.cssText = 'position:fixed;right:16px;bottom:96px;z-index:20;background:#1d2940;color:#fff;padding:8px 14px;border-radius:999px;font:14px system-ui;text-decoration:none';
    document.body.append(back);
    const destroy = current.destroy; current = { destroy: () => { back.remove(); destroy(); } };
  } else current = mountWizard(root);
}
window.addEventListener('hashchange', mount);
mount();
