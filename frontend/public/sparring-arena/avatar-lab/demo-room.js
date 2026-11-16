import { AVATAR_PRESETS } from '../src/avatar-appearance.js';

const CHANNEL = 'jarihana-sparring';
// An in-memory host for the real arena bridge. This module never calls an API.
export function createDemoRoom(frame) {
  const now = Date.now(), posts = AVATAR_PRESETS.map((preset, index) => ({
    id: String(index + 1), authorId: `demo-${preset.id}`, name: ['민트', '코랄', '크림', '네이비', '라일락', '머스터드'][index],
    memberType: 'CREW', appearance: preset.appearance, side: index % 2 ? 'b' : 'a',
    text: ['함께라면 새로운 것도 해볼 수 있을 것 같아요.', '저는 익숙한 곳에서 천천히 시작하고 싶어요.', '처음엔 가볍게 한 판 어때요?', '좋아요. 작은 약속부터 시작해 봐요.', '서로 다른 생각이 모이면 더 재밌겠어요.', '다음 모임에서도 이 모습으로 만나요!'][index],
    createdAt: now - (6 - index) * 60000, replyTo: null, replyToId: null,
  }));
  let selected = AVATAR_PRESETS[0], mySide = null, ready = false, sequence = 6, revision = 1;
  const requests = new Map();
  const send = message => frame.contentWindow?.postMessage({ channel: CHANNEL, ...message }, location.origin);
  function snapshot(fresh = [], livePosts = []) {
    if (!ready) return;
    const a = 3 + (mySide === 'a' ? 1 : 0), b = 3 + (mySide === 'b' ? 1 : 0);
    send({ kind: 'snapshot', state: {
      topic: { id: 'avatar-demo', title: '다음 모임, 어떻게 시작할까요?', a: '새로운 도전', b: '편안한 시작', description: '', createdAt: now, closesAt: null, example: true, revision },
      actorId: 'avatar-self', actorMemberType: 'CREW', actorAppearance: selected.appearance,
      mySide, balance: { a, b, total: a + b, ratio: a / (a + b) }, postCount: sequence, posts: [...posts], connection: 'live',
    }, fresh, livePosts });
  }
  function viewport() { send({ kind: 'viewport', height: innerHeight, contentWidth: frame.clientWidth }); }
  function result(requestId, value, error) { send({ kind: 'result', requestId, result: value, ...(error ? { error } : {}) }); }
  function receive(event) {
    if (event.source !== frame.contentWindow || event.origin !== location.origin || event.data?.channel !== CHANNEL) return;
    const message = event.data;
    if (message.kind === 'ready') {
      ready = true; viewport(); snapshot(); send({ kind: 'view', value: 'compact' });
    } else if (message.kind === 'height' && Number.isFinite(message.height) && message.height >= 200 && message.height <= 50000) {
      frame.style.height = `${Math.ceil(message.height)}px`; viewport();
    } else if (message.kind === 'scene') {
      const status = document.querySelector('#arena-status');
      status.textContent = message.status === 'ready' ? '준비됐어요. 아래 캐릭터를 눌러 한마디를 보내보세요.' : '토론 화면을 불러오지 못했어요. 새로고침해 주세요.';
      document.querySelector('#clash').disabled = message.status !== 'ready';
      frame.dataset.ready = String(message.status === 'ready');
    } else if (message.kind === 'command' && typeof message.requestId === 'string') {
      const payload = message.payload;
      if (requests.has(message.requestId)) { result(message.requestId, requests.get(message.requestId)); return; }
      if (message.action === 'vote' && ['a', 'b'].includes(payload?.side)) {
        mySide = payload.side; revision++; snapshot(); requests.set(message.requestId, true); result(message.requestId, true);
      } else if (message.action === 'post' && mySide && typeof payload?.text === 'string' && payload.text.trim() && payload.text.length <= 160) {
        let post = posts.find(item => item.requestId === payload.postId);
        if (!post) {
          const parent = posts.find(item => item.id === payload.replyToId) ?? null;
          post = { id: String(++sequence), requestId: payload.postId, authorId: 'avatar-self', name: '나', memberType: 'CREW', appearance: selected.appearance,
            side: mySide, text: payload.text, createdAt: Date.now(), replyToId: parent?.id ?? null, replyTo: parent };
          posts.push(post); if (posts.length > 30) posts.shift(); revision++;
        }
        snapshot(); requests.set(message.requestId, post); result(message.requestId, post);
      } else result(message.requestId, null, '캐릭터로 편을 고른 뒤 한마디를 보내주세요.');
      if (requests.size > 100) requests.delete(requests.keys().next().value);
    }
  }
  const hello = () => { ready = false; send({ kind: 'hello' }); };
  frame.addEventListener('load', hello); window.addEventListener('message', receive); window.addEventListener('resize', viewport);
  send({ kind: 'hello' });
  return {
    select(preset) { selected = preset; snapshot(); },
    clash() {
      if (!ready) return;
      const parent = posts.find(post => post.authorId !== 'avatar-self') ?? posts[0];
      const post = { id: String(++sequence), authorId: 'avatar-self', name: '나', memberType: 'CREW', appearance: selected.appearance,
        side: parent.side === 'a' ? 'b' : 'a', text: '다른 생각도 함께 들어보고 싶어요!', createdAt: Date.now(), replyToId: parent.id, replyTo: parent };
      posts.push(post); if (posts.length > 30) posts.shift(); revision++; snapshot([post.id], [post]);
      frame.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    },
    dispose() { frame.removeEventListener('load', hello); window.removeEventListener('message', receive); window.removeEventListener('resize', viewport); },
  };
}
