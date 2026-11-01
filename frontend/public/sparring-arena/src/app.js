import { createRequestId } from './request-id.js';
import { setupComposer, animateCapsuleSend, revealComposer } from './composer.js';
import { createArena } from './scene.js';
import { connectRoom } from './remote-room.js';

const $ = selector => document.querySelector(selector);
const sideNames = { a: '민트 편', b: '코랄 편' };
const store = await connectRoom();
const roomId = store.snapshot().topic.id;
let state = store.snapshot();
let voting = false, draftVersion = 0, notice = '';
const pendingShipments = new Map(), failedShipments = new Map();
let pendingSide = null, voteError = '', expandedSide = null;
let selectedId = state.posts.at(-1)?.id ?? null;
let selectedUntil = 0, filter = 'all', historyLimit = 20, flowPaused = false, replyToId = null, arena;
const own = post => String(post.authorId) === state.actorId;
const displayName = post => own(post) ? '나' : post.name;
const mySide = () => state.mySide;
const mobileComposer = () => innerWidth <= 700;
const composerInput = side => mobileComposer() ? $('#message') : $(`[data-input-side="${side}"]`);
function scenePost(post) {
  const parent = state.posts.find(item => item.id === post.replyToId) ?? post.replyTo;
  return { ...post, mine: own(post), name: displayName(post), replyTo: parent ? { ...parent, name: displayName(parent) } : null };
}
const scenePosts = () => state.posts.map(scenePost);
function announce(text) { $('#stage-status').textContent = text; }
function composerError(text = '') { notice = text; renderComposerNotice(); }
function renderComposerNotice() {
  const note = $('#composer-note');
  note.replaceChildren();
  const message = notice || (!mySide() && replyToId ? '받아치려면 아래 캐릭터를 눌러 내 편을 골라주세요.' : '');
  if (message) note.append(document.createTextNode(message));
  for (const shipment of failedShipments.values()) {
    const row = document.createElement('span'), text = document.createElement('span'), retry = document.createElement('button');
    row.className = 'composer-failed-message';
    text.textContent = `보내지 못한 말: ${shipment.text}`;
    retry.type = 'button'; retry.className = 'composer-retry';
    retry.textContent = mySide() === shipment.side ? '다시 보내기' : `${state.topic[shipment.side]} 편에서 다시 보내기`;
    retry.disabled = isClosed() || voting || mySide() !== shipment.side;
    retry.dataset.phCaptureAttributeAction = 'sparring_post_submit';
    retry.addEventListener('click', () => {
      if (retry.disabled) return;
      const input = composerInput(mySide());
      if (input.value.trim() === shipment.text && replyToId === shipment.replyToId) resetDraft();
      expandedSide = mySide(); renderInput();
      input.focus({ preventScroll: true });
      void submitShipment({ ...shipment, restoreVersion: draftVersion });
    });
    row.append(text, retry); note.append(row);
  }
  note.hidden = !note.childNodes.length;
}
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
function findPost(id) {
  return state.posts.find(post => post.id === id) ?? state.posts.find(post => post.replyTo?.id === id)?.replyTo;
}
function selectPost(id, manual = false) {
  const post = findPost(id);
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
  } else if (!replyToId && Date.now() > selectedUntil && !document.activeElement?.matches('[data-input-side]')) selectPost(post.id);
}
try {
  arena = createArena($('#scene'), id => selectPost(id, true), showReveal, startReply);
  arena.ready.then(() => store.reportScene('ready'), () => { fallback(); store.reportScene('error'); });
}
catch (error) { console.error(error); fallback(); store.reportScene('error'); }
function changeView(event) {
  if (event.source !== window.parent || event.origin !== location.origin) return;
  if (event.data?.channel === 'jarihana-sparring' && event.data.kind === 'view') arena?.setView(event.data.value);
  if (event.data?.channel === 'jarihana-sparring' && event.data.kind === 'clash-camera' && typeof event.data.value === 'boolean') arena?.setClashCamera(event.data.value);
}
window.addEventListener('message', changeView);
window.addEventListener('pagehide', () => window.removeEventListener('message', changeView));
$('#scene').addEventListener('sceneerror', fallback);

