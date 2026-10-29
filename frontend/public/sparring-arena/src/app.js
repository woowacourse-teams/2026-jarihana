import { setupComposer, animateCapsuleSend } from './composer.js';
import { createArena } from './scene.js';
import { connectRoom } from './remote-room.js';

const $ = selector => document.querySelector(selector);
const sideNames = { a: '민트 편', b: '코랄 편' };
const store = await connectRoom();
const roomId = store.snapshot().topic.id;
let state = store.snapshot();
let submitting = false, voting = false, shipment = null;
let pendingSide = null, voteError = '';
let selectedId = state.posts.at(-1)?.id ?? null;
let selectedUntil = 0, filter = 'all', historyLimit = 20, flowPaused = false, replyToId = null, arena;
const own = post => String(post.authorId) === state.actorId;
const displayName = post => own(post) ? '나' : post.name;
const mySide = () => state.mySide;
function scenePost(post) {
  const parent = state.posts.find(item => item.id === post.replyToId) ?? post.replyTo;
  return { ...post, name: displayName(post), replyTo: parent ? { ...parent, name: displayName(parent) } : null };
}
const scenePosts = () => state.posts.map(scenePost);
function announce(text) { $('#stage-status').textContent = text; }
function formatTime(timestamp) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(timestamp);
}
function storageStatus() {
  $('#storage-note').textContent = state.connection === 'offline'
    ? '오프라인이에요. 작성 중인 글은 그대로 두고 다시 연결할게요.'
    : '대화는 서버에 저장돼요. 흘러간 말은 기록에서 다시 볼 수 있어요.';
}
function fallback() {
  if ($('#scene .fallback')) return;
  const message = document.createElement('p');
  message.className = 'fallback';
  message.textContent = '3D 화면을 표시할 수 없어요. 주장을 눌러 투표하고 대화를 이어갈 수 있어요.';
  $('#scene').append(message);
}
function selectPost(id, manual = false) {
  const post = state.posts.find(post => post.id === id);
  if (!post) return;
  selectedId = id;
  $('#replay-reply').hidden = !scenePost(post).replyTo;
  if (manual) selectedUntil = Infinity;
  $('#current-post').hidden = false;
  $('#post-avatar').textContent = displayName(post).slice(0, 2);
  $('#post-avatar').className = 'post-avatar ' + post.side;
  $('#post-meta').textContent = displayName(post) + ' · ' + sideNames[post.side] + ' · ' + formatTime(post.createdAt);
  $('#post-text').textContent = post.text;
  document.querySelectorAll('.history-item').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.postId === id)));
}
function showReveal(post, fresh) {
  $('#slide-status').textContent = fresh ? displayName(post) + '의 새 한마디' : '지난 대화 리플레이';
  if (replyToId) return;
  if (fresh && own(post)) {
    selectedUntil = Date.now() + 8000;
    selectPost(post.id);
    $('#composer-note').textContent = '내 캐릭터가 한마디를 건넸어요. 내 대화에서 다시 볼 수 있어요.';
  } else if (!replyToId && Date.now() > selectedUntil && document.activeElement !== $('#message')) selectPost(post.id);
}
try { arena = createArena($('#scene'), id => selectPost(id, true), showReveal); }
catch (error) { console.error(error); fallback(); }
$('#scene').addEventListener('sceneerror', fallback);

