import { createContext, useContext, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ListMusic, Music, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router";
import { useAuth } from "../auth/index.js";
import { advanceMusicPlayback, enqueueGroupMusic, fetchGroupMusic, saveMusicPlayback, skipGroupMusic } from "./api.js";
import { parseYoutubeUrl } from "./youtubeUrl.js";
import { YoutubePlayer } from "./YoutubePlayer.jsx";
import { acceptMusicSnapshot, isScheduledTrack, playbackPosition, projectMusicSchedule, stampMusicSnapshot } from "./timeline.js";
import "./groupMusic.css";

const MusicContext = createContext({ openMusic: () => {}, musicOpen: false, muted: false, toggleMuted: undefined });
export const useGroupMusic = () => useContext(MusicContext);
export function GroupMusicHeaderSlot() {
  const { groupId, setHeaderSlot } = useGroupMusic();
  return groupId ? <div className="group-music__header-slot" ref={setHeaderSlot} /> : null;
}
export function musicGroupId(pathname) {
  const id = /^\/groups\/([1-9]\d*)(?:\/space)?\/?$/.exec(pathname)?.[1];
  return id && Number.isSafeInteger(Number(id)) ? id : null;
}

function QueueArtwork({ url }) {
  const { videoId, playlistId } = parseYoutubeUrl(url) ?? {};
  const [failed, setFailed] = useState(false);
  return <span className="group-music__row-art" aria-hidden="true">
    {videoId && !failed
      ? <img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" loading="lazy" onError={() => setFailed(true)} />
      : playlistId ? <ListMusic size={18} /> : <Music size={18} />}
  </span>;
}

function MusicPanel({ groupId, memberId, snapshot, onSnapshot, refresh, connectionError, headerSlot,
  expanded, setExpanded, audioPreferences, setAudioPreferences, muteControlRef }) {
  const { music } = snapshot;
  const canEdit = Boolean(memberId && snapshot.canEdit);
  const canAdd = Boolean(memberId && (snapshot.canAdd ?? canEdit));
  const queue = music.queue ?? [];
  const [draft, setDraft] = useState(null);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const mutating = useRef(false);
  const advanceDenied = useRef(false);
  const unavailableCheck = useRef({ revision: null, queueId: null, time: -Infinity });
  const addButton = useRef(null);
  const panelToggle = useRef(null);
  const restoreToggleFocus = useRef(false);
  const queueId = useId();
  const addForm = useRef(null);
  const urlInput = useRef(null);
  const queueFull = queue.length >= 50;

  async function changeMusic(kind, mutation) {
    if (mutating.current) return false;
    mutating.current = true; setPending(kind); setError(""); setNotice("");
    try {
      onSnapshot(await mutation());
      return true;
    } catch (failure) {
      if (failure.status === 403 || failure.status === 409 || (kind === "add" && failure.status === 400)) void refresh();
      setError(failure.code === "GROUP_MUSIC_VERIFICATION_UNAVAILABLE" ? "유튜브 영상 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요."
        : failure.code === "GROUP_MUSIC_VIDEO_UNPLAYABLE" ? "삭제되었거나 외부 재생이 허용되지 않은 영상이에요."
        : failure.code === "GROUP_ENDED" ? "종료된 모임의 재생 목록은 바꿀 수 없어요."
        : failure.status === 403 ? "이 모임의 음악을 바꿀 권한이 없어요."
          : failure.status === 409 ? "모임 음악이 바뀌었어요. 목록을 확인한 뒤 다시 시도해 주세요."
            : kind === "add" ? "곡을 추가하지 못했어요. 링크와 대기열을 확인해 주세요."
              : "재생 상태를 바꾸지 못했어요. 다시 시도해 주세요.");
      return false;
    } finally { mutating.current = false; setPending(""); }
  }

  async function addTrack(event) {
    event.preventDefault();
    if (!draft || !canAdd || queueFull) return;
    const title = draft.title.trim();
    const url = draft.url.trim();
    if (!title || !parseYoutubeUrl(url)?.videoId) {
      setError(!title ? "곡 이름을 입력해 주세요." : "유튜브 영상 링크를 입력해 주세요.");
      return;
    }
    if (await changeMusic("add", () => enqueueGroupMusic(groupId, { title, url }))) {
      setDraft(null); setNotice("곡을 추가했어요.");
      addButton.current?.focus();
    }
  }

  function commandPlayback(command) {
    if (!canEdit) return;
    void changeMusic("playback", () => saveMusicPlayback(groupId, {
      ...command, expectedRevision: snapshot.playback.revision,
      ...(music.currentQueueId && { expectedCurrentQueueId: music.currentQueueId })
    }));
  }

  function skip() {
    if (!canEdit) return;
    void changeMusic("playback", () => skipGroupMusic(groupId, snapshot.playback.revision, music.currentQueueId ?? undefined));
  }

  const advance = useCallback(async (command) => {
    if (!canAdd || advanceDenied.current) return;
    if (command.checkUnavailable) {
      const previous = unavailableCheck.current;
      if (previous.revision === command.expectedRevision && previous.queueId === command.expectedCurrentQueueId && performance.now() - previous.time < 10000) return;
      unavailableCheck.current = { revision: command.expectedRevision, queueId: command.expectedCurrentQueueId, time: performance.now() };
    }
    try { onSnapshot(await advanceMusicPlayback(groupId, command)); }
    catch (failure) {
      if (failure.status === 401 || failure.status === 403) advanceDenied.current = true;
      if (failure.status === 409) void refresh();
    }
  }, [groupId, canAdd, onSnapshot, refresh]);

  const closeDraft = useCallback(() => {
    setDraft(null); setError("");
    addButton.current?.focus();
  }, []);
  const togglePanel = useCallback(() => {
    restoreToggleFocus.current = true;
    setExpanded((value) => !value);
  }, [setExpanded]);
  const adding = Boolean(draft);
  useEffect(() => {
    if (!restoreToggleFocus.current) return;
    restoreToggleFocus.current = false;
    panelToggle.current?.focus({ preventScroll: true });
  }, [expanded]);
  useEffect(() => {
    if (!expanded || !adding) return;
    addForm.current?.scrollIntoView?.({ block: "nearest" });
    urlInput.current?.focus({ preventScroll: true });
  }, [expanded, adding]);
  useEffect(() => {
    if (!expanded || pending === "add") return undefined;
    function handleEscape(event) {
      if (event.key !== "Escape" || !headerSlot.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      if (adding) closeDraft();
      else togglePanel();
    }
    function handleOutsidePress(event) {
      if (!headerSlot.contains(event.target)) setExpanded(false);
    }
    document.addEventListener("keydown", handleEscape, true);
    document.addEventListener("pointerdown", handleOutsidePress);
    return () => {
      document.removeEventListener("keydown", handleEscape, true);
      document.removeEventListener("pointerdown", handleOutsidePress);
    };
  }, [adding, closeDraft, expanded, headerSlot, pending, setExpanded, togglePanel]);

  return <>
    {!music.enabled && <div className="group-music__mini--header">
      <button type="button" ref={panelToggle} className="group-music__mini-title" aria-expanded={expanded} aria-controls={queueId}
        data-ph-capture-attribute-action={expanded ? "group_music_collapse" : "group_music_open"} onClick={togglePanel}>
        <Music size={17} aria-hidden="true" /><span>모임 음악</span><ChevronDown size={14} aria-hidden="true" />
      </button>
    </div>}
    <aside className={`group-music group-music--${expanded ? "expanded" : "compact"}`} aria-label="우리 모임 음악" data-ph-private hidden={!music.enabled && !expanded}>
      {expanded && <header className="group-music__header">
        <h2>모임 음악</h2>
        <button type="button" className="group-music__icon-button" aria-label="음악 패널 접기" data-ph-capture-attribute-action="group_music_collapse" onClick={togglePanel}><ChevronDown size={19} aria-hidden="true" /></button>
      </header>}
      <div className="group-music__body">
        {expanded && music.lastSkippedTitle && <p role="status">「{music.lastSkippedTitle}」은 재생할 수 없어 건너뛰었어요.</p>}
        {expanded && connectionError && <p role="status">실시간 연결을 복구하고 있어요.</p>}
        <section className="group-music__current" aria-label="현재 재생">
          {expanded && <h2>현재 재생</h2>}
          {music.enabled
            ? <YoutubePlayer muteControlRef={muteControlRef} audioPreferences={audioPreferences} onAudioPreferencesChange={setAudioPreferences}
                snapshot={snapshot} canEdit={canEdit} commandPending={Boolean(pending)} onCommand={commandPlayback}
                onSkip={skip} onAdvance={advance} expanded={expanded} queueId={queueId} queueToggle={panelToggle}
                onToggleQueue={togglePanel} headerSlot={headerSlot} canListenLocally={canAdd} />
            : <p className="group-music__empty">재생 중인 곡이 없어요.</p>}
        </section>
        <section id={queueId} className="group-music__queue" aria-label="다음 곡" hidden={!expanded}>
          <div className="group-music__section-head">
            <h2>다음 곡 {queue.length > 0 && <small>{queue.length}</small>}</h2>
            {canAdd && <button type="button" className="group-music__add" aria-expanded={Boolean(draft)} disabled={Boolean(pending) || queueFull} ref={addButton}
              data-ph-capture-attribute-action="group_music_queue_open"
              onClick={() => {
                if (draft) closeDraft();
                else { setDraft({ title: "", url: "" }); setError(""); setNotice(""); }
              }}>
              <Plus size={16} aria-hidden="true" /> 곡 추가
            </button>}
          </div>
          {draft && <form ref={addForm} className="group-music__form" onSubmit={addTrack} data-ph-capture-attribute-action="group_music_queue_submit">
            <fieldset disabled={Boolean(pending) || !canAdd}>
              <label>유튜브 링크<input ref={urlInput} type="url" maxLength={500} placeholder="https://youtu.be/…" required value={draft.url} data-ph-capture-attribute-action="group_music_queue_url" onChange={(event) => setDraft({ ...draft, url: event.target.value })} /></label>
              <label>곡 이름<input maxLength={80} required placeholder="함께 들을 곡 이름" value={draft.title} data-ph-capture-attribute-action="group_music_queue_title" onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
            </fieldset>
            <div className="group-music__form-actions">
              <button type="button" disabled={pending === "add"} data-ph-capture-attribute-action="group_music_queue_cancel" onClick={closeDraft}>취소</button>
              <button type="submit" className="group-music__primary" disabled={Boolean(pending) || !canAdd || queueFull} data-ph-capture-attribute-action="group_music_queue_add">{pending === "add" ? "추가 중…" : "대기열에 추가"}</button>
            </div>
          </form>}
          {notice && <p role="status">{notice}</p>}
          {error && <p role="alert">{error}</p>}
          {queueFull && canAdd && <p className="group-music__empty">대기열에 최대 50곡을 추가할 수 있어요.</p>}
          {queue.length > 0 ? <ol className="group-music__library">
            {queue.map((item, index) => <li key={item.id} className="group-music__row">
              <QueueArtwork url={item.url} />
              <span className="group-music__row-text"><strong>{item.title}</strong><small>{parseYoutubeUrl(item.url)?.playlistId ? "YouTube 재생목록" : "YouTube"}</small></span>
              <span className="group-music__row-order" aria-hidden="true">{index + 1}</span>
            </li>)}
          </ol> : !draft && <p className="group-music__empty">대기 중인 곡이 없어요.</p>}
        </section>
      </div>
    </aside>
  </>;
}

function useMusicEvents(groupId, enabled, accept) {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return undefined;
    const controller = new AbortController();
    const stream = new EventSource(`/api/groups/${groupId}/music/events`, { withCredentials: true });
    let refreshRequested = false;
    let fetching = false;
    async function update() {
      refreshRequested = true;
      if (fetching) return;
      fetching = true;
      while (refreshRequested && !controller.signal.aborted) {
        refreshRequested = false;
        try {
          const result = await fetchGroupMusic(groupId, controller.signal);
          if (!controller.signal.aborted) {
            accept(result);
            if (stream.readyState === 1) setConnected(true);
          }
        } catch {
          if (!controller.signal.aborted) setConnected(false);
        }
      }
      fetching = false;
    }
    stream.addEventListener("change", update);
    stream.onopen = () => setConnected(true);
    stream.onerror = () => setConnected(false);
    return () => { controller.abort(); stream.close(); };
  }, [groupId, enabled, accept]);
  return connected;
}

