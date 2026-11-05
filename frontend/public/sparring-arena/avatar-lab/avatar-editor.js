import { AVATAR_OPTIONS, AVATAR_PALETTE } from '../src/avatar-appearance.js';
import { createAvatarDraft } from './avatar-draft.js';
import { createEditorIcon } from './avatar-editor-icons.js';

const FIELDS = {
  face: { label: '얼굴형', action: 'avatar_lab_face_change', names: ['동그란 얼굴', '타원형 얼굴', '넓은 얼굴'] },
  skin: { label: '피부색', action: 'avatar_lab_skin_change', names: ['밝은 피부', '따뜻한 피부', '갈색 피부', '짙은 피부'] },
  hair: { label: '머리 모양', action: 'avatar_lab_hair_change', names: ['곱슬머리', '가르마', '단발머리', '긴 생머리', '긴 웨이브', '민머리'] },
  hairColor: { label: '머리색', action: 'avatar_lab_hair_color_change', names: ['검정', '밤색', '구릿빛', '은빛'] },
  eyes: { label: '눈', action: 'avatar_lab_eyes_change', names: ['동그란 눈', '가는 눈', '작은 눈'] },
  eyebrows: { label: '눈썹', action: 'avatar_lab_eyebrows_change', names: ['아치형 눈썹', '일자 눈썹', '짙은 눈썹'] },
  nose: { label: '코', action: 'avatar_lab_nose_change', names: ['둥근 코', '작은 코', '넓은 코'] },
  mouth: { label: '입', action: 'avatar_lab_mouth_change', names: ['미소', '일자 입', '동그란 입'] },
  glasses: { label: '안경', action: 'avatar_lab_glasses_change', names: ['안경 없음', '둥근 안경', '네모 안경', '선글라스'] },
  outfit: { label: '옷 색', action: 'avatar_lab_outfit_change', names: ['민트', '코랄', '크림', '네이비', '라일락', '머스터드'] },
  shoes: { label: '신발 모양', action: 'avatar_lab_shoes_change', names: ['운동화', '슬립온', '하이탑'] },
  shoeColor: { label: '신발 색', action: 'avatar_lab_shoe_color_change', names: ['흰색', '검정', '민트', '코랄'] },
  hat: { label: '모자 모양', action: 'avatar_lab_hat_change', names: ['모자 없음', '캡', '버킷햇', '비니', '베레모'] },
  hatColor: { label: '모자 색', action: 'avatar_lab_hat_color_change', names: ['검정', '크림', '민트', '코랄', '네이비'] },
  bag: { label: '가방 모양', action: 'avatar_lab_bag_change', names: ['가방 없음', '백팩', '크로스백', '숄더백'] },
  bagColor: { label: '가방 색', action: 'avatar_lab_bag_color_change', names: ['검정', '크림', '민트', '코랄', '네이비'] },
  handheld: { label: '손에 드는 물건', action: 'avatar_lab_handheld_change', names: ['빈손', '따뜻한 커피', '차가운 커피', '책', '노트북', '휴대폰'] },
};
const CATEGORIES = [
  { id: 'face', name: '얼굴', fields: ['face', 'skin'] },
  { id: 'hair', name: '머리', fields: ['hair', 'hairColor'] },
  { id: 'eyebrows', name: '눈썹', fields: ['eyebrows'] },
  { id: 'eyes', name: '눈', fields: ['eyes'] },
  { id: 'nose', name: '코', fields: ['nose'] },
  { id: 'mouth', name: '입', fields: ['mouth'] },
  { id: 'glasses', name: '안경', fields: ['glasses'] },
  { id: 'outfit', name: '옷', fields: ['outfit'] },
  { id: 'shoes', name: '신발', fields: ['shoes', 'shoeColor'] },
  { id: 'hat', name: '모자', fields: ['hat', 'hatColor'] },
  { id: 'bag', name: '가방', fields: ['bag', 'bagColor'] },
  { id: 'handheld', name: '소지품', fields: ['handheld'] },
];

