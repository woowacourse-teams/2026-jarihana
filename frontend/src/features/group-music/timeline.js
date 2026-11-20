export function stampMusicSnapshot(snapshot, receivedAt = performance.now()) {
  return { ...snapshot, receivedAt };
}

export function acceptMusicSnapshot(current, incoming) {
  if (!current) return incoming;
  if (incoming.revision < current.revision || incoming.playback.revision < current.playback.revision) return current;
  if (incoming.revision === current.revision && incoming.playback.revision === current.playback.revision &&
    Date.parse(incoming.serverTime) < Date.parse(current.serverTime)) return current;
  return incoming;
}

export function playbackPosition(snapshot, now = performance.now()) {
  const playback = snapshot.playback;
  if (playback.state === "PAUSED") return playback.positionSeconds;
  const atReceipt = (Date.parse(snapshot.serverTime) - Date.parse(playback.anchorTime)) / 1000;
  return Math.max(0, playback.positionSeconds + atReceipt + Math.max(0, now - snapshot.receivedAt) / 1000);
}

export function isScheduledTrack(music) {
  return Boolean(music.currentQueueId && Number.isFinite(music.durationSeconds) && music.durationSeconds > 0);
}

export function projectMusicSchedule(snapshot, now) {
  if (!snapshot?.music.enabled || snapshot.playback.state !== "PLAYING" || !isScheduledTrack(snapshot.music)) return snapshot;
  const position = playbackPosition(snapshot, now);
  if (position < snapshot.music.durationSeconds) return snapshot;

  const { queue = [], ...music } = snapshot.music;
  let elapsed = music.durationSeconds;
  let index = 0;
  while (index < queue.length) {
    const duration = queue[index].durationSeconds;
    if (!Number.isFinite(duration) || duration <= 0 || elapsed + duration > position) break;
    elapsed += duration;
    index += 1;
  }
  const next = queue[index];
  const anchorTime = new Date(Date.parse(snapshot.playback.anchorTime) + Math.round((elapsed - snapshot.playback.positionSeconds) * 1000)).toISOString();
  return {
    ...snapshot,
    music: {
      ...music,
      enabled: Boolean(next),
      title: next?.title ?? "우리 모임의 음악",
      url: next?.url ?? "",
      currentQueueId: next?.id ?? null,
      durationSeconds: next?.durationSeconds,
      verifiedAt: next?.verifiedAt,
      lastSkippedTitle: undefined,
      queue: queue.slice(index + 1)
    },
    playback: { ...snapshot.playback, state: next ? "PLAYING" : "PAUSED", playlistIndex: 0, positionSeconds: 0, anchorTime }
  };
}

export function createTimelineFollower({ source, getSnapshot, getPlayer, isListening, isBlocked, onAdvance, now = () => performance.now() }) {
  const durations = new Map();
  let initial = true;
  let lastRevision = null;
  let loadingTrack = null;
  let lastCorrection = -Infinity;
  let lastAdvance = -Infinity;
  let advancing = false;

  return function synchronize({ force = false, ended = false } = {}) {
    const target = getPlayer();
    const snapshot = getSnapshot();
    if (!target || !snapshot) return;
    const timeline = snapshot.playback;
    const desired = playbackPosition(snapshot, now());
    const revisionChanged = lastRevision !== timeline.revision;
    lastRevision = timeline.revision;
    const actualIndex = source.playlistId ? target.getPlaylistIndex() : 0;
    const duration = target.getDuration();
    if (actualIndex >= 0 && Number.isFinite(duration) && duration > 0) durations.set(actualIndex, duration);
    const trackDuration = snapshot.music.durationSeconds ?? durations.get(timeline.playlistIndex);
    const playerState = target.getPlayerState();
    const scheduled = isScheduledTrack(snapshot.music);

    if (!isListening()) {
      if (playerState === 1 || playerState === 3) target.pauseVideo();
      return;
    }
    if (timeline.state === "PLAYING" && (ended || (scheduled && playerState === 0) || (trackDuration && desired >= trackDuration))) {
      if (!scheduled && !advancing && now() - lastAdvance >= 10000) {
        lastAdvance = now(); advancing = true;
        Promise.resolve().then(() => onAdvance({
          expectedRevision: timeline.revision,
          ...(snapshot.music.currentQueueId && { expectedCurrentQueueId: snapshot.music.currentQueueId })
        })).catch(() => undefined).finally(() => { advancing = false; });
      }
      if (playerState === 1 || playerState === 3) target.pauseVideo();
      return;
    }
    if (isBlocked() && !force) return;
    const trackKey = `${timeline.revision}:${timeline.playlistIndex}`;
    if (source.playlistId && (initial || actualIndex !== timeline.playlistIndex)) {
      if (loadingTrack !== trackKey || force) {
        loadingTrack = trackKey;
        const options = { listType: "playlist", list: source.playlistId,
          index: timeline.playlistIndex, startSeconds: desired };
        if (timeline.state === "PLAYING") target.loadPlaylist(options);
        else target.cuePlaylist(options);
        initial = false; lastCorrection = now();
      }
      return;
    }
    loadingTrack = null;
    if (initial && timeline.state === "PAUSED") {
      target.cueVideoById({ videoId: source.videoId, startSeconds: desired });
      initial = false; lastCorrection = now();
      return;
    }
    const actual = target.getCurrentTime();
    if ((initial || force || Math.abs(actual - desired) > 2) && (force || initial || revisionChanged || now() - lastCorrection >= 1500)) {
      target.seekTo(desired, true); lastCorrection = now();
    }
    initial = false;
    if (timeline.state === "PLAYING" && playerState !== 1 && playerState !== 3) target.playVideo();
    if (timeline.state === "PAUSED" && (playerState === 1 || playerState === 3)) target.pauseVideo();
  };
}
