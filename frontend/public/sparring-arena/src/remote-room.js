const CHANNEL = 'jarihana-sparring';

export async function connectRoom() {
  if (window.parent === window) throw new Error('스파링 목록에서 경기장에 들어와 주세요.');
  let state, resolveInitial;
  const initial = new Promise(resolve => { resolveInitial = resolve; });
  const requests = new Map(), listeners = new Set();
  const send = value => window.parent.postMessage({ channel: CHANNEL, ...value }, location.origin);
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== location.origin || event.data?.channel !== CHANNEL) return;
    const message = event.data;
    if (message.kind === 'hello') send({ kind: 'ready' });
    if (message.kind === 'snapshot') {
      state = message.state; resolveInitial();
      for (const listener of listeners) listener(message.fresh ?? []);
    }
    if (message.kind === 'connection') {
      document.body.dataset.connection = message.value;
      const label = document.querySelector('#storage-note');
      if (label) label.textContent = message.value === 'live' ? '대화는 서버에 저장돼요. 흘러간 말은 기록에서 다시 볼 수 있어요.' : message.value === 'offline' ? '오프라인이에요. 작성 중인 글은 그대로 두고 다시 연결할게요.' : '다시 연결하는 중이에요. 입력한 내용은 그대로 있어요.';
    }
    if (message.kind === 'failure') {
      const status = document.querySelector('#composer-note');
      if (status) status.textContent = message.message;
    }
    if (message.kind === 'result') {
      const request = requests.get(message.requestId);
      if (!request) return;
      clearTimeout(request.timer); requests.delete(message.requestId);
      if (message.error) request.reject(new Error(message.error)); else request.resolve(message.result);
    }
  });
  function command(action, payload) {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => { requests.delete(requestId); reject(new Error('응답이 늦어지고 있어요. 입력한 내용으로 다시 시도해 주세요.')); }, 20000);
      requests.set(requestId, { resolve, reject, timer }); send({ kind: 'command', requestId, action, payload });
    });
  }
  for (const type of ['click', 'change', 'submit']) document.addEventListener(type, event => {
    const action = event.target.closest('[data-ph-capture-attribute-action]')?.dataset.phCaptureAttributeAction;
    if (action) send({ kind: 'interaction', action });
  });
  send({ kind: 'ready' }); await initial;
  return {
    snapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    vote: (_id, _authorId, _name, side) => command('vote', { side }),
    post: (_id, post) => command('post', { text: post.text, replyToId: post.replyToId, postId: post.postId }),
    loadHistory: (mine, reset = false) => command('history', { mine, reset }),
    reveal() { send({ kind: 'reveal' }); },
    reportHeight(height) { send({ kind: 'height', height }); }
  };
}
