import { readAvatarAppearance } from '../src/avatar-appearance.js';
import { createAvatarPreview } from '../src/avatar-preview.js';
import { SHOP_PREVIEW_CHANNEL } from './channel.js';

const container = document.querySelector('#preview');
const send = type => window.parent.postMessage({ channel: SHOP_PREVIEW_CHANNEL, type }, location.origin);
const fail = () => send('error');
let preview;

function receive(event) {
  if (event.origin !== location.origin || event.source !== window.parent
      || event.data?.channel !== SHOP_PREVIEW_CHANNEL || event.data.type !== 'appearance') return;
  const appearance = readAvatarAppearance(event.data.appearance);
  if (!appearance) return;

  try {
    if (!preview) {
      preview = createAvatarPreview(container, { platformColor: 0xffffff, lightweight: true });
      preview.setRotation(-15);
    }
    preview.setAppearance(appearance);
    send('shown');
  } catch (error) {
    console.error(error);
    preview?.dispose();
    preview = undefined;
    fail();
  }
}

function leavePage(event) {
  if (event.persisted) return;
  preview?.dispose();
  container.removeEventListener('avatarerror', fail);
  window.removeEventListener('message', receive);
  window.removeEventListener('pagehide', leavePage);
}

container.addEventListener('avatarerror', fail);
window.addEventListener('message', receive);
window.addEventListener('pagehide', leavePage);