function useScheduledPlayback(snapshot) {
  const [clockSample, setClockSample] = useState(0);
  const current = useMemo(() => projectMusicSchedule(snapshot, clockSample), [snapshot, clockSample]);
  useEffect(() => {
    if (!current?.music.enabled || current.playback.state !== "PLAYING" || !isScheduledTrack(current.music)) return undefined;
    const synchronizeTime = () => setClockSample(performance.now());
    const remainingMs = (current.music.durationSeconds - playbackPosition(current)) * 1000;
    const timeout = setTimeout(synchronizeTime, Math.max(1, Math.min(2147483647, Math.ceil(remainingMs))));
    document.addEventListener("visibilitychange", synchronizeTime);
    window.addEventListener("pageshow", synchronizeTime);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", synchronizeTime);
      window.removeEventListener("pageshow", synchronizeTime);
    };
  }, [current, clockSample]);
  return current;
}

function MusicSession({ groupId, memberId, authReady, children }) {
  const [musicOpen, setMusicOpen] = useState(false);
  const [audioPreferences, setAudioPreferences] = useState({ volume: 60, muted: false, listening: true });
  const muteControlRef = useRef(null);
  const [snapshot, setSnapshot] = useState(null);
  const scheduledSnapshot = useScheduledPlayback(snapshot);
  const [headerSlot, setHeaderSlot] = useState(null);
  const openMusic = useCallback(() => setMusicOpen(true), []);
  const toggleMuted = useCallback(() => {
    if (muteControlRef.current) muteControlRef.current();
    else setAudioPreferences((current) => ({ ...current, muted: !current.muted }));
  }, []);
  const { muted } = audioPreferences;
  const context = useMemo(() => ({ groupId, setHeaderSlot, openMusic, musicOpen, muted, toggleMuted }),
    [groupId, openMusic, musicOpen, muted, toggleMuted]);
  const accept = useCallback((incoming) => {
    const stamped = Number.isFinite(incoming.receivedAt) ? incoming : stampMusicSnapshot(incoming);
    setSnapshot((current) => acceptMusicSnapshot(current, stamped));
  }, []);
  const enabled = Boolean(groupId && authReady);
  const connected = useMusicEvents(groupId, enabled, accept);
  const query = useQuery({
    queryKey: ["group-music", groupId, memberId ?? "visitor"],
    queryFn: async () => { const result = await fetchGroupMusic(groupId); accept(result); return result; },
    enabled, staleTime: 0, gcTime: 0, retry: false,
    refetchOnMount: "always", refetchOnWindowFocus: true, refetchOnReconnect: true,
    refetchInterval: connected ? false : 15000
  });
  return <MusicContext.Provider value={context}>
    {children}
    {headerSlot && scheduledSnapshot && createPortal(
      <MusicPanel groupId={groupId} memberId={memberId} snapshot={scheduledSnapshot} headerSlot={headerSlot}
        expanded={musicOpen} setExpanded={setMusicOpen} audioPreferences={audioPreferences} setAudioPreferences={setAudioPreferences}
        muteControlRef={muteControlRef}
        onSnapshot={accept} refresh={query.refetch} connectionError={!connected && query.isError} />,
      headerSlot
    )}
    {headerSlot && !snapshot && (query.isError || musicOpen) && createPortal(
      <>
        <div className="group-music__mini--header">
          <button type="button" className="group-music__mini-title" aria-expanded={musicOpen}
            data-ph-capture-attribute-action={musicOpen ? "group_music_collapse" : "group_music_open"}
            onClick={musicOpen ? () => setMusicOpen(false) : openMusic}>
            <Music size={17} aria-hidden="true" /><span>모임 음악</span>
          </button>
        </div>
        {musicOpen && <aside className="group-music group-music--expanded" aria-label="모임 음악 안내">
          <header className="group-music__header">
            <h2>모임 음악</h2>
            <button type="button" className="group-music__icon-button" aria-label="음악 패널 접기"
              data-ph-capture-attribute-action="group_music_collapse" onClick={() => setMusicOpen(false)}><ChevronDown size={19} aria-hidden="true" /></button>
          </header>
          {query.isError ? <>
            <p role="alert">모임 음악을 불러오지 못했어요.</p>
            <button type="button" data-ph-capture-attribute-action="group_music_load_retry" onClick={() => void query.refetch()}>다시 시도</button>
          </> : <p role="status">모임 음악을 불러오는 중이에요.</p>}
        </aside>}
      </>,
      headerSlot
    )}
  </MusicContext.Provider>;
}

export function GroupMusicProvider({ children }) {
  const { pathname } = useLocation();
  const auth = useAuth();
  const groupId = musicGroupId(pathname);
  const memberId = (auth.member ?? auth.user)?.id;
  return <MusicSession key={`${groupId ?? "outside"}:${memberId ?? "visitor"}`} groupId={groupId} memberId={memberId}
    authReady={auth.status !== "loading" && auth.status !== "unavailable"}>
    {children}
  </MusicSession>;
}
