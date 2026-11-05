import { fireEvent, getByRole, within } from '@testing-library/dom';
import { createAvatarEditor } from '../../public/sparring-arena/avatar-lab/avatar-editor.js';
import { createAvatarDraft } from '../../public/sparring-arena/avatar-lab/avatar-draft.js';
import { AVATAR_PRESETS } from '../../public/sparring-arena/src/avatar-appearance.js';

it('파츠 변경은 다른 파츠를 보존하며 반환값이나 나중 편집이 이전 snapshot을 바꾸지 않는다', () => {
  const draft = createAvatarDraft(), first = draft.get();
  expect(draft.setPart('hair', 'bob')).toBe(true);
  expect(draft.get()).toEqual({ ...first, hair: 'bob' });
  const changed = draft.get(); changed.skin = 'deep';
  expect(draft.get().skin).toBe(first.skin);
  expect(first.hair).toBe('curly');
  expect(draft.setPart('hair', 'invalid')).toBe(false);
  expect(draft.setPart('version', 2)).toBe(false);
});

it('추천 스타일 선택·초기화도 되돌리고 다시 할 수 있고 새 편집은 재실행 기록을 비운다', () => {
  const draft = createAvatarDraft(), first = draft.get();
  draft.setPart('mouth', 'open'); const custom = draft.get();
  draft.replace(AVATAR_PRESETS[1].appearance); draft.undo(); expect(draft.get()).toEqual(custom);
  draft.redo(); expect(draft.get()).toMatchObject(AVATAR_PRESETS[1].appearance);
  draft.reset(); expect(draft.get()).toEqual(first);
  draft.undo(); expect(draft.get()).toMatchObject(AVATAR_PRESETS[1].appearance);
  draft.setPart('nose', 'wide'); expect(draft.canRedo()).toBe(false);
});

