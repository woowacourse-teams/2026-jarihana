import { createHistoryConversation } from '../../public/sparring-arena/src/history-conversation.js';

describe('말풍선 크기 캐시와 매 프레임 위치 갱신', () => {
  let stage, history, observer, fonts, width, height, reads, headX;
  const savedObserver = global.ResizeObserver;
  const savedFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  const layout = { width: 800, worldLeft: { x: -4, y: -6, z: 10 }, worldRight: { x: 4, y: -6, z: 10 } };
  const origin = { x: 0, y: -6, z: 9 };
  const post = (id, side = 'a') => ({ id, side, name: '작성자 ' + id, text: '대화 ' + id });
  const bubbles = () => [...stage.querySelectorAll('.history-conversation-speech:not([hidden])')];
  beforeEach(() => {
    global.ResizeObserver = class {
      constructor(callback) { observer = { callback, disconnect: jest.fn() }; }
      observe() {}
      disconnect() { observer.disconnect(); }
    };
    fonts = new EventTarget(); fonts.ready = Promise.resolve();
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
    stage = document.createElement('div'); document.body.append(stage);
    width = 140; height = 54; headX = 300;
    history = createHistoryConversation(stage, jest.fn(), jest.fn(), {
      draw() {}, hide() {}, project: point => ({ x: headX, y: 500 - point.y * 10 }),
    });
    history.setLayout(layout);
    reads = { width: jest.fn(() => width), height: jest.fn(() => height) };
    for (const bubble of stage.querySelectorAll('.history-conversation-speech')) {
      Object.defineProperties(bubble, { offsetWidth: { get: reads.width }, offsetHeight: { get: reads.height } });
    }
  });
  afterEach(() => {
    history.dispose(); stage.remove(); global.ResizeObserver = savedObserver;
    if (savedFonts) Object.defineProperty(document, 'fonts', savedFonts); else delete document.fonts;
    jest.restoreAllMocks();
  });
  const add = (entry = post('one')) => history.emerge(entry, origin, true);
  const clearReads = () => { reads.width.mockClear(); reads.height.mockClear(); };

  it('16개 말풍선은 120프레임 동안 재측정하지 않고 머리 좌표만 계속 따라간다', () => {
    history.setBrawl(true); history.setSpeechOverlap(true);
    for (let i = 0; i < 16; i++) add(post(String(i), i % 2 ? 'a' : 'b'));
    history.step(0, true); expect(bubbles()).toHaveLength(16);
    const before = bubbles()[0].style.left;
    clearReads();
    for (let frame = 0; frame < 120; frame++) { headX += .1; history.step(1 / 120); }
    expect(reads.width).not.toHaveBeenCalled(); expect(reads.height).not.toHaveBeenCalled();
    expect(bubbles()[0].style.left).not.toBe(before);
  });

  it('글·작성자·상대 시간·선택 표시 변경은 같은 프레임에서 크기를 갱신한다', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(120000);
    add({ ...post('one'), createdAt: 120000 }); clearReads();
    width = 180; add({ ...post('one'), name: '더 긴 이름', text: '바뀐 대화', createdAt: 120000 });
    expect(bubbles()[0].style.getPropertyValue('--history-bubble-width')).toBe('180px');
    expect(reads.height).toHaveBeenCalledTimes(1);
    clearReads(); now.mockReturnValue(180000); history.step(.01);
    expect(reads.height).toHaveBeenCalledTimes(1);
    expect(bubbles()[0].textContent).toContain('1분 전');
    clearReads(); bubbles()[0].click(); history.step(.01);
    expect(reads.height).toHaveBeenCalledTimes(1);
  });

  it('인원·구도 너비·창 크기·폰트·실제 요소 크기·숨김 복귀에 캐시를 갱신한다', async () => {
    add(); await fonts.ready; clearReads();
    width = 170; add(post('two', 'b')); expect(reads.height).toHaveBeenCalledTimes(2);
    clearReads(); history.setLayout({ ...layout, width: 600 }); expect(reads.height).toHaveBeenCalledTimes(2);
    clearReads(); window.dispatchEvent(new Event('resize')); expect(reads.height).toHaveBeenCalledTimes(2);
    clearReads(); fonts.dispatchEvent(new Event('loadingdone')); expect(reads.height).toHaveBeenCalledTimes(2);
    clearReads(); width = 190; observer.callback([{ target: bubbles()[0] }]);
    expect(reads.height).toHaveBeenCalledTimes(1);
    expect(bubbles()[0].style.getPropertyValue('--history-bubble-width')).toBe('190px');
    clearReads(); history.setVisible(false); history.setVisible(true);
    expect(reads.height).toHaveBeenCalledTimes(2);
  });

  it('겹침 허용 시 사용하지 않는 장애물을 읽지 않고 해제하면 현재 위치를 반영한다', () => {
    const topic = document.createElement('div'); topic.className = 'topic'; document.body.append(topic);
    const measure = jest.spyOn(topic, 'getBoundingClientRect');
    try {
      history.setSpeechOverlap(true); add(); measure.mockClear();
      history.step(.01); expect(measure).not.toHaveBeenCalled();
      history.setSpeechOverlap(false); expect(measure).toHaveBeenCalledTimes(1);
    } finally { topic.remove(); }
  });

  it('dispose 뒤 크기·폰트 관찰과 대기 중 콜백이 다시 그리지 않는다', async () => {
    add(); history.dispose(); clearReads();
    window.dispatchEvent(new Event('resize')); fonts.dispatchEvent(new Event('loadingdone'));
    observer.callback([{ target: stage }]); await fonts.ready;
    expect(reads.width).not.toHaveBeenCalled(); expect(observer.disconnect).toHaveBeenCalled();
  });
});