function renderInput() {
  const side = mySide(), input = $('#message');
  input.disabled = !side || submitting;
  input.placeholder = side ? (replyToId ? '이 의견에 한마디 받아쳐볼까요?' : '한마디 넣어볼까?' ) : '위에서 내 편을 고르면 한마디를 보낼 수 있어요';
  $('#composer-label').textContent = side ? sideNames[side] + (replyToId ? '에서 받아치기' : '에서 한마디') : '어느 쪽 생각에 가까운가요?';
  $('#char-count').textContent = input.value.length + ' / 160';
  $('#send').disabled = submitting || !side || !input.value.trim();
  $('#send').setAttribute('aria-busy', String(submitting));
  $('#composer').dataset.side = side ?? '';
  $('#composer').dataset.hasDraft = String(!!input.value.trim());
  $('#send .capsule-paper').textContent = input.value.trim().slice(0, 12);
  $('#send-label').textContent = submitting ? '담는 중' : replyToId ? '받아치기' : '보내기';
}
function renderCounts() {
  const result = state.balance, side = mySide();
  const percent = Math.round(result.ratio * 100);
  $('#topic-title').textContent = state.topic.title;
  $('#topic-description').textContent = state.topic.description;
  $('#topic-description').hidden = !state.topic.description;

  $('#option-a').textContent = state.topic.a; $('#option-b').textContent = state.topic.b;
  $('#count-a').textContent = result.a + '표';
  $('#count-b').textContent = result.b + '표';
  $('#percent-a').textContent = (result.total ? percent : 0) + '%';
  $('#percent-b').textContent = (result.total ? 100 - percent : 0) + '%';
  $('#balance-label').textContent = result.total ? '총 ' + result.total + '명 참여 · 캡슐 색 = 투표 비율' : '첫 자리를 기다려요';
  $('#seat-instruction').textContent = voteError || (voting ? sideNames[pendingSide] + ' 선택을 저장하고 있어요…' : side ? sideNames[side] + '으로 참여 중 · 아래에서 한마디를 보낼 수 있어요' : '어느 쪽 생각에 가까워요?');
  for (const choice of ['a', 'b']) $('#station-' + choice).classList.toggle('chosen', choice === side);
  document.querySelectorAll('.vote-option[data-side]').forEach(button => {
    const chosen = button.dataset.side === side;
    button.disabled = voting || submitting;
    button.setAttribute('aria-busy', String(voting && button.dataset.side === pendingSide));
    button.setAttribute('aria-pressed', String(chosen));
    const label = voting && button.dataset.side === pendingSide ? '선택 중…' : chosen ? '선택한 편' : side ? '이쪽으로 변경' : '이쪽 선택';
    const seat = button.querySelector('.seat-state');
    if (seat) seat.textContent = label;
    button.setAttribute('aria-label', state.topic[button.dataset.side] + ' · ' + sideNames[button.dataset.side] + (button.classList.contains('pipe-meter') ? ' 파이프' : '') + ' · ' + label);
  });
  $('#total-count').textContent = state.postCount;
  $('#empty-stage').hidden = !!state.posts.length;
  $('#spill').disabled = !state.posts.length;
  $('#current-post').hidden = !selectedId;
  arena?.updateState(scenePosts(), result);
  renderInput(); storageStatus();
}
function renderHistory() {
  const list = $('#history-list');
  list.replaceChildren();
  const posts = state.posts.filter(post => filter === 'all' || own(post)).slice().reverse();
  for (const post of posts.slice(0, historyLimit)) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'history-item'; button.dataset.postId = post.id;
    button.dataset.phCaptureAttributeAction = 'sparring_history_select';
    button.setAttribute('aria-pressed', String(post.id === selectedId));
    const avatar = document.createElement('span');
    avatar.className = 'post-avatar ' + post.side; avatar.textContent = displayName(post).slice(0, 2);
    const copy = document.createElement('span'); copy.className = 'post-copy';
    const meta = document.createElement('span');
    const dot = document.createElement('i'); dot.className = 'dot ' + (post.side === 'a' ? 'mint' : 'coral');
    const time = document.createElement('time'); time.dateTime = new Date(post.createdAt).toISOString(); time.textContent = formatTime(post.createdAt);
    meta.append(dot, document.createTextNode(displayName(post) + ' · ' + sideNames[post.side]), time);
    const text = document.createElement('p'); text.textContent = post.text;
    if (post.replyToId) {
      const parent = state.posts.find(item => item.id === post.replyToId) ?? post.replyTo;
      const context = document.createElement('span'); context.className = 'history-reply';
      context.textContent = parent ? '↩ ' + displayName(parent) + '의 의견에 받아치기: ' + parent.text : '↩ 이전 의견에 받아치기';
      copy.append(context);
    }
    copy.append(meta, text); button.append(avatar, copy);
    button.addEventListener('click', () => { selectPost(post.id, true); $('#current-post').scrollIntoView({ block: 'nearest' }); });
    list.append(button);
  }
  if (!posts.length) {
    const empty = document.createElement('p'); empty.className = 'history-empty';
    empty.textContent = filter === 'mine' ? '아직 내 대화가 없어요. 먼저 한마디 건네보세요.' : '아직 대화가 없어요. 먼저 한마디 건네보세요.';
    list.append(empty);
  }
  $('#more-history').hidden = posts.length <= historyLimit && !state.more[filter === 'mine' ? 'mine' : 'all'];
}
function sync() { state = store.snapshot(roomId); renderCounts(); renderHistory(); flowLabel(); }
document.querySelectorAll('.vote-option[data-side]').forEach(button => button.addEventListener('click', async () => {
  const side = button.dataset.side;
  if (mySide() === side || voting || submitting) return;
  voting = true; pendingSide = side; voteError = '';
  try {
    renderCounts();
    await store.vote(roomId, state.actorId, '', side); sync();
    arena?.chooseSide(side);
    $('#composer-note').textContent = sideNames[side] + '을 골랐어요. 이제 자유롭게 이야기해요.';
    announce(sideNames[side] + '으로 투표했어요');
  } catch (error) {
    voteError = error.message;
    $('#composer-note').textContent = voteError;
    announce(voteError);
  }
  finally { voting = false; pendingSide = null; sync(); }
}));
setupComposer($('#composer'));
$('#message').addEventListener('input', renderInput);
$('#reply-selected').addEventListener('click', () => {
  const target = state.posts.find(post => post.id === selectedId);
  if (!target) return;
  if (!mySide()) {
    $('#seat-instruction').textContent = '받아치려면 먼저 내 편을 골라주세요';
    $('.vote-flag').scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  replyToId = target.id; selectedUntil = Infinity;
  $('#reply-target-text').textContent = target.text;
  $('#reply-target').hidden = false;
  $('#composer-label').textContent = sideNames[mySide()] + '에서 받아치기';
  $('#message').placeholder = '이 의견에 한마디 받아쳐볼까요?';
  renderInput();
  $('#message').focus({ preventScroll: true });
  $('#composer').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});
$('#cancel-reply').addEventListener('click', () => {
  replyToId = null; selectedUntil = 0; $('#reply-target').hidden = true; renderInput();
});
$('#message').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !$('#send').disabled) {
    event.preventDefault(); $('#composer').requestSubmit();
  }
});
$('#composer').addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting || !mySide()) return;
  const text = $('#message').value.trim();
  if (!text) return;
  const key = JSON.stringify([text, replyToId]);
  if (shipment?.key !== key) shipment = { key, id: crypto.randomUUID() };
  submitting = true; renderCounts();
  try {
    const post = await store.post(roomId, { text, replyToId, postId: shipment.id });
    shipment = null;
    replyToId = null; $('#reply-target').hidden = true;
    $('#message').value = '';
    if (innerWidth <= 700) $('#message').blur();
    store.reveal(); sync();
    selectedUntil = Date.now() + 8000; selectPost(post.id);
    animateCapsuleSend($('#composer'), post, () => arena?.launch(scenePost(post)));
    $('#composer-note').textContent = post.replyToId ? '두 의견이 맞붙어요. 받아친 말도 내 대화에 남았어요.' : '내 한마디를 보냈어요. 파이프에서 말풍선으로 보여요.';
    announce('한마디를 보냈어요. ' + post.text);
  } catch (error) { $('#composer-note').textContent = error.message; }
  finally { submitting = false; sync(); }
});
function flowLabel() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('#flow-label').textContent = reduced ? '움직임 줄이기' : flowPaused ? '잠시 멈춤' : state.posts.length ? '지난 대화 재생 중' : '첫 대화 기다리는 중';
  $('#flow-action').textContent = flowPaused ? '재생' : '멈추기';
  $('#flow-toggle').setAttribute('aria-label', flowPaused ? '다시 흘려보내기' : '흐름 멈추기');
  $('#flow-toggle').setAttribute('aria-pressed', String(flowPaused));
}
$('#flow-toggle').addEventListener('click', () => { flowPaused = !flowPaused; arena?.setPaused(flowPaused); flowLabel(); });
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', flowLabel);
$('#spill').addEventListener('click', () => arena?.spill());
$('#replay-reply').addEventListener('click', () => {
  const post = state.posts.find(item => item.id === selectedId);
  if (!post) return;
  arena?.replayReply(scenePost(post));
  $('.stage').scrollIntoView({ block: 'start', behavior: 'smooth' });
});
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', async () => {
  filter = button.dataset.filter; historyLimit = 20;
  document.querySelectorAll('[data-filter]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  renderHistory();
  try { await store.loadHistory(filter === 'mine', true); sync(); } catch (error) { announce(error.message); }
}));
$('#more-history').addEventListener('click', async () => {
  $('#more-history').disabled = true;
  try {
    const loaded = state.posts.filter(post => filter !== 'mine' || own(post)).length;
    if (loaded <= historyLimit && state.more[filter === 'mine' ? 'mine' : 'all']) await store.loadHistory(filter === 'mine');
    historyLimit += 20; sync();
  } catch (error) { announce(error.message); }
  finally { $('#more-history').disabled = false; }
});
$('#view-selected').addEventListener('click', () => {
  filter = 'all'; historyLimit = state.posts.length;
  document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
  renderHistory();
  [...document.querySelectorAll('.history-item')].find(button => button.dataset.postId === selectedId)?.scrollIntoView({ block: 'center' });
});
store.subscribe(fresh => {
  sync();
  for (const id of fresh) {
    const post = state.posts.find(post => post.id === id);
    if (!post) continue;
    arena?.launch(scenePost(post));
    $('#composer-note').textContent = displayName(post) + '의 새 한마디가 도착했어요.';
  }
});
const actions = {
  composer: 'sparring_post_submit', message: 'sparring_message_edit', send: 'sparring_post_submit',
  'cancel-reply': 'sparring_reply_cancel', 'reply-selected': 'sparring_reply_start',
  'replay-reply': 'sparring_clash_replay', 'view-selected': 'sparring_history_locate', 'flow-toggle': 'sparring_flow_toggle',
  spill: 'sparring_capsule_release', 'more-history': 'sparring_history_more'
};
for (const [id, action] of Object.entries(actions)) $('#' + id).dataset.phCaptureAttributeAction = action;
for (const button of document.querySelectorAll('.vote-option[data-side]')) button.dataset.phCaptureAttributeAction = 'sparring_vote';
for (const button of document.querySelectorAll('[data-filter]')) button.dataset.phCaptureAttributeAction = 'sparring_history_filter';
let height = 0;
new ResizeObserver(() => {
  const next = Math.ceil($('.page').getBoundingClientRect().height) + 4;
  if (next !== height) { height = next; store.reportHeight(height); }
}).observe($('.page'));
window.addEventListener('pagehide', () => arena?.dispose());
sync(); flowLabel();
if (selectedId) selectPost(selectedId);