describe('파츠 편집 화면', () => {
  let root, editor, onChange, portrait;
  beforeEach(() => {
    jest.useFakeTimers(); root = document.createElement('div'); document.body.append(root);
    onChange = jest.fn(); portrait = jest.fn(() => 'data:image/png;base64,preview');
    editor = createAvatarEditor(root, { portrait, onChange });
  });
  afterEach(() => { editor.dispose(); root.remove(); jest.useRealTimers(); });
  const click = (name, role = 'button') => fireEvent.click(getByRole(root, role, { name, exact: true }));

  it('서로 다른 탭의 파츠를 섞어 고르면 조합 전체를 미리보기로 전달한다', () => {
    click('머리 모양: 단발머리'); click('머리색: 구릿빛'); click('얼굴', 'tab'); click('얼굴형: 넓은 얼굴');
    click('입', 'tab'); click('입: 동그란 입'); click('코', 'tab'); click('코: 작은 코');
    const appearance = onChange.mock.lastCall[0];
    expect(appearance).toMatchObject({ hair: 'bob', hairColor: 'copper', face: 'wide', mouth: 'open', nose: 'small' });
    expect(AVATAR_PRESETS.some(preset => Object.entries(appearance).every(([key, value]) => preset.appearance[key] === value))).toBe(false);
    expect(root.querySelector('[aria-label="입: 동그란 입"]')).toHaveAttribute('aria-pressed', 'true');
    jest.advanceTimersByTime(20);
    expect(portrait).toHaveBeenCalledWith(expect.objectContaining({ hair: 'bob', face: 'wide', nose: 'small' }), 128);
    click('되돌리기'); expect(onChange.mock.lastCall[0].nose).toBe('round');
    click('다시 하기'); expect(onChange.mock.lastCall[0].nose).toBe('small');
  });

  it('화살표와 Home/End로 탭을 이동하고 선택하지 않은 패널은 숨긴다', () => {
    const hair = getByRole(root, 'tab', { name: '머리' }); hair.focus();
    fireEvent.keyDown(hair, { key: 'ArrowRight' });
    expect(getByRole(root, 'tab', { name: '눈썹' })).toHaveFocus();
    fireEvent.keyDown(getByRole(root, 'tab', { name: '눈썹' }), { key: 'ArrowRight' });
    const eyes = getByRole(root, 'tab', { name: '눈' });
    expect(eyes).toHaveFocus(); expect(eyes).toHaveAttribute('aria-selected', 'true');
    expect(within(getByRole(root, 'tabpanel')).getByRole('button', { name: '눈: 작은 눈' })).toBeVisible();
    fireEvent.keyDown(eyes, { key: 'End' });
    expect(getByRole(root, 'tab', { name: '소지품' })).toHaveFocus();
    expect(root.querySelector('#avatar-panel-hair').hidden).toBe(true);
  });

  it('신발 모양과 색을 독립적으로 고르고 발 부분 썸네일을 보여 주며 되돌릴 수 있다', () => {
    const before = onChange.mock.lastCall[0];
    click('신발', 'tab'); click('신발 모양: 하이탑'); click('신발 색: 검정');
    expect(onChange.mock.lastCall[0]).toEqual({ ...before, shoes: 'highTop', shoeColor: 'ink' });
    jest.advanceTimersByTime(20);
    expect(portrait).toHaveBeenCalledWith(expect.objectContaining({ shoes: 'slipOn', shoeColor: 'ink' }), 128, 'feet');
    click('되돌리기');
    expect(onChange.mock.lastCall[0]).toEqual({ ...before, shoes: 'highTop' });
    click('다시 하기');
    expect(onChange.mock.lastCall[0].shoeColor).toBe('ink');
  });

  it('편집 초기화와 추천 스타일은 실제 선택·버튼 상태를 일치시킨다', () => {
    click('머리 모양: 긴 생머리'); click('처음 모습으로');
    expect(getByRole(root, 'button', { name: '머리 모양: 곱슬머리' })).toHaveAttribute('aria-pressed', 'true');
    expect(getByRole(root, 'button', { name: '처음 모습으로' })).toBeDisabled();
    editor.replace(AVATAR_PRESETS[1].appearance);
    expect(getByRole(root, 'button', { name: '머리 모양: 단발머리' })).toHaveAttribute('aria-pressed', 'true');
    expect([...root.querySelectorAll('button')].every(button => button.dataset.phCaptureAttributeAction)).toBe(true);
  });

  it('모자·색상·선글라스를 골라도 머리와 신발을 유지하고 각 선택을 되돌릴 수 있다', () => {
    const original = onChange.mock.lastCall[0];
    click('모자', 'tab'); click('모자 모양: 버킷햇'); click('모자 색: 민트');
    click('안경', 'tab'); click('안경: 선글라스');
    expect(onChange.mock.lastCall[0]).toEqual({ ...original, hat: 'bucket', hatColor: 'mint', glasses: 'sunglasses' });
    click('되돌리기'); expect(onChange.mock.lastCall[0]).toEqual({ ...original, hat: 'bucket', hatColor: 'mint' });
    click('다시 하기'); expect(onChange.mock.lastCall[0].glasses).toBe('sunglasses');
    click('모자', 'tab'); click('모자 모양: 모자 없음');
    expect(onChange.mock.lastCall[0]).toEqual({ ...original, hatColor: 'mint', glasses: 'sunglasses' });
  });

  it('가방과 소지품을 섞어 고르고 해당 물건을 확대한 썸네일로 비교한다', () => {
    const original = onChange.mock.lastCall[0];
    click('가방', 'tab'); click('가방 모양: 백팩'); click('가방 색: 네이비');
    jest.advanceTimersByTime(20);
    expect(portrait).toHaveBeenCalledWith(expect.objectContaining({ bag: 'shoulder' }), 128, 'bag');
    click('소지품', 'tab'); click('손에 드는 물건: 차가운 커피');
    jest.advanceTimersByTime(20);
    expect(portrait).toHaveBeenCalledWith(expect.objectContaining({ handheld: 'hotCoffee' }), 128, 'handheld');
    expect(onChange.mock.lastCall[0]).toEqual({ ...original, bag: 'backpack', bagColor: 'navy', handheld: 'icedCoffee' });
    click('되돌리기'); expect(onChange.mock.lastCall[0]).toEqual({ ...original, bag: 'backpack', bagColor: 'navy' });
  });
});