const isClosed = () => !!state.topic.closesAt && Date.now() >= new Date(state.topic.closesAt).getTime();
function renderInput() {
  const side = mySide(), draft = $('#message').value, mobile = mobileComposer();
  const replyTarget = $('#reply-target');
  if (side) $(`[data-composer-side="${mobile ? 'a' : side}"] .composer-field`).prepend(replyTarget);
  replyTarget.hidden = !side || !replyToId;
  for (const choice of ['a', 'b']) {
    const device = $(`[data-composer-side="${choice}"]`);
    const input = device.querySelector('textarea'), send = device.querySelector('[type=submit]');
    const chosen = side === choice;
    const expanded = mobile ? choice === 'a' : chosen && expandedSide === choice;
    device.querySelector('.composer-field').dataset.reply = String(chosen && !!replyToId);
    device.dataset.expanded = String(expanded);
    device.dataset.memberType = state.actorMemberType ?? state.posts.find(own)?.memberType ?? 'CREW';
    const panel = device.querySelector('.composer-drawer');
    panel.id = `composer-panel-${choice}`;
    panel.inert = !expanded;
    const toggle = device.querySelector('.composer-avatar');
    if (mobile) toggle.removeAttribute('aria-expanded');
    else toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', `${state.topic[choice]} · ${mobile ? (chosen ? '선택한 편' : '이 편으로 보내기') : expanded ? '말풍선 접기' : '캐릭터를 눌러 한마디 쓰기'}`);
    toggle.dataset.phCaptureAttributeAction = mobile ? 'sparring_vote' : chosen ? 'sparring_composer_toggle' : 'sparring_vote';
    toggle.querySelector('.composer-hint').textContent = isClosed() ? '마감된 토론' : voting && pendingSide === choice ? '선택 중…' : mobile ? (chosen ? '선택됨' : '선택') : expanded ? '말풍선 접기' : '눌러서 한마디';
    toggle.setAttribute('aria-controls', mobile ? 'composer-panel-a' : panel.id);
    input.disabled = isClosed() || (mobile ? choice === 'b' : !chosen);
    input.readOnly = false;
    input.placeholder = isClosed() ? '마감된 토론이에요' : chosen ? (replyToId ? '이 의견에 한마디 받아쳐볼까요?' : '내 생각은…') : '캐릭터를 눌러 한마디 남겨보세요';
    device.querySelector('label').textContent = state.topic[choice] + (replyToId && chosen ? ' · 받아치기' : ' · 한마디');
    device.querySelector('.char-count').textContent = draft.length + ' / 160';
    send.disabled = isClosed() || voting || !chosen || !draft.trim();
    send.setAttribute('aria-busy', 'false');
    device.dataset.hasDraft = String(!!draft.trim());
    device.querySelector('.capsule-paper').textContent = draft.trim().slice(0, 12);
    device.querySelector('.send-label').textContent = replyToId && chosen ? '받아치기' : '보내기';
  }
  if (mobile) {
    const device = $('[data-composer-side="a"]');
    const input = $('#message'), send = $('#send');
    device.querySelector('.composer-field').dataset.reply = String(!!side && !!replyToId);
    input.disabled = isClosed();
    input.placeholder = isClosed() ? '마감된 토론이에요' : side ? '내 생각은…' : '생각을 적고 캐릭터로 편을 골라요';
    $('#composer-label').textContent = side ? `${state.topic[side]} · 한마디` : '토론에 한마디';
    send.disabled = isClosed() || voting || !side || !draft.trim();
    $('#send-label').textContent = replyToId ? '받아치기' : '보내기';
    $('#message-b').disabled = true;
    $('#send-b').disabled = true;
  }
  $('#composer').dataset.side = side ?? '';
  $('#composer').dataset.memberType = state.actorMemberType ?? 'CREW';
  renderComposerNotice();
}
function renderCounts() {
  const result = state.balance, side = mySide();
  const percent = Math.round(result.ratio * 100);
  $('#topic-deadline').textContent = state.topic.closesAt ? (isClosed() ? '마감됨 · ' : '마감 · ') + new Date(state.topic.closesAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric' }) : '';
  $('#topic-deadline').hidden = !state.topic.closesAt;
  $('#topic-title').textContent = state.topic.title;
  $('#topic-description').textContent = state.topic.description;
  $('#topic-description').hidden = !state.topic.description;

  $('#option-a').textContent = state.topic.a; $('#option-b').textContent = state.topic.b;
  $('#count-a').textContent = result.a + '표';
  $('#count-b').textContent = result.b + '표';
  $('#percent-a').textContent = (result.total ? percent : 0) + '%';
  $('#percent-b').textContent = (result.total ? 100 - percent : 0) + '%';
  $('#seat-instruction').textContent = voteError || (voting ? sideNames[pendingSide] + ' 선택을 저장하고 있어요…' : '');
  for (const choice of ['a', 'b']) $('#station-' + choice).classList.toggle('chosen', choice === side);
  document.querySelectorAll('.vote-option[data-side]').forEach(button => {
    const chosen = button.dataset.side === side;
    button.disabled = isClosed() || voting || (pendingShipments.size > 0 && !chosen);
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
    button.type = 'button'; button.className = 'history-item'; button.dataset.postId = post.id; button.dataset.side = post.side;
    button.dataset.phCaptureAttributeAction = 'sparring_history_select';
    button.setAttribute('aria-pressed', String(post.id === selectedId));
    const avatar = document.createElement('span');
    avatar.className = 'post-avatar ' + post.side; avatar.textContent = displayName(post).slice(0, 2);
    const copy = document.createElement('span'); copy.className = 'post-copy';
    const meta = document.createElement('span');
    const dot = document.createElement('i'); dot.className = 'dot ' + (post.side === 'a' ? 'mint' : 'coral');
    const time = document.createElement('time'); time.dateTime = new Date(post.createdAt).toISOString(); time.textContent = formatTime(post.createdAt);
    meta.append(dot, document.createTextNode(displayName(post) + ' · ' + state.topic[post.side]), time);
    const text = document.createElement('p'); text.textContent = post.text;
    if (post.replyToId) {
      const parent = state.posts.find(item => item.id === post.replyToId) ?? post.replyTo;
      const context = document.createElement('span'); context.className = 'history-reply';
      context.textContent = parent ? '↩ ' + displayName(parent) + '의 의견에 받아치기: ' + parent.text : '↩ 이전 의견에 받아치기';
      copy.append(context);
    }
    copy.append(meta, text); button.append(avatar, copy);
    button.addEventListener('click', () => startReply(post.id));
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
function setComposerExpanded(side, restoreFocus = true) {
  const previous = expandedSide;
  expandedSide = side;
  if (!side && previous && restoreFocus) $(`.composer-avatar[data-side="${previous}"]`).focus({ preventScroll: true });
  renderInput();
  if (side) composerInput(side).focus({ preventScroll: true });
}
const composerForm = $('#composer');
const parentDocument = window.frameElement?.ownerDocument;
function dismissComposer(event) {
  if (!composerForm.isConnected || mobileComposer() || !expandedSide || composerForm.contains(event.target)) return;
  if (composerForm.contains(document.activeElement)) document.activeElement.blur();
  setComposerExpanded(null, false);
}
document.addEventListener('click', dismissComposer, true);
parentDocument?.addEventListener('click', dismissComposer, true);
window.addEventListener('pagehide', () => {
  document.removeEventListener('click', dismissComposer, true);
  parentDocument?.removeEventListener('click', dismissComposer, true);
}, { once: true });
document.querySelectorAll('.vote-option[data-side]').forEach(button => button.addEventListener('click', async () => {
  const side = button.dataset.side;
  const avatar = button.classList.contains('composer-avatar');
  if (isClosed() || voting) return;
  if (mySide() === side) {
    if (!avatar) return;
    setComposerExpanded(mobileComposer() ? side : expandedSide === side ? null : side);
    return;
  }
  if (pendingShipments.size > 0) return;
  voting = true; pendingSide = side; voteError = ''; composerError();
  try {
    renderCounts();
    await store.vote(roomId, state.actorId, '', side); sync();
    arena?.chooseSide(side);
    if (mySide() === side) {
      expandedSide = side; renderInput();
      if (avatar) composerInput(side).focus({ preventScroll: true });
    }
    if (mySide() === side && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const element of [$(`[data-composer-side="${side}"] .inlet-mouth`), $(`[data-composer-side="${side}"] .send-capsule`), $(`.transport-pipes [data-route="${side}"] .transport-route`)]) {
        element?.animate?.([{ filter: 'brightness(1)' }, { filter: 'brightness(1.3) drop-shadow(0 0 7px currentColor)' }, { filter: 'brightness(1)' }], { duration: 650 });
      }
    }
    announce(sideNames[side] + '으로 투표했어요');
  } catch (error) {
    voteError = error.message;
    composerError(voteError);
    announce(voteError);
  }
  finally { voting = false; pendingSide = null; sync(); }
}));
setupComposer($('#composer'));
matchMedia('(max-width: 700px)').addEventListener('change', renderInput);
document.querySelectorAll('[data-input-side]').forEach(input => input.addEventListener('input', () => {
  draftVersion++;
  document.querySelectorAll('[data-input-side]').forEach(other => { if (other !== input) other.value = input.value; });
  renderInput();
}));
function startReply(id) {
  const target = findPost(id);
  if (!target) return;
  composerError();
  selectPost(target.id, true);
  replyToId = target.id; selectedUntil = Infinity; draftVersion++;
  expandedSide = mySide();
  document.querySelectorAll('.history-conversation-speech, .duel-speech, .capsule-note, .capsule-flight-tag').forEach(bubble => {
    bubble.dataset.replySelected = String(bubble.dataset.postId === String(target.id));
  });
  $('#reply-target-text').textContent = target.text;
  $('#reply-target-author').textContent = displayName(target) + '에게 받아치기';
  announce('받아칠 의견을 선택했어요. ' + target.text);
  renderInput();
  revealComposer($('#composer'));
  if (mySide()) composerInput(mySide()).focus({ preventScroll: true });
}
$('#reply-selected').addEventListener('click', () => startReply(selectedId));
$('#cancel-reply').addEventListener('click', () => {
  draftVersion++;
  replyToId = null; selectedUntil = 0; $('#reply-target').hidden = true;
  document.querySelectorAll('[data-reply-selected]').forEach(bubble => delete bubble.dataset.replySelected);
  renderInput();
  if (mySide() && expandedSide === mySide()) composerInput(mySide()).focus({ preventScroll: true });
});
document.querySelectorAll('[data-input-side]').forEach(input => input.addEventListener('keydown', event => {
  const send = $(`[data-send-side="${input.dataset.inputSide}"]`);
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !send.disabled) {
    event.preventDefault(); $('#composer').requestSubmit(send);
  }
}));
function resetDraft() {
  draftVersion++;
  replyToId = null; $('#reply-target').hidden = true;
  document.querySelectorAll('[data-reply-selected]').forEach(bubble => delete bubble.dataset.replySelected);
  document.querySelectorAll('[data-input-side]').forEach(input => { input.value = ''; });
}
async function submitShipment(shipment) {
  if (pendingShipments.has(shipment.id)) return;
  pendingShipments.set(shipment.id, shipment); failedShipments.delete(shipment.id);
  composerError(); renderCounts();
  try {
    const post = await store.post(roomId, { text: shipment.text, replyToId: shipment.replyToId, postId: shipment.id });
    sync();
    selectedUntil = Date.now() + 8000; selectPost(post.id);
    try {
      const visualPost = scenePost(post);
      const delivered = arena?.launch(visualPost, arrive => animateCapsuleSend($('#composer'), visualPost, arrive));
      Promise.resolve(delivered).catch(error => { console.error(error); fallback(); });
    } catch (error) { console.error(error); fallback(); }
    announce('한마디를 보냈어요. ' + post.text);
  } catch (error) {
    failedShipments.set(shipment.id, shipment);
    // A late failure must not replace a newer draft or reply target.
    if (draftVersion === shipment.restoreVersion && mySide() === shipment.side && !$('#message').value) {
      document.querySelectorAll('[data-input-side]').forEach(input => { input.value = shipment.text; });
      replyToId = shipment.replyToId;
      const target = findPost(replyToId);
      $('#reply-target').hidden = !target;
      if (target) {
        $('#reply-target-text').textContent = target.text;
        $('#reply-target-author').textContent = displayName(target) + '에게 받아치기';
      }
    }
    composerError(error.message);
  } finally { pendingShipments.delete(shipment.id); sync(); }
}
$('#composer').addEventListener('submit', event => {
  event.preventDefault();
  const side = mySide();
  if (isClosed() || voting || !side || (event.submitter && !(mobileComposer() && event.submitter.id === 'send') && event.submitter.dataset.sendSide !== side)) return;
  const input = composerInput(side), text = input.value.trim();
  if (!text) return;
  const failed = [...failedShipments.values()].find(item => item.text === text && item.replyToId === replyToId && item.side === side);
  const shipment = { text, replyToId, side, id: failed?.id ?? createRequestId() };
  resetDraft(); renderInput();
  input.focus({ preventScroll: true });
  void submitShipment({ ...shipment, restoreVersion: draftVersion });
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
store.subscribe(fresh => {
  sync();
  for (const id of fresh) {
    const post = state.posts.find(post => post.id === id);
    if (!post) continue;
    arena?.launch(scenePost(post));
  }
});
const actions = {
  composer: 'sparring_post_submit', message: 'sparring_message_edit', send: 'sparring_post_submit',
  'cancel-reply': 'sparring_reply_cancel', 'reply-selected': 'sparring_reply_start',
  'replay-reply': 'sparring_clash_replay', 'flow-toggle': 'sparring_flow_toggle',
  spill: 'sparring_capsule_release', 'more-history': 'sparring_history_more'
};
for (const [id, action] of Object.entries(actions)) $('#' + id).dataset.phCaptureAttributeAction = action;
for (const input of document.querySelectorAll('[data-input-side]')) input.dataset.phCaptureAttributeAction = 'sparring_message_edit';
for (const button of document.querySelectorAll('[data-send-side]')) button.dataset.phCaptureAttributeAction = 'sparring_post_submit';
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

let wasClosed = isClosed();
const deadlineTimer = setInterval(() => { if (wasClosed !== isClosed()) { wasClosed = isClosed(); renderCounts(); } }, 1000);
window.addEventListener('pagehide', () => clearInterval(deadlineTimer));
