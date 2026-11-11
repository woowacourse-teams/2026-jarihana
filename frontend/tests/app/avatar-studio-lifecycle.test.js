import { AVATAR_BASIC_APPEARANCE } from '../../public/sparring-arena/src/avatar-appearance.js';
import { createAvatarPreview } from '../../public/sparring-arena/src/avatar-preview.js';
import { createAvatarEditor } from '../../public/sparring-arena/avatar-studio/avatar-editor.js';

jest.mock('../../public/sparring-arena/src/avatar-preview.js', () => ({ createAvatarPreview: jest.fn() }));
jest.mock('../../public/sparring-arena/avatar-studio/avatar-editor.js', () => ({ createAvatarEditor: jest.fn() }));

let preview, editor;
beforeEach(() => {
  document.body.innerHTML = '<main hidden><div id="preview"></div><div id="part-editor"></div><div id="presets"></div><input id="rotation"><span id="rotation-value"></span></main><p id="error" hidden></p>';
  preview = { setAppearance: jest.fn(), setRotation: jest.fn(), portrait: jest.fn(() => 'data:image/png;base64,preview'), dispose: jest.fn() };
  editor = { dispose: jest.fn() };
  createAvatarPreview.mockReturnValue(preview); createAvatarEditor.mockReturnValue(editor);
  jest.isolateModules(() => require('../../public/sparring-arena/avatar-studio/studio.js'));
  window.dispatchEvent(new MessageEvent('message', {
    origin: location.origin, source: window.parent,
    data: { channel: 'jarihana-avatar-studio', type: 'initialize', appearance: AVATAR_BASIC_APPEARANCE }
  }));
});
afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); document.body.innerHTML = ''; jest.clearAllMocks(); });

it('뒤로가기를 위한 페이지 캐시 보관 중에는 미리보기와 편집 상태를 유지한다', () => {
  window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  expect(preview.dispose).not.toHaveBeenCalled();
  expect(editor.dispose).not.toHaveBeenCalled();
  expect(document.querySelector('main').hidden).toBe(false);
});

it('실제로 화면을 떠날 때는 3D 자원을 한 번만 해제한다', () => {
  window.dispatchEvent(new PageTransitionEvent('pagehide'));
  window.dispatchEvent(new PageTransitionEvent('pagehide'));
  expect(preview.dispose).toHaveBeenCalledTimes(1);
  expect(editor.dispose).toHaveBeenCalledTimes(1);
});
