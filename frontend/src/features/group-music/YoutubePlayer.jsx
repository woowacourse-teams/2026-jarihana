import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Music, Pause, Play, SkipForward, Volume2, VolumeX } from "lucide-react";
import { loadYoutubeApi } from "./youtubeApi.js";
import { parseYoutubeUrl } from "./youtubeUrl.js";
import { createTimelineFollower, playbackPosition } from "./timeline.js";

export function YoutubePlayer(props) {
  const [attempt, setAttempt] = useState(0);
  return <PlayerInstance key={`${props.snapshot.music.currentQueueId ?? props.snapshot.music.url}:${attempt}`} {...props} onRetry={() => setAttempt((value) => value + 1)} />;
}

function PlayerInstance({ audioPreferences, onAudioPreferencesChange, snapshot, canEdit, commandPending, onCommand, onSkip, onAdvance, onRetry,
  expanded, queueId, queueToggle, onToggleQueue, headerSlot, canListenLocally, muteControlRef }) {
  const mount = useRef(null);
  const latestAudio = useRef(audioPreferences);
  const player = useRef(null);
  const latest = useRef({ snapshot, onAdvance });
  const synchronize = useRef(null);
  const listening = useRef(!canListenLocally || audioPreferences.listening);
  const autoplayBlocked = useRef(false);
  const videoVisible = useRef(typeof IntersectionObserver === "undefined");
  const [ready, setReady] = useState(false);
  const [state, setState] = useState(-1);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [playlistSize, setPlaylistSize] = useState(0);
  const [trackTitle, setTrackTitle] = useState("");
  const [duration, setDuration] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [volume, setVolume] = useState(60);
  const { muted } = audioPreferences;
  useEffect(() => { latestAudio.current = audioPreferences; }, [audioPreferences]);
  const url = snapshot.music.url;
  useEffect(() => {
    latest.current = { snapshot, onAdvance };
    if (!canListenLocally) listening.current = true;
    synchronize.current?.();
  }, [snapshot, onAdvance, canListenLocally]);

  useEffect(() => {
    let cancelled = false;
    let instance;
    let readyTimeout;
    let correctionTimer;
    const source = parseYoutubeUrl(url);
    if (!source) return undefined;
    const syncPlaylist = (target) => {
      const ids = target.getPlaylist();
      setPlaylistSize(Array.isArray(ids) ? ids.length : 0);
      setTrackTitle(target.getVideoData?.()?.title || "");
      setDuration(Math.floor(target.getDuration() || 0));
      setElapsed(Math.floor(target.getCurrentTime() || 0));
    };
    const follow = createTimelineFollower({ source, getSnapshot: () => latest.current.snapshot,
      getPlayer: () => player.current, isListening: () => listening.current && videoVisible.current && !document.hidden,
      isBlocked: () => autoplayBlocked.current, onAdvance: (command) => latest.current.onAdvance(command) });
    synchronize.current = follow;
    const checkVisibility = () => follow({ force: videoVisible.current && !document.hidden && !autoplayBlocked.current });
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      videoVisible.current = entry.intersectionRatio >= 0.51;
      checkVisibility();
    }, { threshold: 0.51 });
    if (observer && mount.current) observer.observe(mount.current);
    document.addEventListener("visibilitychange", checkVisibility);
    loadYoutubeApi().then((YT) => {
      if (cancelled || !mount.current) return;
      const playerVars = { controls: 0, disablekb: 1, playsinline: 1, autoplay: 0, origin: window.location.origin,
        ...(source.playlistId ? { listType: "playlist", list: source.playlistId } : {}) };
      const playlistOnly = source.playlistId && !source.videoId;
      const target = document.createElement(playlistOnly ? "iframe" : "div");
      if (playlistOnly) {
        const embed = new URL("https://www.youtube.com/embed/videoseries");
        embed.search = new URLSearchParams({ ...playerVars, enablejsapi: 1 }).toString();
        target.src = embed.href;
        target.title = "유튜브 영상 플레이어";
        target.allow = "autoplay; encrypted-media";
      }
      mount.current.replaceChildren(target);
      readyTimeout = setTimeout(() => {
        if (!cancelled) setError("유튜브 영상에 연결하지 못했어요. 네트워크나 브라우저의 차단 설정을 확인한 뒤 다시 열어 주세요.");
      }, 20000);
      instance = new YT.Player(target, {
        width: "100%", height: "216", videoId: source.videoId ?? undefined,
        playerVars,
        events: {
          onReady: (event) => {
            if (cancelled) return;
            clearTimeout(readyTimeout); setError("");
            player.current = event.target;
            event.target.setVolume(latestAudio.current.volume); setVolume(latestAudio.current.volume);
            if (latestAudio.current.muted) event.target.mute();
            setReady(true); syncPlaylist(event.target);
            follow({ force: true });
            correctionTimer = setInterval(() => { follow(); syncPlaylist(event.target); }, 1000);
          },
          onStateChange: (event) => {
            if (cancelled) return;
            setState(event.data); syncPlaylist(event.target);
            if (event.data === 1) { autoplayBlocked.current = false; setBlocked(false); setError(""); }
            if (event.data === 0 || event.data === 1) follow({ ended: event.data === 0 });
          },
          onAutoplayBlocked: () => {
            if (!cancelled) { autoplayBlocked.current = true; setBlocked(true); }
          },
          onError: (event) => {
            if (cancelled) return;
            clearTimeout(readyTimeout); setState(-1);
            if ([100, 101, 150].includes(event.data)) {
              const { playback, music } = latest.current.snapshot;
              void latest.current.onAdvance({
                expectedRevision: playback.revision, checkUnavailable: true,
                ...(music.currentQueueId && { expectedCurrentQueueId: music.currentQueueId })
              });
            }
            setError([100, 101, 150].includes(event.data)
              ? "삭제되었거나 외부 재생이 허용되지 않은 영상이에요."
              : "유튜브에서 재생하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
          }
        }
      });
    }).catch((failure) => { if (!cancelled) setError(failure.message); });
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", checkVisibility);
      cancelled = true; clearTimeout(readyTimeout); clearInterval(correctionTimer);
      instance?.pauseVideo?.(); instance?.destroy?.(); player.current = null; synchronize.current = null;
    };
  }, [url]);

  function listen() {
    const nextListening = !listening.current || blocked;
    listening.current = nextListening;
    onAudioPreferencesChange({ ...audioPreferences, listening: nextListening });
    if (!nextListening) {
      player.current?.pauseVideo();
    } else {
      autoplayBlocked.current = false;
      setBlocked(false);
      synchronize.current?.({ force: true });
    }
  }
  const shared = snapshot.playback;
  function next() {
    const index = shared.playlistIndex + 1;
    if (parseYoutubeUrl(url)?.playlistId && index < playlistSize) {
      void onCommand({ state: "PLAYING", playlistIndex: index, positionSeconds: 0 });
    } else onSkip();
  }
  function toggleMute() {
    const nextMuted = !muted && !blocked;
    if (nextMuted) player.current?.mute();
    else player.current?.unMute();
    onAudioPreferencesChange((current) => ({ ...current, muted: nextMuted }));
    if (blocked && !canListenLocally) {
      autoplayBlocked.current = false;
      setBlocked(false);
      synchronize.current?.({ force: true });
    }
  }
  useImperativeHandle(muteControlRef, () => toggleMute);
  const localListening = !canListenLocally || audioPreferences.listening;
  const listeningLabel = blocked ? "눌러서 함께 듣기" : localListening ? "나만 잠시 멈춤" : "함께 듣기";
  const effectivelyMuted = muted || (!canListenLocally && blocked);
  const muteLabel = effectivelyMuted ? "소리 켜기" : "음소거";
  const sharedLabel = shared.state === "PLAYING" ? "모두 일시 정지" : "모두 재생";
  const currentTitle = trackTitle || snapshot.music.title;
  const muteButton = <button type="button" className="group-music__icon-button" disabled={!ready}
    aria-pressed={effectivelyMuted} aria-label={muteLabel} title={muteLabel}
    data-ph-capture-attribute-action="group_music_mute" onClick={toggleMute}>
    {effectivelyMuted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
  </button>;
  const mini = <div className="group-music__mini--header" data-ph-private>
    <button type="button" ref={queueToggle} className="group-music__mini-title" title={currentTitle}
      aria-controls={queueId} aria-expanded={expanded} aria-label={`${currentTitle} · 대기열 ${expanded ? "접기" : "열기"}`}
      data-ph-capture-attribute-action={expanded ? "group_music_collapse" : "group_music_open"} onClick={onToggleQueue}>
      <Music size={17} aria-hidden="true" /><span>{currentTitle}</span><ChevronDown size={14} aria-hidden="true" />
    </button>
    {canListenLocally ? <button type="button" className="group-music__icon-button" disabled={!ready} aria-label={listeningLabel} title={listeningLabel}
      data-ph-capture-attribute-action="group_music_local_listen" onClick={listen}>
      {localListening && !blocked ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
    </button> : muteButton}
  </div>;
  return <div className="group-music-player">
    {expanded && <div className="group-music-player__now">
      <strong>{currentTitle}</strong>
      <small aria-live="polite">
        {shared.state === "PAUSED" ? "모임 일시 정지" : !localListening ? "나만 일시 정지" : state === 1 ? "함께 재생 중" : state === 3 ? "불러오는 중" : "재생 준비"}
        {playlistSize > 1 && ` · ${shared.playlistIndex + 1} / ${playlistSize}`}
      </small>
    </div>}
    <div className="group-music-player__video" ref={mount} aria-label="유튜브 영상 플레이어" />
    {expanded && duration > 0 && <div className="group-music-player__progress">
      <span aria-hidden="true">{formatTime(elapsed)}</span>
      <progress aria-label="현재 곡 재생 위치" value={Math.min(elapsed, duration)} max={duration} />
      <span aria-hidden="true">{formatTime(duration)}</span>
    </div>}
    {expanded && blocked && <p role="status">{canListenLocally
      ? "자동 재생이 차단됐어요. 한 번 눌러 모임의 현재 위치에서 함께 들어 주세요."
      : "자동 재생이 차단됐어요. 소리 켜기를 누르면 현재 위치에서 들을 수 있어요."}</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" data-ph-capture-attribute-action="group_music_player_retry" onClick={onRetry}>플레이어 다시 열기</button></div>}
    {expanded && <div className="group-music-player__controls">
      {canEdit && <>
        <button type="button" className="group-music__icon-button" aria-label={sharedLabel} title={sharedLabel}
          disabled={commandPending} data-ph-capture-attribute-action="group_music_play_toggle" onClick={() => void onCommand({ state: shared.state === "PLAYING" ? "PAUSED" : "PLAYING", playlistIndex: shared.playlistIndex, positionSeconds: playbackPosition(snapshot) })}>
          {shared.state === "PLAYING" ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        </button>
        <button type="button" className="group-music__icon-button" aria-label="모두 다음 영상" title="모두 다음 영상"
          disabled={commandPending} data-ph-capture-attribute-action="group_music_next" onClick={next}><SkipForward size={19} aria-hidden="true" /></button>
      </>}
      {canListenLocally && muteButton}
      {canListenLocally && <label>음량 <input type="range" min="0" max="100" value={volume} disabled={!ready} data-ph-capture-attribute-action="group_music_volume" onChange={(event) => { const value = Number(event.target.value); onAudioPreferencesChange({ ...audioPreferences, volume: value }); setVolume(value); player.current?.setVolume(value); }} /></label>}
    </div>}
    {createPortal(mini, headerSlot)}
  </div>;
}

function formatTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
