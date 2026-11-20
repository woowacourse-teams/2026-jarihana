import { createDemoRoom } from '../../public/sparring-arena/avatar-lab/demo-room.js';
import { AVATAR_PRESETS } from '../../public/sparring-arena/src/avatar-appearance.js';

let frame, room, send;
const snapshot = () => send.mock.calls.map(([message]) => message).filter(message => message.kind === 'snapshot').at(-1).state;
function receive(message, origin = location.origin) {
  window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin, data: { channel: 'jarihana-sparring', ...message } }));
}
beforeEach(() => {
  document.body.innerHTML = '<p id="arena-status"></p><button id="clash"></button><iframe></iframe>';
  frame = document.querySelector('iframe');
  send = jest.spyOn(frame.contentWindow, 'postMessage').mockImplementation(() => {});
  room = createDemoRoom(frame); receive({ kind: 'ready' });
});
afterEach(() => { room.dispose(); document.body.innerHTML = ''; });

it('서로 다른 여섯 작성자 외형을 실제 경기장 snapshot으로 전달한다', () => {
  expect(snapshot().posts.map(post => post.appearance)).toEqual(AVATAR_PRESETS.map(preset => preset.appearance));
  room.select(AVATAR_PRESETS[4]);
  expect(snapshot().actorAppearance).toEqual(AVATAR_PRESETS[4].appearance);
});

it('전송 재시도는 중복 글을 만들지 않고, 외형 변경 뒤에도 이전 글의 얼굴을 유지한다', () => {
  receive({ kind: 'command', requestId: 'vote-1', action: 'vote', payload: { side: 'a' } });
  const command = { kind: 'command', requestId: 'send-1', action: 'post', payload: { postId: 'same-message', text: '안녕하세요', replyToId: '2' } };
  receive(command);
  const post = snapshot().posts.at(-1);
  expect(post.replyTo.appearance).toEqual(AVATAR_PRESETS[1].appearance);
  expect(post.appearance).toEqual(AVATAR_PRESETS[0].appearance);
  room.select(AVATAR_PRESETS[3]);
  receive({ ...command, requestId: 'send-again' });
  expect(snapshot().posts.filter(item => item.requestId === 'same-message')).toHaveLength(1);
  expect(snapshot().posts.at(-1).appearance).toEqual(AVATAR_PRESETS[0].appearance);
  receive({ ...command, requestId: 'send-new', payload: { ...command.payload, postId: 'new-message' } });
  expect(snapshot().posts.at(-1).appearance).toEqual(AVATAR_PRESETS[3].appearance);
});

it('다른 출처의 명령과 dispose 뒤 도착한 메시지는 처리하지 않는다', () => {
  const before = send.mock.calls.length;
  receive({ kind: 'command', requestId: 'bad', action: 'vote', payload: { side: 'b' } }, 'https://example.com');
  expect(send).toHaveBeenCalledTimes(before);
  room.dispose(); receive({ kind: 'ready' });
  expect(send).toHaveBeenCalledTimes(before);
});

it('프리셋에 없는 파츠 조합도 토론 작성자와 발언에 그대로 전달한다', () => {
  const custom = { ...AVATAR_PRESETS[0].appearance, hair: 'bob', hairColor: 'copper', eyebrows: 'straight', nose: 'small', mouth: 'open', outfit: 'lilac' };
  room.select({ appearance: custom });
  expect(snapshot().actorAppearance).toEqual(custom);
  receive({ kind: 'command', requestId: 'vote-custom', action: 'vote', payload: { side: 'b' } });
  receive({ kind: 'command', requestId: 'post-custom', action: 'post', payload: { postId: 'custom', text: '내가 고른 파츠예요.' } });
  expect(snapshot().posts.at(-1).appearance).toEqual(custom);
  room.select(AVATAR_PRESETS[2]);
  expect(snapshot().posts.at(-1).appearance).toEqual(custom);
});
