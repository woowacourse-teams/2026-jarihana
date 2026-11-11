import { AVATAR_PRESETS, avatarAppearanceKey, readAvatarAppearance } from '../src/avatar-appearance.js';
import { createAvatarPreview } from '../src/avatar-preview.js';
import { createAvatarEditor } from './avatar-editor.js';

const CHANNEL = 'jarihana-avatar-studio';
const previewOnly = new URLSearchParams(location.search).get('mode') === 'preview';
document.body.classList.toggle('preview-only', previewOnly);
let preview, editor, initialized = false;
const send = (type, value = {}) => window.parent.postMessage({ channel: CHANNEL, type, ...value }, location.origin);
function fail() {
  const error = document.querySelector('#error'); error.hidden = false;
  error.textContent = '입체 캐릭터를 표시하지 못했어요.'; send('error');
}
const resize = new ResizeObserver(() => send('resize', { height: Math.ceil(document.body.getBoundingClientRect().height) }));
resize.observe(document.body);
function initialize(event) {
  if (event.origin !== location.origin || event.source !== window.parent || event.data?.channel !== CHANNEL || event.data.type !== 'initialize' || initialized) return;
  const appearance = readAvatarAppearance(event.data.appearance);
  if (!appearance) { fail(); return; }
  initialized = true;
  try {
    document.querySelector('main').hidden = false;
    const container = document.querySelector('#preview');
    const platformColor = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim();
    preview = createAvatarPreview(container, { platformColor, lightweight: previewOnly }); preview.setAppearance(appearance);
    preview.setRotation(previewOnly ? -15 : Number(document.querySelector('#rotation').value));
    container.addEventListener('avatarerror', fail);
    if (!previewOnly) {
      const portraits = new Map();
      const portrait = (value, size = 128, framing = 'face') => {
        const key = `${framing}:${size}:${avatarAppearanceKey(value)}`;
        if (!portraits.has(key)) {
          portraits.set(key, preview.portrait(value, size, framing));
          if (portraits.size > 100) portraits.delete(portraits.keys().next().value);
        }
        return portraits.get(key);
      };
      editor = createAvatarEditor(document.querySelector('#part-editor'), {
        initial: appearance, portrait,
        onChange(value) { preview.setAppearance(value); send('change', { appearance: value }); }
      });
      for (const preset of AVATAR_PRESETS) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'preset';
        button.dataset.phCaptureAttributeAction = 'avatar_lab_preset_select';
        const image = document.createElement('img'); image.src = portrait(preset.appearance); image.alt = '';
        const label = document.createElement('span'); label.textContent = preset.name; button.append(image, label);
        button.addEventListener('click', () => editor.replace(preset.appearance)); document.querySelector('#presets').append(button);
      }
      document.querySelectorAll('[data-pose]').forEach(button => button.addEventListener('click', () => {
        preview.setPose(button.dataset.pose);
        document.querySelectorAll('[data-pose]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      }));
      document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
        preview.setView(button.dataset.view);
        document.querySelectorAll('[data-view]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      }));
      document.querySelector('#rotation').addEventListener('input', event => {
        const degrees = Number(event.target.value); preview.setRotation(degrees);
        document.querySelector('#rotation-value').textContent = degrees === 0 ? '정면' : `${degrees}°`;
      });
    }
    send('initialized');
  } catch (error) { console.error(error); editor?.dispose(); preview?.dispose(); fail(); }
}
window.addEventListener('message', initialize);
function leavePage(event) {
  if (event.persisted) return;
  resize.disconnect(); editor?.dispose(); preview?.dispose();
  window.removeEventListener('message', initialize); window.removeEventListener('pagehide', leavePage);
}
window.addEventListener('pagehide', leavePage);
send('ready');
