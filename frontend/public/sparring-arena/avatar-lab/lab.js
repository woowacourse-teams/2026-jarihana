import { AVATAR_PRESETS, avatarAppearanceKey } from '../src/avatar-appearance.js';
import { createAvatarPreview } from '../src/avatar-preview.js';
import { createDemoRoom } from './demo-room.js';
import { createAvatarEditor } from './avatar-editor.js';

const room = createDemoRoom(document.querySelector('#arena'));
const container = document.querySelector('#preview');
let preview, editor;
function showError() {
  const error = document.querySelector('#error');
  error.textContent = '입체 캐릭터를 표시하지 못했어요. WebGL을 사용할 수 있는 브라우저에서 다시 열어주세요.';
  error.hidden = false;
}
try {
  preview = createAvatarPreview(container);
  const portraits = new Map();
  function portrait(appearance, size = 256, framing = 'face') {
    const key = `${framing}:${size}:${avatarAppearanceKey(appearance)}`;
    if (!portraits.has(key)) {
      portraits.set(key, preview.portrait(appearance, size, framing));
      if (portraits.size > 100) portraits.delete(portraits.keys().next().value);
    }
    return portraits.get(key);
  }
  function renderAppearance(appearance) {
    const key = avatarAppearanceKey(appearance);
    const preset = AVATAR_PRESETS.find(item => avatarAppearanceKey(item.appearance) === key);
    const name = preset?.name ?? '나만의 캐릭터';
    preview.setAppearance(appearance); room.select({ appearance });
    document.querySelector('#selected-name').textContent = name;
    container.setAttribute('aria-label', `${name}의 입체 모습`);
    for (const button of document.querySelectorAll('.preset')) button.setAttribute('aria-pressed', String(button.dataset.preset === preset?.id));
    const image = portrait(appearance);
    for (const id of ['stone-portrait', 'white-portrait', 'small-portrait']) document.getElementById(id).src = image;
    const download = document.querySelector('#download'); download.href = image; download.download = `jarihana-${preset?.id ?? 'my-avatar'}.png`;
  }
  for (const preset of AVATAR_PRESETS) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'preset';
    button.dataset.preset = preset.id; button.dataset.phCaptureAttributeAction = 'avatar_lab_preset_select';
    button.title = preset.description; button.setAttribute('aria-pressed', 'false');
    const image = document.createElement('img'); image.src = portrait(preset.appearance, 128); image.alt = ''; image.width = image.height = 100;
    const label = document.createElement('span'); label.textContent = preset.name; button.append(image, label);
    button.addEventListener('click', () => editor.replace(preset.appearance)); document.querySelector('#presets').append(button);
  }
  editor = createAvatarEditor(document.querySelector('#part-editor'), { portrait, onChange: renderAppearance });
  document.querySelectorAll('[data-pose]').forEach(button => button.addEventListener('click', () => {
    preview.setPose(button.dataset.pose);
    document.querySelectorAll('[data-pose]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  }));
  document.querySelector('#rotation').addEventListener('input', event => {
    const degrees = Number(event.target.value); preview.setRotation(degrees);
    document.querySelector('#rotation-value').textContent = degrees === 0 ? '정면' : `${degrees}°`;
  });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const motionNote = () => { document.querySelector('#motion-note').hidden = !reduced.matches; };
  reduced.addEventListener('change', motionNote); motionNote();
  document.querySelector('#clash').addEventListener('click', () => room.clash());
  container.addEventListener('avatarerror', showError);
  window.addEventListener('pagehide', () => {
    reduced.removeEventListener('change', motionNote); editor.dispose(); preview.dispose(); room.dispose();
  }, { once: true });
} catch (error) {
  console.error(error); editor?.dispose(); preview?.dispose(); showError();
}