export function createAvatarEditor(root, { portrait, onChange, initial }) {
  const draft = createAvatarDraft(initial), buttons = new Map(), tabs = [], panels = [];
  let active = 'hair', pending = 0;
  const tablist = document.createElement('div'); tablist.className = 'part-tabs';
  tablist.setAttribute('role', 'tablist'); tablist.setAttribute('aria-label', '꾸밀 부분');
  root.append(tablist);
  function thumbnails() {
    if (pending) cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      pending = 0;
      const appearance = draft.get();
      for (const field of CATEGORIES.find(category => category.id === active).fields) {
        if (AVATAR_PALETTE[field]) continue;
        for (const [value, button] of buttons.get(field)) {
          const valueAppearance = { ...appearance, [field]: value };
          if (field === 'hair') valueAppearance.hat = 'none';
          const framing = { shoes: 'feet', bag: 'bag', handheld: 'handheld' }[field];
          button.querySelector('img').src = framing ? portrait(valueAppearance, 128, framing) : portrait(valueAppearance, 128);
        }
      }
    });
  }
  function sync() {
    const appearance = draft.get();
    for (const [field, choices] of buttons) for (const [value, button] of choices) button.setAttribute('aria-pressed', String(appearance[field] === value));
    undo.disabled = !draft.canUndo(); redo.disabled = !draft.canRedo(); reset.disabled = draft.isInitial();
    onChange(appearance); thumbnails();
  }
  function selectCategory(id, focus = false) {
    active = id;
    for (const tab of tabs) {
      const chosen = tab.id === `avatar-tab-${id}`;
      tab.setAttribute('aria-selected', String(chosen)); tab.tabIndex = chosen ? 0 : -1;
      if (chosen && focus) tab.focus();
    }
    for (const panel of panels) panel.hidden = panel.id !== `avatar-panel-${id}`;
    thumbnails();
  }
  for (const category of CATEGORIES) {
    const tab = document.createElement('button'); tab.type = 'button'; tab.id = `avatar-tab-${category.id}`;
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `avatar-panel-${category.id}`);
    tab.dataset.phCaptureAttributeAction = 'avatar_lab_category_change';
    const label = document.createElement('span'); label.textContent = category.name;
    tab.append(createEditorIcon(category.id), label);
    tab.addEventListener('click', () => selectCategory(category.id));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const current = tabs.indexOf(tab);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? CATEGORIES.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + CATEGORIES.length) % CATEGORIES.length;
      selectCategory(CATEGORIES[index].id, true);
    });
    tabs.push(tab); tablist.append(tab);
    const panel = document.createElement('div'); panel.className = 'part-panel'; panel.id = `avatar-panel-${category.id}`;
    panel.classList.toggle('part-panel--mixed', category.fields.length > 1);
    panel.classList.toggle('part-panel--colors', Boolean(AVATAR_PALETTE[category.fields[0]]));
    panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
    for (const field of category.fields) {
      const group = document.createElement('fieldset'), legend = document.createElement('legend');
      legend.textContent = FIELDS[field].label; group.className = 'part-group'; group.append(legend);
      const choices = document.createElement('div'); choices.className = AVATAR_PALETTE[field] ? 'part-colors' : 'part-options';
      const registry = new Map(); buttons.set(field, registry);
      AVATAR_OPTIONS[field].forEach((value, index) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'part-option';
        button.dataset.part = field; button.dataset.value = value; button.dataset.phCaptureAttributeAction = FIELDS[field].action;
        button.setAttribute('aria-label', `${FIELDS[field].label}: ${FIELDS[field].names[index]}`);
        button.setAttribute('aria-pressed', 'false');
        if (AVATAR_PALETTE[field]) {
          const swatch = document.createElement('span'); swatch.className = 'part-swatch';
          swatch.style.backgroundColor = AVATAR_PALETTE[field][value]; swatch.setAttribute('aria-hidden', 'true'); button.append(swatch);
        } else {
          const image = document.createElement('img'); image.alt = ''; image.width = image.height = 72; button.append(image);
        }
        const name = document.createElement('span'); name.textContent = FIELDS[field].names[index]; button.append(name);
        button.addEventListener('click', () => { if (draft.setPart(field, value)) sync(); });
        registry.set(value, button); choices.append(button);
      });
      group.append(choices); panel.append(group);
    }
    panels.push(panel); root.append(panel);
  }
  const toolbar = document.createElement('div'); toolbar.className = 'edit-history'; toolbar.setAttribute('role', 'group'); toolbar.setAttribute('aria-label', '편집 기록');
  function historyButton(label, action, change) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.dataset.phCaptureAttributeAction = action;
    button.addEventListener('click', () => { if (change()) sync(); }); toolbar.append(button); return button;
  }
  const undo = historyButton('되돌리기', 'avatar_lab_undo', draft.undo);
  const redo = historyButton('다시 하기', 'avatar_lab_redo', draft.redo);
  const reset = historyButton('처음 모습으로', 'avatar_lab_reset', draft.reset);
  root.append(toolbar); selectCategory(active); sync();
  return {
    replace(appearance) { if (draft.replace(appearance)) sync(); },
    getAppearance: draft.get,
    dispose() { if (pending) cancelAnimationFrame(pending); root.replaceChildren(); },
  };
}
